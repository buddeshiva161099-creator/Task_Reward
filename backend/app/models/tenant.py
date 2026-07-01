"""
Tenant model for MongoDB tenants collection.

This is the SaaS tenant (customer account). The owner creates a Tenant;
the tenant has exactly one admin; the admin creates Companies inside
the tenant. Tenant lifecycle, plan, trial state are tracked here.
Tenant data isolation is enforced by filtering all tenant-scoped
collections on `tenant_id`.
"""
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional


TENANT_STATUS_TRIAL = "trial"
TENANT_STATUS_ACTIVE = "active"
TENANT_STATUS_SUSPENDED = "suspended"
TENANT_STATUS_CANCELLED = "cancelled"

TENANT_STATUSES = [
    TENANT_STATUS_TRIAL,
    TENANT_STATUS_ACTIVE,
    TENANT_STATUS_SUSPENDED,
    TENANT_STATUS_CANCELLED,
]


class Tenant(Document):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = Field(default=True)
    work_days: list[str] = Field(default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    work_start_time: str = Field(default="09:00")
    work_end_time: str = Field(default="18:00")
    work_type: str = Field(default="fixed")
    flexible_hours: Optional[int] = Field(default=8)
    cut_out_time: str = Field(default="10:00")
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    geofence_radius_meters: int = Field(default=500)
    geofence_policy: str = Field(default="flexible")
    min_session_minutes: int = Field(default=30)
    auto_checkout_enabled: bool = Field(default=True)
    location_drift_threshold_km: float = Field(default=5.0)

    tenant_status: str = Field(default=TENANT_STATUS_ACTIVE)
    subscription_plan_id: Optional[PydanticObjectId] = None
    trial_ends_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None
    suspended_at: Optional[datetime] = None
    suspended_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    max_employees: int = Field(default=50)
    storage_used_mb: float = Field(default=0.0)
    onboarded_by_owner_id: Optional[PydanticObjectId] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    task_priority_points: dict[str, float] = Field(default={
        "critical": 10.0,
        "high": 5.0,
        "medium": 3.0,
        "regular": 1.0,
        "low": 1.0
    })
    delay_penalties: dict[str, float] = Field(default={
        "on_time": 1.0,
        "1_day_late": 0.75,
        "2_days_late": 0.50,
        "3_days_late": 0.25,
        "4_plus_days_late": 0.0
    })
    early_completion_multiplier: float = Field(default=1.1)
    quality_multipliers: dict[str, float] = Field(default={
        "rework": 0.8,
        "standard": 1.0,
        "exemplary": 1.2
    })
    incentive_tiers: list[dict] = Field(default=[
        {"min_performance": 0.0, "max_performance": 49.99, "pool_percentage": 0.0},
        {"min_performance": 50.0, "max_performance": 69.99, "pool_percentage": 35.0},
        {"min_performance": 70.0, "max_performance": 79.99, "pool_percentage": 75.0},
        {"min_performance": 80.0, "max_performance": 109.99, "pool_percentage": 100.0},
        {"min_performance": 110.0, "max_performance": 999.0, "pool_percentage": 150.0}
    ])
    attendance_points: dict[str, float] = Field(default={
        "present": 1.0,
        "late_under_30": 0.75,
        "late_over_30": 0.5,
        "excused": 0.0,
        "unexcused": -1.0,
        "overtime": 1.25
    })
    attendance_bonus_threshold: float = Field(default=95.0)
    attendance_bonus_percentage: float = Field(default=5.0)
    performance_incentive_pool_percentage: float = Field(default=25.0)
    performance_bonus_threshold: float = Field(default=80.0)
    performance_bonus_percentage: float = Field(default=10.0)
    performance_bonus_amount: float = Field(default=0.0)

    sick_leave_limit: int = Field(default=0)
    earned_leave_limit: int = Field(default=0)
    casual_leave_limit: int = Field(default=12)
    max_paid_casual_leaves_per_month: int = Field(default=1)
    half_day_min_hours: float = Field(default=4.0)
    full_day_min_hours: float = Field(default=8.0)

    class Settings:
        name = "tenants"
        indexes = [
            "name",
            "tenant_status",
            "subscription_plan_id",
            "onboarded_by_owner_id",
        ]
