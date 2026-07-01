from fastapi import APIRouter, Depends, HTTPException, status, Request
from app.models.user import User, UserRole
from app.models.payroll import Payroll, SalaryStructure, PayrollStatus
from app.models.activity_log import ActivityLog
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService
from app.auth.dependencies import get_current_user, require_hr_team, require_any_hr_manager, require_admin, require_hr_manager
from app.auth.tenant_scope import get_active_business_unit_id, require_tenant_id
from pydantic import BaseModel
from typing import List, Optional
from beanie import PydanticObjectId
from beanie.operators import Or, In
from datetime import datetime, timedelta, timezone
from app.utils.ist_time import to_utc_iso
from app.models.tenant import Tenant
from app.models.holiday import Holiday

router = APIRouter(prefix="/payroll", tags=["Payroll Management"])


class SalaryStructureRequest(BaseModel):
    user_id: str
    basic: float
    hra: float
    special_allowance: float
    pf_deduction: float
    esi_deduction: float
    tax_deduction: float


class PayrollDraftRequest(BaseModel):
    user_id: str
    month: str  # YYYY-MM
    overtime_pay: float = 0.0
    incentives: float = 0.0
    bonuses: float = 0.0
    penalties: float = 0.0
    deductions: float = 0.0
    automated: bool = True


class PayrollActionRequest(BaseModel):
    comments: Optional[str] = None


class RunPayrollRequest(BaseModel):
    tenant_id: str
    month: str  # Format: "YYYY-MM"
    department_id: Optional[str] = None
    employee_id: Optional[str] = None



def _get_payroll_month_range(month: str):
    """Parse month string and return start/end of month datetimes in UTC and total days."""
    from app.models.attendance import IST
    from datetime import timezone, datetime, timedelta
    try:
        year, month_num = map(int, month.split("-"))
    except Exception:
        raise ValueError("Invalid month format. Use YYYY-MM.")

    start_of_month_ist = datetime(year, month_num, 1, tzinfo=IST)
    if month_num == 12:
        end_of_month_ist = datetime(year + 1, 1, 1, tzinfo=IST) - timedelta(microseconds=1)
    else:
        end_of_month_ist = datetime(year, month_num + 1, 1, tzinfo=IST) - timedelta(microseconds=1)
    
    start_of_month = start_of_month_ist.astimezone(timezone.utc)
    end_of_month = end_of_month_ist.astimezone(timezone.utc)
    total_days_in_month = (end_of_month_ist.date() - start_of_month_ist.date()).days + 1
    return start_of_month, end_of_month, total_days_in_month, start_of_month_ist, end_of_month_ist


def _calculate_active_window(joining_date_str: str | None, start_of_month: datetime, end_of_month: datetime, total_days_in_month: int):
    """Determine employee active window for proration based on joining date."""
    from app.models.attendance import IST
    from datetime import timezone, datetime
    joining_date = None
    if joining_date_str:
        try:
            joining_date = datetime.strptime(joining_date_str, "%Y-%m-%d").replace(tzinfo=IST)
        except Exception:
            pass
    
    if not joining_date:
        joining_date_utc = start_of_month
    else:
        joining_date_utc = joining_date.astimezone(timezone.utc)

    if joining_date_utc > end_of_month:
        raise ValueError("Employee joined after the selected month.")

    active_start_date_utc = start_of_month
    active_end_date_utc = end_of_month
    
    active_start_date = active_start_date_utc.astimezone(IST)
    active_end_date = active_end_date_utc.astimezone(IST)
    
    active_days = (active_end_date.date() - active_start_date.date()).days + 1
    is_prorated = active_days < total_days_in_month
    return active_start_date, active_end_date, active_days, is_prorated


def _count_working_days(active_start_date, active_end_date, work_days, holiday_dates):
    """Count total working days in active window."""
    from datetime import timedelta
    total_working_days = 0
    holidays_weekends = 0
    work_days_set = {d.strip().lower() for d in work_days} if work_days else None

    cur_day = active_start_date
    while cur_day.date() <= active_end_date.date():
        cur_date = cur_day.date()
        day_name_lower = cur_date.strftime("%a").lower()
        # Handle full name check (e.g. monday) and abbreviation check (e.g. mon)
        day_full_lower = cur_date.strftime("%A").lower()
        is_weekend = False
        if work_days_set is not None:
            is_weekend = (day_name_lower not in work_days_set) and (day_full_lower not in work_days_set)
        else:
            is_weekend = cur_date.weekday() >= 5
        is_holiday = cur_date in holiday_dates
        
        if is_weekend or is_holiday:
            holidays_weekends += 1
        else:
            total_working_days += 1
        cur_day += timedelta(days=1)
    return total_working_days, holidays_weekends


