"""
User/Employee service - business logic for user operations.
"""
from app.models.user import User, UserRole
from app.auth.password import hash_password, validate_password_strength
from app.models.activity_log import ActivityLog
from beanie import PydanticObjectId
from beanie.operators import In
from datetime import datetime, timezone
from typing import Optional, List

NON_ADMIN_ROLES = [
    UserRole.HR_MANAGER,
    UserRole.ASSISTANT_HR_MANAGER,
    UserRole.MANAGER,
    UserRole.ASSISTANT_MANAGER,
    UserRole.EMPLOYEE,
]


async def create_employee(
    name: str,
    email: str,
    password: str,
    mobile: str = None,
    alternate_mobile: str = None,
    role: str = "employee",
    reporting_manager_id: str = None,
    hr_reporting_manager_id: str = None,
    identity_card_type: str = None,
    identity_card_url: str = None,
    emergency_contact: str = None,
    job_title: str = None,
    department: str = None,
    branch: str = None,
    hiring_date: str = None,
    hiring_company: str = None,
    tenant_id: Optional[PydanticObjectId] = None,
    business_unit_id: Optional[PydanticObjectId] = None,
) -> User:
    """Create a new employee user."""
    validate_password_strength(password)

    existing = await User.find_one(User.email == email)
    if existing:
        raise ValueError("Email already registered")

    user = User(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=role,
        mobile=mobile,
        alternate_mobile=alternate_mobile,
        reporting_manager_id=PydanticObjectId(reporting_manager_id) if reporting_manager_id else None,
        hr_reporting_manager_id=PydanticObjectId(hr_reporting_manager_id) if hr_reporting_manager_id else None,
        identity_card_type=identity_card_type,
        identity_card_url=identity_card_url,
        emergency_contact=emergency_contact,
        job_title=job_title,
        department=department,
        branch=branch,
        hiring_date=hiring_date,
        hiring_company=hiring_company,
        tenant_id=tenant_id,
        business_unit_id=business_unit_id,
    )
    await user.insert()

    await ActivityLog(
        user_id=user.id,
        tenant_id=tenant_id,
        action="employee_created",
        details=f"Employee {name} created",
    ).insert()

    return user


async def get_all_employees(
    tenant_id: Optional[PydanticObjectId] = None,
    business_unit_id: Optional[PydanticObjectId] = None,
) -> List[User]:
    """Get all registered system users who are not deleted.

    If `tenant_id` is provided, returns only users belonging to that tenant.
    If `business_unit_id` is also provided, narrows further to that unit.
    """
    if business_unit_id is not None:
        return await User.find(
            User.is_deleted != True,
            User.tenant_id == tenant_id,
            User.business_unit_id == business_unit_id,
        ).sort("-created_at").to_list()
    if tenant_id is not None:
        return await User.find(
            User.is_deleted != True,
            User.tenant_id == tenant_id,
        ).sort("-created_at").to_list()
    return await User.find(User.is_deleted != True).sort("-created_at").to_list()


async def get_employee_by_id(employee_id: str, tenant_id: Optional[PydanticObjectId] = None) -> Optional[User]:
    """Get a specific employee by ID. If `tenant_id` is provided, the user must belong to that tenant."""
    user = await User.get(PydanticObjectId(employee_id))
    if not user:
        return None
    if tenant_id is not None and user.tenant_id != tenant_id:
        return None
    return user


async def update_employee(employee_id: str, **kwargs) -> Optional[User]:
    """Update employee details."""
    user = await User.get(PydanticObjectId(employee_id))
    if not user:
        return None

    update_data = {k: v for k, v in kwargs.items() if v is not None}

    # Convert manager string IDs to PydanticObjectIds
    for field in ["reporting_manager_id", "hr_reporting_manager_id"]:
        if field in update_data:
            val = update_data[field]
            update_data[field] = PydanticObjectId(val) if val else None
    
    if "email" in update_data and update_data["email"] != user.email:
        existing = await User.find_one(User.email == update_data["email"])
        if existing:
            raise ValueError("Email already registered to another user")

    if "password" in update_data:
        password = update_data.pop("password")
        validate_password_strength(password)
        update_data["password_hash"] = hash_password(password)
        update_data["raw_password"] = None

    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await user.set(update_data)

    return await User.get(PydanticObjectId(employee_id))


