import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.employee import Employee
from app.models.audit_event import AuditEvent
from app.models.payroll_impact import PayrollRecalculationImpact
from app.models.leave import Leave, LeaveType, LeaveStatus
from app.models.leave_balance import LeaveBalance
from app.models.payroll import Payroll, PayrollStatus, SalaryStructure
from app.models.regularization import AttendanceRegularization, RegularizationStatus
from app.models.attendance import Attendance
from app.models.tenant import Tenant
from datetime import datetime, date, timedelta
from beanie import PydanticObjectId

@pytest_asyncio.fixture
async def test_company(db):
    company = Tenant(
        name="Test Fixes Corp",
        geofence_radius_meters=1000
    )
    await company.insert()
    return company

@pytest_asyncio.fixture
async def test_admin(db, test_company):
    admin = User(
        email="test_admin@company.com",
        name="Test Admin",
        full_name="Test Admin",
        password_hash="fakehash",
        role=UserRole.ADMIN,
        tenant_id=test_company.id
    )
    await admin.insert()
    return admin

@pytest_asyncio.fixture
async def test_hr_manager(db, test_company):
    hr = User(
        email="hr@company.com",
        name="HR Manager",
        full_name="HR Manager",
        password_hash="fakehash",
        role=UserRole.HR_MANAGER,
        tenant_id=test_company.id
    )
    await hr.insert()
    return hr

@pytest_asyncio.fixture
async def test_employee_user(db, test_company):
    user = User(
        email="test_emp@company.com",
        name="Test Employee",
        full_name="Test Employee",
        password_hash="fakehash",
        role=UserRole.EMPLOYEE,
        tenant_id=test_company.id
    )
    await user.insert()

    emp = Employee(
        user_id=user.id,
        first_name="Test",
        last_name="Employee",
        email=user.email,
        role="employee",
        tenant_id=test_company.id,
        location="HQ"
    )
    await emp.insert()

    # Initialize salary structure for payroll tests
    struct = SalaryStructure(
        user_id=user.id,
        basic=10000
    )
    await struct.insert()

    # Initialize leave balance
    balance = LeaveBalance(user_id=user.id)
    await balance.insert()

    return user, emp

@pytest.mark.asyncio
async def test_onboarding_audit(test_admin, db, test_company):
    """Test that creating an employee generates an audit event."""
    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: test_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "email": "new_hire@company.com",
            "name": "New Hire",
            "password": "SecurePassword123!@#",
            "mobile": "1234567890",
            "role": "manager",
            "job_title": "Manager",
            "department": "Sales",
            "hiring_company": "Test Company"
        }
        response = await ac.post("/admin/employees", json=payload)
        if response.status_code != 201:
            print(f"Error response: {response.json()}")
        assert response.status_code == 201

        # Check audit log
        audit = await AuditEvent.find_one(AuditEvent.action == "created", AuditEvent.entity_type == "employee")
        assert audit is not None
        assert audit.actor_id == test_admin.id
        assert audit.entity_id is not None
        assert audit.after_state["email"] == "new_hire@company.com"

@pytest.mark.asyncio
async def test_leave_payroll_impact(test_admin, test_employee_user, db, test_company):
    """Test that approving a leave creates a payroll impact."""
    user, emp = test_employee_user

    # Create a leave request
    leave = Leave(
        user_id=user.id,
        user_name=user.name,
        leave_type=LeaveType.CASUAL,
        start_date=datetime.now(),
        end_date=datetime.now(),
        reason="Test",
        status=LeaveStatus.PENDING
    )
    await leave.insert()

    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: test_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Approve leave
        response = await ac.post(f"/leaves/approve/{leave.id}", json={"comments": "approved"})
        assert response.status_code == 200

        # Check payroll impact
        impact = await PayrollRecalculationImpact.find_one(
            PayrollRecalculationImpact.user_id == user.id
        )
        assert impact is not None
        assert impact.source_event_type == "leave_approval"
        assert impact.source_event_id == leave.id

@pytest.mark.asyncio
async def test_payroll_lock_impact_notification(test_admin, test_hr_manager, test_employee_user, db, test_company):
    """Test that approvals for locked months notify rather than just flagging."""
    user, emp = test_employee_user

    # Set HR manager as manager for the user
    user.reporting_manager_id = test_hr_manager.id
    await user.save()

    # Create a locked payroll period for current month
    today = date.today()
    month_str = today.strftime("%Y-%m")

    payroll = Payroll(
        user_id=user.id,
        user_name=user.name,
        month=month_str,
        status=PayrollStatus.LOCKED
    )
    await payroll.insert()

    att = Attendance(
        user_id=user.id,
        tenant_id=test_company.id,
        check_in=datetime.now()
    )
    await att.insert()

    # Create a regularization request
    reg = AttendanceRegularization(
        user_id=user.id,
        user_name=user.name,
        attendance_id=att.id,
        reason="Forgot",
        status=RegularizationStatus.PENDING
    )
    await reg.insert()

    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: test_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Approve regularization
        response = await ac.post(f"/regularization/approve/{reg.id}", json={"comments": "ok"})
        assert response.status_code == 200

        # In the route logic, it should detect locked period and notify the HR manager (the user's manager)
        from app.models.notification import Notification
        notif = await Notification.find_one(
            Notification.user_id == test_hr_manager.id,
            Notification.title == "Action Required: Locked Payroll Impacted"
        )
        assert notif is not None
        assert month_str in notif.message
