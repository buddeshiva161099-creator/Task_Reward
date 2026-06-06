"""
Category model for MongoDB categories collection.
"""
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional


class Category(Document):
    tenant_id: Optional[PydanticObjectId] = None
    business_unit_id: Optional[PydanticObjectId] = None
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#6366f1")  # Default indigo color
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

    class Settings:
        name = "categories"
        indexes = ["tenant_id", "business_unit_id", "name", ("tenant_id", "name")]

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Development",
                "color": "#6366f1",
                "is_active": True,
            }
        }
