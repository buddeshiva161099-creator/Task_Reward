"""
Onboarding service for creating new tenants.

A tenant is created transactionally along with its first admin user. The
newly created admin must change their password on first login. No default
Company or BusinessUnit is created here; the admin lands on the
`/admin/companies` page and is prompted to create their first Company.
Once they do, a default HQ BusinessUnit is auto-created inside that
Company by the company service.
"""
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.models.tenant import (
    Tenant,
    TENANT_STATUS_TRIAL,
    TENANT_STATUS_ACTIVE,
)
from app.models.user import User, UserRole
from app.models.subscription_plan import SubscriptionPlan
from app.models.leave_balance import LeaveBalance
from app.auth.password import hash_password


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class OnboardingService:
    @staticmethod
    async def create_tenant(
        *,
        owner: User,
        tenant_name: str,
        admin_name: str,
        admin_email: str,
        plan_code: Optional[str] = None,
        trial_days: Optional[int] = None,
        work_days: Optional[list] = None,
        work_start_time: str = "09:00",
        work_end_time: str = "18:00",
        office_lat: Optional[float] = None,
        office_lng: Optional[float] = None,
    ) -> dict:
        existing_tenant = await Tenant.find_one(Tenant.name == tenant_name)
        if existing_tenant:
            raise ValueError(f"Tenant '{tenant_name}' already exists")

        existing_user = await User.find_one(User.email == admin_email)
        if existing_user:
            raise ValueError(f"Email '{admin_email}' is already registered")

        plan: Optional[SubscriptionPlan] = None
        if plan_code:
            plan = await SubscriptionPlan.find_one(SubscriptionPlan.code == plan_code)
            if not plan:
                raise ValueError(f"Plan '{plan_code}' not found")
        else:
            plan = await SubscriptionPlan.find_one(SubscriptionPlan.is_default == True)

        effective_trial_days = trial_days if trial_days is not None else (plan.trial_days if plan else 14)
        max_employees = plan.max_employees if plan else 50
        now = datetime.now(timezone.utc)
        trial_ends_at = now + timedelta(days=effective_trial_days)

        tenant = Tenant(
            name=tenant_name,
            work_days=work_days or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            work_start_time=work_start_time,
            work_end_time=work_end_time,
            office_lat=office_lat,
            office_lng=office_lng,
            tenant_status=TENANT_STATUS_TRIAL,
            subscription_plan_id=plan.id if plan else None,
            trial_ends_at=trial_ends_at,
            activated_at=now,
            max_employees=max_employees,
            onboarded_by_owner_id=owner.id,
        )
        await tenant.insert()

        temp_password = _generate_temp_password()

        admin = User(
            name=admin_name,
            email=admin_email,
            password_hash=hash_password(temp_password),
            role=UserRole.ADMIN,
            tenant_id=tenant.id,
            primary_company_id=None,
            scope_company_ids=[],
            is_active=True,
            must_change_password=True,
        )
        await admin.insert()

        try:
            await LeaveBalance(
                user_id=admin.id,
                tenant_id=tenant.id,
                sick_leave=0,
                earned_leave=0,
                casual_leave=0,
            ).insert()
        except Exception:
            pass

        return {
            "tenant": tenant,
            "admin": admin,
            "temp_password": temp_password,
            "plan": plan,
            "trial_ends_at": trial_ends_at.isoformat() if trial_ends_at else None,
        }
