import pytest
import pytest_asyncio
import os
from datetime import datetime, timezone, timedelta
from app.models.payroll import Payroll, SalaryStructure, PayrollStatus, PayrollHistory
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.models.attendance import Attendance
from app.models.holiday import Holiday
from app.models.task import Task
from app.models.leave import Leave, LeaveStatus, LeaveType
from app.models.regularization import AttendanceRegularization, RegularizationStatus
from app.routes.payroll import calculate_corporate_payroll
from app.models.attendance import IST
from beanie import init_beanie
from pymongo import AsyncMongoClient

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = AsyncMongoClient(mongodb_url)
    await init_beanie(database=client.test_db, document_models=[
        User, Tenant, Payroll, SalaryStructure, Attendance, Leave, AttendanceRegularization, PayrollHistory, Holiday, Task
    ])

    # clear db
    await User.find_all().delete()
    await Tenant.find_all().delete()
    await Payroll.find_all().delete()
    await SalaryStructure.find_all().delete()
    await Attendance.find_all().delete()
    await Leave.find_all().delete()
    await AttendanceRegularization.find_all().delete()
    await PayrollHistory.find_all().delete()
    await Holiday.find_all().delete()
    await Task.find_all().delete()

    yield
    await client.drop_database("test_db")

@pytest.mark.asyncio
async def test_calculate_corporate_payroll_basic():
    company = Tenant(name="Test Corp", geofence_radius_meters=100)
    await company.insert()

    user = User(
        email="test@example.com",
        name="Test User",
        role=UserRole.EMPLOYEE,
        tenant_id=company.id,
        hiring_date="2023-01-01",
        password_hash="mock_hash"
    )
    await user.insert()

    struct = SalaryStructure(
        user_id=user.id,
        basic=10000,
        hra=5000,
        special_allowance=5000,
        pf_deduction=1000,
        tax_deduction=500
    )
    await struct.insert()

    # May 1, 2, 3, 4, 5 2024.
    # May 1 (Wed), May 2 (Thu), May 3 (Fri) are working days.
    # May 4 (Sat), May 5 (Sun) are weekends.
    start_date = datetime(2024, 5, 1, 9, 0, tzinfo=timezone.utc)
    for i in range(5):
        attn = Attendance(
            user_id=user.id,
            tenant_id=company.id,
            check_in=start_date + timedelta(days=i),
            status="present"
        )
        await attn.insert()

    payroll = await calculate_corporate_payroll(user, "2024-05")

    assert payroll.month == "2024-05"
    assert payroll.present_days == 3  # Only Wed, Thu, Fri count. Sat, Sun are weekends.
    assert payroll.base_salary == 20000.0

@pytest.mark.asyncio
async def test_calculate_corporate_payroll_with_regularization():
    company = Tenant(name="Test Corp")
    await company.insert()
    user = User(email="test2@example.com", name="Test User 2", role=UserRole.EMPLOYEE, tenant_id=company.id, hiring_date="2023-01-01", password_hash="mock_hash")
    await user.insert()

    struct = SalaryStructure(
        user_id=user.id, basic=10000, hra=5000, special_allowance=5000
    )
    await struct.insert()

    check_in_date = datetime(2024, 5, 1, 9, 0, tzinfo=timezone.utc)
    attn = Attendance(
        user_id=user.id, tenant_id=company.id, check_in=check_in_date, status="present", remarks="Regularized"
    )
    await attn.insert()

    reg = AttendanceRegularization(
        user_id=user.id, attendance_id=attn.id, reason="Forgot", status=RegularizationStatus.APPROVED
    )
    await reg.insert()

    payroll = await calculate_corporate_payroll(user, "2024-05")

    assert payroll.present_days == 1
    assert payroll.approved_regularization_days == 1
    assert payroll.payable_days == 1

@pytest.mark.asyncio
async def test_calculate_corporate_payroll_with_leaves():
    company = Tenant(name="Test Corp")
    await company.insert()
    user = User(email="test3@example.com", name="Test User 3", role=UserRole.EMPLOYEE, tenant_id=company.id, hiring_date="2023-01-01", password_hash="mock_hash")
    await user.insert()

    struct = SalaryStructure(
        user_id=user.id, basic=10000, hra=5000, special_allowance=5000
    )
    await struct.insert()

    leave_start = datetime(2024, 5, 6, tzinfo=timezone.utc)
    leave_end = datetime(2024, 5, 7, tzinfo=timezone.utc)

    leave = Leave(
        user_id=user.id, user_name=user.name, leave_type=LeaveType.SICK,
        start_date=leave_start, end_date=leave_end, reason="Sick", status=LeaveStatus.APPROVED
    )
    await leave.insert()

    payroll = await calculate_corporate_payroll(user, "2024-05")

    assert payroll.paid_leaves == 2
    assert payroll.payable_days == 2

@pytest.mark.asyncio
async def test_payroll_recalculation_history():
    company = Tenant(name="Test Corp")
    await company.insert()
    user = User(email="test4@example.com", name="Test User 4", role=UserRole.EMPLOYEE, tenant_id=company.id, hiring_date="2023-01-01", password_hash="mock_hash")
    await user.insert()

    struct = SalaryStructure(user_id=user.id, basic=10000)
    await struct.insert()

    payroll_v1 = await calculate_corporate_payroll(user, "2024-05")
    assert payroll_v1.version_number == 1

    attn = Attendance(
        user_id=user.id, tenant_id=company.id, check_in=datetime(2024, 5, 10, 9, 0, tzinfo=timezone.utc), status="present"
    )
    await attn.insert()

    payroll_v2 = await calculate_corporate_payroll(user, "2024-05")

    assert payroll_v2.version_number == 2
    assert payroll_v2.present_days == 1

    history = await PayrollHistory.find(PayrollHistory.payroll_id == payroll_v2.id).to_list()
    assert len(history) == 1
    assert history[0].version_number == 1
    assert history[0].payroll_snapshot["present_days"] == 0


