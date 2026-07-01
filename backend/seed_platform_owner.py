"""
Seed the first Platform Owner (Application Owner) account.

Usage:
    python seed_platform_owner.py --email owner@vision.app --password 'StrongP@ss123' --name "Vision Owner"

The script is idempotent: re-running with the same email updates the existing
owner instead of creating a duplicate.
"""
import asyncio
import argparse
import sys

from pymongo import AsyncMongoClient
from beanie import init_beanie

from app.config import settings
from app.models.user import User, UserRole
from app.auth.password import hash_password


async def seed(email: str, password: str, name: str, reset_password: bool):
    client = AsyncMongoClient(settings.MONGODB_URL)
    database = client[settings.DATABASE_NAME]

    from app.models.tenant import Tenant
    from app.models.subscription_plan import SubscriptionPlan
    from app.models.platform_audit_log import PlatformAuditLog

    await init_beanie(
        database=database,
        document_models=[User, Tenant, SubscriptionPlan, PlatformAuditLog],
    )

    existing = await User.find_one(User.email == email)
    if existing:
        if existing.role != UserRole.PLATFORM_OWNER:
            existing.role = UserRole.PLATFORM_OWNER
            existing.tenant_id = None
            existing.is_platform_owner = True
            existing.is_active = True
        if reset_password:
            existing.password_hash = hash_password(password)
        existing.must_change_password = False
        await existing.save()
        print(f"[OK] Existing account promoted to platform owner: {email}")
        return

    owner = User(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=UserRole.PLATFORM_OWNER,
        tenant_id=None,
        is_platform_owner=True,
        is_active=True,
        must_change_password=False,
    )
    await owner.insert()
    print(f"[OK] Platform owner created: {email}")


def main():
    parser = argparse.ArgumentParser(description="Seed a Platform Owner account.")
    parser.add_argument("--email", default="owner@bstk.in")
    parser.add_argument("--password", default="BstkOwner@123")
    parser.add_argument("--name", default="Platform Owner")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset the password if the owner already exists.",
    )
    args = parser.parse_args()

    if len(args.password) < 8:
        print("[ERROR] Password must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(
        seed(args.email, args.password, args.name, args.reset_password)
    )


if __name__ == "__main__":
    main()
