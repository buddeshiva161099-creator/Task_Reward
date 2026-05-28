from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from typing import List

class ChatGroup(Document):
    name: str
    members: List[PydanticObjectId] = Field(default_factory=list)
    created_by: PydanticObjectId
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "chat_groups"
        indexes = ["members", "created_by"]
