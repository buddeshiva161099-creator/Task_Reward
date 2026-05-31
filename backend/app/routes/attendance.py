from fastapi import APIRouter, Depends, HTTPException, status
from app.models.user import User, UserRole
from app.models.company import Company
from app.auth.dependencies import get_current_user
from app.services.geofence_utils import (
    is_within_geofence, calculate_drift_km, detect_anomalies, get_distance_to_office
)
from datetime import datetime, timedelta, timezone
from app.models.attendance import Attendance, ist_now, IST
from typing import List, Optional
from pydantic import BaseModel
from beanie import PydanticObjectId
from beanie.operators import In
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class AttendanceRequest(BaseModel):
    lat: float
    lng: float
    address: Optional[str] = None
    remarks: Optional[str] = None
    device_fingerprint: Optional[str] = None

class AttendanceResponse(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_reward_points: Optional[float] = 0.0
    company_id: str
    check_in: datetime
    check_out: Optional[datetime] = None
    location_in: Optional[dict] = None
    location_out: Optional[dict] = None
    address_in: Optional[str] = None
    address_out: Optional[str] = None
    status: str
    remarks: Optional[str] = None
    # Smart fields
    location_drift_km: Optional[float] = None
    distance_from_office_in: Optional[float] = None
    distance_from_office_out: Optional[float] = None
    flags: List[str] = []
    is_auto_closed: bool = False
    device_fingerprint: Optional[str] = None

def _build_response(attendance: Attendance, user: Optional[User] = None) -> dict:
    """Build response dict from attendance record."""
    res = attendance.model_dump()
    res["id"] = str(attendance.id)
    res["user_id"] = str(attendance.user_id)
    res["company_id"] = str(attendance.company_id)
    if user:
        res["user_name"] = user.name
        res["user_email"] = user.email
        res["user_reward_points"] = user.reward_points
    return res


@router.post("/check-in", response_model=AttendanceResponse)
async def check_in(req: AttendanceRequest, current_user: User = Depends(get_current_user)):
    """Record a check-in with live location and smart validation."""
    now_utc = datetime.now(timezone.utc)
    now_ist = now_utc.astimezone(IST)
    today_start_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start = today_start_ist.astimezone(timezone.utc)
    
    existing = await Attendance.find_one(
        Attendance.user_id == current_user.id,
        Attendance.check_in >= today_start,
        Attendance.check_out == None
    )
    if existing:
        raise HTTPException(status_code=400, detail="You are already checked in.")

    # Get company for geofence and policy settings
    company = await Company.get(current_user.company_id) if current_user.company_id else None
    
    # --- GEOFENCE VALIDATION ---
    distance_from_office = None
    geofence_flags = []
    
    if company and company.office_lat is not None and company.office_lng is not None:
        distance_from_office = get_distance_to_office(
            req.lat, req.lng, company.office_lat, company.office_lng
        )
        
        within_fence = is_within_geofence(
            req.lat, req.lng,
            company.office_lat, company.office_lng,
            company.geofence_radius_meters
        )
        
        if not within_fence:
            if company.geofence_policy == "strict":
                raise HTTPException(
                    status_code=400,
                    detail=f"You are {int(distance_from_office)}m away from the office. "
                           f"Check-in is only allowed within {company.geofence_radius_meters}m of the office."
                )
            elif company.geofence_policy == "flexible":
                geofence_flags.append("outside_geofence")

    # --- DEVICE FINGERPRINT CHECK ---
    device_flags = []
    if req.device_fingerprint:
        # Check last known fingerprint for this user
        last_attendance = await Attendance.find(
            Attendance.user_id == current_user.id,
            Attendance.device_fingerprint != None
        ).sort(-Attendance.check_in).first_or_none()
        
        if last_attendance and last_attendance.device_fingerprint != req.device_fingerprint:
            device_flags.append("device_changed")

    # --- LATE STATUS CALCULATION ---
    status_str = "present"
    if company and company.work_start_time:
        try:
            # Robust parsing of various formats (e.g., "09:30 AM", "9:00AM", "14:00")
            work_start = None
            raw_time = company.work_start_time.strip().upper()
            
            formats = ["%I:%M %p", "%I:%M%p", "%H:%M"]
            for fmt in formats:
                try:
                    work_start = datetime.strptime(raw_time, fmt)
                    break
                except ValueError:
                    continue
            
            if work_start:
                # Compare against current IST time
                work_start_dt = now_ist.replace(hour=work_start.hour, minute=work_start.minute, second=0, microsecond=0)
                if now_ist > work_start_dt:
                    diff_minutes = (now_ist - work_start_dt).total_seconds() / 60.0
                    if diff_minutes <= 30.0:
                        status_str = "late_under_30"
                    else:
                        status_str = "late_over_30"
            else:
                logger.warning(f"Could not parse work_start_time: {company.work_start_time}")
        except Exception as e:
            logger.error(f"Error calculating late status: {e}")

    # --- ANOMALY DETECTION (check-in time) ---
    anomaly_flags = detect_anomalies(
        check_in_time=now_ist,
        check_out_time=None,
        location_in={"lat": req.lat, "lng": req.lng},
        location_out=None,
        device_fingerprint=req.device_fingerprint,
        previous_fingerprint=None,  # Already handled above
    )
    # Filter out non-check-in anomalies
    checkin_anomalies = [f for f in anomaly_flags if f in ("off_hours_checkin", "suspicious_coordinates", "invalid_coordinates")]

    all_flags = geofence_flags + device_flags + checkin_anomalies

    attendance = Attendance(
        user_id=current_user.id,
        company_id=current_user.company_id or current_user.id,
        location_in={"lat": req.lat, "lng": req.lng},
        address_in=req.address,
        remarks=req.remarks,
        status=status_str,
        distance_from_office_in=distance_from_office,
        flags=all_flags,
        device_fingerprint=req.device_fingerprint,
    )
    await attendance.insert()
    return _build_response(attendance, current_user)

@router.post("/check-out", response_model=AttendanceResponse)
async def check_out(req: AttendanceRequest, current_user: User = Depends(get_current_user)):
    """Record a check-out with smart validation."""
    attendance = await Attendance.find(
        Attendance.user_id == current_user.id,
        Attendance.check_out == None
    ).sort(-Attendance.check_in).first_or_none()
    
    if not attendance:
        raise HTTPException(status_code=400, detail="No active check-in session found.")

    company = await Company.get(current_user.company_id) if current_user.company_id else None

    # --- MINIMUM SESSION DURATION CHECK ---
    if company and company.min_session_minutes > 0:
        now_utc = datetime.now(timezone.utc)
        session_duration = (now_utc - attendance.check_in).total_seconds() / 60
        if session_duration < company.min_session_minutes:
            remaining = int(company.min_session_minutes - session_duration)
            raise HTTPException(
                status_code=400,
                detail=f"Minimum session duration is {company.min_session_minutes} minutes. "
                       f"Please wait {remaining} more minute(s) before checking out."
            )

    # --- GEOFENCE CHECK ON CHECKOUT ---
    distance_from_office_out = None
    checkout_flags = list(attendance.flags)  # Preserve existing flags
    
    if company and company.office_lat is not None and company.office_lng is not None:
        distance_from_office_out = get_distance_to_office(
            req.lat, req.lng, company.office_lat, company.office_lng
        )
        
        within_fence = is_within_geofence(
            req.lat, req.lng,
            company.office_lat, company.office_lng,
            company.geofence_radius_meters
        )
        
        if not within_fence:
            # Checkout is always allowed but flagged
            if "outside_geofence_checkout" not in checkout_flags:
                checkout_flags.append("outside_geofence_checkout")

    # --- LOCATION DRIFT CALCULATION ---
    drift_km = calculate_drift_km(
        attendance.location_in,
        {"lat": req.lat, "lng": req.lng}
    )
    
    if drift_km is not None and company:
        if drift_km > company.location_drift_threshold_km:
            if f"location_drift_{drift_km}km" not in checkout_flags:
                checkout_flags.append(f"location_drift_{drift_km}km")

    # Update attendance record
    attendance.check_out = datetime.now(timezone.utc)
    attendance.location_out = {"lat": req.lat, "lng": req.lng}
    attendance.address_out = req.address
    attendance.location_drift_km = drift_km
    attendance.distance_from_office_out = distance_from_office_out
    attendance.flags = checkout_flags
    await attendance.save()
    
    # Automatically recalculate draft payroll if it exists and is not locked
    try:
        from app.routes.payroll import calculate_corporate_payroll
        from app.models.payroll import Payroll, PayrollStatus
        month_str = attendance.check_in.astimezone(IST).strftime("%Y-%m")

        payrolls = await Payroll.find(Payroll.user_id == current_user.id, Payroll.month == month_str).to_list()
        for p in payrolls:
            if p.status == PayrollStatus.DRAFT:
                await calculate_corporate_payroll(employee=current_user, month=month_str)
            else:
                p.recalculation_required = True
                await p.save()
    except Exception as e:
        logger.warning(f"Could not automatically recalculate draft payroll on check-out: {e}")
    
    return _build_response(attendance, current_user)

@router.get("/me", response_model=List[AttendanceResponse])
async def get_my_attendance(current_user: User = Depends(get_current_user)):
    """Retrieve check-in history for the current user."""
    logs = await Attendance.find(Attendance.user_id == current_user.id).sort(-Attendance.check_in).to_list()
    return [_build_response(log, current_user) for log in logs]

@router.get("/all", response_model=List[AttendanceResponse])
async def get_all_attendance(current_user: User = Depends(get_current_user)):
    """Retrieve attendance logs for management with user names. Hierarchy-scoped for non-admins."""
    if current_user.role not in [
        UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER,
        UserRole.MANAGER, UserRole.ASSISTANT_MANAGER
    ]:
        raise HTTPException(status_code=403, detail="Unauthorized access to attendance logs.")

    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(current_user)

    if visible_ids is not None:
        # Filter logs to only visible employees
        logs = await Attendance.find(
            In(Attendance.user_id, list(visible_ids))
        ).sort(-Attendance.check_in).to_list()
    else:
        # Admin: fetch all
        logs = await Attendance.find().sort(-Attendance.check_in).to_list()

    user_ids = list(set([log.user_id for log in logs]))
    if not user_ids:
        return []

    users = await User.find(In(User.id, user_ids)).to_list()
    user_map = {u.id: u for u in users}

    return [_build_response(log, user_map.get(log.user_id)) for log in logs]

@router.get("/summary")
async def get_summary(current_user: User = Depends(get_current_user)):
    """Get attendance summary. Admin/HR see all; Managers see their hierarchy."""
    if current_user.role not in [
        UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER,
        UserRole.MANAGER, UserRole.ASSISTANT_MANAGER
    ]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    from app.services import dashboard_service
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(current_user)
    return await dashboard_service.get_all_attendance_summary(visible_employee_ids=visible_ids)

@router.get("/geofence-status")
async def get_geofence_status(
    lat: float, lng: float,
    current_user: User = Depends(get_current_user)
):
    """Check if the current location is within the geofence. Returns distance and status."""
    company = await Company.get(current_user.company_id) if current_user.company_id else None
    
    if not company or company.office_lat is None or company.office_lng is None:
        return {
            "geofence_configured": False,
            "policy": "disabled",
            "within_geofence": True,
            "distance_meters": None,
            "radius_meters": None,
        }
    
    distance = get_distance_to_office(lat, lng, company.office_lat, company.office_lng)
    within = is_within_geofence(lat, lng, company.office_lat, company.office_lng, company.geofence_radius_meters)
    
    return {
        "geofence_configured": True,
        "policy": company.geofence_policy,
        "within_geofence": within,
        "distance_meters": distance,
        "radius_meters": company.geofence_radius_meters,
        "min_session_minutes": company.min_session_minutes,
    }


@router.get("/my-calendar-summary")
async def get_my_calendar_summary(current_user: User = Depends(get_current_user)):
    """Returns enriched calendar data for the employee's last 90 days attendance:
    - attendance logs (raw check-in/out records)
    - approved regularization dates (YYYY-MM-DD strings, IST)
    - approved leave date ranges with details
    - holiday dates (global + company-specific)
    - company work_days config and work_start_time
    """
    from app.models.regularization import AttendanceRegularization, RegularizationStatus
    from app.models.leave import Leave, LeaveStatus
    from app.models.holiday import Holiday
    from beanie.operators import Or

    # Company config
    company = await Company.get(current_user.company_id) if current_user.company_id else None
    if not company:
        company = await Company.find_one(Company.is_active == True)

    work_days = company.work_days if company else ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    work_start_time = company.work_start_time if company else "09:00"

    # Last 90 days window
    now_ist = ist_now()
    today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    history_start = today_start - timedelta(days=89)

    # Raw attendance logs
    attendance_logs = await Attendance.find(
        Attendance.user_id == current_user.id,
        Attendance.check_in >= history_start
    ).sort(-Attendance.check_in).to_list()
    logs_data = [_build_response(log, current_user) for log in attendance_logs]

    # Approved regularizations
    all_approved_regs = await AttendanceRegularization.find(
        AttendanceRegularization.user_id == current_user.id,
        AttendanceRegularization.status == RegularizationStatus.APPROVED
    ).to_list()

    attendance_id_map = {str(log.id): log for log in attendance_logs}
    regularized_dates: list[str] = []
    regularizations_detail: list[dict] = []
    for reg in all_approved_regs:
        attn = attendance_id_map.get(str(reg.attendance_id))
        if attn:
            date_ist = attn.check_in.astimezone(IST).date()
            date_str = date_ist.isoformat()
            if date_str not in regularized_dates:
                regularized_dates.append(date_str)
            regularizations_detail.append({
                "id": str(reg.id),
                "date": date_str,
                "requested_check_in": reg.requested_check_in.astimezone(IST).isoformat() if reg.requested_check_in else None,
                "requested_check_out": reg.requested_check_out.astimezone(IST).isoformat() if reg.requested_check_out else None,
                "reason": reg.reason,
                "comments": reg.comments,
            })

    # Approved leaves
    approved_leaves = await Leave.find(
        Leave.user_id == current_user.id,
        Leave.status == LeaveStatus.APPROVED
    ).to_list()

    leave_dates: list[dict] = []
    for leave in approved_leaves:
        leave_dates.append({
            "id": str(leave.id),
            "start": leave.start_date.astimezone(IST).date().isoformat(),
            "end": leave.end_date.astimezone(IST).date().isoformat(),
            "leave_type": leave.leave_type.value if hasattr(leave.leave_type, "value") else str(leave.leave_type),
            "reason": leave.reason,
            "comments": leave.comments,
        })

    # Holidays (global + company-specific) within the 90-day window
    holidays_list = await Holiday.find(
        Holiday.date >= history_start,
        Or(Holiday.company_id == current_user.company_id, Holiday.company_id == None)
    ).to_list()

    holiday_dates: list[dict] = [
        {
            "date": h.date.astimezone(IST).date().isoformat(),
            "name": h.name,
        }
        for h in holidays_list
    ]

    return {
        "attendance_logs": logs_data,
        "regularized_dates": regularized_dates,
        "regularizations_detail": regularizations_detail,
        "leave_dates": leave_dates,
        "holiday_dates": holiday_dates,
        "work_days": work_days,
        "work_start_time": work_start_time
    }


@router.get("/calendar-summary/{employee_id}")
async def get_employee_calendar_summary(
    employee_id: str,
    current_user: User = Depends(get_current_user)
):
    """Returns enriched calendar data for a specific employee's last 90 days attendance:
    - attendance logs (raw check-in/out records)
    - approved regularization dates (YYYY-MM-DD strings, IST)
    - approved leave date ranges with details
    - holiday dates (global + company-specific)
    - company work_days config and work_start_time
    """
    if current_user.role not in [
        UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER,
        UserRole.MANAGER, UserRole.ASSISTANT_MANAGER
    ]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(current_user)
    
    try:
        target_id = PydanticObjectId(employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee ID format")

    if visible_ids is not None and target_id not in visible_ids:
        raise HTTPException(status_code=403, detail="Unauthorized to view this employee's attendance")

    employee = await User.get(target_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    from app.models.regularization import AttendanceRegularization, RegularizationStatus
    from app.models.leave import Leave, LeaveStatus
    from app.models.holiday import Holiday
    from beanie.operators import Or

    # Company config
    company = await Company.get(employee.company_id) if employee.company_id else None
    if not company:
        company = await Company.find_one(Company.is_active == True)

    work_days = company.work_days if company else ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    work_start_time = company.work_start_time if company else "09:00"

    # Last 90 days window
    now_ist = ist_now()
    today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    history_start = today_start - timedelta(days=89)

    # Raw attendance logs
    attendance_logs = await Attendance.find(
        Attendance.user_id == employee.id,
        Attendance.check_in >= history_start
    ).sort(-Attendance.check_in).to_list()
    logs_data = [_build_response(log, employee) for log in attendance_logs]

    # Approved regularizations
    all_approved_regs = await AttendanceRegularization.find(
        AttendanceRegularization.user_id == employee.id,
        AttendanceRegularization.status == RegularizationStatus.APPROVED
    ).to_list()

    attendance_id_map = {str(log.id): log for log in attendance_logs}
    regularized_dates: list[str] = []
    regularizations_detail: list[dict] = []
    for reg in all_approved_regs:
        attn = attendance_id_map.get(str(reg.attendance_id))
        if attn:
            date_ist = attn.check_in.astimezone(IST).date()
            date_str = date_ist.isoformat()
            if date_str not in regularized_dates:
                regularized_dates.append(date_str)
            regularizations_detail.append({
                "id": str(reg.id),
                "date": date_str,
                "requested_check_in": reg.requested_check_in.astimezone(IST).isoformat() if reg.requested_check_in else None,
                "requested_check_out": reg.requested_check_out.astimezone(IST).isoformat() if reg.requested_check_out else None,
                "reason": reg.reason,
                "comments": reg.comments,
            })

    # Approved leaves
    approved_leaves = await Leave.find(
        Leave.user_id == employee.id,
        Leave.status == LeaveStatus.APPROVED
    ).to_list()

    leave_dates: list[dict] = []
    for leave in approved_leaves:
        leave_dates.append({
            "id": str(leave.id),
            "start": leave.start_date.astimezone(IST).date().isoformat(),
            "end": leave.end_date.astimezone(IST).date().isoformat(),
            "leave_type": leave.leave_type.value if hasattr(leave.leave_type, "value") else str(leave.leave_type),
            "reason": leave.reason,
            "comments": leave.comments,
        })

    # Holidays (global + company-specific) within the 90-day window
    holidays_list = await Holiday.find(
        Holiday.date >= history_start,
        Or(Holiday.company_id == employee.company_id, Holiday.company_id == None)
    ).to_list()

    holiday_dates: list[dict] = [
        {
            "date": h.date.astimezone(IST).date().isoformat(),
            "name": h.name,
        }
        for h in holidays_list
    ]

    return {
        "attendance_logs": logs_data,
        "regularized_dates": regularized_dates,
        "regularizations_detail": regularizations_detail,
        "leave_dates": leave_dates,
        "holiday_dates": holiday_dates,
        "work_days": work_days,
        "work_start_time": work_start_time
    }

