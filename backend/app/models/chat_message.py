from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from typing import Optional, List

class ChatMessage(Document):
    group_id: Optional[PydanticObjectId] = None
    sender_id: PydanticObjectId
    sender_name: str
    recipient_id: Optional[PydanticObjectId] = None
    text: str
    type: str = Field(default="text")  # "text", "file", "task", "tip"
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    task_card_id: Optional[PydanticObjectId] = None
    tip_points: Optional[float] = None
    deleted_for_everyone: bool = Field(default=False)
    deleted_for_users: List[PydanticObjectId] = Field(default_factory=list)
    read_by: List[PydanticObjectId] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "chat_messages"
        indexes = ["group_id", "sender_id", "recipient_id", "created_at"]