async def calculate_corporate_payroll(
    employee: User,
    month: str,
    drafted_by_id: Optional[PydanticObjectId] = None,
    drafted_by_name: Optional[str] = None,
    force: bool = False,
    tenant: Optional[Tenant] = None,
    holidays_list: Optional[List[Holiday]] = None
) -> Payroll:
    from app.models.tenant import Tenant
    from app.models.attendance import Attendance, IST
    from app.models.holiday import Holiday
    from app.models.leave import Leave, LeaveStatus
    from app.models.regularization import AttendanceRegularization, RegularizationStatus
    from datetime import timezone

    # 1. Parse Month/Year
    start_of_month, end_of_month, total_days_in_month, start_of_month_ist, end_of_month_ist = _get_payroll_month_range(month)

    # 2 & 3. Active window proration
    try:
        active_start_date, active_end_date, active_days, is_prorated = _calculate_active_window(
            employee.hiring_date, start_of_month, end_of_month, total_days_in_month
        )
    except ValueError:
        raise ValueError(f"Employee {employee.name} joined after the selected month ({month}).")

    # 4. Fetch Salary Structure
    structure = await SalaryStructure.find_one(SalaryStructure.user_id == employee.id)
    if not structure:
        raise ValueError(f"Salary structure not configured.")

    # 5. Fetch Tenant & Holidays
    if not tenant:
        from app.models.policy import PolicyVersion
        if employee.tenant_id:
            tenant = await PolicyVersion.get_active_policy(employee.tenant_id, end_of_month)
            if not tenant:
                tenant = await Tenant.get(employee.tenant_id)
        if not tenant:
            tenant = await Tenant.find_one(Tenant.is_active == True)

    if holidays_list is None:
        holidays_list = await Holiday.find(
            Holiday.date >= start_of_month,
            Holiday.date <= end_of_month,
            Or(Holiday.tenant_id == employee.tenant_id, Holiday.tenant_id == None)
        ).to_list() if tenant else []
    holiday_dates = {h.date.astimezone(IST).date() for h in holidays_list}

    # 6. Count working days, weekends, holidays in active window
    work_days = tenant.work_days if tenant else None
    work_days_set = {d.strip().lower() for d in work_days} if work_days else None
    total_working_days, holidays_weekends = _count_working_days(
        active_start_date, active_end_date, work_days, holiday_dates
    )

    # 7. Fetch Attendance Logs & Leaves in the month
    attendance_logs = await Attendance.find(
        Attendance.user_id == employee.id,
        Attendance.check_in >= start_of_month,
        Attendance.check_in <= end_of_month
    ).to_list()
    attendance_map = {log.check_in.astimezone(IST).date(): log for log in attendance_logs}

    approved_leaves = await Leave.find(
        Leave.user_id == employee.id,
        Leave.status == LeaveStatus.APPROVED
    ).to_list()

    leave_type_map = {}
    for leave in approved_leaves:
        cur = leave.start_date.astimezone(IST).date()
        while cur <= leave.end_date.astimezone(IST).date():
            leave_type_map[cur] = leave.leave_type
            cur += timedelta(days=1)

    approved_regularizations = await AttendanceRegularization.find(
        AttendanceRegularization.user_id == employee.id,
        AttendanceRegularization.status == RegularizationStatus.APPROVED
    ).to_list()

    # Store regularized attendance IDs to track which dates were regularized
    regularized_attendance_ids = {str(reg.attendance_id) for reg in approved_regularizations}

    # 8. Loop through working days to find present, absent, paid leaves
    present_days = 0.0
    absent_days = 0.0
    paid_leaves = 0.0
    approved_regularization_days = 0.0
    late_penalties = 0.0
    overtime_pay = 0.0

    max_paid_casual_per_month = getattr(tenant, "max_paid_casual_leaves_per_month", 1)
    casual_leaves_counter = 0

    cur_day = active_start_date
    while cur_day.date() <= active_end_date.date():
        cur_date = cur_day.date()
        day_name_lower = cur_date.strftime("%A").lower()
        is_weekend = (day_name_lower not in work_days_set) if work_days_set is not None else (cur_date.weekday() >= 5)
        is_holiday = cur_date in holiday_dates
        
        if not (is_weekend or is_holiday):
            log = attendance_map.get(cur_date)
            is_regularized = log and str(log.id) in regularized_attendance_ids

            if is_regularized:
                present_days += 1.0
                approved_regularization_days += 1.0
                if log:
                    status_lower = log.status.lower() if log.status else ""
                    if "late" in status_lower:
                        late_penalties += 100.0
                    if "overtime" in status_lower or "approved_overtime" in status_lower:
                        overtime_pay += 500.0
            elif log:
                status_lower = log.status.lower() if log.status else ""
                half_day_min = getattr(tenant, "half_day_min_hours", 4.0)
                full_day_min = getattr(tenant, "full_day_min_hours", 8.0)
                
                duration_hours = 0.0
                if log.check_in and log.check_out:
                    duration_hours = (log.check_out - log.check_in).total_seconds() / 3600.0
                
                if "half_day_absent" in status_lower or (log.check_in and log.check_out and duration_hours < half_day_min):
                    absent_days += 1.0
                elif "half_day_present" in status_lower or (log.check_in and log.check_out and duration_hours < full_day_min):
                    present_days += 0.5
                    absent_days += 0.5
                elif "absent" in status_lower or "absence" in status_lower:
                    absent_days += 1.0
                else:
                    present_days += 1.0

                    # Late check-in penalty: flat 100 INR
                    if "late" in status_lower:
                        late_penalties += 100.0
                    # Overtime: flat 500 INR
                    if "overtime" in status_lower or "approved_overtime" in status_lower:
                        overtime_pay += 500.0
            else:
                if cur_date in leave_type_map:
                    ltype = leave_type_map[cur_date]
                    ltype_str = ltype.value if hasattr(ltype, "value") else str(ltype)
                    if ltype_str == "casual":
                        casual_leaves_counter += 1
                        if casual_leaves_counter <= max_paid_casual_per_month:
                            paid_leaves += 1.0
                        else:
                            # Excess casual leaves in the month are unpaid (Loss of Pay)
                            absent_days += 1.0
                    elif ltype_str == "loss_of_pay":
                        absent_days += 1.0
                    elif ltype_str in ["sick", "earned", "approved_leave"]:
                        paid_leaves += 1.0
                    else:
                        # Paid leaves are counted towards paid_leaves
                        paid_leaves += 1.0
                else:
                    absent_days += 1.0
        cur_day += timedelta(days=1)

    payable_days = present_days + paid_leaves
    absent_days = max(0.0, total_working_days - payable_days)

    # 9. Perform Calculations
    basic = structure.basic
    hra = structure.hra
    special_allowance = structure.special_allowance
    gross_base = basic + hra + special_allowance

    if is_prorated:
        proration_ratio = active_days / total_days_in_month
        basic = basic * proration_ratio
        hra = hra * proration_ratio
        special_allowance = special_allowance * proration_ratio
        prorated_gross = gross_base * proration_ratio
        pf_deduction = structure.pf_deduction * proration_ratio
        esi_deduction = structure.esi_deduction * proration_ratio
        tax_deduction = structure.tax_deduction * proration_ratio
    else:
        prorated_gross = gross_base
        pf_deduction = structure.pf_deduction
        esi_deduction = structure.esi_deduction
        tax_deduction = structure.tax_deduction


    if total_working_days > 0:
        daily_rate = prorated_gross / total_working_days
        lop_deduction = daily_rate * absent_days
    else:
        daily_rate = 0.0
        lop_deduction = 0.0

    earned_salary = prorated_gross - lop_deduction

    # Preserve manual fields if recalculating existing draft
    existing = await Payroll.find_one(Payroll.user_id == employee.id, Payroll.month == month)
    bonuses = existing.bonuses if existing else 0.0
    incentives = existing.incentives if existing else 0.0
    extra_deductions = existing.deductions if existing else 0.0

    # 10. Automated Calculations for Bonuses and Incentives
    if not existing:
        bonuses = 0.0
        incentives = 0.0
        if tenant:
            # Calculate regular attendance rate
            earned_attn_pts = 0.0
            cur_day = active_start_date
            while cur_day.date() <= active_end_date.date():
                cur_date = cur_day.date()
                day_name_lower = cur_date.strftime("%A").lower()
                is_weekend = (day_name_lower not in work_days_set) if work_days_set is not None else (cur_date.weekday() >= 5)
                is_holiday = cur_date in holiday_dates
                
                if not (is_weekend or is_holiday):
                    log = attendance_map.get(cur_date)
                    if log:
                        status_lower = log.status.lower() if log.status else ""
                        if "absent" in status_lower or "absence" in status_lower:
                            earned_attn_pts += tenant.attendance_points.get("unexcused", -1.0)
                        elif "late_under_30" in status_lower:
                            earned_attn_pts += tenant.attendance_points.get("late_under_30", 0.75)
                        elif "late_over_30" in status_lower:
                            earned_attn_pts += tenant.attendance_points.get("late_over_30", 0.50)
                        elif "late" in status_lower:
                            earned_attn_pts += tenant.attendance_points.get("late", 0.75)
                        elif "excused" in status_lower:
                            earned_attn_pts += 1.0
                        else:
                            earned_attn_pts += tenant.attendance_points.get("present", 1.0)
                    else:
                        if cur_date in leave_type_map:
                            ltype = leave_type_map[cur_date]
                            ltype_str = ltype.value if hasattr(ltype, "value") else str(ltype)
                            if ltype_str in ["casual", "sick", "earned"]:
                                earned_attn_pts += 1.0
                        else:
                            earned_attn_pts += 0.0
                cur_day += timedelta(days=1)
            
            attn_rate = 0.0
            if total_working_days > 0:
                attn_rate = (earned_attn_pts / total_working_days) * 100.0
            
            # Get attendance bonus settings with safe default fallbacks to 0 (disabled)
            attendance_bonus_threshold = getattr(tenant, "attendance_bonus_threshold", 100.0)
            attendance_bonus_percentage = getattr(tenant, "attendance_bonus_percentage", 0.0)
            if attn_rate >= attendance_bonus_threshold:
                bonuses = gross_base * (attendance_bonus_percentage / 100.0)
            else:
                bonuses = 0.0
            
            # Calculate Performance Incentive
            from app.models.task import Task, TaskStatus
            target_pts = getattr(employee, "performance_target", None)
            if target_pts is None:
                role_targets = {
                    UserRole.MANAGER: 200.0,
                    UserRole.ASSISTANT_MANAGER: 190.0,
                    UserRole.HR_MANAGER: 152.0,
                    UserRole.EMPLOYEE: 200.0,
                }
                target_pts = role_targets.get(employee.role, 150.0)
            perf_score = (employee.reward_points / target_pts) * 100.0 if target_pts > 0 else 0.0
            
            # Match dynamic tenant rules for performance bonus with safe default fallbacks to 0 (disabled)
            perf_bonus_threshold = getattr(tenant, "performance_bonus_threshold", 999.0)
            perf_bonus_pct = getattr(tenant, "performance_bonus_percentage", 0.0)
            perf_bonus_flat = getattr(tenant, "performance_bonus_amount", 0.0)
            
            if perf_score >= perf_bonus_threshold:
                if perf_bonus_flat > 0:
                    incentives = perf_bonus_flat
                else:
                    incentives = gross_base * (perf_bonus_pct / 100.0)
            else:
                incentives = 0.0
                
            # Backlog penalty (> 5 overdue tasks)
            overdue_count = await Task.find(
                Task.assigned_to == employee.id,
                Task.status == TaskStatus.OVERDUE,
                Task.deadline < start_of_month - timedelta(days=4)
            ).count()
            if overdue_count > 5:
                incentives *= 0.95

    # Check if payroll is already locked
    if existing and existing.status in [PayrollStatus.LOCKED, PayrollStatus.PAID] and not force:
        # Do not overwrite locked payrolls. We just mark it as recalculation_required elsewhere.
        return existing

    total_earnings = earned_salary + overtime_pay + incentives + bonuses
    total_deductions = pf_deduction + esi_deduction + tax_deduction + late_penalties + extra_deductions
    net_salary = max(0.0, total_earnings - total_deductions)

    if existing:
        payroll = existing

        # Snapshot the existing version before saving the new calculations
        from app.models.payroll import PayrollHistory
        history = PayrollHistory(
            payroll_id=existing.id,
            version_number=existing.version_number,
            payroll_snapshot=existing.model_dump(exclude={"id", "created_at", "updated_at", "version_number", "recalculation_required"}),
            reason_for_change="Recalculated based on latest approved attendance/leave data.",
            created_by=drafted_by_id
        )
        await history.insert()

        # Increment version and reset recalculation required flag
        payroll.version_number += 1
        payroll.recalculation_required = False
    else:
        payroll = Payroll(user_id=employee.id, user_name=employee.name, month=month)

    payroll.tenant_id = employee.tenant_id
    payroll.business_unit_id = employee.business_unit_id

    payroll.basic = basic
    payroll.hra = hra
    payroll.special_allowance = special_allowance
    payroll.pf_deduction = pf_deduction
    payroll.esi_deduction = esi_deduction
    payroll.tax_deduction = tax_deduction
    
    payroll.present_days = present_days
    payroll.absent_days = absent_days
    payroll.paid_leaves = paid_leaves
    payroll.approved_regularization_days = approved_regularization_days
    payroll.payable_days = payable_days
    payroll.holidays_weekends = holidays_weekends
    payroll.total_working_days = total_working_days
    
    payroll.base_salary = gross_base
    payroll.earned_salary = earned_salary
    payroll.lop_deduction = lop_deduction
    payroll.overtime_pay = overtime_pay
    payroll.penalties = late_penalties
    
    # Net values
    payroll.incentives = incentives
    payroll.bonuses = bonuses
    payroll.deductions = extra_deductions
    payroll.net_salary = net_salary
    
    payroll.remarks = (
        f"Processed corporate payroll for {month}. Present: {present_days}d, Regularized: {approved_regularization_days}d, "
        f"Absent (LOP): {absent_days}d, Paid Leaves: {paid_leaves}d, Holidays: {holidays_weekends}d. "
        f"LOP deduction: Rs. {lop_deduction:.2f}. PF: Rs. {pf_deduction:.2f}, Tax: Rs. {tax_deduction:.2f}."
    )
    
    if drafted_by_id:
        payroll.drafted_by = drafted_by_id
        payroll.drafted_by_name = drafted_by_name

    await payroll.save()
    return payroll


