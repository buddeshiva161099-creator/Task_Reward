"""
Holiday management routes.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Request
from app.models.holiday import Holiday
from app.models.user import User, UserRole
from app.auth.dependencies import get_current_user, require_admin
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional
from beanie import PydanticObjectId
from app.services.audit_service import AuditService

router = APIRouter(tags=["Holiday Management"])

class HolidayRequest(BaseModel):
    name: str
    date: datetime
    company_id: Optional[str] = None

class HolidayResponse(BaseModel):
    id: str
    name: str
    date: datetime
    company_id: Optional[str] = None
    created_at: datetime

@router.get("", response_model=List[HolidayResponse])
async def list_holidays(current_user: User = Depends(get_current_user)):
    """List holidays for the user's company."""
    # Show global holidays (company_id=None) and company-specific holidays
    global_holidays = await Holiday.find(Holiday.company_id == None).to_list()
    company_holidays = []
    if current_user.company_id:
        company_holidays = await Holiday.find(Holiday.company_id == current_user.company_id).to_list()
    
    holidays = sorted(global_holidays + company_holidays, key=lambda x: x.date)
    
    return [
        HolidayResponse(
            id=str(h.id),
            name=h.name,
            date=h.date,
            company_id=str(h.company_id) if h.company_id else None,
            created_at=h.created_at
        ) for h in holidays
    ]

@router.post("", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
async def create_holiday(
    req: HolidayRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user)
):
    """Create a new holiday."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    company_id = PydanticObjectId(req.company_id) if req.company_id else current_user.company_id
    
    holiday = Holiday(
        name=req.name,
        date=req.date,
        company_id=company_id
    )
    await holiday.insert()
    
    await AuditService.log_event(
        actor=current_user,
        entity_type="holiday",
        entity_id=holiday.id,
        action="created",
        after_state=holiday.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return HolidayResponse(
        id=str(holiday.id),
        name=holiday.name,
        date=holiday.date,
        company_id=str(holiday.company_id) if holiday.company_id else None,
        created_at=holiday.created_at
    )

@router.delete("/{holiday_id}")
async def delete_holiday(
    holiday_id: str,
    http_request: Request,
    current_user: User = Depends(get_current_user)
):
    """Delete a holiday."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    holiday = await Holiday.get(PydanticObjectId(holiday_id))
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
        
    before_state = holiday.model_dump()
    await holiday.delete()

    await AuditService.log_event(
        actor=current_user,
        entity_type="holiday",
        entity_id=holiday.id,
        action="deleted",
        before_state=before_state,
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return {"message": "Holiday deleted"}
