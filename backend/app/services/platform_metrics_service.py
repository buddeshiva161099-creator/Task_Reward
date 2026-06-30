"""
Platform metrics service for the Application Owner dashboard.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from beanie import PydanticObjectId

from app.models.tenant import Tenant, TENANT_STATUSES
from app.models.user import User, UserRole
from app.models.subscription_plan import SubscriptionPlan
from app.models.platform_audit_log import PlatformAuditLog
from app.models.task import Task
from app.models.attendance import Attendance


class PlatformMetricsService:
    @staticmethod
    async def summary(tenant_id: Optional[PydanticObjectId] = None) -> dict:
        plans = await SubscriptionPlan.find().to_list()
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

        if tenant_id:
            # --- Single Tenant Filtering ---
            tenant = await Tenant.get(tenant_id)
            if not tenant:
                total_tenants = 0
                active = 0
                trial = 0
                suspended = 0
                cancelled = 0
                new_tenants_30d = 0
            else:
                total_tenants = 1
                active = 1 if tenant.tenant_status == "active" else 0
                trial = 1 if tenant.tenant_status == "trial" else 0
                suspended = 1 if tenant.tenant_status == "suspended" else 0
                cancelled = 1 if tenant.tenant_status == "cancelled" else 0
                new_tenants_30d = 1 if tenant.created_at >= datetime.now(timezone.utc) - timedelta(days=30) else 0

            total_users = await User.find(User.tenant_id == tenant_id, User.is_platform_owner == False).count()
            total_tenant_admins = await User.find(
                User.tenant_id == tenant_id,
                User.role == UserRole.ADMIN,
                User.is_platform_owner == False,
            ).count()
            total_employees = await User.find(
                User.tenant_id == tenant_id,
                User.role == UserRole.EMPLOYEE,
                User.is_platform_owner == False,
            ).count()

            plan_counts = {}
            for plan in plans:
                plan_counts[plan.code] = 1 if (tenant and tenant.subscription_plan_id == plan.id) else 0

            recent_signups = (
                await User.find(
                    User.tenant_id == tenant_id,
                    User.is_platform_owner == False,
                    User.created_at >= seven_days_ago,
                )
                .sort("-created_at")
                .limit(10)
                .to_list()
            )

            # MRR for this tenant
            mrr = 0.0
            if tenant and tenant.tenant_status == "active" and tenant.subscription_plan_id:
                plan = await SubscriptionPlan.get(tenant.subscription_plan_id)
                if plan:
                    mrr = plan.price_monthly

            # Tenant-specific diagnostics
            tenant_users = await User.find(User.tenant_id == tenant_id).count()
            tenant_tasks = await Task.find(Task.tenant_id == tenant_id).count()
            tenant_attendance = await Attendance.find(Attendance.tenant_id == tenant_id).count()
            total_objects = tenant_users + tenant_tasks + tenant_attendance

            # Storage on disk
            storage_bytes = 0
            for file_type in ["identity_docs", "chat"]:
                tenant_dir = os.path.normpath(os.path.join("uploads", file_type, f"tenant_{tenant_id}"))
                if os.path.exists(tenant_dir):
                    for dirpath, _, filenames in os.walk(tenant_dir):
                        for f in filenames:
                            fp = os.path.join(dirpath, f)
                            try:
                                if os.path.exists(fp):
                                    storage_bytes += os.path.getsize(fp)
                            except Exception:
                                pass
            storage_mb = round(storage_bytes / (1024 * 1024), 2)
            data_mb = round((total_objects * 1200) / (1024 * 1024), 2)
            index_mb = round((total_objects * 600) / (1024 * 1024), 2)

            db_stats = {
                "collections": 31,
                "objects": total_objects,
                "data_size_mb": data_mb,
                "storage_size_mb": storage_mb,
                "index_size_mb": index_mb,
            }

            # Tenant-specific engagement
            total_tasks = await Task.find(Task.tenant_id == tenant_id).count()
            completed_tasks = await Task.find(Task.tenant_id == tenant_id, Task.status == "completed").count()
            total_attendance = await Attendance.find(Attendance.tenant_id == tenant_id).count()

            pipeline = [
                {"$match": {"tenant_id": tenant_id}},
                {"$group": {"_id": None, "total": {"$sum": "$reward_points"}}}
            ]
            points_cursor = await User.get_pymongo_collection().aggregate(pipeline)
            points_result = await points_cursor.to_list(1)
            total_reward_points = round(points_result[0]["total"], 2) if points_result else 0.0

        else:
            # --- Overall Global Mode ---
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

            plan_counts = {}
            for plan in plans:
                plan_counts[plan.code] = await Tenant.find(
                    Tenant.subscription_plan_id == plan.id
                ).count()

            new_tenants_30d = await Tenant.find(
                Tenant.created_at >= datetime.now(timezone.utc) - timedelta(days=30)
            ).count()

            recent_signups = (
                await User.find(
                    User.is_platform_owner == False,
                    User.created_at >= seven_days_ago,
                )
                .sort("-created_at")
                .limit(10)
                .to_list()
            )

            # Global MRR
            mrr = 0.0
            active_tenants = await Tenant.find(Tenant.tenant_status == "active").to_list()
            for t in active_tenants:
                if t.subscription_plan_id:
                    plan = await SubscriptionPlan.get(t.subscription_plan_id)
                    if plan:
                        mrr += plan.price_monthly

            # Global Database Stats
            db = User.get_pymongo_collection().database
            stats = await db.command("dbStats")
            db_stats = {
                "collections": stats.get("collections", 0),
                "objects": stats.get("objects", 0),
                "data_size_mb": round(stats.get("dataSize", 0) / (1024 * 1024), 2),
                "storage_size_mb": round(stats.get("storageSize", 0) / (1024 * 1024), 2),
                "index_size_mb": round(stats.get("indexSize", 0) / (1024 * 1024), 2),
            }

            # Global Engagement
            total_tasks = await Task.count()
            completed_tasks = await Task.find(Task.status == "completed").count()
            total_attendance = await Attendance.count()

            pipeline = [{"$group": {"_id": None, "total": {"$sum": "$reward_points"}}}]
            points_cursor = await User.get_pymongo_collection().aggregate(pipeline)
            points_result = await points_cursor.to_list(1)
            total_reward_points = round(points_result[0]["total"], 2) if points_result else 0.0

        engagement = {
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "total_attendance": total_attendance,
            "total_reward_points": total_reward_points,
        }

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
            "mrr": mrr,
            "db_stats": db_stats,
            "engagement": engagement,
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
