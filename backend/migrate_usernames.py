"""
Migration script to populate user_name in leaves and attendance_regularizations where it is missing.
"""
import asyncio
from pymongo import AsyncMongoClient
from app.config import settings

async def main():
    print(f"Connecting to MongoDB at: {settings.MONGODB_URL}")
    print(f"Database: {settings.DATABASE_NAME}")
    
    client = AsyncMongoClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    # 1. Update leaves
    print("Migrating leaves...")
    cursor = db.leaves.find({"$or": [{"user_name": {"$exists": False}}, {"user_name": None}]})
    updated_leaves_count = 0
    async for leaf in cursor:
        user_id = leaf.get("user_id")
        if user_id:
            user = await db.users.find_one({"_id": user_id})
            if user:
                user_name = user.get("name")
                await db.leaves.update_one({"_id": leaf["_id"]}, {"$set": {"user_name": user_name}})
                updated_leaves_count += 1
    print(f"Updated {updated_leaves_count} leaves with user_name.")
    
    # 2. Update attendance_regularizations
    print("Migrating attendance regularizations...")
    cursor = db.attendance_regularizations.find({"$or": [{"user_name": {"$exists": False}}, {"user_name": None}]})
    updated_reg_count = 0
    async for reg in cursor:
        user_id = reg.get("user_id")
        if user_id:
            user = await db.users.find_one({"_id": user_id})
            if user:
                user_name = user.get("name")
                await db.attendance_regularizations.update_one({"_id": reg["_id"]}, {"$set": {"user_name": user_name}})
                updated_reg_count += 1
    print(f"Updated {updated_reg_count} attendance regularizations with user_name.")
    
    print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
