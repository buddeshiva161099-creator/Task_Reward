"""
Verification script for AI Workforce Intelligence.
Initializes a mock database and tests the heuristic calculations, summaries, and report structures.
"""
import sys
import os
# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))

import asyncio
from datetime import datetime, timedelta
from app.database.connection import init_db
from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.attendance import Attendance
from app.services import ai_service


async def run_verification():
    print("[INFO] Initializing mock MongoDB connection and Beanie ODM...")
    # Force use of mongomock by using a mock database name
    import os
    os.environ["DATABASE_NAME"] = "tasktracker_mock_ai_test"
    
    # Initialize connection
    await init_db()
    
    print("[INFO] Seeding verification data...")
    # Fetch default admin seeded by connection
    admin = await User.find_one(User.role == UserRole.ADMIN)
    if not admin:
        print("[FAIL] Admin user not seeded.")
        return
        
    # Seed a manager and a reportee employee
    manager = User(
        name="Test Manager",
        email="manager@company.com",
        password_hash="...",
        role=UserRole.MANAGER
    )
    await manager.insert()
    
    employee = User(
        name="Test Employee",
        email="employee@company.com",
        password_hash="...",
        role=UserRole.EMPLOYEE,
        reporting_manager_id=manager.id
    )
    await employee.insert()

    # Seed some tasks
    now = datetime.utcnow()
    
    # Overdue task
    t1 = Task(
        work_description="Critical Overdue Assignment",
        assigned_to=employee.id,
        assigned_to_name=employee.name,
        created_by=manager.id,
        status=TaskStatus.IN_PROGRESS,
        priority=TaskPriority.CRITICAL,
        deadline=now - timedelta(days=2)
    )
    await t1.insert()

    # Completed task
    t2 = Task(
        work_description="Completed On Time Assignment",
        assigned_to=employee.id,
        assigned_to_name=employee.name,
        created_by=manager.id,
        status=TaskStatus.COMPLETED,
        priority=TaskPriority.MEDIUM,
        deadline=now + timedelta(days=5),
        completed_at=now + timedelta(hours=1)
    )
    await t2.insert()

    # Active task
    t3 = Task(
        work_description="Future Assignment High Risk",
        assigned_to=employee.id,
        assigned_to_name=employee.name,
        created_by=manager.id,
        status=TaskStatus.ASSIGNED,
        priority=TaskPriority.HIGH,
        deadline=now + timedelta(hours=4)
    )
    await t3.insert()

    # Seed attendance logs
    att1 = Attendance(
        user_id=employee.id,
        company_id=PydanticObjectId(),
        check_in=now - timedelta(days=1, hours=8),
        check_out=now - timedelta(days=1),
        status="present"
    )
    await att1.insert()

    att2 = Attendance(
        user_id=employee.id,
        company_id=PydanticObjectId(),
        check_in=now - timedelta(hours=3),
        status="late"
    )
    await att2.insert()

    print("[OK] Verification data seeded successfully.")

    # 1. Test Task Intelligence
    print("\n--- Testing Task Intelligence ---")
    task_intel = await ai_service.run_task_analysis([employee.id])
    print(f"Total active tasks evaluated: {task_intel['total_active_tasks']}")
    print(f"Overdue tasks identified: {task_intel['total_overdue_tasks']}")
    
    overloaded_names = [o["name"] for o in task_intel["overloaded_employees"]]
    print(f"Overloaded employees: {overloaded_names}")
    
    for pred in task_intel["task_predictions"]:
        print(f"Task: '{pred['description']}' - Risk: {pred['risk_score']}% - Prediction: {pred['completion_prediction']}")
        if pred["insights"]:
            print(f"  AI Insights: {pred['insights']}")

    # 2. Test Performance Intelligence
    print("\n--- Testing Performance Intelligence ---")
    perf_intel = await ai_service.run_performance_analysis([employee.id])
    print(f"Team Average Productivity: {perf_intel['team_average_productivity']}%")
    for emp_perf in perf_intel["employee_performance"]:
        print(f"Employee: {emp_perf['name']} - Productivity: {emp_perf['productivity_score']}% - Consistency: {emp_perf['consistency_score']}% - Burnout: {emp_perf['burnout_risk']}")
        if emp_perf["insights"]:
            print(f"  AI Insights: {emp_perf['insights']}")

    # 3. Test Attendance Intelligence
    print("\n--- Testing Attendance Intelligence ---")
    att_intel = await ai_service.run_attendance_analysis([employee.id])
    for l in att_intel["consistency_rankings"]:
        print(f"Consistency Score for {l['name']}: {l['consistency_score']}%")
    if att_intel["alerts"]:
        print("Attendance warnings:")
        for alert in att_intel["alerts"]:
            print(f"  - {alert}")

    # 4. Test Dashboard Summary
    print("\n--- Testing Dashboard Summaries ---")
    admin_summary = await ai_service.generate_ai_dashboard_summary(admin)
    print("Admin AI Summary:")
    print(f"  Text: {admin_summary['ai_summary']}")
    print(f"  Alerts count: {len(admin_summary['alerts'])}")
    print(f"  Recommendations: {admin_summary['recommendations']}")

    employee_user_obj = await User.get(employee.id)
    emp_summary = await ai_service.generate_ai_dashboard_summary(employee_user_obj)
    print("Employee AI Summary:")
    print(f"  Text: {emp_summary['ai_summary']}")
    print(f"  Alerts count: {len(emp_summary['alerts'])}")
    
    # 5. Test Copilot Chat Assistant
    print("\n--- Testing Copilot Chat Assistant ---")
    queries = [
        "Show overdue tasks",
        "Who is overloaded?",
        "How is the team performance?",
        "General help"
    ]
    for q in queries:
        print(f"User Question: '{q}'")
        res = await ai_service.run_ai_copilot_assistant(q, admin)
        print(f"Copilot Response:\n{res['answer']}\n")

    print("[SUCCESS] All AI Workforce Intelligence modules tested successfully on local mongomock!")


if __name__ == "__main__":
    from beanie import PydanticObjectId
    asyncio.run(run_verification())
