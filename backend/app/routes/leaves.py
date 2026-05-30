from fastapi import APIRouter, Depends, HTTPException, status
from app.models.user import User, UserRole
from app.models.leave import Leave, LeaveType, LeaveStatus
from app.models.leave_balance import LeaveBalance
from app.models.notification import Notification
from app.auth.dependencies import get_current_user, require_hr_team, require_any_hr_manager, require_hr_manager, require_management_team
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import List, Optional
from beanie import PydanticObjectId
from beanie.operators import In
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leaves", tags=["Leave Management"])


async def _get_synced_leave_balance(user: User) -> LeaveBalance:
    """Fetch (or create) and sync a user's leave balance from company rules."""
    balance = await LeaveBalance.find_one(LeaveBalance.user_id == user.id)
    if not balance:
        balance = LeaveBalance(user_id=user.id)
        await balance.insert()

    from app.models.company import Company
    company = None
    if user.company_id:
        company = await Company.get(user.company_id)
    if not company:
        company = await Company.find_one(Company.is_active == True)

    if company:
        balance.casual_allocated = company.casual_leave_limit
        balance.sick_allocated = company.sick_leave_limit
        balance.earned_allocated = company.earned_leave_limit
        await balance.save()

    return balance


class LeaveApplyRequest(BaseModel):
    leave_type: LeaveType
    start_date: datetime
    end_date: datetime
    reason: str


class LeaveActionRequest(BaseModel):
    comments: Optional[str] = None


@router.get("/balance", response_model=dict)
async def get_leave_balance(current_user: User = Depends(get_current_user)):
    """Get the current user's leave balance."""
    balance = await _get_synced_leave_balance(current_user)
    return {
        "casual_allocated": balance.casual_allocated,
        "casual_used": balance.casual_used,
        "casual_remaining": balance.casual_allocated - balance.casual_used,
        "sick_allocated": balance.sick_allocated,
        "sick_used": balance.sick_used,
        "sick_remaining": balance.sick_allocated - balance.sick_used,
        "earned_allocated": balance.earned_allocated,
        "earned_used": balance.earned_used,
        "earned_remaining": balance.earned_allocated - balance.earned_used,
    }


@router.get("/balances", response_model=List[dict])
async def get_leave_balances_list(current_user: User = Depends(get_current_user)):
    """Get the current user's leave balances as an array, matching frontend expectations."""
    balance = await _get_synced_leave_balance(current_user)

    # Calculate pending days for each type
    pending_requests = await Leave.find(
        Leave.user_id == current_user.id,
        Leave.status != LeaveStatus.APPROVED,
        Leave.status != LeaveStatus.REJECTED
    ).to_list()
    
    pending_days = {"casual": 0, "sick": 0, "earned": 0}
    for req in pending_requests:
        days = (req.end_date - req.start_date).days + 1
        lt = req.leave_type.value if hasattr(req.leave_type, "value") else req.leave_type
        if lt in pending_days:
            pending_days[lt] += days

    return [
        {
            "id": f"{balance.id}_casual",
            "leave_type": "casual",
            "allocated": balance.casual_allocated,
            "used": balance.casual_used,
            "pending_approval": pending_days["casual"],
        },
        {
            "id": f"{balance.id}_sick",
            "leave_type": "sick",
            "allocated": balance.sick_allocated,
            "used": balance.sick_used,
            "pending_approval": pending_days["sick"],
        },
        {
            "id": f"{balance.id}_earned",
            "leave_type": "earned",
            "allocated": balance.earned_allocated,
            "used": balance.earned_used,
            "pending_approval": pending_days["earned"],
        },
    ]


@router.get("/history", response_model=List[dict])
async def get_leaves_history_alias(current_user: User = Depends(get_current_user)):
    """Get the current user's leave history (frontend alias)."""
    leaves = await Leave.find(Leave.user_id == current_user.id).sort("-created_at").to_list()
    return [
        {
            "id": str(l.id),
            "leave_type": l.leave_type.value,
            "start_date": l.start_date.isoformat(),
            "end_date": l.end_date.isoformat(),
            "reason": l.reason,
            "status": l.status.value,
            "comments": l.comments,
            "created_at": l.created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "verified_by_name": l.verified_by_name,
            "approved_by_name": l.approved_by_name,
        }
        for l in leaves
    ]


