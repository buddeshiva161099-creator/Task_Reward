"""
MongoDB connection setup using PyMongo Async and Beanie ODM.
"""
from pymongo import AsyncMongoClient
from beanie import init_beanie
from app.config import settings
from app.models.user import User, UserRole
from app.auth.password import hash_password
from app.models.task import Task
from app.models.activity_log import ActivityLog
from app.models.tenant import Tenant
from app.models.company import Company
from app.models.attendance import Attendance
from app.models.holiday import Holiday
from app.models.recurring_task import RecurrenceRule
from app.models.notification import Notification
from app.models.category import Category
from app.models.leave import Leave
from app.models.leave_balance import LeaveBalance
from app.models.regularization import AttendanceRegularization
from app.models.payroll import SalaryStructure, Payroll, PayrollHistory
from app.models.chat_group import ChatGroup
from app.models.chat_message import ChatMessage
from app.models.ai_insight import CachedAIInsight
from app.models.audit_event import AuditEvent
from app.models.payroll_impact import PayrollRecalculationImpact
from app.models.policy import PolicyVersion, ApprovalPolicy
from app.models.employee import Employee
from app.models.ledger import LeaveLedgerEntry, RewardLedgerEntry
from app.models.notification_engine import NotificationTemplate, NotificationPreference, NotificationDeliveryLog
from app.models.subscription_plan import SubscriptionPlan
from app.models.platform_audit_log import PlatformAuditLog
from app.models.business_unit import BusinessUnit
from app.models.shift import Shift, ShiftAssignment
import urllib.parse
from motor.motor_asyncio import AsyncIOMotorClient


async def auto_seed_if_needed():
    """Automatically seed initial database roles if empty."""
    try:
        count = await User.count()
        if count > 0:
            return
        
        print("[INFO] No users found in database. Seeding default users...")
        # Seed admin user
        admin_user = User(
            name="System Admin",
            email="admin%40tenant.com",
            password_hash=hash_password("Admin%40123"),
            role=UserRole.ADMIN,
        )
        await admin_user.insert()
        # Seed test employee user
        employee_user = User(
            name="Nishitha",
            email="nishitha%40vision.com",
            password_hash=hash_password("123456"),
            role=UserRole.EMPLOYEE,
        )
        await employee_user.insert()
        print(f"[OK] Seeded default users: admin@tenant.com ({UserRole.ADMIN}), nishitha@vision.com ({UserRole.EMPLOYEE})")
    except Exception as e:
        print(f"[WARNING] Automatic database seeding failed: {str(e)}")


async def init_db():
    """Initialize MongoDB connection and Beanie ODM."""
    try:
        # Use a longer server selection timeout in production or when fallback is disabled
        timeout = 5000 if (settings.ALLOW_IN_MEMORY_DB_FALLBACK and not settings.is_production) else 30000
        client = AsyncMongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=timeout, tz_aware=True)
        database = client[settings.DATABASE_NAME]
        
        # Force a connection check
        await database.command({"buildInfo": 1})
 
        await init_beanie(
            database=database,
            document_models=[
                User, Task, ActivityLog, Tenant, Company, Attendance, Holiday,
                RecurrenceRule, Notification, Category, Leave, LeaveBalance,
                AttendanceRegularization,                 SalaryStructure, Payroll, PayrollHistory,
                ChatGroup, ChatMessage, CachedAIInsight, AuditEvent, PayrollRecalculationImpact,
                PolicyVersion, ApprovalPolicy, Employee, LeaveLedgerEntry, RewardLedgerEntry,
                NotificationTemplate, NotificationPreference, NotificationDeliveryLog,
                SubscriptionPlan, PlatformAuditLog, BusinessUnit, Shift, ShiftAssignment
            ]
        )
        print(f"[OK] Connected to MongoDB: {settings.DATABASE_NAME}")
        if settings.AUTO_SEED_DEFAULT_USERS:
            await auto_seed_if_needed()
        await _seed_default_subscription_plans()
    except Exception as e:
        print(f"[WARNING] Failed to connect to MongoDB: {str(e)}")
        if not settings.ALLOW_IN_MEMORY_DB_FALLBACK:
            raise
        print("[INFO] Falling back to in-memory mongomock database because ALLOW_IN_MEMORY_DB_FALLBACK is enabled.")
        try:
            import mongomock
            # Monkeypatch mongomock to support Beanie's call to list_collection_names with extra kwargs
            orig_list_collection_names = mongomock.Database.list_collection_names
            def patched_list_collection_names(self, filter=None, session=None, *args, **kwargs):
                return orig_list_collection_names(self, filter=filter, session=session)
            mongomock.Database.list_collection_names = patched_list_collection_names
 
            from mongomock_motor import AsyncMongoMockClient
            mock_client = AsyncMongoMockClient(tz_aware=True)
            mock_database = mock_client[settings.DATABASE_NAME]
            
            await init_beanie(
                database=mock_database,
                document_models=[
                    User, Task, ActivityLog, Tenant, Company, Attendance, Holiday,
                    RecurrenceRule, Notification, Category, Leave, LeaveBalance,
                    AttendanceRegularization,                     SalaryStructure, Payroll, PayrollHistory,
                    ChatGroup, ChatMessage, CachedAIInsight, AuditEvent, PayrollRecalculationImpact,
                    PolicyVersion, ApprovalPolicy, Employee, LeaveLedgerEntry, RewardLedgerEntry,
                    NotificationTemplate, NotificationPreference, NotificationDeliveryLog,
                    SubscriptionPlan, PlatformAuditLog, BusinessUnit, Shift, ShiftAssignment
                ]
            )
            print(f"[OK] Connected to mock in-memory MongoDB: {settings.DATABASE_NAME}")

            if settings.AUTO_SEED_DEFAULT_USERS:
                await auto_seed_if_needed()
            await _seed_default_subscription_plans()
        except Exception as mock_e:
            print(f"[ERROR] Failed to connect to mock MongoDB: {str(mock_e)}")
            raise e


