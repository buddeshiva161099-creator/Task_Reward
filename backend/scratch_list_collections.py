import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def list_collections():
    client = AsyncIOMotorClient("mongodb+srv://employee-task-management:employee-task-management@employee-task-managemen.bf806ra.mongodb.net/?appName=Employee-task-management")
    db = client["employee_task_reward4"]
    collections = await db.list_collection_names()
    print("Collections in database:")
    for col in collections:
        count = await db[col].count_documents({})
        print(f"- {col}: {count} documents")

if __name__ == "__main__":
    asyncio.run(list_collections())
