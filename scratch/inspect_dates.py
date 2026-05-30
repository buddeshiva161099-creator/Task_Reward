import asyncio
import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(dotenv_path="backend/.env")

async def inspect():
    url = os.getenv("MONGODB_URL", "mongodb://127.0.0.1:27017")
    db_name = os.getenv("DATABASE_NAME", "employee_task_reward")
    print(f"Connecting to {url}, database {db_name}...")
    client = MongoClient(url)
    db = client[db_name]
    
    print("\n--- ATTENDANCE ---")
    att_col = db["attendance"]
    print(f"Total records: {att_col.count_documents({})}")
    for doc in att_col.find().limit(5):
        print(f"ID: {doc['_id']}, check_in: {doc.get('check_in')} ({type(doc.get('check_in'))}), check_out: {doc.get('check_out')} ({type(doc.get('check_out'))})")
        
    print("\n--- TASK ---")
    task_col = db["tasks"]
    print(f"Total records: {task_col.count_documents({})}")
    for doc in task_col.find().limit(5):
        print(f"ID: {doc['_id']}, created_at: {doc.get('created_at')} ({type(doc.get('created_at'))}), deadline: {doc.get('deadline')} ({type(doc.get('deadline'))})")

    print("\n--- LEAVE ---")
    leave_col = db["leave"]
    print(f"Total records: {leave_col.count_documents({})}")
    for doc in leave_col.find().limit(5):
        print(f"ID: {doc['_id']}, created_at: {doc.get('created_at')} ({type(doc.get('created_at'))})")

    print("\n--- REGULARIZATION ---")
    reg_col = db["regularization"]
    print(f"Total records: {reg_col.count_documents({})}")
    for doc in reg_col.find().limit(5):
        print(f"ID: {doc['_id']}, created_at: {doc.get('created_at')} ({type(doc.get('created_at'))})")

if __name__ == "__main__":
    asyncio.run(inspect())
