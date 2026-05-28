"""
Company model for MongoDB companies collection.
"""
from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional, List


class Company(Document):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = Field(default=True)
    work_days: list[str] = Field(default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    work_start_time: str = Field(default="09:00")
    work_end_time: str = Field(default="18:00")
    work_type: str = Field(default="fixed") # "fixed" or "flexible"
    flexible_hours: Optional[int] = Field(default=8)
    cut_out_time: str = Field(default="10:00")
    # Geofence settings
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    geofence_radius_meters: int = Field(default=500)  # Default 500m radius
    geofence_policy: str = Field(default="flexible")  # "strict" = block, "flexible" = flag, "disabled" = skip
    # Attendance policy
    min_session_minutes: int = Field(default=30)  # Minimum session before checkout allowed
    auto_checkout_enabled: bool = Field(default=True)
    location_drift_threshold_km: float = Field(default=5.0)  # Max drift before flagging
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Dynamic system core rules configurations
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

    # Leave rules settings
    sick_leave_limit: int = Field(default=0)
    earned_leave_limit: int = Field(default=0)
    casual_leave_limit: int = Field(default=12)
    max_paid_casual_leaves_per_month: int = Field(default=1)


    class Settings:
        name = "companies"
        indexes = ["name"]