@router.post("/structure", response_model=dict)
async def configure_salary_structure(
    request: SalaryStructureRequest,
    hr_mgr: User = Depends(require_hr_team)
):
    """Configure or update an employee's salary structure (HR Manager and Admin only)."""
    user_id = PydanticObjectId(request.user_id)
    employee = await User.get(user_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if hr_mgr.role != UserRole.ADMIN:
        from app.services.user_service import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(hr_mgr)
        if visible_ids is not None and user_id not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only configure salary structures for employees under your hierarchy."
            )

    structure = await SalaryStructure.find_one(SalaryStructure.user_id == user_id)
    if not structure:
        structure = SalaryStructure(user_id=user_id)

    structure.tenant_id = employee.tenant_id
    structure.business_unit_id = employee.business_unit_id
    structure.basic = request.basic
    structure.hra = request.hra
    structure.special_allowance = request.special_allowance
    structure.pf_deduction = request.pf_deduction
    structure.esi_deduction = request.esi_deduction
    structure.tax_deduction = request.tax_deduction
    structure.updated_at = datetime.now(timezone.utc)
    await structure.save()

    employee.salary_structure_id = structure.id
    await employee.save()

    return {"message": "Salary structure configured successfully", "id": str(structure.id)}


@router.get("/structure/{user_id}", response_model=dict)
async def get_salary_structure(user_id: str, current_user: User = Depends(get_current_user)):
    """View salary structure details."""
    uid = PydanticObjectId(user_id)

    if current_user.id != uid:
        if current_user.role == UserRole.ADMIN:
            pass
        elif current_user.role in [UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER,
                                    UserRole.MANAGER, UserRole.ASSISTANT_MANAGER]:
            from app.services.user_service import get_visible_employee_ids
            visible_ids = await get_visible_employee_ids(current_user)
            if visible_ids is not None and uid not in visible_ids:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    structure = await SalaryStructure.find_one(SalaryStructure.user_id == uid)
    if not structure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary structure not configured for this user",
        )

    return {
        "user_id": str(structure.user_id),
        "basic": structure.basic,
        "hra": structure.hra,
        "special_allowance": structure.special_allowance,
        "pf_deduction": structure.pf_deduction,
        "esi_deduction": structure.esi_deduction,
        "tax_deduction": structure.tax_deduction,
        "gross_salary": structure.basic + structure.hra + structure.special_allowance,
    }


