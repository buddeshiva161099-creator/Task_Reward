import os
from datetime import timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(dotenv_path="backend/.env")

def migrate():
    url = os.getenv("MONGODB_URL", "mongodb://127.0.0.1:27017")
    db_name = os.getenv("DATABASE_NAME", "employee_task_reward3")
    print(f"Connecting to {url}, database {db_name}...")
    client = MongoClient(url)
    db = client[db_name]
    
    att_col = db["attendance"]
    print("Starting migration of attendance records...")
    
    count = 0
    for doc in att_col.find():
        updates = {}
        check_in = doc.get("check_in")
        check_out = doc.get("check_out")
        
        # If naive, it represents local IST. Convert to UTC by subtracting 5.5 hours.
        if check_in and check_in.tzinfo is None:
            # Check if it was already migrated (e.g. if we run it twice, we don't want to double shift)
            # Actually, to make it safe, we can inspect if the year/month/day/hour matches expected range,
            # or just run it once.
            new_check_in = check_in - timedelta(hours=5, minutes=30)
            updates["check_in"] = new_check_in
            print(f"ID {doc['_id']}: check_in {check_in} -> {new_check_in}")
            
        if check_out and check_out.tzinfo is None:
            new_check_out = check_out - timedelta(hours=5, minutes=30)
            updates["check_out"] = new_check_out
            print(f"ID {doc['_id']}: check_out {check_out} -> {new_check_out}")
            
        if updates:
            att_col.update_one({"_id": doc["_id"]}, {"$set": updates})
            count += 1
            
    print(f"Successfully migrated {count} attendance records.")

if __name__ == "__main__":
    migrate()
