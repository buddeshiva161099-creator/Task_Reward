from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from typing import Optional, Any

class AuditEvent(Document):
    actor_id: Optional[PydanticObjectId] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None

    entity_type: str = Field(..., max_length=50) # e.g., task, leave, payroll, employee
    entity_id: Optional[PydanticObjectId] = None
    action: str = Field(..., max_length=100) # e.g., created, approved, deleted

    before_state: Optional[dict[str, Any]] = None
    after_state: Optional[dict[str, Any]] = None

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    correlation_id: Optional[str] = None

    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    class Settings:
        name = "audit_events"
        indexes = ["actor_id", "entity_type", "entity_id", "action", "timestamp", "correlation_id"]
