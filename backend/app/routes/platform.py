"""
Platform Owner (Application Owner) routes.

These routes are accessible only to authenticated users whose role is
PLATFORM_OWNER. Tenant users receive 403 here. The middleware in
app.middleware.PlatformAuthMiddleware also enforces this.
"""
from datetime import datetime, timezone, timedelta
import re
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status, Depends, Request, Query, Response, UploadFile, File
from pydantic import BaseModel, Field, EmailStr
from beanie import PydanticObjectId
from app.config import settings

from app.models.user import User, UserRole
from app.models.tenant import Tenant, TENANT_STATUSES
from app.models.subscription_plan import SubscriptionPlan
from app.models.platform_audit_log import PlatformAuditLog
from app.auth.dependencies import require_platform_owner
from app.auth.password import hash_password, verify_password
from app.auth.jwt_handler import create_access_token
from app.services.onboarding_service import OnboardingService
from app.services.platform_audit_service import PlatformAuditService
from app.services.platform_metrics_service import PlatformMetricsService
from app.utils.ist_time import to_utc_iso
from app.utils.rate_limiter import RateLimiter


platform_login_limiter = RateLimiter(times=5, seconds=60)
platform_tenant_create_limiter = RateLimiter(times=10, seconds=60)

router = APIRouter(prefix="/platform", tags=["Platform Owner"])


# ---------- Schemas ----------

class PlatformLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)


class PlatformTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    owner: dict


class OnboardTenantRequest(BaseModel):
    tenant_name: str = Field(..., min_length=1, max_length=200)
    admin_name: str = Field(..., min_length=1, max_length=100)
    admin_email: EmailStr
    plan_code: Optional[str] = None
    trial_days: Optional[int] = Field(default=None, ge=0, le=180)
    work_days: Optional[List[str]] = None
    work_start_time: Optional[str] = "09:00"
    work_end_time: Optional[str] = "18:00"
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None


class UpdateTenantStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(trial|active|suspended|cancelled)$")
    reason: Optional[str] = Field(default=None, max_length=500)


class UpdateTenantPlanRequest(BaseModel):
    plan_code: str = Field(..., min_length=1)
    trial_days: Optional[int] = Field(default=None, ge=0, le=180)


class UpdateTenantAccessDaysRequest(BaseModel):
    trial_days: int = Field(..., ge=0)


class CreatePlanRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)
    price_monthly: float = Field(default=0.0, ge=0.0)
    price_yearly: float = Field(default=0.0, ge=0.0)
    currency: str = Field(default="INR")
    max_employees: int = Field(default=50, ge=1)
    max_admins: int = Field(default=5, ge=1)
    storage_gb: float = Field(default=5.0, ge=0.0)
    trial_days: int = Field(default=14, ge=0)
    is_default: bool = False
    feature_flags: List[str] = Field(default_factory=list)
    sort_order: int = 0


# ---------- Helpers ----------

def _tenant_summary(c: Tenant, plan_code: Optional[str] = None) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "description": c.description,
        "is_active": c.is_active,
        "tenant_status": c.tenant_status,
        "plan_id": str(c.subscription_plan_id) if c.subscription_plan_id else None,
        "plan_code": plan_code,
        "trial_ends_at": c.trial_ends_at.isoformat() if c.trial_ends_at else None,
        "activated_at": to_utc_iso(c.activated_at) if c.activated_at else None,
        "suspended_at": to_utc_iso(c.suspended_at) if c.suspended_at else None,
        "suspended_reason": c.suspended_reason,
        "cancelled_at": to_utc_iso(c.cancelled_at) if c.cancelled_at else None,
        "max_employees": c.max_employees,
        "created_at": to_utc_iso(c.created_at),
        "onboarded_by_owner_id": str(c.onboarded_by_owner_id) if c.onboarded_by_owner_id else None,
    }


async def _resolve_plan_code(plan_id: Optional[PydanticObjectId]) -> Optional[str]:
    if not plan_id:
        return None
    plan = await SubscriptionPlan.get(plan_id)
    return plan.code if plan else None


# ---------- Auth ----------

