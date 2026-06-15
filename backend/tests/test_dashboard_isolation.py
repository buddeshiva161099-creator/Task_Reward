import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.models.task import Task, TaskStatus
from app.models.attendance import Attendance, ist_now
from app.models.activity_log import ActivityLog
from app.models.ledger import RewardLedgerEntry
from datetime import datetime, timedelta, timezone
from beanie import PydanticObjectId

@pytest.mark.asyncio
async def test_dashboard_isolation():
    # 1. Create two separate tenants
    tenant_1 = Tenant(name="Tenant One", is_active=True)
    await tenant_1.insert()

    tenant_2 = Tenant(name="Tenant Two", is_active=True)
    await tenant_2.insert()

    # 2. Create Tenant Admins
    admin_1 = User(
        email="admin1@tenant1.com",
        name="Admin One",
        password_hash="hash",
        role=UserRole.ADMIN,
        tenant_id=tenant_1.id,
        is_active=True
    )
    await admin_1.insert()

    admin_2 = User(
        email="admin2@tenant2.com",
        name="Admin Two",
        password_hash="hash",
        role=UserRole.ADMIN,
        tenant_id=tenant_2.id,
        is_active=True
    )
    await admin_2.insert()

    # 3. Create Tenant Employees
    employee_1 = User(
        email="emp1@tenant1.com",
        name="Employee One",
        password_hash="hash",
        role=UserRole.EMPLOYEE,
        tenant_id=tenant_1.id,
        reward_points=100.0,
        is_active=True
    )
    await employee_1.insert()

    employee_2 = User(
        email="emp2@tenant2.com",
        name="Employee Two",
        password_hash="hash",
        role=UserRole.EMPLOYEE,
        tenant_id=tenant_2.id,
        reward_points=250.0,
        is_active=True
    )
    await employee_2.insert()

    # 4. Seed Tasks under each tenant
    task_1 = Task(
        work_description="Tenant 1 Task",
        assigned_to=employee_1.id,
        created_by=admin_1.id,
        status=TaskStatus.COMPLETED,
        deadline=datetime.now(timezone.utc) + timedelta(days=2),
        completed_at=datetime.now(timezone.utc),
        reward_given=True,
        reward_points=100.0,
        tenant_id=tenant_1.id
    )
    await task_1.insert()

    task_2 = Task(
        work_description="Tenant 2 Task",
        assigned_to=employee_2.id,
        created_by=admin_2.id,
        status=TaskStatus.COMPLETED,
        deadline=datetime.now(timezone.utc) + timedelta(days=2),
        completed_at=datetime.now(timezone.utc),
        reward_given=True,
        reward_points=250.0,
        tenant_id=tenant_2.id
    )
    await task_2.insert()

    # 5. Seed Attendance logs for today
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    attendance_1 = Attendance(
        user_id=employee_1.id,
        tenant_id=tenant_1.id,
        check_in=today_start + timedelta(hours=9),
        check_out=today_start + timedelta(hours=17),
        status="present"
    )
    await attendance_1.insert()

    attendance_2 = Attendance(
        user_id=employee_2.id,
        tenant_id=tenant_2.id,
        check_in=today_start + timedelta(hours=9),
        check_out=today_start + timedelta(hours=17),
        status="present"
    )
    await attendance_2.insert()

    # 6. Seed Activity Logs
    activity_1 = ActivityLog(
        user_id=employee_1.id,
        tenant_id=tenant_1.id,
        action="task_completed",
        details="Employee One completed task"
    )
    await activity_1.insert()

    activity_2 = ActivityLog(
        user_id=employee_2.id,
        tenant_id=tenant_2.id,
        action="task_completed",
        details="Employee Two completed task"
    )
    await activity_2.insert()

    # 7. Override dependencies for Tenant 1 Admin
    from app.auth.dependencies import get_current_user, require_management_team
    from app.auth.tenant_scope import get_active_business_unit_id

    app.dependency_overrides[require_management_team] = lambda: admin_1
    app.dependency_overrides[get_current_user] = lambda: admin_1
    app.dependency_overrides[get_active_business_unit_id] = lambda: None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # A. Fetch Tenant 1 Admin Dashboard
        response = await ac.get("/dashboard/admin")
        assert response.status_code == 200
        data = response.json()

        # Employees metrics
        assert data["employees"]["total"] == 1  # Only employee_1, not employee_2
        assert data["employees"]["active"] == 1

        # Task counts
        assert data["tasks"]["total"] == 1
        assert data["tasks"]["completed"] == 1

        # Attendance today
        assert data["attendance_today"]["present"] == 1
        assert data["attendance_today"]["total"] == 1

        # Leaderboard
        assert len(data["leaderboard"]) == 1
        assert data["leaderboard"][0]["email"] == "emp1@tenant1.com"
        assert data["leaderboard"][0]["reward_points"] == 100.0

        # Recent activities
        assert len(data["recent_activity"]) == 1
        assert data["recent_activity"][0]["user_name"] == "Employee One"

        # Total rewards given
        assert data["total_rewards_given"] == 1

        # Performance tracking
        assert data["performance_tracking"]["assigned_tasks"] == 1

        # B. Test Employee 1 Personal Dashboard Scoping
        app.dependency_overrides[get_current_user] = lambda: employee_1
        response = await ac.get("/dashboard/employee")
        assert response.status_code == 200
        emp_data = response.json()

        # Verify info in personal dashboard
        assert emp_data["user"]["email"] == "emp1@tenant1.com"
        assert emp_data["tasks"]["total"] == 1
        assert emp_data["rewards_earned"] == 1
        assert len(emp_data["recent_activity"]) == 1
        assert emp_data["recent_activity"][0]["details"] == "Employee One completed task"

    # Reset overrides
    app.dependency_overrides.clear()
