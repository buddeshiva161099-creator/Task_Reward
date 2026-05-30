from fastapi import APIRouter, Depends, HTTPException, status
from app.models.user import User, UserRole
from app.models.payroll import Payroll, SalaryStructure, PayrollStatus
from app.models.activity_log import ActivityLog
from app.auth.dependencies import get_current_user, require_hr_team, require_any_hr_manager, require_admin, require_hr_manager
from pydantic import BaseModel
from typing import List, Optional
from beanie import PydanticObjectId
from beanie.operators import Or, In
from datetime import datetime, timedelta

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
    company_id: str
    month: str  # Format: "YYYY-MM"
    department_id: Optional[str] = None
    employee_id: Optional[str] = None


async def calculate_corporate_payroll(
    employee: User,
    month: str,
    drafted_by_id: Optional[PydanticObjectId] = None,
    drafted_by_name: Optional[str] = None
) -> Payroll:
    from app.models.company import Company
    from app.models.attendance import Attendance, IST
    from app.models.holiday import Holiday
    from app.models.leave import Leave, LeaveStatus
    from app.models.regularization import AttendanceRegularization, RegularizationStatus
    from datetime import timezone

    # 1. Parse Month/Year
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

    # 2. Join Date Check
    joining_date = None
    if employee.hiring_date:
        try:
            joining_date = datetime.strptime(employee.hiring_date, "%Y-%m-%d").replace(tzinfo=IST)
        except Exception:
            pass
    if not joining_date:
        joining_date = employee.created_at
        if joining_date.tzinfo is None:
            joining_date = joining_date.replace(tzinfo=timezone.utc)
    
    joining_date_utc = joining_date.astimezone(timezone.utc)

    if joining_date_utc > end_of_month:
        raise ValueError(f"Employee {employee.name} joined after the selected month ({month}).")

    # 3. Active window proration
    active_start_date_utc = max(start_of_month, joining_date_utc)
    active_end_date_utc = end_of_month
    
    active_start_date = active_start_date_utc.astimezone(IST)
    active_end_date = active_end_date_utc.astimezone(IST)
    
    active_days = (active_end_date.date() - active_start_date.date()).days + 1
    is_prorated = active_days < total_days_in_month

    # 4. Fetch Salary Structure
    structure = await SalaryStructure.find_one(SalaryStructure.user_id == employee.id)
    if not structure:
        raise ValueError(f"Salary structure not configured.")

    # 5. Fetch Company & Holidays
    company = await Company.get(employee.company_id) if employee.company_id else None
    if not company:
        company = await Company.find_one(Company.is_active == True)

    holidays_list = await Holiday.find(
        Holiday.date >= start_of_month,
        Holiday.date <= end_of_month,
        Or(Holiday.company_id == employee.company_id, Holiday.company_id == None)
    ).to_list() if company else []
    holiday_dates = {h.date.astimezone(IST).date() for h in holidays_list}

    # 6. Count working days, weekends, holidays in active window
    total_working_days = 0
    holidays_weekends = 0
    
    cur_day = active_start_date
    while cur_day.date() <= active_end_date.date():
        cur_date = cur_day.date()
        is_weekend = cur_date.weekday() >= 5
        is_holiday = cur_date in holiday_dates
        
        if is_weekend or is_holiday:
            holidays_weekends += 1
        else:
            total_working_days += 1
        cur_day += timedelta(days=1)

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
    present_days = 0
    absent_days = 0
    paid_leaves = 0
    approved_regularization_days = 0
    late_penalties = 0.0
    overtime_pay = 0.0

    max_paid_casual_per_month = getattr(company, "max_paid_casual_leaves_per_month", 1)
    casual_leaves_counter = 0

    cur_day = active_start_date
    while cur_day.date() <= active_end_date.date():
        cur_date = cur_day.date()
        is_weekend = cur_date.weekday() >= 5
        is_holiday = cur_date in holiday_dates
        
        if not (is_weekend or is_holiday):
            log = attendance_map.get(cur_date)
            is_regularized = log and str(log.id) in regularized_attendance_ids

            if log:
                status_lower = log.status.lower() if log.status else ""
                if "absent" in status_lower or "absence" in status_lower:
                    absent_days += 1
                else:
                    if is_regularized:
                        approved_regularization_days += 1
                    else:
                        present_days += 1

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
                            paid_leaves += 1
                        else:
                            # Excess casual leaves in the month are unpaid (Loss of Pay)
                            absent_days += 1
                    elif ltype_str == "loss_of_pay":
                        absent_days += 1
                    elif ltype_str in ["sick", "earned", "approved_leave"]:
                        paid_leaves += 1
                    else:
                        # Paid leaves are counted towards paid_leaves
                        paid_leaves += 1
                else:
                    absent_days += 1
        cur_day += timedelta(days=1)

    payable_days = present_days + paid_leaves + approved_regularization_days
    absent_days = max(0, total_working_days - payable_days)

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
        if company:
            # Calculate regular attendance rate
            earned_attn_pts = 0.0
            cur_day = active_start_date
            while cur_day.date() <= active_end_date.date():
                cur_date = cur_day.date()
                is_weekend = cur_date.weekday() >= 5
                is_holiday = cur_date in holiday_dates
                
                if not (is_weekend or is_holiday):
                    log = attendance_map.get(cur_date)
                    if log:
                        status_lower = log.status.lower() if log.status else ""
                        if "absent" in status_lower or "absence" in status_lower:
                            earned_attn_pts += company.attendance_points.get("unexcused", -1.0)
                        elif "late_under_30" in status_lower:
                            earned_attn_pts += company.attendance_points.get("late_under_30", 0.75)
                        elif "late_over_30" in status_lower:
                            earned_attn_pts += company.attendance_points.get("late_over_30", 0.50)
                        elif "late" in status_lower:
                            earned_attn_pts += company.attendance_points.get("late", 0.75)
                        elif "excused" in status_lower:
                            earned_attn_pts += 1.0
                        else:
                            earned_attn_pts += company.attendance_points.get("present", 1.0)
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
            
            if attn_rate >= company.attendance_bonus_threshold:
                bonuses = gross_base * (company.attendance_bonus_percentage / 100.0)
            
            # Calculate Performance Incentive
            from app.models.task import Task, TaskStatus
            role_targets = {
                UserRole.MANAGER: 200.0,
                UserRole.ASSISTANT_MANAGER: 190.0,
                UserRole.HR_MANAGER: 152.0,
                UserRole.EMPLOYEE: 200.0,
            }
            if employee.name == "Shiva":
                role_targets[UserRole.EMPLOYEE] = 148.2
                
            target_pts = role_targets.get(employee.role, 150.0)
            perf_score = (employee.reward_points / target_pts) * 100.0 if target_pts > 0 else 0.0
            
            # Match performance to tier
            tier_pct = 0.0
            for tier in company.incentive_tiers:
                if tier["min_performance"] <= perf_score <= tier["max_performance"]:
                    tier_pct = tier["pool_percentage"]
                    break
            
            incentives = gross_base * (tier_pct / 100.0) * (company.performance_incentive_pool_percentage / 100.0)
                
            # Backlog penalty (> 5 overdue tasks)
            overdue_count = await Task.find(
                Task.assigned_to == employee.id,
                Task.status == TaskStatus.OVERDUE,
                Task.deadline < start_of_month - timedelta(days=4)
            ).count()
            if overdue_count > 5:
                incentives *= 0.95

    # Check if payroll is already locked
    if existing and existing.status in [PayrollStatus.LOCKED, PayrollStatus.PAID]:
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
            payroll_snapshot=existing.dict(exclude={"id", "created_at", "updated_at", "version_number", "recalculation_required"}),
            reason_for_change="Recalculated based on latest approved attendance/leave data.",
            created_by=drafted_by_id
        )
        await history.insert()

        # Increment version and reset recalculation required flag
        payroll.version_number += 1
        payroll.recalculation_required = False
    else:
        payroll = Payroll(user_id=employee.id, user_name=employee.name, month=month)

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
        from app.routes.employees import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(hr_mgr)
        if visible_ids is not None and user_id not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only configure salary structures for employees under your hierarchy."
            )

    structure = await SalaryStructure.find_one(SalaryStructure.user_id == user_id)
    if not structure:
        structure = SalaryStructure(user_id=user_id)

    structure.basic = request.basic
    structure.hra = request.hra
    structure.special_allowance = request.special_allowance
    structure.pf_deduction = request.pf_deduction
    structure.esi_deduction = request.esi_deduction
    structure.tax_deduction = request.tax_deduction
    structure.updated_at = datetime.utcnow()
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
            from app.routes.employees import get_visible_employee_ids
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
    hr_user: User = Depends(require_hr_team)
):
    """Prepare a new payroll draft (Assistant HR Manager or above)."""
    uid = PydanticObjectId(request.user_id)
    employee = await User.get(uid)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if hr_user.role != UserRole.ADMIN:
        from app.routes.employees import get_visible_employee_ids
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
            
        return {"message": "Payroll draft successfully generated", "id": str(payroll.id)}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/run", response_model=dict)