@router.post("/auth/login", response_model=PlatformTokenResponse, dependencies=[Depends(platform_login_limiter)])
async def platform_login(request: Request, body: PlatformLoginRequest, response: Response):
    user = await User.find_one(User.email == body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if user.role != UserRole.PLATFORM_OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a platform owner account",
        )
    if user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform owner must not be linked to a tenant",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    user.last_login_at = datetime.now(timezone.utc)
    user.last_active = datetime.now(timezone.utc)
    await user.save()

    token = create_access_token(
        {
            "sub": str(user.id),
            "role": user.role.value,
            "token_version": getattr(user, "token_version", 0)
        }
    )

    # Set httpOnly cookie for the owner token
    response.set_cookie(
        key="owner_access_token",
        value=token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    await PlatformAuditService.log(
        actor=user,
        action="owner.login",
        entity_type="user",
        entity_id=user.id,
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )

    return PlatformTokenResponse(
        access_token=token,
        owner={
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role.value,
            "must_change_password": user.must_change_password,
        },
    )


@router.get("/me")
async def platform_me(request: Request, owner: User = Depends(require_platform_owner)):
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = request.cookies.get("owner_access_token") or request.cookies.get("access_token")

    return {
        "id": str(owner.id),
        "name": owner.name,
        "email": owner.email,
        "role": owner.role.value,
        "must_change_password": owner.must_change_password,
        "last_login_at": to_utc_iso(owner.last_login_at) if owner.last_login_at else None,
        "access_token": token,
    }


# ---------- Tenants ----------

@router.get("/tenants")
async def list_tenants(
    request: Request,
    owner: User = Depends(require_platform_owner),
    status: Optional[str] = Query(default=None),
    plan: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
):
    query: dict = {}
    if status:
        if status not in TENANT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query["tenant_status"] = status
    if search:
        query["name"] = {"$regex": re.escape(search), "$options": "i"}

    if plan:
        plan_doc = await SubscriptionPlan.find_one(SubscriptionPlan.code == plan)
        if not plan_doc:
            return {"items": [], "total": 0}
        query["subscription_plan_id"] = plan_doc.id

    plans = await SubscriptionPlan.find_all().to_list()
    plan_code_map = {p.id: p.code for p in plans}

    items = await Tenant.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    total = await Tenant.find(query).count()

    tenant_ids = [c.id for c in items]
    employee_counts = {}
    if tenant_ids:
        counts_agg = await User.aggregate([
            {
                "$match": {
                    "tenant_id": {"$in": tenant_ids},
                    "is_platform_owner": False
                }
            },
            {
                "$group": {
                    "_id": "$tenant_id",
                    "count": {"$sum": 1}
                }
            }
        ]).to_list()
        employee_counts = {str(item["_id"]): item["count"] for item in counts_agg if item["_id"] is not None}

    enriched = []
    for c in items:
        plan_code = plan_code_map.get(c.subscription_plan_id) if c.subscription_plan_id else None
        summary = _tenant_summary(c, plan_code)
        summary["employee_count"] = employee_counts.get(str(c.id), 0)
        enriched.append(summary)
    return {"items": enriched, "total": total}


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: str,
    owner: User = Depends(require_platform_owner),
):
    try:
        oid = PydanticObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant id")
    tenant = await Tenant.get(oid)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    plan_code = await _resolve_plan_code(tenant.subscription_plan_id)
    summary = _tenant_summary(tenant, plan_code)
    summary["employee_count"] = await User.find(
        User.tenant_id == tenant.id, User.is_platform_owner == False
    ).count()
    summary["admin_count"] = await User.find(
        User.tenant_id == tenant.id, User.role == UserRole.ADMIN
    ).count()
    summary["active_admin_count"] = await User.find(
        User.tenant_id == tenant.id,
        User.role == UserRole.ADMIN,
        User.is_active == True,
    ).count()

    from app.models.business_unit import BusinessUnit
    units = await BusinessUnit.find(BusinessUnit.tenant_id == tenant.id).sort("+name").to_list()
    summary["business_unit_count"] = len(units)
    summary["business_unit_summary"] = [
        {
            "id": str(u.id),
            "name": u.name,
            "type": u.type,
            "is_active": u.is_active,
            "is_default": u.is_default,
        }
        for u in units
    ]
    return summary


@router.get("/tenants/{tenant_id}/business-units")
async def list_tenant_business_units(
    tenant_id: str,
    include_inactive: bool = False,
    owner: User = Depends(require_platform_owner),
):
    """Platform-owner read-only view of all business units in a tenant."""
    try:
        oid = PydanticObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant id")
    tenant = await Tenant.get(oid)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    from app.models.business_unit import BusinessUnit
    q: dict = {"tenant_id": oid}
    if not include_inactive:
        q["is_active"] = True
    units = await BusinessUnit.find(q).sort("+name").to_list()

    unit_ids = [u.id for u in units]
    employee_counts = {}
    if unit_ids:
        counts_agg = await User.aggregate([
            {
                "$match": {
                    "business_unit_id": {"$in": unit_ids},
                    "is_platform_owner": False
                }
            },
            {
                "$group": {
                    "_id": "$business_unit_id",
                    "count": {"$sum": 1}
                }
            }
        ]).to_list()
        employee_counts = {str(item["_id"]): item["count"] for item in counts_agg if item["_id"] is not None}

    items = []
    for u in units:
        emp_count = employee_counts.get(str(u.id), 0)
        items.append({
            "id": str(u.id),
            "tenant_id": str(u.tenant_id),
            "name": u.name,
            "type": u.type,
            "code": u.code,
            "is_active": u.is_active,
            "is_default": u.is_default,
            "city": u.city,
            "country": u.country,
            "timezone": u.timezone,
            "employee_count": emp_count,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })
    return {"items": items, "total": len(items)}


