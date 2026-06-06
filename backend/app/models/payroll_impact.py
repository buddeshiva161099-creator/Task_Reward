from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

class ImpactStatus(str, Enum):
    PENDING = "pending"
    PROCESSED = "processed"

class PayrollRecalculationImpact(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    employee_name: str
    month: str  # Format: YYYY-MM

    source_event_type: str  # e.g., "leave_approval", "regularization_approval"
    source_event_id: PydanticObjectId

    status: ImpactStatus = ImpactStatus.PENDING
    trigger_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    processed_at: Optional[datetime] = None
    processed_by: Optional[PydanticObjectId] = None

    class Settings:
        name = "payroll_recalculation_impacts"
        indexes = ["user_id", "tenant_id", "month", "status", "trigger_timestamp"]
