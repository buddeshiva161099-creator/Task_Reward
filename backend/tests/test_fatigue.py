import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.models.task import Task, TaskStatus, TaskPriority, TaskType
from app.models.attendance import Attendance
from app.models.leave import Leave, LeaveType, LeaveStatus
from datetime import datetime, timedelta, timezone
from app.auth.dependencies import require_management_team

@pytest.mark.asyncio
async def test_employee_fatigue_scoring_and_api():
    # 1. Create a Tenant
    tenant = Tenant(name="Test Attrition Tenant", is_active=True)
    await tenant.insert()

    # 2. Create Tenant Admin/Manager
    admin = User(
        email="manager@attrition.com",
        name="Team Manager",
        password_hash="pw",
        role=UserRole.ADMIN,
        tenant_id=tenant.id,
        is_active=True
    )
    await admin.insert()

    # 3. Create Tenant Employee to test fatigue metrics
    employee = User(
        email="employee@attrition.com",
        name="Tired Employee",
        password_hash="pw",
        role=UserRole.EMPLOYEE,
        reporting_manager_id=admin.id,
        tenant_id=tenant.id,
        is_active=True
    )
    await employee.insert()

    # 4. Seed Stress factors over past 30 days
    now = datetime.now(timezone.utc)
    
    # Stress factor A: Overtime sessions (2 consecutive days of 12-hour shifts)
    # Day 1: check_in at now - 3 days
    day1_in = now - timedelta(days=3, hours=12)
    day1_out = now - timedelta(days=3)
    att1 = Attendance(
        user_id=employee.id,
        tenant_id=tenant.id,
        check_in=day1_in,
        check_out=day1_out,
        status="present"
    )
    await att1.insert()

    # Day 2: check_in at now - 2 days (Consecutive)
    day2_in = now - timedelta(days=2, hours=12)
    day2_out = now - timedelta(days=2)
    att2 = Attendance(
        user_id=employee.id,
        tenant_id=tenant.id,
        check_in=day2_in,
        check_out=day2_out,
        status="present"
    )
    await att2.insert()

    # Stress factor B: Late arrival check-in
    day3_in = now - timedelta(days=1, hours=8)
    day3_out = now - timedelta(days=1)
    att3 = Attendance(
        user_id=employee.id,
        tenant_id=tenant.id,
        check_in=day3_in,
        check_out=day3_out,
        status="late" # Late arrival
    )
    await att3.insert()

    # Stress factor C: Late/Overdue Task
    task = Task(
        work_description="Complete urgent reporting task",
        assigned_to=employee.id,
        created_by=admin.id,
        status=TaskStatus.COMPLETED_LATE,
        priority=TaskPriority.HIGH,
        task_type=TaskType.ASSIGNED,
        deadline=now - timedelta(days=4),
        completed_at=now - timedelta(days=3),
        tenant_id=tenant.id
    )
    await task.insert()

    # Stress factor D: Short notice leave request (notice is 2 hours)
    leave_start = now + timedelta(days=2)
    leave_created = now + timedelta(days=2) - timedelta(hours=2) # 2 hours notice
    leave = Leave(
        user_id=employee.id,
        user_name=employee.name,
        tenant_id=tenant.id,
        leave_type=LeaveType.SICK,
        start_date=leave_start,
        end_date=leave_start + timedelta(days=1),
        reason="Not feeling well, sick leave",
        status=LeaveStatus.APPROVED,
        created_at=leave_created
    )
    await leave.insert()

    # 5. Setup FastAPI mock credentials
    app.dependency_overrides[require_management_team] = lambda: admin

    # 6. Invoke GET /dashboard/fatigue
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/dashboard/fatigue")
        assert response.status_code == 200
        
        report_data = response.json()
        assert len(report_data) == 1
        
        emp_report = report_data[0]
        assert emp_report["id"] == str(employee.id)
        assert emp_report["name"] == "Tired Employee"
        
        # Verify specific calculations:
        # A. Overtime days = 2
        assert emp_report["metrics"]["overtime_days"] == 2
        assert emp_report["metrics"]["overtime_streak_days"] == 2
        
        # B. Late arrivals = 1
        assert emp_report["metrics"]["late_arrivals"] == 1
        
        # C. Late/Overdue Tasks = 1
        assert emp_report["metrics"]["late_overdue_tasks"] == 1
        
        # D. Short notice leaves = 1
        assert emp_report["metrics"]["short_notice_leaves"] == 1

        # Check score is aggregated and risk level set properly
        assert emp_report["fatigue_score"] > 0
        assert emp_report["risk_category"] in ["low", "medium", "high", "critical"]
        assert len(emp_report["incidents"]) > 0

    # 7. Clean up overrides
    app.dependency_overrides.clear()