@router.post("/draft", response_model=dict)
async def create_payroll_draft(
    request: PayrollDraftRequest,
    http_request: Request,
    hr_user: User = Depends(require_hr_team)
):
    """Prepare a new payroll draft (Assistant HR Manager or above)."""
    uid = PydanticObjectId(request.user_id)
    employee = await User.get(uid)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if hr_user.role != UserRole.ADMIN:
        from app.services.user_service import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(hr_user)
        if visible_ids is not None and uid not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only generate payroll for employees under your hierarchy."
            )

    try:
        payroll = await calculate_corporate_payroll(
            employee=employee,
            month=request.month,
            drafted_by_id=hr_user.id,
            drafted_by_name=hr_user.name
        )
        if not request.automated:
            payroll.overtime_pay = request.overtime_pay
            payroll.incentives = request.incentives
            payroll.bonuses = request.bonuses
            payroll.penalties = request.penalties
            payroll.deductions = request.deductions
            
            # Recompute net
            gross = payroll.earned_salary + payroll.overtime_pay + payroll.incentives + payroll.bonuses
            deducts = payroll.pf_deduction + payroll.esi_deduction + payroll.tax_deduction + payroll.penalties + payroll.deductions
            payroll.net_salary = max(0.0, gross - deducts)
            await payroll.save()
            
        await AuditService.log_event(
            actor=hr_user,
            entity_type="payroll",
            entity_id=payroll.id,
            action="drafted",
            after_state=payroll.model_dump(),
            ip_address=http_request.client.host,
            user_agent=http_request.headers.get("user-agent")
        )

        return {"message": "Payroll draft successfully generated", "id": str(payroll.id)}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/run", response_model=dict)
