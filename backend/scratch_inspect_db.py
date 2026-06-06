import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def inspect_db():
    client = AsyncIOMotorClient("mongodb+srv://employee-task-management:employee-task-management@employee-task-managemen.bf806ra.mongodb.net/?appName=Employee-task-management")
    db = client["employee_task_reward4"]
    
    # Check attendance collection
    attendance_col = db["attendance"]
    
    # Find records without tenant_id
    cursor = attendance_col.find({"tenant_id": {"$exists": False}})
    missing_tenant_count = 0
    async for doc in cursor:
        missing_tenant_count += 1
        print(f"Missing tenant_id in document: {doc}")
        
    print(f"Total attendance docs missing tenant_id: {missing_tenant_count}")
    
    # Also find tenants in the db to see if we can associate a default tenant_id
    tenants_col = db["tenant"]
    tenants = await tenants_col.find().to_list(length=100)
    print("Available tenants:")
    for t in tenants:
        print(f"- ID: {t['_id']}, Name: {t.get('name') or t.get('company_name')}")

if __name__ == "__main__":
    asyncio.run(inspect_db())
