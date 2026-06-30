"""
Seed script to clear database and create initial admin user.
Run: python seed.py
"""
import asyncio
from pymongo import AsyncMongoClient
from app.config import settings
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.models.company import Company
from app.auth.password import hash_password
from app.database.connection import init_db


async def seed_admin():
    """Clear database and create initial admin user."""
    client = AsyncMongoClient(settings.MONGODB_URL)
    
    print(f"Dropping database: {settings.DATABASE_NAME}...")
    await client.drop_database(settings.DATABASE_NAME)
    print("Database dropped successfully!")
    
    # Initialize database connection and all Beanie models
    await init_db()

    # Create a default tenant (contains work rules and policies)
    tenant = Tenant(
        name="VISION TECH",
        description="Innovation in focus",
        work_days=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        work_start_time="09:00",
        work_end_time="18:00",
        office_lat=28.6139,
        office_lng=77.2090
    )
    await tenant.insert()
    print(f"[OK] Default tenant 'VISION TECH' created.")

    # Create a default company under the tenant
    company = Company(
        name="VISION TECH HEADQUARTERS",
        description="Headquarters division",
        tenant_id=tenant.id,
        is_default=True
    )
    await company.insert()
    print(f"[OK] Default company 'VISION TECH HEADQUARTERS' created.")

    admin_data = {
        "name": "System Admin",
        "email": "admin@company.com",
        "password": "Admin@123",
        "role": UserRole.ADMIN
    }

    user = User(
        name=admin_data["name"],
        email=admin_data["email"],
        password_hash=hash_password(admin_data["password"]),
        role=admin_data["role"],
        tenant_id=tenant.id,
        primary_company_id=company.id,
        is_active=True
    )
    await user.insert()
    print(f"[OK] System Admin created successfully!")
    print(f"   Email: {admin_data['email']}")
    print(f"   Password: {admin_data['password']}")

if __name__ == "__main__":
    asyncio.run(seed_admin())