async def run_payroll_engine(
    request: RunPayrollRequest,
    hr_user: User = Depends(require_hr_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Run payroll processing for matching scope (Tenant, Department, Employee). When a
    business unit is active, only employees within that unit are processed."""
    from app.services.user_service import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(hr_user)

    query = {
        "tenant_id": PydanticObjectId(request.tenant_id),
        "is_deleted": {"$ne": True}
    }
    if request.department_id:
        try:
            from beanie import PydanticObjectId
            query["$or"] = [
                {"department_id": PydanticObjectId(request.department_id)},
                {"department": request.department_id}
            ]
        except Exception:
            query["department"] = request.department_id
    if request.employee_id:
        query["_id"] = PydanticObjectId(request.employee_id)
    if active_bu_id is not None:
        query["business_unit_id"] = active_bu_id

    employees = await User.find(query).to_list()
    
    total_processed = 0
    total_payout = 0.0
    pending_employees = 0
    errors = []
    missing_attendance = []

    # Pre-compute month boundaries once (not inside the loop)
    from app.models.attendance import Attendance, IST
    year, month_num = map(int, request.month.split("-"))
    attn_start_ist = datetime(year, month_num, 1, tzinfo=IST)
    if month_num == 12:
        attn_end_ist = datetime(year + 1, 1, 1, tzinfo=IST)
    else:
        attn_end_ist = datetime(year, month_num + 1, 1, tzinfo=IST)
    attn_start = attn_start_ist.astimezone(timezone.utc)
    attn_end = attn_end_ist.astimezone(timezone.utc)
    
    # Pre-fetch tenant & holidays once to avoid N+1 queries
    from app.models.tenant import Tenant
    from app.models.holiday import Holiday
    from app.models.policy import PolicyVersion
    
    tenant = None
    if request.tenant_id:
        tenant = await PolicyVersion.get_active_policy(PydanticObjectId(request.tenant_id), attn_end)
        if not tenant:
            tenant = await Tenant.get(PydanticObjectId(request.tenant_id))
    if not tenant:
        tenant = await Tenant.find_one(Tenant.is_active == True)
        
    holidays_list = await Holiday.find(
        Holiday.date >= attn_start,
        Holiday.date <= attn_end,
        Or(Holiday.tenant_id == tenant.id, Holiday.tenant_id == None)
    ).to_list() if tenant else []
    
    # Pre-fetch attendance counts to avoid N+1 queries
    employee_ids = [e.id for e in employees]
    attn_stats = await Attendance.aggregate([
        {
            "$match": {
                "user_id": {"$in": employee_ids},
                "check_in": {"$gte": attn_start, "$lt": attn_end}
            }
        },
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}}
    ]).to_list()
    attn_counts_map = {str(stat["_id"]): stat["count"] for stat in attn_stats}

    for emp in employees:
        if visible_ids is not None and emp.id not in visible_ids:
            continue
            
        try:
            payroll = await calculate_corporate_payroll(
                employee=emp,
                month=request.month,
                drafted_by_id=hr_user.id,
                drafted_by_name=hr_user.name,
                tenant=tenant,
                holidays_list=holidays_list
            )
            if payroll:
                total_processed += 1
                total_payout += payroll.net_salary
                
                # Check for zero attendance using pre-fetched map
                attn_count = attn_counts_map.get(str(emp.id), 0)
                if attn_count == 0:
                    missing_attendance.append(f"{emp.name} ({emp.email}) - No attendance captured for {request.month}")
        except Exception as e:
            errors.append(f"Employee {emp.name}: {str(e)}")
            pending_employees += 1

            
    # Audit log
    log = ActivityLog(
        user_id=hr_user.id,
        user_name=hr_user.name,
        action="Payroll Processing Run",
        details=f"Ran corporate payroll processing for month {request.month}. Processed: {total_processed}, Net Payout: Rs. {total_payout:.2f}"
    )
    await log.insert()
    
    return {
        "total_employees_processed": total_processed,
        "total_payout": total_payout,
        "pending_employees": pending_employees,
        "errors": errors,
        "missing_attendance": missing_attendance
    }


@router.post("/mark-paid/{payroll_id}", response_model=dict)
async def mark_payroll_paid(
    payroll_id: str,
    http_request: Request,
    hr_mgr: User = Depends(require_hr_team)
):
    """Mark a locked payroll as Paid (moves status to Paid)."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll record not found")
        
    before_state = payroll.model_dump()
    if payroll.status != PayrollStatus.LOCKED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark payroll as Paid in '{payroll.status.value}' state. Must be locked first."
        )
        
    payroll.status = PayrollStatus.PAID
    payroll.updated_at = datetime.now(timezone.utc)
    await payroll.save()
    
    await AuditService.log_event(
        actor=hr_mgr,
        entity_type="payroll",
        entity_id=payroll.id,
        action="paid",
        before_state=before_state,
        after_state=payroll.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    await NotificationService.notify_user(
        user_id=payroll.user_id,
        sender_id=hr_mgr.id,
        title="Payroll Paid",
        message=f"Your payroll for {payroll.month} has been marked as paid. You can now view your payslip.",
        type="system"
    )

    # Audit log
    log = ActivityLog(
        user_id=hr_mgr.id,
        user_name=hr_mgr.name,
        action="Payroll Paid Marking",
        details=f"Marked payroll month {payroll.month} for employee {payroll.user_name} (net {payroll.net_salary}) as Paid"
    )
    await log.insert()
    
    return {"message": "Payroll successfully marked as Paid!"}


@router.get("/summary", response_model=dict)
async def get_payroll_summary(
    month: str,
    tenant_id: str,
    user: User = Depends(require_hr_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Get payroll stats summary for management dashboard. When a business unit is
    active, only payrolls belonging to that unit are aggregated."""
    from app.services.user_service import get_visible_employee_ids
    cid = require_tenant_id(user)
    visible_ids = await get_visible_employee_ids(user)

    query_conditions = [Payroll.month == month, Payroll.tenant_id == cid]

    if visible_ids is not None:
        query_conditions.append(In(Payroll.user_id, list(visible_ids)))
    if active_bu_id is not None:
        query_conditions.append(Payroll.business_unit_id == active_bu_id)

    payrolls = await Payroll.find(*query_conditions).to_list()

    total_payout = sum(p.net_salary for p in payrolls)
    total_processed = len(payrolls)

    status_counts = {
        "draft": 0,
        "under_review": 0,
        "approved": 0,
        "locked": 0,
        "paid": 0
    }
    for p in payrolls:
        val = p.status.value
        if val in status_counts:
            status_counts[val] += 1

    # Monthly Payout Trend (last 6 months)
    try:
        year, month_num = map(int, month.split("-"))
    except Exception:
        now_utc = datetime.now(timezone.utc)
        year, month_num = now_utc.year, now_utc.month

    trend_months = []
    for i in range(5, -1, -1):
        m_num = month_num - i
        y_num = year
        while m_num <= 0:
            m_num += 12
            y_num -= 1
        trend_months.append(f"{y_num}-{m_num:02d}")

    # Build single aggregation query to group and sum net_salary by month
    match_stage = {
        "tenant_id": cid,
        "month": {"$in": trend_months}
    }
    if visible_ids is not None:
        match_stage["user_id"] = {"$in": list(visible_ids)}
    if active_bu_id is not None:
        match_stage["business_unit_id"] = active_bu_id

    agg_res = await Payroll.aggregate([
        {"$match": match_stage},
        {"$group": {"_id": "$month", "total_payout": {"$sum": "$net_salary"}}}
    ]).to_list()

    payout_map = {item["_id"]: item["total_payout"] for item in agg_res}
    
    trend = []
    for m_str in trend_months:
        trend.append({
            "month": m_str,
            "payout": payout_map.get(m_str, 0.0)
        })

    return {
        "total_payout": total_payout,
        "total_processed": total_processed,
        "status_counts": status_counts,
        "trend": trend
    }


@router.get("/pending", response_model=List[dict])
async def get_pending_payrolls(
    employee_id: Optional[str] = None,
    year: Optional[str] = None,
    month: Optional[str] = None,
    user: User = Depends(require_hr_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """List payroll runs. Filters by hierarchy for non-Admin roles. When a business
    unit is active, only payrolls belonging to that unit are returned.
    Supports searching by employee_id, year, and month."""
    from app.services.user_service import get_visible_employee_ids
    cid = require_tenant_id(user)

    visible_ids = await get_visible_employee_ids(user)
    conditions = [Payroll.tenant_id == cid]
    if visible_ids is not None:
        conditions.append(In(Payroll.user_id, list(visible_ids)))
    if active_bu_id is not None:
        conditions.append(Payroll.business_unit_id == active_bu_id)

    # Search filters
    if employee_id:
        conditions.append(Payroll.user_id == PydanticObjectId(employee_id))

    if year or month:
        target_year = year or ""
        target_month = month or ""
        if target_year and target_month:
            padded_month = target_month.zfill(2)
            conditions.append(Payroll.month == f"{target_year}-{padded_month}")
        elif target_year:
            conditions.append({"month": {"$regex": f"^{target_year}-"}})
        elif target_month:
            padded_month = target_month.zfill(2)
            conditions.append({"month": {"$regex": f"-{padded_month}$"}})

    payrolls = await Payroll.find(*conditions).sort("-month").to_list()

    return [
        {
            "id": str(p.id),
            "user_id": str(p.user_id),
            "user_name": p.user_name,
            "month": p.month,
            "status": p.status.value,
            "base_salary": p.base_salary,
            "net_salary": p.net_salary,
            "drafted_by": p.drafted_by_name,
            "reviewed_by": p.reviewed_by_name,
            "basic": p.basic,
            "hra": p.hra,
            "special_allowance": p.special_allowance,
            "pf_deduction": p.pf_deduction,
            "esi_deduction": p.esi_deduction,
            "tax_deduction": p.tax_deduction,
            "present_days": p.present_days,
            "absent_days": p.absent_days,
            "paid_leaves": p.paid_leaves,
            "approved_regularization_days": p.approved_regularization_days,
            "payable_days": p.payable_days,
            "holidays_weekends": p.holidays_weekends,
            "total_working_days": p.total_working_days,
            "lop_deduction": p.lop_deduction,
            "overtime_pay": p.overtime_pay,
            "penalties": p.penalties,
            "incentives": p.incentives,
            "bonuses": p.bonuses,
            "deductions": p.deductions,
            "version_number": p.version_number,
            "recalculation_required": p.recalculation_required
        }
        for p in payrolls
    ]


@router.post("/review/{payroll_id}")
async def review_payroll(
    payroll_id: str,
    action: PayrollActionRequest,
    http_request: Request,
    hr_mgr: User = Depends(require_hr_manager)
):
    """Review and verify a payroll draft (HR Manager or Admin only)."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    if hr_mgr.role != UserRole.ADMIN:
        from app.services.user_service import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(hr_mgr)
        if visible_ids is not None and payroll.user_id not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only review payroll for employees under your hierarchy."
            )

    before_state = payroll.model_dump()
    if payroll.status != PayrollStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot review payroll in '{payroll.status.value}' state.",
        )

    payroll.status = PayrollStatus.UNDER_REVIEW
    payroll.reviewed_by = hr_mgr.id
    payroll.reviewed_by_name = hr_mgr.name
    payroll.updated_at = datetime.now(timezone.utc)
    await payroll.save()

    await AuditService.log_event(
        actor=hr_mgr,
        entity_type="payroll",
        entity_id=payroll.id,
        action="reviewed",
        before_state=before_state,
        after_state=payroll.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    await NotificationService.notify_user(
        user_id=payroll.user_id,
        sender_id=hr_mgr.id,
        title="Payroll Under Review",
        message=f"Your payroll for {payroll.month} is currently under review.",
        type="system"
    )

    return {"message": "Payroll draft verified and moved to Under Review status."}


@router.post("/approve/{payroll_id}")
async def approve_payroll(
    payroll_id: str,
    action: PayrollActionRequest,
    http_request: Request,
    admin: User = Depends(require_admin)
):
    """Approve and lock payroll (Admin/MD only). Generates official audit logs."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    before_state = payroll.model_dump()
    if payroll.status not in [PayrollStatus.DRAFT, PayrollStatus.UNDER_REVIEW]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve payroll in '{payroll.status.value}' state.",
        )

    payroll.status = PayrollStatus.LOCKED
    payroll.approved_by = admin.id
    payroll.approved_by_name = admin.name
    payroll.updated_at = datetime.now(timezone.utc)
    await payroll.save()

    await AuditService.log_event(
        actor=admin,
        entity_type="payroll",
        entity_id=payroll.id,
        action="locked",
        before_state=before_state,
        after_state=payroll.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    await NotificationService.notify_user(
        user_id=payroll.user_id,
        sender_id=admin.id,
        title="Payroll Approved",
        message=f"Your payroll for {payroll.month} has been approved and locked.",
        type="system"
    )

    # Log critical audit entry
    log = ActivityLog(
        user_id=admin.id,
        user_name=admin.name,
        action="Payroll Finalized & Locked",
        details=f"Locked monthly payroll run of net {payroll.net_salary} for employee {payroll.user_name} (month: {payroll.month})",
    )
    await log.insert()

    return {"message": "Payroll successfully approved, locked, and payslip generated!"}


@router.post("/recalculate/{payroll_id}")
async def manual_recalculate_payroll(
    payroll_id: str,
    http_request: Request,
    admin: User = Depends(require_hr_team)
):
    """Manually trigger recalculation of a payroll (draft, or flagged as recalculation_required)."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    employee = await User.get(payroll.user_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    # Only HR team/admins can recalculate
    if admin.role != UserRole.ADMIN:
        from app.services.user_service import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(admin)
        if visible_ids is not None and payroll.user_id not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only manage payroll for employees under your hierarchy."
            )

    try:
        before_state = payroll.model_dump()
        new_payroll = await calculate_corporate_payroll(
            employee=employee,
            month=payroll.month,
            drafted_by_id=admin.id,
            drafted_by_name=admin.name,
            force=True
        )

        await AuditService.log_event(
            actor=admin,
            entity_type="payroll",
            entity_id=new_payroll.id,
            action="recalculated",
            before_state=before_state,
            after_state=new_payroll.model_dump(),
            ip_address=http_request.client.host,
            user_agent=http_request.headers.get("user-agent")
        )

        # Clear any pending impacts for this employee/month
        from app.models.payroll_impact import PayrollRecalculationImpact, ImpactStatus
        from app.services.payroll_impact_service import PayrollImpactService
        pending_impacts = await PayrollRecalculationImpact.find(
            PayrollRecalculationImpact.user_id == employee.id,
            PayrollRecalculationImpact.month == payroll.month,
            PayrollRecalculationImpact.status == ImpactStatus.PENDING
        ).to_list()
        for impact in pending_impacts:
            await PayrollImpactService.mark_processed(impact.id, admin.id)

        return {"message": "Payroll recalculated successfully", "id": str(new_payroll.id)}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{payroll_id}")
async def delete_payroll(
    payroll_id: str,
    admin: User = Depends(require_hr_team)
):
    """Delete a payroll and its history (HR Manager or Admin only)."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    if admin.role not in [UserRole.ADMIN, UserRole.HR_MANAGER]:
         raise HTTPException(
             status_code=status.HTTP_403_FORBIDDEN,
             detail="Only HR Managers or Admins can delete payrolls."
         )

    from app.models.payroll import PayrollHistory
    await PayrollHistory.find(PayrollHistory.payroll_id == payroll.id).delete()
    await payroll.delete()

    # Log audit entry
    log = ActivityLog(
        user_id=admin.id,
        user_name=admin.name,
        action="Payroll Deleted",
        details=f"Deleted payroll {payroll.month} for employee {payroll.user_name}.",
    )
    await log.insert()

    return {"message": "Payroll and its history successfully deleted."}


def convert_object_ids(obj):
    if isinstance(obj, list):
        return [convert_object_ids(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: convert_object_ids(v) for k, v in obj.items()}
    elif obj.__class__.__name__ in ("ObjectId", "PydanticObjectId"):
        return str(obj)
    return obj


@router.get("/{payroll_id}/history")
async def get_payroll_history(
    payroll_id: str,
    current_user: User = Depends(get_current_user)
):
    """Fetch version history of a specific payroll."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    # Check permissions (either it's my payroll, or I am HR/Admin with visibility)
    if current_user.id != payroll.user_id:
        if current_user.role not in [UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER, UserRole.MANAGER, UserRole.ASSISTANT_MANAGER]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        if current_user.role != UserRole.ADMIN:
            from app.services.user_service import get_visible_employee_ids
            visible_ids = await get_visible_employee_ids(current_user)
            if visible_ids is not None and payroll.user_id not in visible_ids:
                 raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    from app.models.payroll import PayrollHistory
    history = await PayrollHistory.find(PayrollHistory.payroll_id == payroll.id).sort("-version_number").to_list()

    return [
        {
            "version_number": h.version_number,
            "reason_for_change": h.reason_for_change,
            "created_at": to_utc_iso(h.created_at),
            "snapshot": convert_object_ids(h.payroll_snapshot)
        }
        for h in history
    ]



@router.post("/unlock/{payroll_id}")
async def unlock_payroll(
    payroll_id: str,
    action: PayrollActionRequest,
    admin: User = Depends(require_admin)
):
    """Unlock a locked payroll for further edits (Admin only)."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")
    if payroll.status != PayrollStatus.LOCKED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot unlock payroll in '{payroll.status.value}' state.",
        )
    payroll.status = PayrollStatus.DRAFT
    payroll.approved_by = None
    payroll.approved_by_name = None
    payroll.updated_at = datetime.now(timezone.utc)
    await payroll.save()

    # Log audit entry for unlock action
    log = ActivityLog(
        user_id=admin.id,
        user_name=admin.name,
        action="Payroll Unlock",
        details=f"Unlocked payroll {payroll.month} for employee {payroll.user_name} (net {payroll.net_salary})",
    )
    await log.insert()
    return {"message": "Payroll successfully unlocked and set to draft."}


@router.get("/my", response_model=List[dict])
async def get_my_payslips(current_user: User = Depends(get_current_user)):
    """Employee reads their standard generated payslips."""
    payslips = await Payroll.find(
        Payroll.user_id == current_user.id,
        In(Payroll.status, [PayrollStatus.LOCKED, PayrollStatus.PAID])
    ).sort("-month").to_list()

    return [
        {
            "id": str(p.id),
            "month": p.month,
            "base_salary": p.base_salary or 0.0,
            "earned_salary": p.earned_salary or 0.0,
            "overtime_pay": p.overtime_pay or 0.0,
            "incentives": p.incentives or 0.0,
            "bonuses": p.bonuses or 0.0,
            "penalties": p.penalties or 0.0,
            "deductions": (p.deductions or 0.0) + (p.pf_deduction or 0.0) + (p.esi_deduction or 0.0) + (p.tax_deduction or 0.0),
            "net_salary": p.net_salary or 0.0,
            "approved_by": p.approved_by_name,
            "finalized_at": to_utc_iso(p.updated_at),
            "status": p.status.value if hasattr(p.status, "value") else str(p.status)
        }
        for p in payslips
    ]


@router.get("/my-payslips", response_model=List[dict])
async def get_my_payslips_v2(current_user: User = Depends(get_current_user)):
    """Employee reads their generated payslips with detailed breakdown (high-fi)."""
    payslips = await Payroll.find(
        Payroll.user_id == current_user.id,
        In(Payroll.status, [PayrollStatus.LOCKED, PayrollStatus.PAID])
    ).sort("-month").to_list()

    res = []
    for p in payslips:
        # Safety: handle potential None values in financial fields
        earned = p.earned_salary or 0.0
        overtime = p.overtime_pay or 0.0
        incentives = p.incentives or 0.0
        bonuses = p.bonuses or 0.0

        penalties = p.penalties or 0.0
        extra_deduct = p.deductions or 0.0
        pf = p.pf_deduction or 0.0
        esi = p.esi_deduction or 0.0
        tax = p.tax_deduction or 0.0

        gross_earnings = earned + overtime + incentives + bonuses
        total_deductions = penalties + extra_deduct + pf + esi + tax

        res.append({
            "id": str(p.id),
            "month": p.month,
            "base_salary": p.base_salary or 0.0,
            "gross_earnings": gross_earnings,
            "total_deductions": total_deductions,
            "net_salary": p.net_salary or 0.0,
            "overtime_pay": overtime,
            "incentives": incentives,
            "bonuses": bonuses,
            
            # Detailed breakdown
            "basic": p.basic or 0.0,
            "hra": p.hra or 0.0,
            "special_allowance": p.special_allowance or 0.0,
            "pf_deduction": pf,
            "esi_deduction": esi,
            "tax_deduction": tax,
            "present_days": p.present_days or 0,
            "absent_days": p.absent_days or 0,
            "paid_leaves": p.paid_leaves or 0,
            "approved_regularization_days": p.approved_regularization_days or 0,
            "payable_days": p.payable_days or 0,
            "holidays_weekends": p.holidays_weekends or 0,
            "total_working_days": p.total_working_days or 0,
            "lop_deduction": p.lop_deduction or 0.0,
            "penalties": penalties,
            "deductions": extra_deduct,
            "version_number": p.version_number or 1,
            
            "status": p.status.value if hasattr(p.status, "value") else str(p.status),
            "created_at": to_utc_iso(p.created_at),
        })
    return res
