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
from app.models.company import Company
from app.models.attendance import Attendance
from app.models.holiday import Holiday
from app.models.recurring_task import RecurrenceRule
from app.models.notification import Notification
from app.models.category import Category
from app.models.leave import Leave
from app.models.leave_balance import LeaveBalance
from app.models.regularization import AttendanceRegularization
from app.models.payroll import SalaryStructure, Payroll
from app.models.chat_group import ChatGroup
from app.models.chat_message import ChatMessage
from app.models.ai_insight import CachedAIInsight


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
            email="admin@company.com",
            password_hash=hash_password("Admin@123"),
            raw_password="Admin@123",
            role=UserRole.ADMIN,
        )
        await admin_user.insert()
        # Seed test employee user
        employee_user = User(
            name="Nishitha",
            email="nishitha@vision.com",
            password_hash=hash_password("123456"),
            raw_password="123456",
            role=UserRole.EMPLOYEE,
        )
        await employee_user.insert()
        print(f"[OK] Seeded default users: admin@company.com ({UserRole.ADMIN}), nishitha@vision.com ({UserRole.EMPLOYEE})")
    except Exception as e:
        print(f"[WARNING] Automatic database seeding failed: {str(e)}")


async def init_db():
    """Initialize MongoDB connection and Beanie ODM."""
    try:
        # Set a 2-second timeout for server selection to quickly detect if local mongo is down
        client = AsyncMongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=2000)
        database = client[settings.DATABASE_NAME]
        
        # Force a connection check
        await database.command({"buildInfo": 1})
 
        await init_beanie(
            database=database,
            document_models=[
                User, Task, ActivityLog, Company, Attendance, Holiday, 
                RecurrenceRule, Notification, Category, Leave, LeaveBalance, 
                AttendanceRegularization, SalaryStructure, Payroll,
                ChatGroup, ChatMessage, CachedAIInsight
            ]
        )
        print(f"[OK] Connected to MongoDB: {settings.DATABASE_NAME}")
        await auto_seed_if_needed()
    except Exception as e:
        print(f"[WARNING] Failed to connect to MongoDB: {str(e)}")
        print("[INFO] Falling back to in-memory mongomock database so you can use the application immediately!")
        try:
            import mongomock
            # Monkeypatch mongomock to support Beanie's call to list_collection_names with extra kwargs
            orig_list_collection_names = mongomock.Database.list_collection_names
            def patched_list_collection_names(self, filter=None, session=None, *args, **kwargs):
                return orig_list_collection_names(self, filter=filter, session=session)
            mongomock.Database.list_collection_names = patched_list_collection_names
 
            from mongomock_motor import AsyncMongoMockClient
            mock_client = AsyncMongoMockClient()
            mock_database = mock_client[settings.DATABASE_NAME]
            
            await init_beanie(
                database=mock_database,
                document_models=[
                    User, Task, ActivityLog, Company, Attendance, Holiday, 
                    RecurrenceRule, Notification, Category, Leave, LeaveBalance, 
                    AttendanceRegularization, SalaryStructure, Payroll,
                    ChatGroup, ChatMessage, CachedAIInsight
                ]
            )
            print(f"[OK] Connected to mock in-memory MongoDB: {settings.DATABASE_NAME}")
            
            # Seed the database so they can log in
            await auto_seed_if_needed()
        except Exception as mock_e:
            print(f"[ERROR] Failed to connect to mock MongoDB: {str(mock_e)}")
            raise e
