"""
Shift and ShiftAssignment models for employee rostering.
"""
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional


class Shift(Document):
    tenant_id: PydanticObjectId
    name: str = Field(..., min_length=1, max_length=100) # e.g. "Morning Shift", "Night Shift"
    start_time: str = Field(..., min_length=5, max_length=5) # "HH:MM" (e.g. "09:00")
    end_time: str = Field(..., min_length=5, max_length=5)   # "HH:MM" (e.g. "18:00")
    grace_period_minutes: int = Field(default=15)
    color_code: str = Field(default="#3b82f6")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "shifts"
        indexes = ["tenant_id"]


class ShiftAssignment(Document):
    user_id: PydanticObjectId
    tenant_id: PydanticObjectId
    shift_id: PydanticObjectId
    start_date: datetime # Stored in UTC (start of day)
    end_date: datetime   # Stored in UTC (end of day)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "shift_assignments"
        indexes = ["user_id", "tenant_id", ("start_date", "end_date")]
