import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.models.policy import PolicyVersion, ApprovalPolicy
from app.models.ledger import LeaveLedgerEntry, RewardLedgerEntry
from app.models.leave import Leave, LeaveType, LeaveStatus
from app.models.leave_balance import LeaveBalance
from app.models.task import Task
from app.models.audit_event import AuditEvent
from app.models.notification_engine import NotificationTemplate, NotificationPreference, NotificationDeliveryLog
from datetime import datetime, timedelta, timezone
from beanie import PydanticObjectId

@pytest_asyncio.fixture(autouse=True)
async def db():
    import os
    from beanie import init_beanie
    from pymongo import AsyncMongoClient
    
    # Imports of all models
    from app.models.user import User
    from app.models.employee import Employee
    from app.models.audit_event import AuditEvent
    from app.models.payroll_impact import PayrollRecalculationImpact
    from app.models.leave import Leave
    from app.models.payroll import Payroll, SalaryStructure, PayrollHistory
    from app.models.regularization import AttendanceRegularization
    from app.models.attendance import Attendance
    from app.models.company import Company
    from app.models.tenant import Tenant
    from app.models.holiday import Holiday
    from app.models.task import Task
    from app.models.notification import Notification
    from app.models.activity_log import ActivityLog
    from app.models.leave_balance import LeaveBalance
    from app.models.chat_group import ChatGroup
    from app.models.chat_message import ChatMessage
    from app.models.ai_insight import CachedAIInsight
    from app.models.recurring_task import RecurrenceRule
    from app.models.category import Category
    from app.models.policy import PolicyVersion, ApprovalPolicy
    from app.models.ledger import LeaveLedgerEntry, RewardLedgerEntry
    from app.models.notification_engine import NotificationTemplate, NotificationPreference, NotificationDeliveryLog
    from app.models.business_unit import BusinessUnit
    from app.models.subscription_plan import SubscriptionPlan
    from app.models.platform_audit_log import PlatformAuditLog

    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = AsyncMongoClient(mongodb_url)
    await init_beanie(database=client.test_db_phase2, document_models=[
        User, Task, ActivityLog, Tenant, Company, Attendance, Holiday,
        RecurrenceRule, Notification, Category, Leave, LeaveBalance,
        AttendanceRegularization, SalaryStructure, Payroll, PayrollHistory,
        ChatGroup, ChatMessage, CachedAIInsight, AuditEvent, PayrollRecalculationImpact,
        Employee, PolicyVersion, ApprovalPolicy, LeaveLedgerEntry, RewardLedgerEntry,
        NotificationTemplate, NotificationPreference, NotificationDeliveryLog,
        BusinessUnit, SubscriptionPlan, PlatformAuditLog
    ])

    # Clear db
    models = [
        User, Employee, AuditEvent, PayrollRecalculationImpact,
        Leave, Payroll, AttendanceRegularization, Attendance,
        Tenant, Company, SalaryStructure, PayrollHistory, Holiday, Task, Notification,
        ActivityLog, LeaveBalance, ChatGroup, ChatMessage, CachedAIInsight,
        RecurrenceRule, Category, PolicyVersion, ApprovalPolicy,
        LeaveLedgerEntry, RewardLedgerEntry, NotificationTemplate,
        NotificationPreference, NotificationDeliveryLog,
        BusinessUnit, SubscriptionPlan, PlatformAuditLog
    ]
    for model in models:
        await model.find_all().delete()

    yield
    await client.drop_database("test_db_phase2")

@pytest_asyncio.fixture
async def test_company():
    company = Tenant(
        name="Phase2 Test Corp",
        geofence_radius_meters=500
    )
    await company.insert()
    return company

@pytest_asyncio.fixture
async def test_admin(test_company):
    admin = User(
        email="admin@phase2.com",
        name="Admin User",
        full_name="Admin User",
        password_hash="hash",
        role=UserRole.ADMIN,
        tenant_id=test_company.id
    )
    await admin.insert()
    return admin

@pytest_asyncio.fixture
async def test_employee_user(test_company):
    user = User(
        email="emp@phase2.com",
        name="Employee User",
        full_name="Employee User",
        password_hash="hash",
        role=UserRole.EMPLOYEE,
        tenant_id=test_company.id
    )
    await user.insert()
    
    balance = LeaveBalance(user_id=user.id)
    await balance.insert()
    
    return user

