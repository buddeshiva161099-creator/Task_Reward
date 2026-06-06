from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional

class Notification(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    sender_id: Optional[PydanticObjectId] = None
    title: str = Field(..., max_length=255)
    message: str
    type: str = Field(..., max_length=50)  # task_assigned, task_completed, system, chat
    chat_group_id: Optional[PydanticObjectId] = None
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "notifications"
        indexes = ["user_id", "tenant_id", "is_read", "created_at"]

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "507f1f77bcf86cd799439011",
                "title": "New Task Assigned",
                "message": "You have been assigned a new task: Complete the report",
                "type": "task_assigned",
                "is_read": False,
            }
        }
