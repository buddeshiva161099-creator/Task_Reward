"""
Cached AI Insight model for MongoDB cached_ai_insights collection.
"""
from beanie import Document
from pydantic import Field
from datetime import datetime, timezone
from typing import Dict, Any
from beanie import PydanticObjectId


class CachedAIInsight(Document):
    user_id: PydanticObjectId
    insight_type: str  # "dashboard_summary", "performance", "payroll_anomaly", etc.
    content: Dict[str, Any]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "cached_ai_insights"
        indexes = ["user_id", "insight_type", "created_at"]