async def deactivate_employee(employee_id: str) -> Optional[User]:
    """Deactivate an employee and close any open attendance sessions."""
    user = await User.get(PydanticObjectId(employee_id))
    if not user:
        return None

    # Close any open attendance sessions so payroll / analytics do not count
    # an inactive employee as still on the clock.
    from app.models.attendance import Attendance
    from datetime import timezone as _tz
    now_utc = datetime.now(_tz.utc)
    open_sessions = await Attendance.find(
        Attendance.user_id == user.id,
        Attendance.check_out == None,
    ).to_list()
    closed_session_count = 0
    for session in open_sessions:
        session.check_out = now_utc
        session.is_auto_closed = True
        session.remarks = (session.remarks or "") + " [Auto-closed: employee deactivated]"
        if "auto_closed" not in session.flags:
            session.flags.append("auto_closed")
        if "user_deactivated" not in session.flags:
            session.flags.append("user_deactivated")
        await session.save()
        closed_session_count += 1

    await user.set({"is_active": False, "updated_at": datetime.now(timezone.utc)})

    details = f"Employee {user.name} deactivated"
    if closed_session_count:
        details += f"; closed {closed_session_count} open attendance session(s)"
    await ActivityLog(
        user_id=user.id,
        action="employee_deactivated",
        details=details,
    ).insert()

    return user


async def soft_delete_employee(employee_id: str) -> Optional[User]:
    """Soft delete an employee (move to trash)."""
    user = await User.get(PydanticObjectId(employee_id))
    if not user:
        return None

    await user.set({"is_deleted": True, "updated_at": datetime.now(timezone.utc)})

    await ActivityLog(
        user_id=user.id,
        action="employee_deleted",
        details=f"Employee {user.name} soft-deleted",
    ).insert()

    return user


async def restore_employee(employee_id: str) -> Optional[User]:
    """Restore a soft-deleted employee."""
    user = await User.get(PydanticObjectId(employee_id))
    if not user:
        return None

    await user.set({"is_deleted": False, "updated_at": datetime.now(timezone.utc)})

    await ActivityLog(
        user_id=user.id,
        action="employee_restored",
        details=f"Employee {user.name} restored",
    ).insert()

    return user


async def hard_delete_employee(employee_id: str) -> bool:
    """Permanently delete an employee and all their associated records across all collections."""
    uid = PydanticObjectId(employee_id)
    user = await User.get(uid)
    if not user:
        return False

    # Import models dynamically to avoid circular references
    from app.models.task import Task
    from app.models.attendance import Attendance
    from app.models.leave import Leave
    from app.models.leave_balance import LeaveBalance
    from app.models.payroll import Payroll, SalaryStructure, PayrollHistory
    from app.models.activity_log import ActivityLog
    from app.models.notification import Notification
    from app.models.recurring_task import RecurrenceRule
    from app.models.regularization import AttendanceRegularization
    from app.models.ledger import LeaveLedgerEntry, RewardLedgerEntry
    from app.models.payroll_impact import PayrollRecalculationImpact
    from app.models.employee import Employee

    # Fetch payrolls to delete their histories
    payrolls = await Payroll.find(Payroll.user_id == uid).to_list()
    payroll_ids = [p.id for p in payrolls]
    if payroll_ids:
        await PayrollHistory.find(In(PayrollHistory.payroll_id, payroll_ids)).delete()

    # Delete all associated records matching user_id / assigned_to
    await Task.find(Task.assigned_to == uid).delete()
    await Attendance.find(Attendance.user_id == uid).delete()
    await Leave.find(Leave.user_id == uid).delete()
    await LeaveBalance.find(LeaveBalance.user_id == uid).delete()
    await Payroll.find(Payroll.user_id == uid).delete()
    await SalaryStructure.find(SalaryStructure.user_id == uid).delete()
    await ActivityLog.find(ActivityLog.user_id == uid).delete()
    await Notification.find(Notification.user_id == uid).delete()
    await AttendanceRegularization.find(AttendanceRegularization.user_id == uid).delete()
    await LeaveLedgerEntry.find(LeaveLedgerEntry.user_id == uid).delete()
    await RewardLedgerEntry.find(RewardLedgerEntry.user_id == uid).delete()
    await PayrollRecalculationImpact.find(PayrollRecalculationImpact.user_id == uid).delete()
    await Employee.find(Employee.user_id == uid).delete()

    # Remove employee from any Recurrence Rules they are assigned to
    await RecurrenceRule.find(RecurrenceRule.created_by == uid).delete()

    # Delete the user document itself
    await user.delete()
    return True


