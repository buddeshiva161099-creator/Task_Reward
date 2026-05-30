import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from app.models.payroll import Payroll, SalaryStructure, PayrollStatus, PayrollHistory
from app.models.user import User, UserRole
from app.models.company import Company
from app.models.attendance import Attendance
from app.models.leave import Leave, LeaveStatus, LeaveType
from app.models.regularization import AttendanceRegularization, RegularizationStatus
from app.routes.payroll import calculate_corporate_payroll
from app.models.attendance import IST
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client.test_db, document_models=[
        User, Company, Payroll, SalaryStructure, Attendance, Leave, AttendanceRegularization, PayrollHistory
    ])

    # clear db
    await User.find_all().delete()
    await Company.find_all().delete()
    await Payroll.find_all().delete()
    await SalaryStructure.find_all().delete()
    await Attendance.find_all().delete()
    await Leave.find_all().delete()
    await AttendanceRegularization.find_all().delete()
    await PayrollHistory.find_all().delete()

    yield
    await client.drop_database("test_db")

@pytest.mark.asyncio
async def test_calculate_corporate_payroll_basic():
    company = Company(name="Test Corp", geofence_radius_meters=100)
    await company.insert()

    user = User(
        email="test@example.com",
        name="Test User",
        role=UserRole.EMPLOYEE,
        company_id=company.id,
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

    start_date = datetime(2024, 5, 1, 9, 0, tzinfo=timezone.utc)
    for i in range(5):
        attn = Attendance(
            user_id=user.id,
            company_id=company.id,
            check_in=start_date + timedelta(days=i),
            status="present"
        )
        await attn.insert()

    payroll = await calculate_corporate_payroll(user, "2024-05")

    assert payroll.month == "2024-05"
    assert payroll.present_days == 5
    assert payroll.base_salary == 20000.0

@pytest.mark.asyncio
async def test_calculate_corporate_payroll_with_regularization():
    company = Company(name="Test Corp")
    await company.insert()
    user = User(email="test2@example.com", name="Test User 2", role=UserRole.EMPLOYEE, company_id=company.id, hiring_date="2023-01-01", password_hash="mock_hash")
    await user.insert()

    struct = SalaryStructure(
        user_id=user.id, basic=10000, hra=5000, special_allowance=5000
    )
    await struct.insert()

    check_in_date = datetime(2024, 5, 1, 9, 0, tzinfo=timezone.utc)
    attn = Attendance(
        user_id=user.id, company_id=company.id, check_in=check_in_date, status="present", remarks="Regularized"
    )
    await attn.insert()

    reg = AttendanceRegularization(
        user_id=user.id, attendance_id=attn.id, reason="Forgot", status=RegularizationStatus.APPROVED
    )
    await reg.insert()

    payroll = await calculate_corporate_payroll(user, "2024-05")

    assert payroll.present_days == 0
    assert payroll.approved_regularization_days == 1
    assert payroll.payable_days == 1

@pytest.mark.asyncio
async def test_calculate_corporate_payroll_with_leaves():
    company = Company(name="Test Corp")
    await company.insert()
    user = User(email="test3@example.com", name="Test User 3", role=UserRole.EMPLOYEE, company_id=company.id, hiring_date="2023-01-01", password_hash="mock_hash")
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
    company = Company(name="Test Corp")
    await company.insert()
    user = User(email="test4@example.com", name="Test User 4", role=UserRole.EMPLOYEE, company_id=company.id, hiring_date="2023-01-01", password_hash="mock_hash")
    await user.insert()

    struct = SalaryStructure(user_id=user.id, basic=10000)
    await struct.insert()

    payroll_v1 = await calculate_corporate_payroll(user, "2024-05")
    assert payroll_v1.version_number == 1

    attn = Attendance(
        user_id=user.id, company_id=company.id, check_in=datetime(2024, 5, 10, 9, 0, tzinfo=timezone.utc), status="present"
    )
    await attn.insert()

    payroll_v2 = await calculate_corporate_payroll(user, "2024-05")

    assert payroll_v2.version_number == 2
    assert payroll_v2.present_days == 1

    history = await PayrollHistory.find(PayrollHistory.payroll_id == payroll_v2.id).to_list()
    assert len(history) == 1
    assert history[0].version_number == 1
    assert history[0].payroll_snapshot["present_days"] == 0