@router.post("/apply", response_model=dict, status_code=status.HTTP_201_CREATED)
async def apply_leave(request: LeaveApplyRequest, current_user: User = Depends(get_current_user)):
    """Employee submits a new leave request, checking balances first."""
    if request.start_date > request.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be before or equal to end date",
        )

    days = (request.end_date - request.start_date).days + 1

    # Check balance for deductible leave types
    if request.leave_type in [LeaveType.CASUAL, LeaveType.SICK, LeaveType.EARNED]:
        balance = await _get_synced_leave_balance(current_user)

        if request.leave_type == LeaveType.CASUAL:
            if balance.casual_used + days > balance.casual_allocated:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient Casual Leave balance. Requested: {days}, Remaining: {balance.casual_allocated - balance.casual_used}",
                )
        elif request.leave_type == LeaveType.SICK:
            if balance.sick_used + days > balance.sick_allocated:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient Sick Leave balance. Requested: {days}, Remaining: {balance.sick_allocated - balance.sick_used}",
                )
        elif request.leave_type == LeaveType.EARNED:
            if balance.earned_used + days > balance.earned_allocated:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient Earned Leave balance. Requested: {days}, Remaining: {balance.earned_allocated - balance.earned_used}",
                )

    # Create leave request
    leave = Leave(
        user_id=current_user.id,
        user_name=current_user.name,
        leave_type=request.leave_type,
        start_date=request.start_date,
        end_date=request.end_date,
        reason=request.reason,
        status=LeaveStatus.PENDING,
    )
    await leave.insert()

    # Create notification for managers and HR team
    recipient_ids: set = set()
    if current_user.reporting_manager_id:
        recipient_ids.add(current_user.reporting_manager_id)
    if current_user.hr_reporting_manager_id:
        recipient_ids.add(current_user.hr_reporting_manager_id)

    # Notify all active HR team members
    hr_users = await User.find(
        In(User.role, [UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER]),
        User.is_active == True,
        User.is_deleted == False
    ).to_list()
    for hr in hr_users:
        recipient_ids.add(hr.id)
    recipient_ids.discard(current_user.id)

    # Batch insert notifications
    if recipient_ids:
        notifications = [
            Notification(
                user_id=rid,
                sender_id=current_user.id,
                title="New Leave Application",
                message=f"{current_user.name} has applied for {request.leave_type.value.replace('_', ' ')} leave from {request.start_date.strftime('%Y-%m-%d')} to {request.end_date.strftime('%Y-%m-%d')}.",
                type="system"
            )
            for rid in recipient_ids
        ]
        await Notification.insert_many(notifications)

    return {"message": "Leave application submitted successfully", "leave_id": str(leave.id)}


@router.get("/my", response_model=List[dict])
async def get_my_leaves(current_user: User = Depends(get_current_user)):
    """Get the current user's leave history."""
    leaves = await Leave.find(Leave.user_id == current_user.id).sort("-created_at").to_list()
    return [
        {
            "id": str(l.id),
            "leave_type": l.leave_type.value,
            "start_date": l.start_date.isoformat(),
            "end_date": l.end_date.isoformat(),
            "reason": l.reason,
            "status": l.status.value,
            "comments": l.comments,
            "created_at": l.created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "verified_by_name": l.verified_by_name,
            "approved_by_name": l.approved_by_name,
        }
        for l in leaves
    ]


@router.get("/pending", response_model=List[dict])
async def get_pending_leaves(user: User = Depends(require_management_team)):
    """List all pending leave requests. Filters by hierarchy for all management roles except Admin."""
    query_conditions = [Leave.status != LeaveStatus.APPROVED, Leave.status != LeaveStatus.REJECTED]
    
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None:
        query_conditions.append(In(Leave.user_id, list(visible_ids)))

    leaves = await Leave.find(*query_conditions).sort("-created_at").to_list()
    return [
        {
            "id": str(l.id),
            "user_id": str(l.user_id),
            "user_name": l.user_name,
            "leave_type": l.leave_type.value,
            "start_date": l.start_date.isoformat(),
            "end_date": l.end_date.isoformat(),
            "reason": l.reason,
            "status": l.status.value,
            "comments": l.comments,
            "created_at": l.created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "verified_by_name": l.verified_by_name,
            "approved_by_name": l.approved_by_name,
        }
        for l in leaves
    ]


