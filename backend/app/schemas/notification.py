from pydantic import BaseModel, Field
from datetime import datetime
from beanie import PydanticObjectId
from typing import Optional, List

class NotificationBase(BaseModel):
    title: str
    message: str
    type: str

class NotificationCreate(NotificationBase):
    user_id: PydanticObjectId
    sender_id: Optional[PydanticObjectId] = None

class NotificationResponse(NotificationBase):
    id: str
    user_id: str
    sender_id: Optional[str] = None
    chat_group_id: Optional[str] = None
    is_read: bool
    created_at: str

    @classmethod
    def from_notification(cls, notification) -> "NotificationResponse":
        from app.utils.ist_time import to_utc_iso
        return cls(

            id=str(notification.id),
            user_id=str(notification.user_id),
            sender_id=str(notification.sender_id) if notification.sender_id else None,
            chat_group_id=str(notification.chat_group_id) if getattr(notification, "chat_group_id", None) else None,
            title=notification.title,
            message=notification.message,
            type=notification.type,
            is_read=notification.is_read,
            created_at=to_utc_iso(notification.created_at),

        )

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "title": "New Task Assigned",
                "message": "You have been assigned a new task.",
                "type": "task_assigned",
                "is_read": False,
                "created_at": "2024-05-14T12:00:00"
            }
        }

class NotificationList(BaseModel):
    items: List[NotificationResponse]
    unread_count: int