@router.get("/tenants/{tenant_id}/admins")
async def list_tenant_admins(
    tenant_id: str,
    owner: User = Depends(require_platform_owner),
):
    try:
        oid = PydanticObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant id")
    tenant = await Tenant.get(oid)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    admins = await User.find(
        User.tenant_id == tenant.id,
        User.role == UserRole.ADMIN,
    ).sort("+name").to_list()
    return {
        "items": [
            {
                "id": str(a.id),
                "name": a.name,
                "email": a.email,
                "role": a.role.value,
                "is_active": a.is_active,
                "must_change_password": a.must_change_password,
                "last_login_at": a.last_login_at.isoformat() if a.last_login_at else None,
                "created_at": a.created_at.isoformat() if hasattr(a, "created_at") and a.created_at else None,
            }
            for a in admins
        ],
        "total": len(admins),
    }


@router.post("/tenants/{tenant_id}/admins/{admin_id}/reset-password")
async def reset_tenant_admin_password(
    tenant_id: str,
    admin_id: str,
    request: Request,
    response: Response,
    owner: User = Depends(require_platform_owner),
):
    if settings.ENVIRONMENT == "production" and request.url.scheme != "https":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HTTPS required in production environment.",
        )
    response.headers["Cache-Control"] = "no-store"
    try:
        tenant_oid = PydanticObjectId(tenant_id)
        admin_oid = PydanticObjectId(admin_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")

    tenant = await Tenant.get(tenant_oid)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    admin = await User.get(admin_oid)
    if not admin or admin.tenant_id != tenant.id or admin.role != UserRole.ADMIN:
        raise HTTPException(status_code=404, detail="Admin not found in this tenant")

    import secrets
    import string
    alphabet = string.ascii_letters + string.digits
    temp_password = "".join(secrets.choice(alphabet) for _ in range(12))
    admin.password_hash = hash_password(temp_password)
    admin.must_change_password = True
    await admin.save()

    await PlatformAuditService.log(
        actor=owner,
        action="admin.password_reset",
        entity_type="user",
        entity_id=admin.id,
        tenant_id=tenant.id,
        description=f"Reset password for tenant admin {admin.email}",
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )

    return {
        "admin_id": str(admin.id),
        "admin_email": admin.email,
        "temp_password": temp_password,
        "must_change_password": True,
        "warning": "Save the new password now. It will not be shown again.",
    }


@router.post("/tenants", status_code=status.HTTP_201_CREATED, dependencies=[Depends(platform_tenant_create_limiter)])
async def onboard_tenant(
    request: Request,
    response: Response,
    body: OnboardTenantRequest,
    owner: User = Depends(require_platform_owner),
):
    if settings.ENVIRONMENT == "production" and request.url.scheme != "https":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HTTPS required in production environment.",
        )
    response.headers["Cache-Control"] = "no-store"
    try:
        result = await OnboardingService.create_tenant(
            owner=owner,
            tenant_name=body.tenant_name,
            admin_name=body.admin_name,
            admin_email=body.admin_email,
            plan_code=body.plan_code,
            trial_days=body.trial_days,
            work_days=body.work_days,
            work_start_time=body.work_start_time,
            work_end_time=body.work_end_time,
            office_lat=body.office_lat,
            office_lng=body.office_lng,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    tenant = result["tenant"]
    admin = result["admin"]
    plan = result["plan"]

    await PlatformAuditService.log(
        actor=owner,
        action="tenant.onboarded",
        entity_type="tenant",
        entity_id=tenant.id,
        tenant_id=tenant.id,
        description=f"Onboarded tenant '{tenant.name}' with admin {admin.email}",
        after_state={"tenant_id": str(tenant.id), "admin_id": str(admin.id), "plan": plan.code if plan else None},
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )

    return {
        "tenant": _tenant_summary(tenant, plan.code if plan else None),
        "admin": {
            "id": str(admin.id),
            "name": admin.name,
            "email": admin.email,
            "role": admin.role.value,
        },
        "temp_password": result["temp_password"],
        "trial_ends_at": result["trial_ends_at"],
        "warning": "Save the temp_password now. It will not be shown again.",
    }


@router.patch("/tenants/{tenant_id}/status")
async def update_tenant_status(
    tenant_id: str,
    request: Request,
    body: UpdateTenantStatusRequest,
    owner: User = Depends(require_platform_owner),
):
    try:
        oid = PydanticObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant id")
    tenant = await Tenant.get(oid)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    before = {"tenant_status": tenant.tenant_status}
    now = datetime.now(timezone.utc)
    update = {"tenant_status": body.status}

    if body.status == "suspended":
        update["suspended_at"] = now
        update["suspended_reason"] = body.reason
        update["is_active"] = False
    elif body.status == "active":
        update["suspended_at"] = None
        update["suspended_reason"] = None
        update["cancelled_at"] = None
        update["is_active"] = True
        if not tenant.activated_at:
            update["activated_at"] = now
    elif body.status == "cancelled":
        update["cancelled_at"] = now
        update["is_active"] = False
    elif body.status == "trial":
        update["suspended_at"] = None
        update["suspended_reason"] = None
        update["cancelled_at"] = None
        update["is_active"] = True

    await tenant.set(update)
    tenant = await Tenant.get(oid)

    await PlatformAuditService.log(
        actor=owner,
        action=f"tenant.status.{body.status}",
        entity_type="tenant",
        entity_id=tenant.id,
        tenant_id=tenant.id,
        description=f"Status changed to {body.status}. Reason: {body.reason or 'n/a'}",
        before_state=before,
        after_state={"tenant_status": tenant.tenant_status},
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )

    plan_code = await _resolve_plan_code(tenant.subscription_plan_id)
    return _tenant_summary(tenant, plan_code)


@router.patch("/tenants/{tenant_id}/plan")
async def update_tenant_plan(
    tenant_id: str,
    request: Request,
    body: UpdateTenantPlanRequest,
    owner: User = Depends(require_platform_owner),
):
    try:
        oid = PydanticObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant id")
    tenant = await Tenant.get(oid)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    plan = await SubscriptionPlan.find_one(SubscriptionPlan.code == body.plan_code)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan '{body.plan_code}' not found")

    before = {
        "plan_id": str(tenant.subscription_plan_id) if tenant.subscription_plan_id else None,
        "max_employees": tenant.max_employees,
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
    }
    update: dict = {
        "subscription_plan_id": plan.id,
        "max_employees": plan.max_employees,
    }
    if body.trial_days is not None:
        from datetime import timedelta
        update["trial_ends_at"] = datetime.now(timezone.utc) + timedelta(days=body.trial_days)
    await tenant.set(update)
    tenant = await Tenant.get(oid)

    await PlatformAuditService.log(
        actor=owner,
        action="tenant.plan.changed",
        entity_type="tenant",
        entity_id=tenant.id,
        tenant_id=tenant.id,
        description=f"Plan changed to {plan.code}",
        before_state=before,
        after_state={"plan_id": str(plan.id), "max_employees": plan.max_employees},
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )

    return _tenant_summary(tenant, plan.code)


@router.patch("/tenants/{tenant_id}/access-days")
async def update_tenant_access_days(
    tenant_id: str,
    request: Request,
    body: UpdateTenantAccessDaysRequest,
    owner: User = Depends(require_platform_owner),
):
    try:
        oid = PydanticObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant id")
    tenant = await Tenant.get(oid)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    before = {
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
    }

    new_expiry = datetime.now(timezone.utc) + timedelta(days=body.trial_days)
    await tenant.set({"trial_ends_at": new_expiry})
    tenant = await Tenant.get(oid)

    await PlatformAuditService.log(
        actor=owner,
        action="tenant.access_days.changed",
        entity_type="tenant",
        entity_id=tenant.id,
        tenant_id=tenant.id,
        description=f"Access days changed to {body.trial_days} days remaining",
        before_state=before,
        after_state={"trial_ends_at": new_expiry.isoformat()},
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )

    plan = await SubscriptionPlan.get(tenant.subscription_plan_id)
    plan_code = plan.code if plan else "unknown"
    return _tenant_summary(tenant, plan_code)


# ---------- Plans ----------

@router.get("/plans")
async def list_plans(owner: User = Depends(require_platform_owner)):
    plans = await SubscriptionPlan.find().sort("sort_order").to_list()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "code": p.code,
            "description": p.description,
            "price_monthly": p.price_monthly,
            "price_yearly": p.price_yearly,
            "currency": p.currency,
            "max_employees": p.max_employees,
            "max_admins": p.max_admins,
            "storage_gb": p.storage_gb,
            "trial_days": p.trial_days,
            "is_active": p.is_active,
            "is_default": p.is_default,
            "feature_flags": p.feature_flags,
            "sort_order": p.sort_order,
        }
        for p in plans
    ]


