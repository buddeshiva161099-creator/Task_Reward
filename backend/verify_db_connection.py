import asyncio
from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

async def test_conn():
    from app.config import settings
    url = settings.MONGODB_URL
    print(f"Connecting to {url}...")
    try:
        client = MongoClient(url, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_conn())
