"""
Tenant management routes - admin CRUD + public list for dropdowns.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Request
from app.models.tenant import Tenant
from app.auth.dependencies import get_current_user, require_admin, require_any_hr_manager
from app.models.policy import PolicyVersion
from app.models.user import User
from pydantic import BaseModel, Field
from typing import Optional, List
from beanie import PydanticObjectId
from datetime import datetime, timedelta, timezone
from app.services.audit_service import AuditService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenants", tags=["Tenant Management"])


class CreateTenantRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    work_days: Optional[List[str]] = None
    work_start_time: Optional[str] = None
    work_end_time: Optional[str] = None
    work_type: Optional[str] = "fixed"
    flexible_hours: Optional[int] = 8
    cut_out_time: Optional[str] = "10:00"
    task_priority_points: Optional[dict] = None
    delay_penalties: Optional[dict] = None
    early_completion_multiplier: Optional[float] = None
    quality_multipliers: Optional[dict] = None
    incentive_tiers: Optional[list] = None
    attendance_points: Optional[dict] = None
    attendance_bonus_threshold: Optional[float] = None
    attendance_bonus_percentage: Optional[float] = None
    performance_incentive_pool_percentage: Optional[float] = None
    sick_leave_limit: Optional[int] = 0
    earned_leave_limit: Optional[int] = 0
    casual_leave_limit: Optional[int] = 12
    max_paid_casual_leaves_per_month: Optional[int] = 1
    half_day_min_hours: Optional[float] = 4.0
    full_day_min_hours: Optional[float] = 8.0


class UpdateTenantRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None
    work_days: Optional[List[str]] = None
    work_start_time: Optional[str] = None
    work_end_time: Optional[str] = None
    work_type: Optional[str] = None
    flexible_hours: Optional[int] = None
    cut_out_time: Optional[str] = None
    task_priority_points: Optional[dict] = None
    delay_penalties: Optional[dict] = None
    early_completion_multiplier: Optional[float] = None
    quality_multipliers: Optional[dict] = None
    incentive_tiers: Optional[list] = None
    attendance_points: Optional[dict] = None
    attendance_bonus_threshold: Optional[float] = None
    attendance_bonus_percentage: Optional[float] = None
    performance_incentive_pool_percentage: Optional[float] = None
    sick_leave_limit: Optional[int] = None
    earned_leave_limit: Optional[int] = None
    casual_leave_limit: Optional[int] = None
    max_paid_casual_leaves_per_month: Optional[int] = None
    half_day_min_hours: Optional[float] = None
    full_day_min_hours: Optional[float] = None
    performance_bonus_threshold: Optional[float] = None
    performance_bonus_percentage: Optional[float] = None
    performance_bonus_amount: Optional[float] = None
    # Geofence & attendance policy
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    geofence_radius_meters: Optional[int] = None
    geofence_policy: Optional[str] = None  # "strict" | "flexible" | "disabled"
    min_session_minutes: Optional[int] = None
    auto_checkout_enabled: Optional[bool] = None
    location_drift_threshold_km: Optional[float] = None


class TenantResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    is_active: bool
    work_days: List[str]
    work_start_time: str
    work_end_time: str
    work_type: str
    flexible_hours: int
    cut_out_time: str
    created_at: str
    task_priority_points: dict
    delay_penalties: dict
    early_completion_multiplier: float
    quality_multipliers: dict
    incentive_tiers: list
    attendance_points: dict
    attendance_bonus_threshold: float
    attendance_bonus_percentage: float
    performance_incentive_pool_percentage: float
    sick_leave_limit: int
    earned_leave_limit: int
    casual_leave_limit: int
    max_paid_casual_leaves_per_month: int
    half_day_min_hours: float
    full_day_min_hours: float
    performance_bonus_threshold: float = 80.0
    performance_bonus_percentage: float = 10.0
    performance_bonus_amount: float = 0.0
    # Geofence & attendance policy
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    geofence_radius_meters: int = 500
    geofence_policy: str = "flexible"
    min_session_minutes: int = 30
    auto_checkout_enabled: bool = True
    location_drift_threshold_km: float = 5.0



def parse_time_str(time_str: str) -> datetime:
    raw_time = time_str.strip().upper()
    formats = ["%I:%M %p", "%I:%M%p", "%H:%M"]
    for fmt in formats:
        try:
            return datetime.strptime(raw_time, fmt)
        except ValueError:
            continue
    raise ValueError(f"Could not parse time string: {time_str}")


def get_attendance_status(check_in: datetime, work_start_time_str: str) -> str:
    try:
        from app.models.attendance import IST
        check_in_ist = check_in.astimezone(IST)
        work_start = parse_time_str(work_start_time_str)
        work_start_dt = check_in_ist.replace(hour=work_start.hour, minute=work_start.minute, second=0, microsecond=0)
        
        if check_in_ist <= work_start_dt:
            return "present"
        else:
            diff_minutes = (check_in_ist - work_start_dt).total_seconds() / 60.0
            if diff_minutes <= 30.0:
                return "late_under_30"
            else:
                return "late_over_30"
    except Exception:
        return "present"


def _build_company_response(c: Tenant) -> TenantResponse:
    from app.utils.ist_time import to_utc_iso
    return TenantResponse(

        id=str(c.id),
        name=c.name,
        description=c.description,
        is_active=c.is_active,
        work_days=c.work_days,
        work_start_time=c.work_start_time,
        work_end_time=c.work_end_time,
        work_type=c.work_type,
        flexible_hours=c.flexible_hours,
        cut_out_time=c.cut_out_time,
        created_at=to_utc_iso(c.created_at),

        task_priority_points=c.task_priority_points,
        delay_penalties=c.delay_penalties,
        early_completion_multiplier=c.early_completion_multiplier,
        quality_multipliers=c.quality_multipliers,
        incentive_tiers=c.incentive_tiers,
        attendance_points=c.attendance_points,
        attendance_bonus_threshold=c.attendance_bonus_threshold,
        attendance_bonus_percentage=c.attendance_bonus_percentage,
        performance_incentive_pool_percentage=c.performance_incentive_pool_percentage,
        sick_leave_limit=c.sick_leave_limit,
        earned_leave_limit=c.earned_leave_limit,
        casual_leave_limit=c.casual_leave_limit,
        max_paid_casual_leaves_per_month=c.max_paid_casual_leaves_per_month,
        half_day_min_hours=c.half_day_min_hours,
        full_day_min_hours=c.full_day_min_hours,
        performance_bonus_threshold=c.performance_bonus_threshold,
        performance_bonus_percentage=c.performance_bonus_percentage,
        performance_bonus_amount=c.performance_bonus_amount,
        # Geofence & attendance policy
        office_lat=c.office_lat,
        office_lng=c.office_lng,
        geofence_radius_meters=c.geofence_radius_meters,
        geofence_policy=c.geofence_policy,
        min_session_minutes=c.min_session_minutes,
        auto_checkout_enabled=c.auto_checkout_enabled,
        location_drift_threshold_km=c.location_drift_threshold_km,
    )


async def save_policy_version(company: Tenant, actor_id: Optional[PydanticObjectId] = None) -> PolicyVersion:
    # Find latest version
    latest = await PolicyVersion.find(PolicyVersion.tenant_id == company.id).sort("-version").first_or_none()
    next_version = 1
    now = datetime.now(timezone.utc)
    if latest:
        next_version = latest.version + 1
        latest.effective_to = now
        await latest.save()
        
    policy_data = {
        "tenant_id": company.id,
        "version": next_version,
        "effective_from": now,
        "created_by_id": actor_id,
        "work_days": company.work_days,
        "work_start_time": company.work_start_time,
        "work_end_time": company.work_end_time,
        "work_type": company.work_type,
        "flexible_hours": company.flexible_hours,
        "cut_out_time": company.cut_out_time,
        "office_lat": company.office_lat,
        "office_lng": company.office_lng,
        "geofence_radius_meters": company.geofence_radius_meters,
        "geofence_policy": company.geofence_policy,
        "min_session_minutes": company.min_session_minutes,
        "auto_checkout_enabled": company.auto_checkout_enabled,
        "location_drift_threshold_km": company.location_drift_threshold_km,
        "task_priority_points": company.task_priority_points,
        "delay_penalties": company.delay_penalties,
        "early_completion_multiplier": company.early_completion_multiplier,
        "quality_multipliers": company.quality_multipliers,
        "incentive_tiers": company.incentive_tiers,
        "attendance_points": company.attendance_points,
        "attendance_bonus_threshold": company.attendance_bonus_threshold,
        "attendance_bonus_percentage": company.attendance_bonus_percentage,
        "performance_incentive_pool_percentage": company.performance_incentive_pool_percentage,
        "performance_bonus_threshold": company.performance_bonus_threshold,
        "performance_bonus_percentage": company.performance_bonus_percentage,
        "performance_bonus_amount": company.performance_bonus_amount,
        "sick_leave_limit": company.sick_leave_limit,
        "earned_leave_limit": company.earned_leave_limit,
        "casual_leave_limit": company.casual_leave_limit,
        "max_paid_casual_leaves_per_month": company.max_paid_casual_leaves_per_month,
        "half_day_min_hours": company.half_day_min_hours,
        "full_day_min_hours": company.full_day_min_hours,
    }
    version_doc = PolicyVersion(**policy_data)
    await version_doc.insert()
    return version_doc


@router.get("", response_model=List[TenantResponse])
async def list_companies(current_user: User = Depends(get_current_user)):
    """List active tenants scoped to the user's company or all if platform owner."""
    if current_user.tenant_id:
        tenants = await Tenant.find(Tenant.id == current_user.tenant_id, Tenant.is_active == True).sort("name").to_list()
    else:
        tenants = await Tenant.find(Tenant.is_active == True).sort("name").to_list()
    return [_build_company_response(c) for c in tenants]