async def get_employee_count() -> int:
    """Get total number of all non-admin users who are not soft-deleted."""
    return await User.find(In(User.role, NON_ADMIN_ROLES)).count()


async def get_active_employee_count() -> int:
    """Get total number of active non-admin users who are not soft-deleted."""
    return await User.find(
        In(User.role, NON_ADMIN_ROLES), User.is_active == True
    ).count()


async def get_visible_employee_ids(user: User) -> set:
    """
    Returns a set of PydanticObjectIds of all employees visible to the given manager/HR.
    - Admin: returns None (unlimited visibility).
    - Manager: AMs reporting to them, Employees reporting to those AMs, and AHRMs reporting to them.
      If `scope_company_ids` is set, the visible set is further restricted to users whose
      `primary_company_id` is in that set.
    - HR Manager: AHRMs reporting to them, Employees reporting to those AHRMs, and AMs reporting to them.
    - Assistant Manager: Employees reporting to them.
    - Assistant HR Manager: Employees reporting to them.
    - Employee: Only themselves.
    """
    if hasattr(user, "_visible_employee_ids_cache"):
        return user._visible_employee_ids_cache

    if user.role == UserRole.ADMIN:
        user._visible_employee_ids_cache = None
        return None

    visible_ids = {user.id}

    # Per-Company manager delegation: when a manager has `scope_company_ids` set,
    # they can only see users whose primary_company_id is in that set.
    scope_company_ids = set(user.scope_company_ids or [])

    # Optimization: Use database-level distinct() for faster lookups without full document loading.
    if user.role == UserRole.MANAGER:
        # Performance optimization: Targeted DB queries instead of full scan
        # Get AMs and AHRMs reporting to this Manager
        sub_managers = await User.find(
            User.reporting_manager_id == user.id,
            In(User.role, [UserRole.ASSISTANT_MANAGER, UserRole.ASSISTANT_HR_MANAGER])
        ).to_list()

        am_ids = []
        for u in sub_managers:
            visible_ids.add(u.id)
            if u.role == UserRole.ASSISTANT_MANAGER:
                am_ids.append(u.id)

        if am_ids:
            # Employees reporting to those AMs
            emp_ids = await User.find(
                User.role == UserRole.EMPLOYEE,
                In(User.reporting_manager_id, am_ids)
            ).project({"_id": 1}).to_list()
            visible_ids.update(e.id if hasattr(e, "id") else e["_id"] for e in emp_ids)

    elif user.role == UserRole.HR_MANAGER:
        # Get AHRMs and AMs reporting to this HR Manager
        sub_managers = await User.find(
            User.hr_reporting_manager_id == user.id,
            In(User.role, [UserRole.ASSISTANT_HR_MANAGER, UserRole.ASSISTANT_MANAGER])
        ).to_list()

        ahrm_ids = []
        for u in sub_managers:
            visible_ids.add(u.id)
            if u.role == UserRole.ASSISTANT_HR_MANAGER:
                ahrm_ids.append(u.id)

        if ahrm_ids:
            # Employees reporting to those AHRMs
            emp_ids = await User.find(
                User.role == UserRole.EMPLOYEE,
                In(User.hr_reporting_manager_id, ahrm_ids)
            ).project({"_id": 1}).to_list()
            visible_ids.update(e.id if hasattr(e, "id") else e["_id"] for e in emp_ids)

    elif user.role == UserRole.ASSISTANT_MANAGER:
        emp_ids = await User.find(
            User.role == UserRole.EMPLOYEE,
            User.reporting_manager_id == user.id
        ).project({"_id": 1}).to_list()
        visible_ids.update(e.id if hasattr(e, "id") else e["_id"] for e in emp_ids)

    elif user.role == UserRole.ASSISTANT_HR_MANAGER:
        emp_ids = await User.find(
            User.role == UserRole.EMPLOYEE,
            User.hr_reporting_manager_id == user.id
        ).project({"_id": 1}).to_list()
        visible_ids.update(e.id if hasattr(e, "id") else e["_id"] for e in emp_ids)

    if scope_company_ids:
        scoped_users = await User.find(
            In(User.id, list(visible_ids)),
            In(User.primary_company_id, list(scope_company_ids))
        ).project({"_id": 1}).to_list()
        visible_ids = {u.id if hasattr(u, "id") else u["_id"] for u in scoped_users}

    user._visible_employee_ids_cache = visible_ids
    return visible_ids
