"""
Platform metrics service for the Application Owner dashboard.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.models.tenant import Tenant, TENANT_STATUSES
from app.models.user import User, UserRole
from app.models.subscription_plan import SubscriptionPlan
from app.models.platform_audit_log import PlatformAuditLog


class PlatformMetricsService:
    @staticmethod
    async def summary() -> dict:
        total_tenants = await Tenant.count()
        active = await Tenant.find(Tenant.tenant_status == "active").count()
        trial = await Tenant.find(Tenant.tenant_status == "trial").count()
        suspended = await Tenant.find(Tenant.tenant_status == "suspended").count()
        cancelled = await Tenant.find(Tenant.tenant_status == "cancelled").count()

        total_users = await User.find(User.is_platform_owner == False).count()
        total_tenant_admins = await User.find(
            User.role == UserRole.ADMIN,
            User.is_platform_owner == False,
        ).count()
        total_employees = await User.find(
            User.role == UserRole.EMPLOYEE,
            User.is_platform_owner == False,
        ).count()

        plan_counts: dict[str, int] = {}
        plans = await SubscriptionPlan.find().to_list()
        for plan in plans:
            plan_counts[plan.code] = await Tenant.find(
                Tenant.subscription_plan_id == plan.id
            ).count()

        new_tenants_30d = await Tenant.find(
            Tenant.created_at >= datetime.now(timezone.utc) - timedelta(days=30)
        ).count()

        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent_signups = (
            await User.find(
                User.is_platform_owner == False,
                User.created_at >= seven_days_ago,
            )
            .sort("-created_at")
            .limit(10)
            .to_list()
        )

        return {
            "tenants": {
                "total": total_tenants,
                "active": active,
                "trial": trial,
                "suspended": suspended,
                "cancelled": cancelled,
                "new_last_30_days": new_tenants_30d,
            },
            "users": {
                "total": total_users,
                "admins": total_tenant_admins,
                "employees": total_employees,
            },
            "plans": {
                "total_plans": len(plans),
                "by_code": plan_counts,
            },
            "recent_signups": [
                {
                    "id": str(u.id),
                    "name": u.name,
                    "email": u.email,
                    "role": u.role.value,
                    "tenant_id": str(u.tenant_id) if u.tenant_id else None,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                }
                for u in recent_signups
            ],
        }

    @staticmethod
    async def recent_audit(limit: int = 50) -> list[dict]:
        entries = (
            await PlatformAuditLog.find()
            .sort("-timestamp")
            .limit(limit)
            .to_list()
        )
        return [
            {
                "id": str(e.id),
                "actor_email": e.actor_email,
                "actor_name": e.actor_name,
                "action": e.action,
                "entity_type": e.entity_type,
                "entity_id": str(e.entity_id) if e.entity_id else None,
                "tenant_id": str(e.tenant_id) if e.tenant_id else None,
                "description": e.description,
                "ip_address": e.ip_address,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            }
            for e in entries
        ]
