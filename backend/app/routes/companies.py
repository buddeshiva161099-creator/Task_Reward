"""
Company management routes - admin CRUD + public list for dropdowns.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from app.models.company import Company
from app.auth.dependencies import get_current_user, require_admin, require_any_hr_manager
from app.models.user import User
from pydantic import BaseModel, Field
from typing import Optional, List
from beanie import PydanticObjectId
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["Company Management"])


class CreateCompanyRequest(BaseModel):
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


class UpdateCompanyRequest(BaseModel):
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
    # Geofence & attendance policy
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    geofence_radius_meters: Optional[int] = None
    geofence_policy: Optional[str] = None  # "strict" | "flexible" | "disabled"
    min_session_minutes: Optional[int] = None
    auto_checkout_enabled: Optional[bool] = None
    location_drift_threshold_km: Optional[float] = None


class CompanyResponse(BaseModel):
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
        work_start = parse_time_str(work_start_time_str)
        work_start_dt = check_in.replace(hour=work_start.hour, minute=work_start.minute, second=0, microsecond=0)
        
        if check_in <= work_start_dt:
            return "present"
        else:
            diff_minutes = (check_in - work_start_dt).total_seconds() / 60.0
            if diff_minutes <= 30.0:
                return "late_under_30"
            else:
                return "late_over_30"
    except Exception:
        return "present"


def _build_company_response(c: Company) -> CompanyResponse:
    return CompanyResponse(
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
        created_at=c.created_at.isoformat() + 'Z',
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
        # Geofence & attendance policy
        office_lat=c.office_lat,
        office_lng=c.office_lng,
        geofence_radius_meters=c.geofence_radius_meters,
        geofence_policy=c.geofence_policy,
        min_session_minutes=c.min_session_minutes,
        auto_checkout_enabled=c.auto_checkout_enabled,
        location_drift_threshold_km=c.location_drift_threshold_km,
    )


@router.get("", response_model=List[CompanyResponse])
async def list_companies(current_user: User = Depends(get_current_user)):
    """List all active companies."""
    companies = await Company.find(Company.is_active == True).sort("name").to_list()
    return [_build_company_response(c) for c in companies]


@router.get("/all", response_model=List[CompanyResponse])
async def list_all_companies(admin: User = Depends(require_admin)):
    """List all companies including inactive (admin only)."""
    companies = await Company.find().sort("-created_at").to_list()
    return [_build_company_response(c) for c in companies]


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    request: CreateCompanyRequest,
    admin: User = Depends(require_admin),
):
    """Create a new company (admin only)."""
    existing = await Company.find_one(Company.name == request.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Company with this name already exists",
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

    company = Company(**company_data)
    await company.insert()
    return _build_company_response(company)


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: str,
    request: UpdateCompanyRequest,
    user: User = Depends(require_any_hr_manager),
):
    """Update a company (admin, HR and Manager authorized)."""
    company = await Company.get(PydanticObjectId(company_id))
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

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
        company = await Company.get(PydanticObjectId(company_id))

    # 1. Update Leave Balance records if limits changed
    if leave_limits_changed:
        from app.models.leave_balance import LeaveBalance
        users = await User.find(User.company_id == company.id).to_list()
        user_ids = [u.id for u in users]
        if user_ids:
            # Update existing balances
            await LeaveBalance.find({"user_id": {"$in": user_ids}}).set({
                LeaveBalance.casual_allocated: company.casual_leave_limit,
                LeaveBalance.sick_allocated: company.sick_leave_limit,
                LeaveBalance.earned_allocated: company.earned_leave_limit,
            })
            # Initialize for users without leave balances
            existing_balances = await LeaveBalance.find({"user_id": {"$in": user_ids}}).to_list()
            existing_user_ids = {b.user_id for b in existing_balances}
            for u in users:
                if u.id not in existing_user_ids:
                    new_balance = LeaveBalance(
                        user_id=u.id,
                        casual_allocated=company.casual_leave_limit,
                        sick_allocated=company.sick_leave_limit,
                        earned_allocated=company.earned_leave_limit,
                    )
                    await new_balance.insert()

    # 2. Recalculate attendance log statuses if work_start_time changed
    if work_start_time_changed:
        from app.models.attendance import Attendance, ist_now
        
        # Determine the current month window in IST
        now = ist_now()
        start_of_month = datetime(now.year, now.month, 1)
        if now.month == 12:
            end_of_month = datetime(now.year + 1, 1, 1) - timedelta(microseconds=1)
        else:
            end_of_month = datetime(now.year, now.month + 1, 1) - timedelta(microseconds=1)

        # Find current month attendance logs for this company
        attendance_logs = await Attendance.find(
            Attendance.company_id == company.id,
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
        from app.models.attendance import ist_now
        
        now = ist_now()
        month_str = now.strftime("%Y-%m")
        
        users = await User.find(User.company_id == company.id).to_list()
        for u in users:
            existing_payroll = await Payroll.find_one(Payroll.user_id == u.id, Payroll.month == month_str)
            if existing_payroll and existing_payroll.status in [PayrollStatus.DRAFT, PayrollStatus.UNDER_REVIEW, PayrollStatus.APPROVED]:
                try:
                    await calculate_corporate_payroll(employee=u, month=month_str)
                except Exception as pe:
                    logger.warning(f"Could not recalculate payroll for user {u.name}: {pe}")

    return _build_company_response(company)



@router.delete("/{company_id}")
async def delete_company(
    company_id: str,
    admin: User = Depends(require_admin),
):
    """Deactivate a company (admin only)."""
    company = await Company.get(PydanticObjectId(company_id))
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    await company.set({"is_active": False})
    return {"message": f"Company '{company.name}' deactivated"}
