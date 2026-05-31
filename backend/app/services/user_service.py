"""
User/Employee service - business logic for user operations.
"""
from app.models.user import User, UserRole
from app.auth.password import hash_password
from app.models.activity_log import ActivityLog
from beanie import PydanticObjectId
from beanie.operators import In
from datetime import datetime
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
) -> User:
    """Create a new employee user."""
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
    )
    await user.insert()

    await ActivityLog(
        user_id=user.id,
        action="employee_created",
        details=f"Employee {name} created",
    ).insert()

    return user


async def get_all_employees() -> List[User]:
    """Get all registered system users (employees, managers, HR, admins, etc.) who are not deleted."""
    return await User.find(User.is_deleted != True).sort("-created_at").to_list()


async def get_employee_by_id(employee_id: str) -> Optional[User]:
    """Get a specific employee by ID."""
    return await User.get(PydanticObjectId(employee_id))


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
        update_data["password_hash"] = hash_password(password)
        update_data["raw_password"] = None

    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await user.set(update_data)

    return await User.get(PydanticObjectId(employee_id))


async def deactivate_employee(employee_id: str) -> Optional[User]:
    """Deactivate an employee."""
    user = await User.get(PydanticObjectId(employee_id))
    if not user:
        return None

    await user.set({"is_active": False, "updated_at": datetime.utcnow()})

    await ActivityLog(
        user_id=user.id,
        action="employee_deactivated",
        details=f"Employee {user.name} deactivated",
    ).insert()

    return user


async def soft_delete_employee(employee_id: str) -> Optional[User]:
    """Soft delete an employee (move to trash)."""
    user = await User.get(PydanticObjectId(employee_id))
    if not user:
        return None

    await user.set({"is_deleted": True, "updated_at": datetime.utcnow()})

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

    await user.set({"is_deleted": False, "updated_at": datetime.utcnow()})

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
    from app.models.payroll import Payroll, SalaryStructure
    from app.models.activity_log import ActivityLog
    from app.models.notification import Notification
    from app.models.recurring_task import RecurrenceRule
    from app.models.regularization import AttendanceRegularization

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