@router.get("/all", response_model=List[TenantResponse])
async def list_all_companies(admin: User = Depends(require_admin)):
    """List all tenants scoped to user's company or all if platform owner."""
    if admin.tenant_id:
        tenants = await Tenant.find(Tenant.id == admin.tenant_id).sort("-created_at").to_list()
    else:
        tenants = await Tenant.find().sort("-created_at").to_list()
    return [_build_company_response(c) for c in tenants]


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    request: CreateTenantRequest,
    http_request: Request,
    admin: User = Depends(require_admin),
):
    """Create a new company (platform owner only)."""
    if admin.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform owners can create new tenants.",
        )
    existing = await Tenant.find_one(Tenant.name == request.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant with this name already exists",
        )

    company_data = {
        "name": request.name,
        "description": request.description,
        "work_days": request.work_days or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "work_start_time": request.work_start_time or "09:00",
        "work_end_time": request.work_end_time or "18:00",
        "work_type": request.work_type or "fixed",
        "flexible_hours": request.flexible_hours or 8,
        "cut_out_time": request.cut_out_time or "10:00"
    }
    for field in [
        "task_priority_points", "delay_penalties", "early_completion_multiplier",
        "quality_multipliers", "incentive_tiers", "attendance_points",
        "attendance_bonus_threshold", "attendance_bonus_percentage",
        "performance_incentive_pool_percentage",
        "sick_leave_limit", "earned_leave_limit", "casual_leave_limit",
        "max_paid_casual_leaves_per_month"
    ]:
        val = getattr(request, field, None)
        if val is not None:
            company_data[field] = val

    company = Tenant(**company_data)
    await company.insert()
    await save_policy_version(company, admin.id)

    await AuditService.log_event(
        actor=admin,
        entity_type="tenant",
        entity_id=company.id,
        action="created",
        after_state=company.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return _build_company_response(company)


@router.put("/{company_id}", response_model=TenantResponse)
async def update_company(
    company_id: str,
    request: UpdateTenantRequest,
    http_request: Request,
    user: User = Depends(require_any_hr_manager),
):
    """Update a tenant (admin, HR and Manager authorized)."""
    company = await Tenant.get(PydanticObjectId(company_id))
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    if user.tenant_id is not None and company.id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You cannot modify settings of another company.",
        )

    before_state = company.model_dump()
    # Detect if work_start_time is changing
    work_start_time_changed = (
        request.work_start_time is not None
        and request.work_start_time != company.work_start_time
    )

    # Detect if leave limits are changing
    leave_limits_changed = (
        (request.sick_leave_limit is not None and request.sick_leave_limit != company.sick_leave_limit)
        or (request.earned_leave_limit is not None and request.earned_leave_limit != company.earned_leave_limit)
        or (request.casual_leave_limit is not None and request.casual_leave_limit != company.casual_leave_limit)
    )

    update_data = {k: v for k, v in request.model_dump().items() if v is not None}
    if update_data:
        await company.set(update_data)
        company = await Tenant.get(PydanticObjectId(company_id))
        
        # Check if policy rules changed
        metadata_fields = {"name", "description", "is_active"}
        policy_changed = any(k not in metadata_fields for k in update_data.keys())
        if policy_changed:
            await save_policy_version(company, user.id)

    # 1. Update Leave Balance records if limits changed
    if leave_limits_changed:
        from app.routes.leaves import _get_synced_leave_balance
        users = await User.find(User.tenant_id == company.id).to_list()
        for u in users:
            try:
                await _get_synced_leave_balance(u)
            except Exception as e:
                logger.warning(f"Failed to sync leave balance for user {u.name} via ledger: {e}")

    # 2. Recalculate attendance log statuses if work_start_time changed
    if work_start_time_changed:
        from app.models.attendance import Attendance, IST
        from datetime import timezone
        
        # Determine the current month window in IST and convert to UTC
        now_utc = datetime.now(timezone.utc)
        now_ist = now_utc.astimezone(IST)
        start_of_month_ist = datetime(now_ist.year, now_ist.month, 1, tzinfo=IST)
        if now_ist.month == 12:
            end_of_month_ist = datetime(now_ist.year + 1, 1, 1, tzinfo=IST) - timedelta(microseconds=1)
        else:
            end_of_month_ist = datetime(now_ist.year, now_ist.month + 1, 1, tzinfo=IST) - timedelta(microseconds=1)
            
        start_of_month = start_of_month_ist.astimezone(timezone.utc)
        end_of_month = end_of_month_ist.astimezone(timezone.utc)

        # Find current month attendance logs for this company
        attendance_logs = await Attendance.find(
            Attendance.tenant_id == company.id,
            Attendance.check_in >= start_of_month,
            Attendance.check_in <= end_of_month
        ).to_list()

        target_statuses = ["present", "late", "late_under_30", "late_over_30"]
        for log in attendance_logs:
            if log.status in target_statuses:
                # Recalculate status based on new start time
                new_status = get_attendance_status(log.check_in, company.work_start_time)
                if new_status != log.status:
                    log.status = new_status
                    await log.save()

    # 3. Recalculate active draft payrolls for all employees of the company if any update was made
    if update_data:
        from app.models.payroll import Payroll, PayrollStatus
        from app.routes.payroll import calculate_corporate_payroll
        from app.models.attendance import IST
        from datetime import timezone
        
        now_ist = datetime.now(timezone.utc).astimezone(IST)
        month_str = now_ist.strftime("%Y-%m")
        
        users = await User.find(User.tenant_id == company.id).to_list()
        for u in users:
            existing_payroll = await Payroll.find_one(Payroll.user_id == u.id, Payroll.month == month_str)
            if existing_payroll and existing_payroll.status in [PayrollStatus.DRAFT, PayrollStatus.UNDER_REVIEW, PayrollStatus.APPROVED]:
                try:
                    await calculate_corporate_payroll(employee=u, month=month_str)
                except Exception as pe:
                    logger.warning(f"Could not recalculate payroll for user {u.name}: {pe}")

    await AuditService.log_event(
        actor=user,
        entity_type="tenant",
        entity_id=company.id,
        action="updated",
        before_state=before_state,
        after_state=company.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return _build_company_response(company)



@router.delete("/{company_id}")
async def delete_company(
    company_id: str,
    admin: User = Depends(require_admin),
):
    """Deactivate a company (admin only)."""
    company = await Tenant.get(PydanticObjectId(company_id))
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    if admin.tenant_id is not None and company.id != admin.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You cannot deactivate another company.",
        )

    await company.set({"is_active": False})
    return {"message": f"Tenant '{company.name}' deactivated"}
