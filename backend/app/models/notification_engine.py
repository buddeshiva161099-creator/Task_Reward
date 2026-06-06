"""
Notification engine models for templates, preferences, and delivery logs.
"""
from beanie import Document
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional, List
from beanie import PydanticObjectId


class NotificationTemplate(Document):
    template_name: str = Field(..., max_length=100)  # e.g., "leave_applied", "task_assigned"
    title_template: str = Field(..., max_length=200)  # Jinja-like placeholder allowed
    body_template: str = Field(..., max_length=2000)
    channels: List[str] = Field(default=["in_app"])  # ["in_app", "email", "sms"]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "notification_templates"
        indexes = [
            "template_name"
        ]


class NotificationPreference(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    email_enabled: bool = Field(default=True)
    sms_enabled: bool = Field(default=True)
    in_app_enabled: bool = Field(default=True)
    chat_enabled: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "notification_preferences"
        indexes = [
            "user_id",
            "tenant_id"
        ]


class NotificationDeliveryLog(Document):
    notification_id: Optional[PydanticObjectId] = None
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    channel: str = Field(..., max_length=50)  # "in_app", "email", "sms"
    status: str = Field(default="pending", max_length=50)  # "delivered", "failed", "pending"
    sent_at: Optional[datetime] = None
    retry_count: int = Field(default=0)
    error_message: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "notification_delivery_logs"
        indexes = [
            "user_id",
            "tenant_id",
            "channel",
            "status",
            ("user_id", "status")
        ]
