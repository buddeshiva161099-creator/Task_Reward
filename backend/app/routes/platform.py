"""
Platform Owner (Application Owner) routes.

These routes are accessible only to authenticated users whose role is
PLATFORM_OWNER. Tenant users receive 403 here. The middleware in
app.middleware.PlatformAuthMiddleware also enforces this.
"""
from datetime import datetime, timezone
import re
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status, Depends, Request, Query, Response
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
async def platform_login(request: Request, body: PlatformLoginRequest):
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
        {"sub": str(user.id), "role": user.role.value}
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
async def platform_me(owner: User = Depends(require_platform_owner)):
    return {
        "id": str(owner.id),
        "name": owner.name,
        "email": owner.email,
        "role": owner.role.value,
        "must_change_password": owner.must_change_password,
        "last_login_at": to_utc_iso(owner.last_login_at) if owner.last_login_at else None,
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


@router.post("/tenants", status_code=status.HTTP_201_CREATED)
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
async def get_metrics(owner: User = Depends(require_platform_owner)):
    return await PlatformMetricsService.summary()


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
    return {
        "status": "healthy",
        "mongo": "up",
        "owner_count": await User.find(User.role == UserRole.PLATFORM_OWNER).count(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
