import asyncio
from app.database.connection import init_db
from app.models.user import User

async def main():
    await init_db()
    users = await User.find_all().to_list()
    print("USERS IN DB:")
    for u in users:
        print(f"- {u.name} (ID: {u.id}, Email: {u.email}, Role: {u.role})")

if __name__ == "__main__":
    asyncio.run(main())
