from fastapi import APIRouter, Depends, HTTPException, status
from app.models.user import User, UserRole
from app.models.regularization import AttendanceRegularization, RegularizationStatus
from app.models.attendance import Attendance
from app.models.activity_log import ActivityLog
from app.models.notification import Notification
from app.auth.dependencies import get_current_user, require_hr_team, require_any_hr_manager, require_management_team, require_admin
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from beanie.operators import In
from beanie import PydanticObjectId
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/regularization", tags=["Attendance Regularization"])


class RegularizationApplyRequest(BaseModel):
    attendance_id: Optional[str] = None
    requested_check_in: Optional[datetime] = None
    requested_check_out: Optional[datetime] = None
    reason: str
    attachment_url: Optional[str] = None


class RegularizationActionRequest(BaseModel):
    comments: Optional[str] = None


@router.post("/apply", response_model=dict, status_code=status.HTTP_201_CREATED)
async def request_regularization(
    request: RegularizationApplyRequest,
    current_user: User = Depends(get_current_user)
):
    """Employee submits a new attendance correction/regularization request."""
    if request.attendance_id:
        attendance = await Attendance.get(PydanticObjectId(request.attendance_id))
        if not attendance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attendance record not found",
            )
        # Ensure this regularization belongs to the current user
        if attendance.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to correct this attendance record",
            )
    else:
        if not request.requested_check_in:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please provide a Corrected Check-In date if Attendance ID is left blank.",
            )
        
        target_date = request.requested_check_in.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = request.requested_check_in.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Check if an attendance record already exists for this day
        attendance = await Attendance.find_one(
            Attendance.user_id == current_user.id,
            Attendance.check_in >= target_date,
            Attendance.check_in <= end_date
        )
        
        if not attendance:
            # Create placeholder attendance (null-safe company_id fallback)
            attendance = Attendance(
                user_id=current_user.id,
                company_id=current_user.company_id or PydanticObjectId(),
                check_in=request.requested_check_in,
                check_out=request.requested_check_out,
                status="absent",
                remarks="Placeholder for regularization request"
            )
            await attendance.insert()


    # Check if a pending regularization already exists
    existing = await AttendanceRegularization.find_one(
        AttendanceRegularization.attendance_id == attendance.id,
        AttendanceRegularization.status == RegularizationStatus.PENDING
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A correction request is already pending for this attendance log.",
        )

    regularization = AttendanceRegularization(
        user_id=current_user.id,
        user_name=current_user.name,
        attendance_id=attendance.id,
        requested_check_in=request.requested_check_in,
        requested_check_out=request.requested_check_out,
        reason=request.reason,
        attachment_url=request.attachment_url,
        status=RegularizationStatus.PENDING,
    )
    await regularization.insert()

    # Create notification for managers and HR team
    recipient_ids = set()
    if current_user.reporting_manager_id:
        recipient_ids.add(current_user.reporting_manager_id)
    if current_user.hr_reporting_manager_id:
        recipient_ids.add(current_user.hr_reporting_manager_id)

    # Also notify all active HR team members (Admin, HR Manager, Assistant HR Manager)
    hr_users = await User.find(
        In(User.role, [UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER]),
        User.is_active == True,
        User.is_deleted == False
    ).to_list()
    for hr in hr_users:
        recipient_ids.add(hr.id)

    # Remove applicant from recipient list to avoid self-notifying
    recipient_ids.discard(current_user.id)

    # Insert notifications
    for recipient_id in recipient_ids:
        await Notification(
            user_id=recipient_id,
            sender_id=current_user.id,
            title="New Attendance Regularization Request",
            message=f"{current_user.name} has submitted an attendance regularization request for reason: {request.reason}.",
            type="system"
        ).insert()

    return {"message": "Attendance correction request submitted successfully", "id": str(regularization.id)}


