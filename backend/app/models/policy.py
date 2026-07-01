"""
Policy models for versioned rules and approval workflows.
"""
from beanie import Document
from pydantic import Field, ConfigDict
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from beanie import PydanticObjectId


class PolicyVersion(Document):
    tenant_id: PydanticObjectId
    version: int = Field(default=1)
    effective_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_to: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by_id: Optional[PydanticObjectId] = None

    # Versioned configurations duplicated from Tenant
    work_days: List[str] = Field(default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    work_start_time: str = Field(default="09:00")
    work_end_time: str = Field(default="18:00")
    work_type: str = Field(default="fixed")  # "fixed" or "flexible"
    flexible_hours: Optional[int] = Field(default=8)
    cut_out_time: str = Field(default="10:00")
    
    # Geofence settings
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    geofence_radius_meters: int = Field(default=500)
    geofence_policy: str = Field(default="flexible")  # "strict", "flexible", "disabled"
    
    # Attendance policy
    min_session_minutes: int = Field(default=30)
    auto_checkout_enabled: bool = Field(default=True)
    location_drift_threshold_km: float = Field(default=5.0)

    # Dynamic rules configurations
    task_priority_points: Dict[str, float] = Field(default={
        "critical": 10.0,
        "high": 5.0,
        "medium": 3.0,
        "regular": 1.0,
        "low": 1.0
    })
    delay_penalties: Dict[str, float] = Field(default={
        "on_time": 1.0,
        "1_day_late": 0.75,
        "2_days_late": 0.50,
        "3_days_late": 0.25,
        "4_plus_days_late": 0.0
    })
    early_completion_multiplier: float = Field(default=1.1)
    quality_multipliers: Dict[str, float] = Field(default={
        "rework": 0.8,
        "standard": 1.0,
        "exemplary": 1.2
    })
    incentive_tiers: List[Dict[str, Any]] = Field(default=[
        {"min_performance": 0.0, "max_performance": 49.99, "pool_percentage": 0.0},
        {"min_performance": 50.0, "max_performance": 69.99, "pool_percentage": 35.0},
        {"min_performance": 70.0, "max_performance": 79.99, "pool_percentage": 75.0},
        {"min_performance": 80.0, "max_performance": 109.99, "pool_percentage": 100.0},
        {"min_performance": 110.0, "max_performance": 999.0, "pool_percentage": 150.0}
    ])
    attendance_points: Dict[str, float] = Field(default={
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

    # Leave rules settings
    sick_leave_limit: int = Field(default=0)
    earned_leave_limit: int = Field(default=0)
    casual_leave_limit: int = Field(default=12)
    max_paid_casual_leaves_per_month: int = Field(default=1)
    half_day_min_hours: float = Field(default=4.0)
    full_day_min_hours: float = Field(default=8.0)

    @classmethod
    async def get_active_policy(cls, tenant_id: PydanticObjectId, timestamp: datetime) -> Optional["PolicyVersion"]:
        """Find the active policy version for a tenant at a specific point in time."""
        from beanie.operators import Or
        policy = await cls.find_one(
            cls.tenant_id == tenant_id,
            cls.effective_from <= timestamp,
            Or(cls.effective_to == None, cls.effective_to > timestamp)
        )
        if not policy:
            policy = await cls.find(cls.tenant_id == tenant_id).sort("-version").first_or_none()
        return policy

    class Settings:
        name = "policy_versions"
        indexes = [
            "tenant_id",
            ("tenant_id", "version"),
            ("tenant_id", "effective_from", "effective_to")
        ]


class ApprovalPolicy(Document):
    tenant_id: PydanticObjectId
    event_type: str = Field(..., max_length=50)  # "leave", "regularization", "payroll"
    required_approvals: List[str] = Field(default=["manager", "hr_manager"])  # Ordered roles required for approval
    effective_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "approval_policies"
        indexes = [
            "tenant_id",
            ("tenant_id", "event_type", "is_active")
        ]