@router.post("/plans", status_code=status.HTTP_201_CREATED)
async def create_plan(
    request: Request,
    body: CreatePlanRequest,
    owner: User = Depends(require_platform_owner),
):
    existing = await SubscriptionPlan.find_one(SubscriptionPlan.code == body.code)
    if existing:
        raise HTTPException(status_code=409, detail="Plan code already exists")

    if body.is_default:
        await SubscriptionPlan.find(SubscriptionPlan.is_default == True).update_many(
            {"$set": {"is_default": False}}
        )

    plan = SubscriptionPlan(
        name=body.name,
        code=body.code,
        description=body.description,
        price_monthly=body.price_monthly,
        price_yearly=body.price_yearly,
        currency=body.currency,
        max_employees=body.max_employees,
        max_admins=body.max_admins,
        storage_gb=body.storage_gb,
        trial_days=body.trial_days,
        is_default=body.is_default,
        feature_flags=body.feature_flags,
        sort_order=body.sort_order,
    )
    await plan.insert()

    await PlatformAuditService.log(
        actor=owner,
        action="plan.created",
        entity_type="subscription_plan",
        entity_id=plan.id,
        description=f"Created plan {plan.code}",
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )

    return {"id": str(plan.id), "code": plan.code}


# ---------- Metrics & Audit ----------