@router.get("/all", response_model=List[dict])
async def get_all_leaves(user: User = Depends(require_management_team)):
    """List all leave requests (history). Filters by hierarchy for all management roles except Admin."""
    query_conditions = []
    
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None:
        query_conditions.append(In(Leave.user_id, list(visible_ids)))

    if query_conditions:
        leaves = await Leave.find(*query_conditions).sort("-created_at").to_list()
    else:
        leaves = await Leave.find_all().sort("-created_at").to_list()
    return [
        {
            "id": str(l.id),
            "user_id": str(l.user_id),
            "user_name": l.user_name,
            "leave_type": l.leave_type.value,
            "start_date": l.start_date.isoformat(),
            "end_date": l.end_date.isoformat(),
            "reason": l.reason,
            "status": l.status.value,
            "comments": l.comments,
            "created_at": l.created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "verified_by_name": l.verified_by_name,
            "approved_by_name": l.approved_by_name,
        }
        for l in leaves
    ]


@router.post("/verify/{leave_id}")
async def verify_leave(leave_id: str, action: LeaveActionRequest, hr_user: User = Depends(require_management_team)):
    """Verify leave request."""
    leave = await Leave.get(PydanticObjectId(leave_id))
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")

    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(hr_user)
    if visible_ids is not None and leave.user_id not in visible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage leaves for employees under your hierarchy."
        )
        # Duplicate hierarchy check removed

    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot verify leave in '{leave.status.value}' state.",
        )

    leave.status = LeaveStatus.VERIFIED
    leave.verified_by = hr_user.id
    leave.verified_by_name = hr_user.name
    leave.comments = action.comments
    await leave.save()

    # Notify applicant
    await Notification(
        user_id=leave.user_id,
        sender_id=hr_user.id,
        title="Leave Request Verified",
        message=f"Your leave request from {leave.start_date.strftime('%Y-%m-%d')} to {leave.end_date.strftime('%Y-%m-%d')} has been verified by {hr_user.name} and is awaiting final HR Manager approval.",
        type="system"
    ).insert()

    # Notify HR managers and Admin
    recipient_ids: set = set()
    hr_approvers = await User.find(
        In(User.role, [UserRole.ADMIN, UserRole.HR_MANAGER]),
        User.is_active == True,
        User.is_deleted == False
    ).to_list()
    for hr in hr_approvers:
        recipient_ids.add(hr.id)

    applicant = await User.get(leave.user_id)
    if applicant and applicant.reporting_manager_id:
        recipient_ids.add(applicant.reporting_manager_id)
    recipient_ids.discard(hr_user.id)

    if recipient_ids:
        await Notification.insert_many([
            Notification(
                user_id=rid,
                sender_id=hr_user.id,
                title="Leave Request Verified - Awaiting Approval",
                message=f"Leave request for {leave.user_name} from {leave.start_date.strftime('%Y-%m-%d')} to {leave.end_date.strftime('%Y-%m-%d')} has been verified by {hr_user.name} and is awaiting final approval.",
                type="system"
            )
            for rid in recipient_ids
        ])

    return {"message": "Leave request verified successfully, pending final HR Manager approval."}


