from datetime import datetime
from typing import Optional
from app.models.payroll_impact import PayrollRecalculationImpact, ImpactStatus
from app.models.user import User
from beanie import PydanticObjectId
import logging

logger = logging.getLogger(__name__)

class PayrollImpactService:
    @staticmethod
    async def record_impact(
        user: User,
        month: str,
        source_event_type: str,
        source_event_id: PydanticObjectId
    ):
        impact = PayrollRecalculationImpact(
            user_id=user.id,
            employee_name=user.name,
            month=month,
            source_event_type=source_event_type,
            source_event_id=source_event_id,
            status=ImpactStatus.PENDING
        )
        await impact.insert()
        return impact

    @staticmethod
    async def mark_processed(impact_id: PydanticObjectId, processed_by_id: PydanticObjectId):
        impact = await PayrollRecalculationImpact.get(impact_id)
        if impact:
            impact.status = ImpactStatus.PROCESSED
            impact.processed_at = datetime.utcnow()
            impact.processed_by = processed_by_id
            await impact.save()
        return impact