@router.get("/metrics")
async def get_metrics(
    tenant_id: Optional[str] = Query(default=None),
    owner: User = Depends(require_platform_owner),
):
    tenant_obj_id = PydanticObjectId(tenant_id) if tenant_id else None
    return await PlatformMetricsService.summary(tenant_id=tenant_obj_id)


@router.get("/audit-log")
async def get_audit_log(
    owner: User = Depends(require_platform_owner),
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
):
    entries = await PlatformAuditLog.find().sort("-timestamp").skip(skip).limit(limit).to_list()
    total = await PlatformAuditLog.count()
    items = [
        {
            "id": str(e.id),
            "actor_email": e.actor_email,
            "actor_name": e.actor_name,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": str(e.entity_id) if e.entity_id else None,
            "tenant_id": str(e.tenant_id) if e.tenant_id else None,
            "description": e.description,
            "ip_address": e.ip_address,
            "user_agent": e.user_agent,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        }
        for e in entries
    ]
    return {"items": items, "total": total}


@router.get("/system-health")
async def system_health(owner: User = Depends(require_platform_owner)):
    import platform
    import os
    import sys
    import shutil
    
    mongo_status = "up"
    mongo_version = "unknown"
    try:
        db = User.get_pymongo_collection().database
        build_info = await db.command("buildInfo")
        mongo_version = build_info.get("version", "unknown")
    except Exception:
        mongo_status = "down"

    sys_diagnostics = {
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "python_version": platform.python_version(),
        "process_id": os.getpid()
    }

    total_gb = 0.0
    used_gb = 0.0
    free_gb = 0.0
    percent_used = 0.0
    try:
        total, used, free = shutil.disk_usage(".")
        total_gb = round(total / (1024**3), 2)
        used_gb = round(used / (1024**3), 2)
        free_gb = round(free / (1024**3), 2)
        percent_used = round((used / total) * 100, 1)
    except Exception:
        pass

    disk_info = {
        "total_gb": total_gb,
        "used_gb": used_gb,
        "free_gb": free_gb,
        "percent_used": percent_used
    }

    entries = await PlatformAuditLog.find().sort("-timestamp").limit(100).to_list()
    logs = []
    for e in entries:
        timestamp_str = e.timestamp.strftime("%Y-%m-%d %H:%M:%S") if e.timestamp else "—"
        actor_str = e.actor_email if e.actor_email else "SYSTEM"
        
        log_level = "INFO"
        if any(kw in e.action for kw in ["security", "reset", "impersonation", "suspend", "delete"]):
            log_level = "WARN"
            
        syslog_line = f"[{timestamp_str}] [{log_level}] [{actor_str}] Action: {e.action} - {e.description} [IP: {e.ip_address or 'unknown'}]"
        logs.append({
            "line": syslog_line,
            "level": log_level,
            "action": e.action,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None
        })

    return {
        "status": "healthy",
        "mongo": mongo_status,
        "mongo_version": mongo_version,
        "owner_count": await User.find(User.role == UserRole.PLATFORM_OWNER).count(),
        "diagnostics": sys_diagnostics,
        "disk": disk_info,
        "syslog": logs,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------- Tenant Explorer ----------

class TenantExplorerResponse(BaseModel):
    tenant: dict
    subscription_plan: Optional[dict] = None
    companies: List[dict]
    business_units: List[dict]
    employees: List[dict]
    stats: dict
    drift: dict
    billing_simulator: dict
    engagement_trend: List[dict]


@router.get("/tenants/{id}/explorer", response_model=TenantExplorerResponse)
async def get_tenant_explorer(
    id: str,
    owner: User = Depends(require_platform_owner)
):
    from app.models.company import Company
    from app.models.business_unit import BusinessUnit
    from app.models.task import Task
    from app.models.attendance import Attendance
    from app.models.payroll import Payroll
    import os

    tenant_obj_id = PydanticObjectId(id)
    tenant = await Tenant.get(tenant_obj_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    plan = await SubscriptionPlan.get(tenant.subscription_plan_id) if tenant.subscription_plan_id else None

    # Load companies, BUs, and employees
    companies = await Company.find(Company.tenant_id == tenant_obj_id).to_list()
    business_units = await BusinessUnit.find(BusinessUnit.tenant_id == tenant_obj_id).to_list()
    employees = await User.find(User.tenant_id == tenant_obj_id, User.is_platform_owner == False).to_list()

    active_employees = sum(1 for u in employees if u.is_active and not u.is_deleted)
    
    # Calculate storage size on disk
    storage_bytes = 0
    for file_type in ["identity_docs", "chat"]:
        tenant_dir = os.path.normpath(os.path.join("uploads", file_type, f"tenant_{id}"))
        if os.path.exists(tenant_dir):
            for dirpath, _, filenames in os.walk(tenant_dir):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    try:
                        if os.path.exists(fp):
                            storage_bytes += os.path.getsize(fp)
                    except Exception:
                        pass
    storage_mb = round(storage_bytes / (1024 * 1024), 3)

    tasks_count = await Task.find(Task.tenant_id == tenant_obj_id).count()
    attendance_count = await Attendance.find(Attendance.tenant_id == tenant_obj_id).count()

    # Policy Drift detection (vs default template rules)
    default_attendance_points = {
        "present": 1.0,
        "late_under_30": 0.75,
        "late_over_30": 0.5,
        "excused": 0.0,
        "unexcused": -1.0,
        "overtime": 1.25
    }
    
    drifted_points = {}
    current_points = tenant.attendance_points or {}
    for k, v in default_attendance_points.items():
        curr_val = current_points.get(k)
        if curr_val is not None and abs(curr_val - v) > 1e-3:
            drifted_points[k] = {"default": v, "current": curr_val}

    drift_detected = len(drifted_points) > 0

    # Billing Simulation
    price_base = plan.price_monthly if plan else 0.0
    surcharge_per_emp = 150.0
    excess_employees = max(0, active_employees - 10)
    surcharge_total = excess_employees * surcharge_per_emp
    billing_total = price_base + surcharge_total
    
    # 30-day Engagement Trend
    trend_data = []
    now = datetime.now(timezone.utc)
    for i in range(29, -1, -1):
        day = now - timedelta(days=i)
        start_of_day = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=timezone.utc)
        end_of_day = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc)
        
        day_checkins = await Attendance.find(
            Attendance.tenant_id == tenant_obj_id,
            Attendance.check_in >= start_of_day,
            Attendance.check_in <= end_of_day
        ).count()
        
        trend_data.append({
            "date": start_of_day.strftime("%Y-%m-%d"),
            "count": day_checkins
        })

    return {
        "tenant": {
            "id": str(tenant.id),
            "name": tenant.name,
            "description": tenant.description,
            "tenant_status": tenant.tenant_status,
            "is_active": tenant.is_active,
            "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
            "work_days": tenant.work_days,
            "work_start_time": tenant.work_start_time,
            "work_end_time": tenant.work_end_time,
            "office_lat": tenant.office_lat,
            "office_lng": tenant.office_lng,
            "geofence_radius_meters": tenant.geofence_radius_meters,
            "geofence_policy": tenant.geofence_policy,
            "attendance_points": tenant.attendance_points
        },
        "subscription_plan": {
            "name": plan.name,
            "code": plan.code,
            "price_monthly": plan.price_monthly,
            "max_employees": tenant.max_employees
        } if plan else None,
        "companies": [
            {"id": str(c.id), "name": c.name, "is_active": c.is_active}
            for c in companies
        ],
        "business_units": [
            {"id": str(b.id), "name": b.name, "company_id": str(b.company_id) if b.company_id else None}
            for b in business_units
        ],
        "employees": [
            {
                "id": str(e.id),
                "name": e.name,
                "email": e.email,
                "role": e.role.value,
                "primary_company_id": str(e.primary_company_id) if e.primary_company_id else None,
                "business_unit_id": str(e.business_unit_id) if e.business_unit_id else None,
                "is_active": e.is_active,
                "must_change_password": e.must_change_password,
                "reward_points": e.reward_points
            }
            for e in employees
        ],
        "stats": {
            "active_employees": active_employees,
            "max_employees": tenant.max_employees,
            "storage_mb": storage_mb,
            "tasks_count": tasks_count,
            "attendance_count": attendance_count
        },
        "drift": {
            "drift_detected": drift_detected,
            "drifted_points": drifted_points
        },
        "billing_simulator": {
            "base_rate": price_base,
            "employee_surcharge": surcharge_total,
            "total_invoice": billing_total,
            "next_billing_date": (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
        },
        "engagement_trend": trend_data
    }


@router.post("/tenants/{id}/impersonate/{user_id}")
async def impersonate_tenant_user(
    id: str,
    user_id: str,
    request: Request,
    response: Response,
    owner: User = Depends(require_platform_owner)
):
    tenant_obj_id = PydanticObjectId(id)
    user_obj_id = PydanticObjectId(user_id)
    
    user = await User.get(user_obj_id)
    if not user or user.tenant_id != tenant_obj_id:
        raise HTTPException(status_code=404, detail="User not found in target tenant")
        
    # Log impersonation action in platform audit logs
    await PlatformAuditService.log(
        actor=owner,
        action="owner.impersonation",
        entity_type="user",
        entity_id=user.id,
        tenant_id=tenant_obj_id,
        description=f"Platform Owner impersonated user {user.email} (Role: {user.role.value})",
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )
    
    from app.auth.jwt_handler import create_access_token
    token = create_access_token({
        "sub": str(user.id),
        "role": user.role.value,
        "token_version": getattr(user, "token_version", 0)
    })
    
    # Set the cookie for the impersonated user
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role.value
        }
    }


