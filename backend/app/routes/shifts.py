"""
Shifts and Rostering management routes.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Request
from app.models.shift import Shift, ShiftAssignment
from app.models.user import User, UserRole
from app.auth.dependencies import get_current_user
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import List, Optional
from beanie import PydanticObjectId
from app.services.audit_service import AuditService

router = APIRouter(tags=["Shift Management"])


class ShiftRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    start_time: str = Field(..., min_length=5, max_length=5) # "HH:MM"
    end_time: str = Field(..., min_length=5, max_length=5)   # "HH:MM"
    grace_period_minutes: int = 15
    color_code: str = "#3b82f6"


class ShiftResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    start_time: str
    end_time: str
    grace_period_minutes: int
    color_code: str
    created_at: datetime


class ShiftAssignmentRequest(BaseModel):
    user_id: str
    shift_id: str
    start_date: datetime
    end_date: datetime


class ShiftAssignmentResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    shift_id: str
    shift_name: str
    start_date: datetime
    end_date: datetime
    created_at: datetime


@router.get("", response_model=List[ShiftResponse])
async def list_shifts(current_user: User = Depends(get_current_user)):
    """List shift templates for the current tenant."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="User does not belong to a tenant")
    
    shifts = await Shift.find(Shift.tenant_id == current_user.tenant_id).to_list()
    return [
        ShiftResponse(
            id=str(s.id),
            tenant_id=str(s.tenant_id),
            name=s.name,
            start_time=s.start_time,
            end_time=s.end_time,
            grace_period_minutes=s.grace_period_minutes,
            color_code=s.color_code,
            created_at=s.created_at
        ) for s in shifts
    ]


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    req: ShiftRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user)
):
    """Create a new shift template (Admin/HR only)."""
    if current_user.role not in [UserRole.ADMIN, UserRole.HR_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Admins or HR Managers can create shifts")
    
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="User does not belong to a tenant")

    # Validate time formats simple check
    try:
        sh, sm = map(int, req.start_time.split(":"))
        eh, em = map(int, req.end_time.split(":"))
        if not (0 <= sh <= 23 and 0 <= sm <= 59 and 0 <= eh <= 23 and 0 <= em <= 59):
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_time or end_time format (use HH:MM)")

    shift = Shift(
        tenant_id=current_user.tenant_id,
        name=req.name,
        start_time=req.start_time,
        end_time=req.end_time,
        grace_period_minutes=req.grace_period_minutes,
        color_code=req.color_code
    )
    await shift.insert()

    await AuditService.log_event(
        actor=current_user,
        entity_type="shift",
        entity_id=shift.id,
        action="created",
        after_state=shift.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return ShiftResponse(
        id=str(shift.id),
        tenant_id=str(shift.tenant_id),
        name=shift.name,
        start_time=shift.start_time,
        end_time=shift.end_time,
        grace_period_minutes=shift.grace_period_minutes,
        color_code=shift.color_code,
        created_at=shift.created_at
    )


@router.post("/assign", response_model=ShiftAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_shift(
    req: ShiftAssignmentRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user)
):
    """Assign a shift to an employee (Admin/HR only)."""
    if current_user.role not in [UserRole.ADMIN, UserRole.HR_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Admins or HR Managers can assign shifts")

    # Validate user exists and belongs to same tenant
    target_user = await User.get(PydanticObjectId(req.user_id))
    if not target_user or target_user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Employee not found in your tenant")

    # Validate shift exists and belongs to same tenant
    shift = await Shift.get(PydanticObjectId(req.shift_id))
    if not shift or shift.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=442, detail="Shift template not found")

    # Ensure start_date <= end_date
    if req.start_date > req.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")

    # Save assignment
    assignment = ShiftAssignment(
        user_id=target_user.id,
        tenant_id=current_user.tenant_id,
        shift_id=shift.id,
        start_date=req.start_date,
        end_date=req.end_date
    )
    await assignment.insert()

    await AuditService.log_event(
        actor=current_user,
        entity_type="shift_assignment",
        entity_id=assignment.id,
        action="assigned",
        after_state=assignment.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return ShiftAssignmentResponse(
        id=str(assignment.id),
        user_id=str(assignment.user_id),
        user_name=target_user.name,
        shift_id=str(assignment.shift_id),
        shift_name=shift.name,
        start_date=assignment.start_date,
        end_date=assignment.end_date,
        created_at=assignment.created_at
    )


@router.get("/assignments", response_model=List[ShiftAssignmentResponse])
async def list_all_assignments(current_user: User = Depends(get_current_user)):
    """List all shift assignments for the current tenant (Admin/HR only)."""
    if current_user.role not in [UserRole.ADMIN, UserRole.HR_MANAGER]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    assignments = await ShiftAssignment.find(ShiftAssignment.tenant_id == current_user.tenant_id).to_list()
    
    # Pre-resolve users and shifts to avoid N+1 queries
    user_ids = list(set([a.user_id for a in assignments]))
    shift_ids = list(set([a.shift_id for a in assignments]))
    
    users = await User.find({"_id": {"$in": user_ids}}).to_list()
    shifts = await Shift.find({"_id": {"$in": shift_ids}}).to_list()
    
    user_map = {u.id: u.name for u in users}
    shift_map = {s.id: s.name for s in shifts}

    return [
        ShiftAssignmentResponse(
            id=str(a.id),
            user_id=str(a.user_id),
            user_name=user_map.get(a.user_id, "Unknown"),
            shift_id=str(a.shift_id),
            shift_name=shift_map.get(a.shift_id, "Unknown"),
            start_date=a.start_date,
            end_date=a.end_date,
            created_at=a.created_at
        ) for a in assignments
    ]


@router.get("/my-schedule", response_model=List[ShiftAssignmentResponse])
async def my_shift_schedule(current_user: User = Depends(get_current_user)):
    """Fetch current logged-in employee's schedule assignments."""
    assignments = await ShiftAssignment.find(ShiftAssignment.user_id == current_user.id).to_list()
    
    shift_ids = list(set([a.shift_id for a in assignments]))
    shifts = await Shift.find({"_id": {"$in": shift_ids}}).to_list()
    shift_map = {s.id: s.name for s in shifts}

    return [
        ShiftAssignmentResponse(
            id=str(a.id),
            user_id=str(a.user_id),
            user_name=current_user.name,
            shift_id=str(a.shift_id),
            shift_name=shift_map.get(a.shift_id, "Unknown"),
            start_date=a.start_date,
            end_date=a.end_date,
            created_at=a.created_at
        ) for a in assignments
    ]


@router.put("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: str,
    req: ShiftRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user)
):
    """Update an existing shift template (Admin/HR only)."""
    if current_user.role not in [UserRole.ADMIN, UserRole.HR_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Admins or HR Managers can update shifts")

    shift = await Shift.get(PydanticObjectId(shift_id))
    if not shift or shift.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Shift template not found")

    # Validate time formats simple check
    try:
        sh, sm = map(int, req.start_time.split(":"))
        eh, em = map(int, req.end_time.split(":"))
        if not (0 <= sh <= 23 and 0 <= sm <= 59 and 0 <= eh <= 23 and 0 <= em <= 59):
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_time or end_time format (use HH:MM)")

    shift.name = req.name
    shift.start_time = req.start_time
    shift.end_time = req.end_time
    shift.grace_period_minutes = req.grace_period_minutes
    shift.color_code = req.color_code
    await shift.save()

    await AuditService.log_event(
        actor=current_user,
        entity_type="shift",
        entity_id=shift.id,
        action="updated",
        after_state=shift.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return ShiftResponse(
        id=str(shift.id),
        tenant_id=str(shift.tenant_id),
        name=shift.name,
        start_time=shift.start_time,
        end_time=shift.end_time,
        grace_period_minutes=shift.grace_period_minutes,
        color_code=shift.color_code,
        created_at=shift.created_at
    )