@router.get("/my", response_model=List[dict])
async def get_my_regularizations(current_user: User = Depends(get_current_user)):
    """Get the current employee's correction requests history."""
    reqs = await AttendanceRegularization.find(AttendanceRegularization.user_id == current_user.id).sort("-created_at").to_list()
    return [
        {
            "id": str(r.id),
            "attendance_id": str(r.attendance_id),
            "requested_check_in": r.requested_check_in.isoformat() if r.requested_check_in else None,
            "requested_check_out": r.requested_check_out.isoformat() if r.requested_check_out else None,
            "reason": r.reason,
            "status": r.status.value,
            "comments": r.comments,
            "created_at": r.created_at.isoformat(),
            "verified_by_name": r.verified_by_name,
            "approved_by_name": r.approved_by_name,
        }
        for r in reqs
    ]


@router.get("/pending", response_model=List[dict])
async def get_pending_regularizations(user: User = Depends(require_management_team)):
    """List pending correction requests. Filters by hierarchy for all management roles except Admin."""
    query_conditions = [
        AttendanceRegularization.status != RegularizationStatus.APPROVED,
        AttendanceRegularization.status != RegularizationStatus.REJECTED
    ]
    
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None:
        from beanie.operators import In
        query_conditions.append(In(AttendanceRegularization.user_id, list(visible_ids)))

    reqs = await AttendanceRegularization.find(*query_conditions).sort("-created_at").to_list()

    return [
        {
            "id": str(r.id),
            "user_id": str(r.user_id),
            "user_name": r.user_name,
            "attendance_id": str(r.attendance_id),
            "requested_check_in": r.requested_check_in.isoformat() if r.requested_check_in else None,
            "requested_check_out": r.requested_check_out.isoformat() if r.requested_check_out else None,
            "reason": r.reason,
            "status": r.status.value,
            "comments": r.comments,
            "created_at": r.created_at.isoformat(),
            "verified_by_name": r.verified_by_name,
            "approved_by_name": r.approved_by_name,
        }
        for r in reqs
    ]


@router.get("/all", response_model=List[dict])
async def get_all_regularizations(user: User = Depends(require_management_team)):
    """List all correction requests (history). Filters by hierarchy for all management roles except Admin."""
    query_conditions = []
    
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None:
        from beanie.operators import In
        query_conditions.append(In(AttendanceRegularization.user_id, list(visible_ids)))

    if query_conditions:
        reqs = await AttendanceRegularization.find(*query_conditions).sort("-created_at").to_list()
    else:
        reqs = await AttendanceRegularization.find_all().sort("-created_at").to_list()
    return [
        {
            "id": str(r.id),
            "user_id": str(r.user_id),
            "user_name": r.user_name,
            "attendance_id": str(r.attendance_id),
            "requested_check_in": r.requested_check_in.isoformat() if r.requested_check_in else None,
            "requested_check_out": r.requested_check_out.isoformat() if r.requested_check_out else None,
            "reason": r.reason,
            "status": r.status.value,
            "comments": r.comments,
            "created_at": r.created_at.isoformat(),
            "verified_by_name": r.verified_by_name,
            "approved_by_name": r.approved_by_name,
        }
        for r in reqs
    ]


@router.post("/verify/{id}")
async def verify_regularization(
    id: str,
    action: RegularizationActionRequest,
    hr_user: User = Depends(require_management_team)
):
    """Verify request."""
    req = await AttendanceRegularization.get(PydanticObjectId(id))
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    # Allow any management role (admin, hr manager, manager) to verify
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(hr_user)
    if visible_ids is not None and req.user_id not in visible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage regularization requests for employees under your hierarchy."
        )

    if req.status not in [RegularizationStatus.PENDING]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot verify a request in '{req.status.value}' state. Only PENDING requests can be verified."
        )

    req.status = RegularizationStatus.VERIFIED
    req.verified_by = hr_user.id
    req.verified_by_name = hr_user.name
    req.comments = action.comments
    await req.save()

    # Notify applicant
    await Notification(
        user_id=req.user_id,
        sender_id=hr_user.id,
        title="Attendance Regularization Request Verified",
        message=f"Your attendance regularization request has been verified by {hr_user.name} and is awaiting final Admin approval.",
        type="system"
    ).insert()

    # Notify Admin and HR Managers
    recipient_ids = set()
    hr_approvers = await User.find(
        In(User.role, [UserRole.ADMIN, UserRole.HR_MANAGER]),
        User.is_active == True,
        User.is_deleted == False
    ).to_list()
    for hr in hr_approvers:
        recipient_ids.add(hr.id)

    # Notify applicant's reporting manager if present
    applicant = await User.get(req.user_id)
    if applicant and applicant.reporting_manager_id:
        recipient_ids.add(applicant.reporting_manager_id)

    recipient_ids.discard(hr_user.id)

    for recipient_id in recipient_ids:
        await Notification(
            user_id=recipient_id,
            sender_id=hr_user.id,
            title="Regularization Request Verified - Awaiting Approval",
            message=f"Attendance regularization request for {req.user_name} has been verified by {hr_user.name} and is awaiting final approval.",
            type="system"
        ).insert()

    # Audit log for verification
    log = ActivityLog(
        user_id=hr_user.id,
        user_name=hr_user.name,
        action="Attendance Regularization Verified",
        details=f"Verified regularization request {req.id} for user {req.user_name}. Comments: {action.comments or ''}"
    )
    await log.insert()

    return {"message": "Attendance correction verified successfully, pending manager/admin review.", "performed_by": hr_user.role.value}