@router.post("/tenants/{id}/purge")
async def purge_tenant_stale_data(
    id: str,
    owner: User = Depends(require_platform_owner),
):
    from app.models.task import Task
    from app.models.notification import Notification

    tenant_obj_id = PydanticObjectId(id)
    tenant = await Tenant.get(tenant_obj_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Purge completed tasks older than 1 year
    one_year_ago = datetime.now(timezone.utc) - timedelta(days=365)
    deleted_tasks = await Task.find(
        Task.tenant_id == tenant_obj_id,
        Task.status == "completed",
        Task.completed_at < one_year_ago,
    ).delete()

    # Purge notification logs older than 90 days
    ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)
    deleted_notifications = await Notification.find(
        Notification.created_at < ninety_days_ago,
    ).delete()

    return {
        "status": "success",
        "message": "Successfully purged stale records.",
        "purged_tasks": deleted_tasks.deleted_count if deleted_tasks else 0,
        "purged_notifications": deleted_notifications.deleted_count if deleted_notifications else 0,
    }


class UpdateTenantConfigPayload(BaseModel):
    work_start_time: Optional[str] = None
    work_end_time: Optional[str] = None
    geofence_policy: Optional[str] = None
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    geofence_radius_meters: Optional[int] = None
    attendance_points: Optional[dict] = None


