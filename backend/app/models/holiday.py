"""
Holiday model for MongoDB holidays collection.
"""
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional


class Holiday(Document):
    name: str = Field(..., min_length=1, max_length=200)
    date: datetime
    tenant_id: Optional[PydanticObjectId] = None # Global if None, else company specific
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "holidays"
        indexes = ["date", "tenant_id"]
