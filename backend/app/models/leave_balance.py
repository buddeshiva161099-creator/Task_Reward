from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional


class LeaveBalance(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    business_unit_id: Optional[PydanticObjectId] = None
    casual_allocated: int = Field(default=12)
    casual_used: int = Field(default=0)
    sick_allocated: int = Field(default=10)
    sick_used: int = Field(default=0)
    earned_allocated: int = Field(default=15)
    earned_used: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "leave_balances"
        indexes = ["user_id", "tenant_id", "business_unit_id"]