class AnnouncementPayload(BaseModel):
    message: str
    banner_type: str = "info"
    image_url: Optional[str] = None


@router.post("/announcement")
async def create_announcement(
    payload: AnnouncementPayload,
    owner: User = Depends(require_platform_owner),
):
    from app.models.notification import Notification
    
    special_id = PydanticObjectId("000000000000000000000000")
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be blank.")
        
    announcement = Notification(
        user_id=special_id,
        title=payload.banner_type.strip(),
        message=message,
        type="broadcast",
        image_url=payload.image_url.strip() if payload.image_url else None
    )
    await announcement.insert()
    return {"status": "success", "message": "Announcement broadcasted successfully."}


@router.delete("/announcement/{id}")
async def delete_announcement(
    id: str,
    owner: User = Depends(require_platform_owner),
):
    from app.models.notification import Notification
    
    special_id = PydanticObjectId("000000000000000000000000")
    announcement = await Notification.find_one(
        Notification.id == PydanticObjectId(id),
        Notification.user_id == special_id,
        Notification.type == "broadcast"
    )
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    await announcement.delete()
    return {"status": "success", "message": "Announcement deleted successfully."}


@router.post("/announcement/upload")
async def upload_announcement_file(
    file: UploadFile = File(...),
    owner: User = Depends(require_platform_owner),
):
    from app.utils.uploads import build_stored_filename
    from pathlib import Path
    
    max_bytes = 5 * 1024 * 1024
    upload_dir = Path("uploads/announcements/global").resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_filename = build_stored_filename(file.filename)
    destination = (upload_dir / stored_filename).resolve()
    
    if upload_dir not in destination.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path destination.")
        
    bytes_written = 0
    with destination.open("wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                buffer.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File exceeds the 5MB upload limit."
                )
            buffer.write(chunk)
            
    file_url = f"/uploads/announcements/global/{stored_filename}"
    return {
        "status": "success",
        "file_url": file_url
    }


