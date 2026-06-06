import pytest
import pytest_asyncio
import os
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
from app.models.recurring_task import RecurrenceRule
from app.models.category import Category
from app.models.leave_balance import LeaveBalance
from app.models.chat_group import ChatGroup
from app.models.chat_message import ChatMessage
from app.models.ai_insight import CachedAIInsight
from app.models.policy import PolicyVersion, ApprovalPolicy
from app.models.ledger import LeaveLedgerEntry, RewardLedgerEntry
from app.models.notification_engine import NotificationTemplate, NotificationPreference, NotificationDeliveryLog
from app.models.business_unit import BusinessUnit
from app.models.subscription_plan import SubscriptionPlan
from app.models.platform_audit_log import PlatformAuditLog

from beanie import init_beanie
from pymongo import AsyncMongoClient

@pytest_asyncio.fixture(autouse=True)
async def db():
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = AsyncMongoClient(mongodb_url)
    await init_beanie(database=client.test_db_fixes, document_models=[
        User, Task, ActivityLog, Tenant, Company, Attendance, Holiday, 
        RecurrenceRule, Notification, Category, Leave, LeaveBalance, 
        AttendanceRegularization, SalaryStructure, Payroll, PayrollHistory,
        ChatGroup, ChatMessage, CachedAIInsight, AuditEvent, PayrollRecalculationImpact,
        PolicyVersion, ApprovalPolicy, Employee, LeaveLedgerEntry, RewardLedgerEntry,
        NotificationTemplate, NotificationPreference, NotificationDeliveryLog,
        BusinessUnit, SubscriptionPlan, PlatformAuditLog
    ])

    # Clear db
    models = [
        User, Task, ActivityLog, Tenant, Company, Attendance, Holiday, 
        RecurrenceRule, Notification, Category, Leave, LeaveBalance, 
        AttendanceRegularization, SalaryStructure, Payroll, PayrollHistory,
        ChatGroup, ChatMessage, CachedAIInsight, AuditEvent, PayrollRecalculationImpact,
        PolicyVersion, ApprovalPolicy, Employee, LeaveLedgerEntry, RewardLedgerEntry,
        NotificationTemplate, NotificationPreference, NotificationDeliveryLog,
        BusinessUnit, SubscriptionPlan, PlatformAuditLog
    ]
    for model in models:
        await model.find_all().delete()

    yield
    await client.drop_database("test_db_fixes")

