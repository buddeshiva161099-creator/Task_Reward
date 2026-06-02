import pytest
import pytest_asyncio
import os
from app.models.user import User
from app.models.employee import Employee
from app.models.audit_event import AuditEvent
from app.models.payroll_impact import PayrollRecalculationImpact
from app.models.leave import Leave, LeaveType, LeaveStatus
from app.models.payroll import Payroll, PayrollStatus, SalaryStructure, PayrollHistory
from app.models.regularization import AttendanceRegularization, RegularizationStatus
from app.models.attendance import Attendance
from app.models.company import Company
from app.models.holiday import Holiday
from app.models.task import Task
from app.models.notification import Notification
from beanie import init_beanie
from pymongo import AsyncMongoClient

@pytest_asyncio.fixture(autouse=True)
async def db():
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = AsyncMongoClient(mongodb_url)
    await init_beanie(database=client.test_db_fixes, document_models=[
        User, Employee, AuditEvent, PayrollRecalculationImpact,
        Leave, Payroll, AttendanceRegularization, Attendance,
        Company, SalaryStructure, PayrollHistory, Holiday, Task, Notification
    ])

    # Clear db
    models = [
        User, Employee, AuditEvent, PayrollRecalculationImpact,
        Leave, Payroll, AttendanceRegularization, Attendance,
        Company, SalaryStructure, PayrollHistory, Holiday, Task, Notification
    ]
    for model in models:
        await model.find_all().delete()

    yield
    await client.drop_database("test_db_fixes")
