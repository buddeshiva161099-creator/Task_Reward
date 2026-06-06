"""
Activity Log model for MongoDB activity_logs collection.
"""
from beanie import Document
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional
from beanie import PydanticObjectId


class ActivityLog(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    action: str = Field(..., max_length=100)
    task_id: Optional[PydanticObjectId] = None
    details: Optional[str] = Field(default=None, max_length=500)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "activity_logs"
        indexes = ["user_id", "tenant_id", "timestamp"]
