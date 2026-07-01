"""
Production Database Seeding & Clear Script.
Drops all collections and seeds only the subscription plans and the primary Platform Owner account.
"""
import asyncio
from pymongo import AsyncMongoClient
from app.config import settings
from app.database.connection import init_db
from app.auth.password import hash_password
from app.models.user import User, UserRole

async def run_seed():
    client = AsyncMongoClient(settings.MONGODB_URL)
    print(f"Dropping database: {settings.DATABASE_NAME}...")
    await client.drop_database(settings.DATABASE_NAME)
    print("Database dropped!")

    # Initialize beanie models & default plans
    await init_db()
    print("Beanie models and subscription plans initialized.")

    # Create Platform Owner
    owner_email = "owner@bstk.in"
    owner_pass = "BstkOwner@123"
    owner = User(
        name="Platform Owner",
        email=owner_email,
        password_hash=hash_password(owner_pass),
        role=UserRole.PLATFORM_OWNER,
        is_platform_owner=True,
        is_active=True,
        must_change_password=False,
    )
    await owner.insert()
    print(f"[OK] Platform Owner created: {owner_email} / {owner_pass}")
    print("[OK] Database cleared of all pre-defined data successfully!")

if __name__ == "__main__":
    asyncio.run(run_seed())