@router.post("/tenants/{id}/users/{user_id}/reset-password")
async def reset_tenant_user_password(
    id: str,
    user_id: str,
    owner: User = Depends(require_platform_owner),
):
    import secrets
    import string
    
    tenant_obj_id = PydanticObjectId(id)
    user_obj_id = PydanticObjectId(user_id)
    
    user = await User.get(user_obj_id)
    if not user or user.tenant_id != tenant_obj_id:
        raise HTTPException(status_code=404, detail="User not found in target tenant")
        
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    temp_pass = "".join(secrets.choice(alphabet) for _ in range(12))
    
    user.password_hash = hash_password(temp_pass)
    user.must_change_password = True
    user.failed_login_attempts = 0
    user.lockout_until = None
    await user.save()
    
    await PlatformAuditService.log(
        actor=owner,
        action="owner.password_reset",
        entity_type="user",
        entity_id=user.id,
        tenant_id=tenant_obj_id,
        description=f"Platform Owner reset password of tenant user {user.email}",
        ip_address=None,
    )
    
    return {
        "status": "success",
        "temp_password": temp_pass,
    }


@router.patch("/tenants/{id}/config")
async def update_tenant_configuration(
    id: str,
    payload: UpdateTenantConfigPayload,
    owner: User = Depends(require_platform_owner),
):
    tenant_obj_id = PydanticObjectId(id)
    tenant = await Tenant.get(tenant_obj_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if payload.work_start_time is not None:
        tenant.work_start_time = payload.work_start_time
    if payload.work_end_time is not None:
        tenant.work_end_time = payload.work_end_time
    if payload.geofence_policy is not None:
        tenant.geofence_policy = payload.geofence_policy
    if payload.office_lat is not None:
        tenant.office_lat = payload.office_lat
    if payload.office_lng is not None:
        tenant.office_lng = payload.office_lng
    if payload.geofence_radius_meters is not None:
        tenant.geofence_radius_meters = payload.geofence_radius_meters
    if payload.attendance_points is not None:
        tenant.attendance_points = payload.attendance_points

    await tenant.save()

    await PlatformAuditService.log(
        actor=owner,
        action="owner.config_override",
        entity_type="tenant",
        entity_id=tenant.id,
        tenant_id=tenant.id,
        description=f"Platform Owner overrode operational configuration rules for tenant {tenant.name}",
        ip_address=None,
    )

    return {
        "status": "success",
        "message": "Operational configurations saved successfully.",
        "tenant_id": str(tenant.id),
    }


@router.get("/tenant-announcements")
async def get_tenant_announcements(
    tenant_id: str,
    owner: User = Depends(require_platform_owner),
):
    from app.models.notification import Notification
    
    tenant_obj_id = PydanticObjectId(tenant_id)
    announcements = await Notification.find(
        Notification.tenant_id == tenant_obj_id,
        Notification.type == "broadcast"
    ).sort("created_at").to_list()
    
    return [
        {
            "id": str(a.id),
            "message": a.message,
            "banner_type": a.title,
            "image_url": a.image_url,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in announcements
    ]


@router.delete("/tenant-announcements/{id}")
async def delete_tenant_announcement(
    id: str,
    owner: User = Depends(require_platform_owner),
):
    from app.models.notification import Notification
    
    announcement = await Notification.find_one(
        Notification.id == PydanticObjectId(id),
        Notification.type == "broadcast"
    )
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    await announcement.delete()
    return {"status": "success", "message": "Tenant announcement deleted successfully."}