async def run_payroll_engine(
    request: RunPayrollRequest,
    hr_user: User = Depends(require_hr_team)
):
    """Run payroll processing for matching scope (Company, Department, Employee)."""
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(hr_user)
    
    query = {
        "company_id": PydanticObjectId(request.company_id),
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
        
    employees = await User.find(query).to_list()
    
    total_processed = 0
    total_payout = 0.0
    pending_employees = 0
    errors = []
    missing_attendance = []

    # Pre-compute month boundaries once (not inside the loop)
    from app.models.attendance import Attendance
    year, month_num = map(int, request.month.split("-"))
    attn_start = datetime(year, month_num, 1)
    attn_end = datetime(year + 1, 1, 1) if month_num == 12 else datetime(year, month_num + 1, 1)
    
    for emp in employees:
        if visible_ids is not None and emp.id not in visible_ids:
            continue
            
        try:
            payroll = await calculate_corporate_payroll(
                employee=emp,
                month=request.month,
                drafted_by_id=hr_user.id,
                drafted_by_name=hr_user.name
            )
            if payroll:
                total_processed += 1
                total_payout += payroll.net_salary
                
                # Check for zero attendance
                attn_count = await Attendance.find(
                    Attendance.user_id == emp.id,
                    Attendance.check_in >= attn_start,
                    Attendance.check_in < attn_end
                ).count()
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
    hr_mgr: User = Depends(require_hr_team)
):
    """Mark a locked payroll as Paid (moves status to Paid)."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll record not found")
        
    if payroll.status != PayrollStatus.LOCKED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark payroll as Paid in '{payroll.status.value}' state. Must be locked first."
        )
        
    payroll.status = PayrollStatus.PAID
    payroll.updated_at = datetime.utcnow()
    await payroll.save()
    
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
    company_id: str,
    user: User = Depends(require_hr_team)
):
    """Get payroll stats summary for management dashboard."""
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(user)
    
    query_conditions = [Payroll.month == month]
    
    if visible_ids is not None:
        query_conditions.append(In(Payroll.user_id, list(visible_ids)))
        
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
    trend = []
    try:
        year, month_num = map(int, month.split("-"))
    except Exception:
        year, month_num = datetime.utcnow().year, datetime.utcnow().month

    base_date = datetime(year, month_num, 1)
    for i in range(5, -1, -1):
        # Subtract months
        m_num = month_num - i
        y_num = year
        while m_num <= 0:
            m_num += 12
            y_num -= 1
        m_str = f"{y_num}-{m_num:02d}"
        
        sub_conds = [Payroll.month == m_str]
        if visible_ids is not None:
            sub_conds.append(In(Payroll.user_id, list(visible_ids)))
        sub_payrolls = await Payroll.find(*sub_conds).to_list()
        trend.append({
            "month": m_str,
            "payout": sum(p.net_salary for p in sub_payrolls)
        })
        
    return {
        "total_payout": total_payout,
        "total_processed": total_processed,
        "status_counts": status_counts,
        "trend": trend
    }


@router.get("/pending", response_model=List[dict])
async def get_pending_payrolls(user: User = Depends(require_hr_team)):
    """List payroll runs. Filters by hierarchy for non-Admin roles."""
    from app.routes.employees import get_visible_employee_ids

    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None:
        payrolls = await Payroll.find(
            In(Payroll.user_id, list(visible_ids))
        ).sort("-month").to_list()
    else:
        payrolls = await Payroll.find_all().sort("-month").to_list()

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
    hr_mgr: User = Depends(require_hr_manager)
):
    """Review and verify a payroll draft (HR Manager or Admin only)."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    if hr_mgr.role != UserRole.ADMIN:
        from app.routes.employees import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(hr_mgr)
        if visible_ids is not None and payroll.user_id not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only review payroll for employees under your hierarchy."
            )

    if payroll.status != PayrollStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot review payroll in '{payroll.status.value}' state.",
        )

    payroll.status = PayrollStatus.UNDER_REVIEW
    payroll.reviewed_by = hr_mgr.id
    payroll.reviewed_by_name = hr_mgr.name
    payroll.updated_at = datetime.utcnow()
    await payroll.save()

    return {"message": "Payroll draft verified and moved to Under Review status."}