@pytest.mark.asyncio
async def test_payroll_recalculation_locked():
    company = Tenant(name="Test Corp")
    await company.insert()
    user = User(email="test5@example.com", name="Test User 5", role=UserRole.EMPLOYEE, tenant_id=company.id, hiring_date="2023-01-01", password_hash="mock_hash")
    await user.insert()

    struct = SalaryStructure(user_id=user.id, basic=12000)
    await struct.insert()

    payroll = await calculate_corporate_payroll(user, "2024-05")
    assert payroll.version_number == 1
    
    # Lock payroll
    payroll.status = PayrollStatus.LOCKED
    await payroll.save()

    # Recalculate without force - should return existing without change
    result_no_force = await calculate_corporate_payroll(user, "2024-05")
    assert result_no_force.version_number == 1

    # Add attendance log
    attn = Attendance(
        user_id=user.id, tenant_id=company.id, check_in=datetime(2024, 5, 10, 9, 0, tzinfo=timezone.utc), status="present"
    )
    await attn.insert()

    # Recalculate with force=True - should succeed and increment version, snapshotting the older one
    result_forced = await calculate_corporate_payroll(user, "2024-05", force=True)
    assert result_forced.version_number == 2
    assert result_forced.present_days == 1
    assert result_forced.status == PayrollStatus.LOCKED

    history = await PayrollHistory.find(PayrollHistory.payroll_id == result_forced.id).to_list()
    assert len(history) == 1
    assert history[0].version_number == 1
    assert history[0].payroll_snapshot["present_days"] == 0


@pytest.mark.asyncio
async def test_payroll_active_window_full_month():
    company = Tenant(name="Test Corp")
    await company.insert()
    
    # Hired mid-month on May 15th, 2024
    user = User(
        email="midmonth@example.com",
        name="Mid Month User",
        role=UserRole.EMPLOYEE,
        tenant_id=company.id,
        hiring_date="2024-05-15",
        password_hash="mock_hash"
    )
    await user.insert()

    struct = SalaryStructure(
        user_id=user.id,
        basic=10000,
        hra=5000,
        special_allowance=5000
    )
    await struct.insert()

    payroll = await calculate_corporate_payroll(user, "2024-05")

    # The active window should span the entire month (1st to 31st)
    # The total working days in the month of May 2024 is 23 working days (excluding weekends)
    assert payroll.total_working_days == 23
    assert payroll.base_salary == 20000.0
    # Because there is no active window proration, the basic salary, hra, special allowance are NOT prorated:
    assert payroll.basic == 10000.0
    assert payroll.hra == 5000.0
    assert payroll.special_allowance == 5000.0


@pytest.mark.asyncio
async def test_payroll_custom_company_work_days():
    # 4-day workweek (Monday to Thursday). Friday, Saturday, Sunday are weekoffs (weekends).
    company = Tenant(
        name="Custom Workweek Corp",
        work_days=["Monday", "Tuesday", "Wednesday", "Thursday"]
    )
    await company.insert()

    user = User(
        email="custom@example.com",
        name="Custom User",
        role=UserRole.EMPLOYEE,
        tenant_id=company.id,
        hiring_date="2024-01-01",
        password_hash="mock_hash"
    )
    await user.insert()

    struct = SalaryStructure(
        user_id=user.id,
        basic=10000,
        hra=5000,
        special_allowance=5000
    )
    await struct.insert()

    payroll = await calculate_corporate_payroll(user, "2024-05")

    # In May 2024 (31 days):
    # Total days: 31
    # Mondays: 4 (May 6, 13, 20, 27)
    # Tuesdays: 4 (May 7, 14, 21, 28)
    # Wednesdays: 5 (May 1, 8, 15, 22, 29)
    # Thursdays: 5 (May 2, 9, 16, 23, 30)
    # Total workdays = 4 + 4 + 5 + 5 = 18 working days.
    # Total weekoff days (Fridays, Saturdays, Sundays) = 31 - 18 = 13 weekoffs.
    assert payroll.total_working_days == 18
    assert payroll.holidays_weekends == 13


@pytest.mark.asyncio
async def test_get_payroll_history_endpoint():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    
    company = Tenant(name="Test Corp")
    await company.insert()
    
    admin = User(
        email="admin@example.com",
        name="Admin User",
        role=UserRole.ADMIN,
        tenant_id=company.id,
        password_hash="mock_hash"
    )
    await admin.insert()

    user = User(
        email="test_hist@example.com",
        name="Test User History",
        role=UserRole.EMPLOYEE,
        tenant_id=company.id,
        hiring_date="2023-01-01",
        password_hash="mock_hash"
    )
    await user.insert()

    struct = SalaryStructure(user_id=user.id, basic=10000)
    await struct.insert()

    payroll_v1 = await calculate_corporate_payroll(user, "2024-05")
    
    # Trigger version 2 recalculation to generate a history entry
    attn = Attendance(
        user_id=user.id, tenant_id=company.id, check_in=datetime(2024, 5, 10, 9, 0, tzinfo=timezone.utc), status="present"
    )
    await attn.insert()
    payroll_v2 = await calculate_corporate_payroll(user, "2024-05")
    
    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get(f"/payroll/{payroll_v2.id}/history")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["version_number"] == 1
        # Check that user_id inside the snapshot was serialized successfully as a string
        assert isinstance(data[0]["snapshot"]["user_id"], str)
        assert data[0]["snapshot"]["user_id"] == str(user.id)

