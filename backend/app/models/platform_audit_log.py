"""
Append-only audit log of every action taken by a Platform Owner.

These records are NEVER updated or deleted by the application. They form
the trust trail of every tenant lifecycle change.
"""
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional, Any


class PlatformAuditLog(Document):
    actor_id: Optional[PydanticObjectId] = None
    actor_email: Optional[str] = None
    actor_name: Optional[str] = None

    action: str = Field(..., max_length=100)
    entity_type: str = Field(..., max_length=50)
    entity_id: Optional[PydanticObjectId] = None
    tenant_id: Optional[PydanticObjectId] = None

    description: Optional[str] = None
    before_state: Optional[dict[str, Any]] = None
    after_state: Optional[dict[str, Any]] = None

    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "platform_audit_logs"
        indexes = [
            "actor_id",
            "action",
            "entity_type",
            "entity_id",
            "tenant_id",
            "timestamp",
        ]