@router.post("/review/{id}")
async def review_regularization(
    id: str,
    action: RegularizationActionRequest,
    hr_mgr: User = Depends(require_management_team)
):
    """Review request."""
    req = await AttendanceRegularization.get(PydanticObjectId(id))
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(hr_mgr)
    if visible_ids is not None and req.user_id not in visible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage regularization requests for employees under your hierarchy."
        )

    req.status = RegularizationStatus.VERIFIED  # Treat verified as fully checked
    req.approved_by = hr_mgr.id
    req.approved_by_name = hr_mgr.name
    req.comments = action.comments
    await req.save()

    # Notify applicant
    await Notification(
        user_id=req.user_id,
        sender_id=hr_mgr.id,
        title="Attendance Regularization Reviewed",
        message=f"Your attendance regularization request has been reviewed by {hr_mgr.name} and is pending final approval.",
        type="system"
    ).insert()

    # Audit log for review
    log = ActivityLog(
        user_id=hr_mgr.id,
        user_name=hr_mgr.name,
        action="Attendance Regularization Reviewed",
        details=f"Reviewed regularization request {req.id} for user {req.user_name}. Comments: {action.comments or ''}"
    )
    await log.insert()

    return {"message": "Attendance correction reviewed successfully, pending final approval.", "performed_by": hr_mgr.role.value}


