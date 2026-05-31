from typing import Optional, Any
from app.models.audit_event import AuditEvent
from app.models.user import User
from beanie import PydanticObjectId
import uuid

class AuditService:
    @staticmethod
    async def log_event(
        actor: Optional[User],
        entity_type: str,
        action: str,
        entity_id: Optional[PydanticObjectId] = None,
        before_state: Optional[dict[str, Any]] = None,
        after_state: Optional[dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        event = AuditEvent(
            actor_id=actor.id if actor else None,
            actor_name=actor.name if actor else "System",
            actor_role=actor.role.value if actor else "System",
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            before_state=before_state,
            after_state=after_state,
            correlation_id=correlation_id or str(uuid.uuid4()),
            ip_address=ip_address,
            user_agent=user_agent
        )
        await event.insert()
        return event
