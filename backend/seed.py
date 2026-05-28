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
    
    database = client[settings.DATABASE_NAME]
    await init_beanie(database=database, document_models=[User])

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
        raw_password=admin_data["password"],
        role=admin_data["role"],
    )
    await user.insert()
    print(f"[OK] System Admin created successfully!")
    print(f"   Email: {admin_data['email']}")
    print(f"   Password: {admin_data['password']}")

if __name__ == "__main__":
    asyncio.run(seed_admin())
