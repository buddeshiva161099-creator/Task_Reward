from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import List, Optional

class ChatGroup(Document):
    tenant_id: Optional[PydanticObjectId] = None
    name: str
    members: List[PydanticObjectId] = Field(default_factory=list)
    created_by: PydanticObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "chat_groups"
        indexes = ["tenant_id", "members", "created_by"]