DEFAULT_PLANS = [
    {
        "name": "Trial",
        "code": "trial",
        "description": "14-day evaluation. All features unlocked for one tenant.",
        "price_monthly": 0.0,
        "price_yearly": 0.0,
        "currency": "INR",
        "max_employees": 10,
        "max_admins": 2,
        "storage_gb": 1.0,
        "trial_days": 14,
        "is_active": True,
        "is_default": False,
        "feature_flags": ["core", "attendance", "tasks", "reports"],
        "sort_order": 0,
    },
    {
        "name": "Starter",
        "code": "starter",
        "description": "For small teams getting started with TaskReward.",
        "price_monthly": 999.0,
        "price_yearly": 9999.0,
        "currency": "INR",
        "max_employees": 25,
        "max_admins": 3,
        "storage_gb": 5.0,
        "trial_days": 14,
        "is_active": True,
        "is_default": True,
        "feature_flags": ["core", "attendance", "tasks", "reports", "leave", "regularization"],
        "sort_order": 1,
    },
    {
        "name": "Pro",
        "code": "pro",
        "description": "Full feature set including AI assistant and payroll engine.",
        "price_monthly": 2499.0,
        "price_yearly": 24999.0,
        "currency": "INR",
        "max_employees": 200,
        "max_admins": 10,
        "storage_gb": 50.0,
        "trial_days": 14,
        "is_active": True,
        "is_default": False,
        "feature_flags": [
            "core",
            "attendance",
            "tasks",
            "reports",
            "leave",
            "regularization",
            "payroll",
            "ai_assistant",
            "chat",
        ],
        "sort_order": 2,
    },
]


async def _seed_default_subscription_plans():
    """Insert or update the default plans idempotently by code."""
    try:
        for plan in DEFAULT_PLANS:
            existing = await SubscriptionPlan.find_one(SubscriptionPlan.code == plan["code"])
            if existing:
                await existing.set(plan)
            else:
                await SubscriptionPlan(**plan).insert()

        # Clean up duplicates (keep one per code, safest one)
        for plan in DEFAULT_PLANS:
            all_with_code = await SubscriptionPlan.find(SubscriptionPlan.code == plan["code"]).to_list()
            if len(all_with_code) > 1:
                keep = all_with_code[0]
                for dup in all_with_code[1:]:
                    # Check if any tenant references this duplicate
                    tenants_using = await Tenant.find(Tenant.subscription_plan_id == dup.id).to_list()
                    for t in tenants_using:
                        t.subscription_plan_id = keep.id
                        await t.save()
                    await dup.delete()
                print(f"  [Cleanup] Removed {len(all_with_code)-1} duplicate(s) of '{plan['code']}' plan")

        print(f"[OK] Seeded {len(DEFAULT_PLANS)} default subscription plans")
    except Exception as e:
        print(f"[WARNING] Failed to seed default subscription plans: {e}")