@router.post("/approve/{leave_id}")
async def approve_leave(leave_id: str, action: LeaveActionRequest, hr_manager: User = Depends(require_management_team)):
    """Final approval of leave request. Deducts balances."""
    leave = await Leave.get(PydanticObjectId(leave_id))
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")

    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(hr_manager)
    if visible_ids is not None and leave.user_id not in visible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage leaves for employees under your hierarchy."
        )

    if leave.status not in [LeaveStatus.PENDING, LeaveStatus.VERIFIED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve leave in '{leave.status.value}' state.",
        )

    # Calculate leave days
    days = (leave.end_date - leave.start_date).days + 1

    # Finalize and deduct balance
    if leave.leave_type in [LeaveType.CASUAL, LeaveType.SICK, LeaveType.EARNED]:
        balance = await LeaveBalance.find_one(LeaveBalance.user_id == leave.user_id)
        if not balance:
            balance = LeaveBalance(user_id=leave.user_id)
            await balance.insert()

        if leave.leave_type == LeaveType.CASUAL:
            balance.casual_used += days
        elif leave.leave_type == LeaveType.SICK:
            balance.sick_used += days
        elif leave.leave_type == LeaveType.EARNED:
            balance.earned_used += days
        await balance.save()

    leave.status = LeaveStatus.APPROVED
    leave.approved_by = hr_manager.id
    leave.approved_by_name = hr_manager.name
    leave.comments = action.comments
    await leave.save()

    # Notify applicant
    await Notification(
        user_id=leave.user_id,
        sender_id=hr_manager.id,
        title="Leave Request Approved",
        message=f"Your leave request from {leave.start_date.strftime('%Y-%m-%d')} to {leave.end_date.strftime('%Y-%m-%d')} has been approved by {hr_manager.name}.",
        type="system"
    ).insert()

    # Mark attendance as present for all days of this leave
    from app.models.attendance import Attendance
    from datetime import timedelta

    # Fetch applicant once (reused below for notifications too)
    applicant = await User.get(leave.user_id)
    comp_id = applicant.company_id if (applicant and applicant.company_id) else PydanticObjectId()

    current_date = leave.start_date
    while current_date <= leave.end_date:
        start_of_day = current_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = current_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        attendance = await Attendance.find_one(
            Attendance.user_id == leave.user_id,
            Attendance.check_in >= start_of_day,
            Attendance.check_in <= end_of_day
        )
        
        if not attendance:
            attendance = Attendance(
                user_id=leave.user_id,
                company_id=comp_id,
                check_in=current_date.replace(hour=9, minute=0, second=0),
                check_out=current_date.replace(hour=18, minute=0, second=0),
                status="present",
                remarks=f"Marked Present due to Approved Leave ({leave.leave_type.value}). Approved by {hr_manager.name}."
            )
            await attendance.insert()
        else:
            attendance.status = "present"
            attendance.remarks = f"Marked Present due to Approved Leave ({leave.leave_type.value}). Approved by {hr_manager.name}."
            await attendance.save()
            
        current_date += timedelta(days=1)

    # Batch-notify applicant's managers
    recipient_ids: set = set()
    if applicant:
        if applicant.reporting_manager_id:
            recipient_ids.add(applicant.reporting_manager_id)
        if applicant.hr_reporting_manager_id:
            recipient_ids.add(applicant.hr_reporting_manager_id)
    recipient_ids.discard(hr_manager.id)

    if recipient_ids:
        await Notification.insert_many([
            Notification(
                user_id=rid,
                sender_id=hr_manager.id,
                title="Leave Request Approved",
                message=f"Leave request for {leave.user_name} from {leave.start_date.strftime('%Y-%m-%d')} to {leave.end_date.strftime('%Y-%m-%d')} has been approved.",
                type="system"
            )
            for rid in recipient_ids
        ])

    return {"message": "Leave request approved, balance updated, and marked present successfully."}


@router.post("/reject/{leave_id}")
async def reject_leave(leave_id: str, action: LeaveActionRequest, hr_user: User = Depends(require_management_team)):
    """Reject leave request."""
    leave = await Leave.get(PydanticObjectId(leave_id))
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")

    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(hr_user)
    if visible_ids is not None and leave.user_id not in visible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage leaves for employees under your hierarchy."
        )

    if leave.status in [LeaveStatus.APPROVED, LeaveStatus.REJECTED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject leave in final '{leave.status.value}' state.",
        )

    leave.status = LeaveStatus.REJECTED
    leave.approved_by = hr_user.id
    leave.approved_by_name = hr_user.name
    leave.comments = action.comments
    await leave.save()

    # Notify applicant
    await Notification(
        user_id=leave.user_id,
        sender_id=hr_user.id,
        title="Leave Request Rejected",
        message=f"Your leave request from {leave.start_date.strftime('%Y-%m-%d')} to {leave.end_date.strftime('%Y-%m-%d')} has been rejected. Comments: {action.comments or 'None'}",
        type="system"
    ).insert()

    # Notify applicant's managers
    recipient_ids = set()
    applicant = await User.get(leave.user_id)
    if applicant:
        if applicant.reporting_manager_id:
            recipient_ids.add(applicant.reporting_manager_id)
        if applicant.hr_reporting_manager_id:
            recipient_ids.add(applicant.hr_reporting_manager_id)

    recipient_ids.discard(hr_user.id)

    for recipient_id in recipient_ids:
        await Notification(
            user_id=recipient_id,
            sender_id=hr_user.id,
            title="Leave Request Rejected",
            message=f"Leave request for {leave.user_name} from {leave.start_date.strftime('%Y-%m-%d')} to {leave.end_date.strftime('%Y-%m-%d')} has been rejected.",
            type="system"
        ).insert()

    return {"message": "Leave request has been rejected."}