@pytest.mark.asyncio
async def test_policy_versioning(test_admin, test_company):
    """Test that creating and updating a company creates appropriate PolicyVersion records."""
    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: test_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Update company settings
        payload = {
            "work_start_time": "10:00",
            "casual_leave_limit": 15
        }
        response = await ac.put(f"/tenants/{test_company.id}", json=payload)
        assert response.status_code == 200

        # 2. Check if a PolicyVersion was created
        versions = await PolicyVersion.find(PolicyVersion.tenant_id == test_company.id).to_list()
        assert len(versions) >= 1
        latest = sorted(versions, key=lambda v: v.version)[-1]
        assert latest.work_start_time == "10:00"
        assert latest.casual_leave_limit == 15

@pytest.mark.asyncio
async def test_leave_ledger_usage_and_sync(test_admin, test_employee_user, test_company):
    """Test that approving a leave records ledger entries and updates balance dynamically."""
    # Create leave request
    leave = Leave(
        user_id=test_employee_user.id,
        user_name=test_employee_user.name,
        leave_type=LeaveType.CASUAL,
        start_date=datetime.now(),
        end_date=datetime.now(),
        reason="Vacation",
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

        # Verify LeaveLedgerEntry was created
        ledger_entries = await LeaveLedgerEntry.find(
            LeaveLedgerEntry.user_id == test_employee_user.id,
            LeaveLedgerEntry.leave_type == "casual"
        ).to_list()
        # Initial accrual (12) + usage (-1)
        assert len(ledger_entries) == 2
        usages = [e for e in ledger_entries if e.transaction_type == "usage"]
        assert len(usages) == 1
        assert usages[0].amount == -1.0

        # Check that LeaveBalance cache is correctly synced
        balance = await LeaveBalance.find_one(LeaveBalance.user_id == test_employee_user.id)
        assert balance.casual_used == 1.0

@pytest.mark.asyncio
async def test_reward_ledger_usage_and_sync(test_admin, test_employee_user, test_company):
    """Test that scoring tasks creates reward ledger entries and updates cached points."""
    # Create task completed by employee
    task = Task(
        work_description="Complete documentation",
        assigned_to=test_employee_user.id,
        tenant_id=test_company.id,
        priority="high",
        deadline=datetime.now(timezone.utc) + timedelta(days=1),
        created_by=test_admin.id,
        status="completed",
        completed_at=datetime.now(timezone.utc)
    )
    await task.insert()

    # Trigger point scoring directly
    from app.services.reward_service import apply_performance_score
    points, details = await apply_performance_score(task)
    assert points > 0

    # Verify RewardLedgerEntry was created
    ledger_entries = await RewardLedgerEntry.find(RewardLedgerEntry.user_id == test_employee_user.id).to_list()
    assert len(ledger_entries) == 1
    assert ledger_entries[0].amount == points
    assert ledger_entries[0].transaction_type == "earned"

    # Check User document caching
    user = await User.get(test_employee_user.id)
    assert user.reward_points == points

@pytest.mark.asyncio
async def test_notification_templates_and_delivery_logging(test_employee_user):
    """Test dispatching templated notification and ensuring delivery logs are recorded."""
    from app.services.notification_engine_service import NotificationEngineService
    await NotificationEngineService.seed_templates()

    # Dispatch leave approved notification
    logs = await NotificationEngineService.dispatch_templated_notification(
        user_id=test_employee_user.id,
        template_name="leave_approved",
        context={"start_date": "2026-06-01", "end_date": "2026-06-05", "approver_name": "HR Manager"}
    )
    # Delivered to in_app and email (mocked)
    assert len(logs) == 2
    
    db_logs = await NotificationDeliveryLog.find(NotificationDeliveryLog.user_id == test_employee_user.id).to_list()
    assert len(db_logs) == 2
    assert "delivered" in [dl.status for dl in db_logs]

@pytest.mark.asyncio
async def test_reporting_excel_exports(test_admin):
    """Test Excel exports of new ledgers and audit logs routes."""
    from app.auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: test_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Check leaves export
        response = await ac.get("/reports/leaves/excel")
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers["content-type"]

        # Check rewards export
        response = await ac.get("/reports/rewards/excel")
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers["content-type"]

        # Check audit export
        response = await ac.get("/reports/audit/excel")
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers["content-type"]
