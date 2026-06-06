"""
Subscription plan definitions owned by the Platform Owner.

A plan defines caps (max employees), included feature flags, and
display metadata. Tenants reference a plan via Company.subscription_plan_id.
"""
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional, List


class SubscriptionPlan(Document):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50, unique=True)
    description: Optional[str] = Field(default=None, max_length=500)
    price_monthly: float = Field(default=0.0, ge=0.0)
    price_yearly: float = Field(default=0.0, ge=0.0)
    currency: str = Field(default="INR")
    max_employees: int = Field(default=50, ge=1)
    max_admins: int = Field(default=5, ge=1)
    storage_gb: float = Field(default=5.0, ge=0.0)
    trial_days: int = Field(default=14, ge=0)
    is_active: bool = Field(default=True)
    is_default: bool = Field(default=False)
    feature_flags: List[str] = Field(default_factory=list)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

    class Settings:
        name = "subscription_plans"
        indexes = ["code", "is_active", "is_default", "sort_order"]
