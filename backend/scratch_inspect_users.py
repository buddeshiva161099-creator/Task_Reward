import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def inspect_details():
    client = AsyncIOMotorClient("mongodb+srv://employee-task-management:employee-task-management@employee-task-managemen.bf806ra.mongodb.net/?appName=Employee-task-management")
    db = client["employee_task_reward4"]
    users_col = db["users"]
    companies_col = db["companies"]
    tenants_col = db["tenants"]
    
    print("--- Companies ---")
    async for c in companies_col.find():
        print(f"Company ID: {c['_id']}, Name: {c.get('name') or c.get('company_name')}, Tenant ID: {c.get('tenant_id')}")
        
    print("\n--- Users ---")
    async for u in users_col.find():
        print(f"User: {u.get('email')}, Role: {u.get('role')}, Tenant ID: {u.get('tenant_id')}, Primary Company ID: {u.get('primary_company_id')}, BU ID: {u.get('business_unit_id')}")

if __name__ == "__main__":
    asyncio.run(inspect_details())