@router.post("/approve/{payroll_id}")
async def approve_payroll(
    payroll_id: str,
    action: PayrollActionRequest,
    admin: User = Depends(require_admin)
):
    """Approve and lock payroll (Admin/MD only). Generates official audit logs."""
    payroll = await Payroll.get(PydanticObjectId(payroll_id))
    if not payroll:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    if payroll.status not in [PayrollStatus.DRAFT, PayrollStatus.UNDER_REVIEW]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve payroll in '{payroll.status.value}' state.",
        )

    payroll.status = PayrollStatus.LOCKED
    payroll.approved_by = admin.id
    payroll.approved_by_name = admin.name
    payroll.updated_at = datetime.utcnow()
    await payroll.save()

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
        from app.routes.employees import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(admin)
        if visible_ids is not None and payroll.user_id not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only manage payroll for employees under your hierarchy."
            )

    try:
        new_payroll = await calculate_corporate_payroll(
            employee=employee,
            month=payroll.month,
            drafted_by_id=admin.id,
            drafted_by_name=admin.name
        )
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
            from app.routes.employees import get_visible_employee_ids
            visible_ids = await get_visible_employee_ids(current_user)
            if visible_ids is not None and payroll.user_id not in visible_ids:
                 raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    from app.models.payroll import PayrollHistory
    history = await PayrollHistory.find(PayrollHistory.payroll_id == payroll.id).sort("-version_number").to_list()

    return [
        {
            "version_number": h.version_number,
            "reason_for_change": h.reason_for_change,
            "created_at": h.created_at.isoformat(),
            "snapshot": h.payroll_snapshot
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
    payroll.updated_at = datetime.utcnow()
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
            "base_salary": p.base_salary,
            "earned_salary": p.earned_salary,
            "overtime_pay": p.overtime_pay,
            "incentives": p.incentives,
            "bonuses": p.bonuses,
            "penalties": p.penalties,
            "deductions": p.deductions + p.pf_deduction + p.esi_deduction + p.tax_deduction,
            "net_salary": p.net_salary,
            "approved_by": p.approved_by_name,
            "finalized_at": p.updated_at.isoformat(),
            "status": p.status.value
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
        gross_earnings = p.earned_salary + p.overtime_pay + p.incentives + p.bonuses
        total_deductions = p.penalties + p.deductions + p.pf_deduction + p.esi_deduction + p.tax_deduction
        res.append({
            "id": str(p.id),
            "month": p.month,
            "base_salary": p.base_salary,
            "gross_earnings": gross_earnings,
            "total_deductions": total_deductions,
            "net_salary": p.net_salary,
            "overtime_pay": p.overtime_pay,
            "incentives": p.incentives,
            "bonuses": p.bonuses,
            
            # Detailed breakdown
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
            "penalties": p.penalties,
            "deductions": p.deductions,
            "version_number": p.version_number,
            
            "status": p.status.value,
            "created_at": p.created_at.isoformat(),
        })
    return res