@router.post("/approve/{id}")
async def approve_regularization(
    id: str,
    action: RegularizationActionRequest,
    admin: User = Depends(require_management_team)
):
    """Final Approval and update matching attendance log."""
    req = await AttendanceRegularization.get(PydanticObjectId(id))
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(admin)
    if visible_ids is not None and req.user_id not in visible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage regularization requests for employees under your hierarchy."
        )

    if req.status in [RegularizationStatus.APPROVED, RegularizationStatus.REJECTED]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request already finalized")

    # Fetch corresponding attendance record
    attendance = await Attendance.get(req.attendance_id)
    if not attendance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corresponding attendance record not found")

    # Update Attendance Log values
    if req.requested_check_in:
        attendance.check_in = req.requested_check_in
    if req.requested_check_out:
        attendance.check_out = req.requested_check_out

    attendance.status = "present"  # Regularize to present
    attendance.remarks = f"Regularized by {admin.name}. Comments: {action.comments or ''}"

    # --- Populate location if missing (placeholder entries have no location_in) ---
    if not attendance.location_in:
        try:
            from app.models.company import Company
            applicant_user = await User.get(req.user_id)
            company = await Company.get(applicant_user.company_id) if applicant_user and applicant_user.company_id else None
            if company and company.office_lat is not None and company.office_lng is not None:
                attendance.location_in = {"lat": company.office_lat, "lng": company.office_lng}
                attendance.address_in = "Regularized – Office Location"
                if not attendance.location_out and req.requested_check_out:
                    attendance.location_out = {"lat": company.office_lat, "lng": company.office_lng}
                    attendance.address_out = "Regularized – Office Location"
        except Exception as loc_err:
            logger.warning(f"Could not set office location on regularized attendance: {loc_err}")

    await attendance.save()

    # Automatically recalculate draft payroll for the applicant
    try:
        from app.routes.payroll import calculate_corporate_payroll
        applicant = await User.get(req.user_id)
        if applicant:
            month_str = attendance.check_in.strftime("%Y-%m")
            await calculate_corporate_payroll(
                employee=applicant,
                month=month_str
            )
    except Exception as e:
        logger.warning(f"Could not automatically recalculate draft payroll on regularization approval: {e}")

    # Update Regularization Request
    req.status = RegularizationStatus.APPROVED
    req.approved_by = admin.id
    req.approved_by_name = admin.name
    req.comments = action.comments
    await req.save()

    # Generate Audit Log
    log = ActivityLog(
        user_id=admin.id,
        user_name=admin.name,
        action="Attendance Regularized",
        details=f"Regularized attendance ID {attendance.id} for user {req.user_name} to check-in: {req.requested_check_in}, check-out: {req.requested_check_out}",
    )
    await log.insert()

    # Notify applicant
    await Notification(
        user_id=req.user_id,
        sender_id=admin.id,
        title="Attendance Regularization Approved",
        message=f"Your attendance regularization request has been approved by {admin.name}. Your attendance log has been successfully updated.",
        type="system"
    ).insert()

    # Notify applicant's managers
    recipient_ids = set()
    applicant = await User.get(req.user_id)
    if applicant:
        if applicant.reporting_manager_id:
            recipient_ids.add(applicant.reporting_manager_id)
        if applicant.hr_reporting_manager_id:
            recipient_ids.add(applicant.hr_reporting_manager_id)

    recipient_ids.discard(admin.id)

    for recipient_id in recipient_ids:
        await Notification(
            user_id=recipient_id,
            sender_id=admin.id,
            title="Attendance Regularization Approved",
            message=f"Attendance regularization request for {req.user_name} has been approved.",
            type="system"
        ).insert()

    # Trigger payroll recalculation logic if necessary
    from app.models.payroll import Payroll, PayrollStatus
    from app.routes.payroll import calculate_corporate_payroll
    from app.models.attendance import IST
    month_str = attendance.check_in.astimezone(IST).strftime("%Y-%m")
    try:
        payrolls = await Payroll.find(Payroll.user_id == req.user_id, Payroll.month == month_str).to_list()
        for p in payrolls:
            if p.status == PayrollStatus.DRAFT:
                await calculate_corporate_payroll(employee=applicant, month=month_str)
            else:
                p.recalculation_required = True
                await p.save()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Could not automatically recalculate payroll on regularization approval: {e}")

    return {"message": "Attendance regularization request approved and log successfully updated!", "performed_by": admin.role.value}


@router.post("/reject/{id}")
async def reject_regularization(
    id: str,
    action: RegularizationActionRequest,
    hr_user: User = Depends(require_management_team)
):
    """Reject regularization request."""
    req = await AttendanceRegularization.get(PydanticObjectId(id))
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(hr_user)
    if visible_ids is not None and req.user_id not in visible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage regularization requests for employees under your hierarchy."
        )

    if req.status in [RegularizationStatus.APPROVED, RegularizationStatus.REJECTED]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request already finalized")

    req.status = RegularizationStatus.REJECTED
    req.approved_by = hr_user.id
    req.approved_by_name = hr_user.name
    req.comments = action.comments
    await req.save()

    # Audit log for rejection
    log = ActivityLog(
        user_id=hr_user.id,
        user_name=hr_user.name,
        action="Attendance Regularization Rejected",
        details=f"Rejected regularization request {req.id} for user {req.user_name}. Comments: {action.comments or ''}"
    )
    await log.insert()

    # Notify applicant
    await Notification(
        user_id=req.user_id,
        sender_id=hr_user.id,
        title="Attendance Regularization Rejected",
        message=f"Your attendance regularization request has been rejected. Comments: {action.comments or 'None'}",
        type="system"
    ).insert()

    # Notify applicant's managers
    recipient_ids = set()
    applicant = await User.get(req.user_id)
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
            title="Attendance Regularization Rejected",
            message=f"Attendance regularization request for {req.user_name} has been rejected.",
            type="system"
        ).insert()

    return {"message": "Attendance regularization request has been rejected.", "performed_by": hr_user.role.value}
