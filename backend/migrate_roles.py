"""
Migration script to update legacy user roles ('super_admin' -> 'admin', 'hr' -> 'hr_manager') in MongoDB.
"""
import asyncio
from pymongo import AsyncMongoClient
from app.config import settings

async def main():
    print(f"Connecting to MongoDB at: {settings.MONGODB_URL}")
    print(f"Database: {settings.DATABASE_NAME}")
    
    client = AsyncMongoClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    # 1. Update super_admin to admin
    res1 = await db.users.update_many({"role": "super_admin"}, {"$set": {"role": "admin"}})
    print(f"Updated {res1.modified_count} users from 'super_admin' to 'admin'.")
    
    # 2. Update hr to hr_manager
    res2 = await db.users.update_many({"role": "hr"}, {"$set": {"role": "hr_manager"}})
    print(f"Updated {res2.modified_count} users from 'hr' to 'hr_manager'.")
    
    print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
