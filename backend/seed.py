"""
Seed script to clear database and create initial admin user.
Run: python seed.py
"""
import asyncio
from pymongo import AsyncMongoClient
from beanie import init_beanie
from app.config import settings
from app.models.user import User, UserRole
from app.auth.password import hash_password


async def seed_admin():
    """Clear database and create initial admin user."""
    client = AsyncMongoClient(settings.MONGODB_URL)
    
    print(f"Dropping database: {settings.DATABASE_NAME}...")
    await client.drop_database(settings.DATABASE_NAME)
    print("Database dropped successfully!")
    
    from app.models.company import Company
    database = client[settings.DATABASE_NAME]
    await init_beanie(database=database, document_models=[User, Company])

    # Create a default company
    company = Company(
        name="VISION TECH",
        description="Innovation in focus",
        work_days=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        work_start_time="09:00",
        work_end_time="18:00",
        office_lat=28.6139,
        office_lng=77.2090
    )
    await company.insert()
    print(f"[OK] Default company 'VISION TECH' created.")

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
        company_id=company.id
    )
    await user.insert()
    print(f"[OK] System Admin created successfully!")
    print(f"   Email: {admin_data['email']}")
    print(f"   Password: {admin_data['password']}")

if __name__ == "__main__":
    asyncio.run(seed_admin())
