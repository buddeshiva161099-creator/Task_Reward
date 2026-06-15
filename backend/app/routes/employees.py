"""
Employee management routes - admin only CRUD operations.
"""
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Request
from app.schemas.user import CreateEmployeeRequest, UpdateEmployeeRequest, EmployeeResponse
from app.services import user_service, dashboard_service
from app.auth.dependencies import require_hr_team, require_any_hr_manager, require_management_team
from app.auth.tenant_scope import require_tenant_id, get_active_business_unit_id
from app.models.user import User, UserRole
from app.models.business_unit import BusinessUnit
from beanie import PydanticObjectId
from beanie.operators import In
from typing import List
from app.services.audit_service import AuditService
from app.utils.uploads import IDENTITY_ALLOWED_CONTENT_TYPES, save_upload_file
from app.utils.rate_limiter import RateLimiter

employee_creation_limiter = RateLimiter(times=10, seconds=60)

NON_ADMIN_ROLES = [
    UserRole.HR_MANAGER,
    UserRole.ASSISTANT_HR_MANAGER,
    UserRole.MANAGER,
    UserRole.ASSISTANT_MANAGER,
    UserRole.EMPLOYEE,
]

router = APIRouter(prefix="/admin/employees", tags=["Employee Management"])



async def check_circular_dependency(user_id: PydanticObjectId, potential_manager_id: PydanticObjectId) -> bool:
    if not potential_manager_id:
        return False
    if user_id == potential_manager_id:
        return True
    
    visited = set()
    async def dfs(curr_id: PydanticObjectId) -> bool:
        if curr_id == user_id:
            return True
        if curr_id in visited:
            return False
        visited.add(curr_id)
        
        curr_user = await User.get(curr_id)
        if not curr_user:
            return False
        
        # Check both reporting paths upward
        if curr_user.reporting_manager_id and await dfs(curr_user.reporting_manager_id):
            return True
        if curr_user.hr_reporting_manager_id and await dfs(curr_user.hr_reporting_manager_id):
            return True
        return False

    return await dfs(potential_manager_id)


async def validate_hierarchy_rules(
    role: str,
    reporting_manager_id: str = None,
    hr_reporting_manager_id: str = None,
    user_id: str = None,
):
    """
    Validate strict hierarchical reporting relationships:
    - Admin        → No hierarchy required.
    - Manager      → No hierarchy required.
    - HR Manager   → No hierarchy required.
    - Asst Manager → Must point to a Manager (reporting_manager_id). Optional linkage to HR Manager (hr_reporting_manager_id).
    - Asst HR Mgr  → Must point to an HR Manager (hr_reporting_manager_id). Optional linkage to Manager (reporting_manager_id).
    - Employee     → Must point to Assistant Manager (reporting_manager_id) AND Assistant HR Manager (hr_reporting_manager_id).
    """
    from beanie import PydanticObjectId
    from bson.errors import InvalidId

    def get_obj_id(val: str, field_name: str):
        if not val:
            return None
        try:
            return PydanticObjectId(val)
        except (InvalidId, Exception):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid ID format for {field_name}: '{val}'"
            )

    rep_id = get_obj_id(reporting_manager_id, "reportingManagerId")
    hr_rep_id = get_obj_id(hr_reporting_manager_id, "hrReportingManagerId")
    u_id = get_obj_id(user_id, "User ID") if user_id else None

    # Circular dependency check
    if u_id:
        if rep_id and await check_circular_dependency(u_id, rep_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Circular reporting relationship detected (Operational Manager)."
            )
        if hr_rep_id and await check_circular_dependency(u_id, hr_rep_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Circular reporting relationship detected (HR Manager)."
            )

    if role == "admin":
        return

    elif role == "manager" or role == "hr_manager":
        return

    elif role == "assistant_manager":
        if not rep_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An Assistant Manager must be assigned to an Operational Manager."
            )
        mgr = await User.get(rep_id)
        if not mgr or mgr.is_deleted or mgr.role != UserRole.MANAGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The assigned operational manager must hold the Manager role."
            )
        if hr_rep_id:
            hr_mgr = await User.get(hr_rep_id)
            if not hr_mgr or hr_mgr.is_deleted or hr_mgr.role != UserRole.HR_MANAGER:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The assigned HR manager must hold the HR Manager role."
                )

    elif role == "assistant_hr_manager":
        if not hr_rep_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An Assistant HR Manager must be assigned to an HR Manager."
            )
        hr_mgr = await User.get(hr_rep_id)
        if not hr_mgr or hr_mgr.is_deleted or hr_mgr.role != UserRole.HR_MANAGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The assigned HR manager must hold the HR Manager role."
            )
        if rep_id:
            mgr = await User.get(rep_id)
            if not mgr or mgr.is_deleted or mgr.role != UserRole.MANAGER:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The assigned operational manager must hold the Manager role."
                )

    elif role == "employee":
        if not rep_id or not hr_rep_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An Employee must be assigned to both an Assistant Manager and an Assistant HR Manager."
            )
        ast_mgr = await User.get(rep_id)
        if not ast_mgr or ast_mgr.is_deleted or ast_mgr.role != UserRole.ASSISTANT_MANAGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The assigned operational manager must hold the Assistant Manager role."
            )
        ast_hr = await User.get(hr_rep_id)
        if not ast_hr or ast_hr.is_deleted or ast_hr.role != UserRole.ASSISTANT_HR_MANAGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The assigned HR manager must hold the Assistant HR Manager role."
            )


from app.services.user_service import get_visible_employee_ids


# ────────────────────────────────────────────────────────
#  Identity Document Upload
# ────────────────────────────────────────────────────────

@router.post("/upload-identity-doc")
async def upload_identity_document(
    file: UploadFile = File(...),
    user: User = Depends(require_management_team),
):
    """Upload a validated identity document file for an employee."""
    tenant_sub = f"tenant_{user.tenant_id}" if user.tenant_id else "global"
    filename, size = await save_upload_file(
        file=file,
        upload_dir=f"uploads/identity_docs/{tenant_sub}",
        allowed_content_types=IDENTITY_ALLOWED_CONTENT_TYPES,
    )

    return {"url": f"/uploads/identity_docs/{tenant_sub}/{filename}", "filename": filename, "size": size}



# ────────────────────────────────────────────────────────
#  List / Read
# ────────────────────────────────────────────────────────

@router.get("", response_model=List[EmployeeResponse])
async def list_employees(
    user: User = Depends(require_management_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Get employees based on role hierarchy, scoped to the caller's tenant and active BU."""
    cid = require_tenant_id(user)
    visible_ids = await get_visible_employee_ids(user)

    extra = {}
    if active_bu_id is not None:
        extra["business_unit_id"] = active_bu_id

    if visible_ids is not None:
        employees = await User.find(
            User.is_deleted != True,
            User.tenant_id == cid,
            In(User.id, list(visible_ids)),
            **extra,
        ).sort("-created_at").to_list()
    else:
        employees = await user_service.get_all_employees(tenant_id=cid, business_unit_id=active_bu_id)

    return [EmployeeResponse.from_user(emp) for emp in employees]


@router.get("/all-users", response_model=List[EmployeeResponse])
async def list_all_users(
    user: User = Depends(require_management_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Get all users of all roles in the system, scoped to the caller's tenant and active BU."""
    cid = require_tenant_id(user)
    visible_ids = await get_visible_employee_ids(user)

    query: dict = { "is_deleted": {"$ne": True}, "tenant_id": cid }
    if active_bu_id is not None:
        query["business_unit_id"] = active_bu_id
    if visible_ids is not None:
        query["_id"] = {"$in": list(visible_ids)}

    users = await User.find(query).to_list()
    return [EmployeeResponse.from_user(u) for u in users]


@router.get("/deleted", response_model=List[EmployeeResponse])
async def list_deleted_employees(
    user: User = Depends(require_management_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Get all soft-deleted employees, scoped to the caller's tenant and active BU."""
    cid = require_tenant_id(user)
    visible_ids = await get_visible_employee_ids(user)

    query: dict = { "is_deleted": True, "tenant_id": cid }
    if active_bu_id is not None:
        query["business_unit_id"] = active_bu_id
    if visible_ids is not None:
        query["_id"] = {"$in": list(visible_ids)}

    employees = await User.find(query).sort("-created_at").to_list()
    return [EmployeeResponse.from_user(emp) for emp in employees]


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: str,
    user: User = Depends(require_management_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Get a specific employee, scoped to the caller's tenant and active BU."""
    cid = require_tenant_id(user)
    employee = await user_service.get_employee_by_id(employee_id, tenant_id=cid)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if active_bu_id is not None and employee.business_unit_id != active_bu_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found in this business unit")
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None and employee.id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this employee")
    return EmployeeResponse.from_user(employee)


@router.get("/{employee_id}/stats")
async def get_employee_stats(
    employee_id: str,
    user: User = Depends(require_management_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Get stats for a specific employee (scoped to caller's tenant + active BU)."""
    cid = require_tenant_id(user)
    employee = await user_service.get_employee_by_id(employee_id, tenant_id=cid)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if active_bu_id is not None and employee.business_unit_id != active_bu_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found in this business unit")
    return await dashboard_service.get_employee_dashboard(employee_id)


# ────────────────────────────────────────────────────────
#  Create
# ────────────────────────────────────────────────────────

@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(employee_creation_limiter)])
async def create_employee(
    request: CreateEmployeeRequest,
    http_request: Request,
    user: User = Depends(require_management_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Create a new employee (Management team)."""
    from beanie import PydanticObjectId

    role = request.role
    reporting_manager_id = request.reporting_manager_id
    hr_reporting_manager_id = request.hr_reporting_manager_id

    # Non-admins cannot create users outside their hierarchy
    if user.role != UserRole.ADMIN:
        visible_ids = await get_visible_employee_ids(user)
        allowed_ref_ids = (visible_ids or set()) | {user.id}

        for field_name, field_val in [
            ("Reporting Manager", reporting_manager_id),
            ("HR Reporting Manager", hr_reporting_manager_id),
        ]:
            if field_val and PydanticObjectId(field_val) not in allowed_ref_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"The selected {field_name} is not in your hierarchy.",
                )

    await validate_hierarchy_rules(
        role=role,
        reporting_manager_id=reporting_manager_id,
        hr_reporting_manager_id=hr_reporting_manager_id,
    )

    business_unit_id = getattr(request, "business_unit_id", None)
    if business_unit_id is not None:
        try:
            bu_oid = PydanticObjectId(business_unit_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid business_unit_id.")
        unit = await BusinessUnit.find_one(
            BusinessUnit.id == bu_oid,
            BusinessUnit.tenant_id == user.tenant_id,
        )
        if not unit:
            raise HTTPException(
                status_code=400,
                detail="business_unit_id does not belong to your tenant.",
            )
        business_unit_id = bu_oid
    elif active_bu_id is not None:
        business_unit_id = active_bu_id
    else:
        default_bu = await BusinessUnit.find_one(
            BusinessUnit.tenant_id == user.tenant_id,
            BusinessUnit.is_default == True,
        )
        if not default_bu:
            default_bu = await BusinessUnit.find_one(
                BusinessUnit.tenant_id == user.tenant_id,
                BusinessUnit.is_active == True,
            )
        if default_bu:
            business_unit_id = default_bu.id

    try:
        employee = await user_service.create_employee(
            name=request.name,
            email=request.email,
            password=request.password,
            mobile=request.mobile,
            alternate_mobile=request.alternate_mobile,
            role=role,
            reporting_manager_id=reporting_manager_id,
            hr_reporting_manager_id=hr_reporting_manager_id,
            identity_card_type=request.identity_card_type,
            identity_card_url=request.identity_card_url,
            emergency_contact=request.emergency_contact,
            job_title=request.job_title,
            department=request.department,
            branch=request.branch,
            hiring_date=request.hiring_date,
            hiring_company=request.hiring_company,
            tenant_id=user.tenant_id,
            business_unit_id=business_unit_id,
        )

        await AuditService.log_event(
            actor=user,
            entity_type="employee",
            entity_id=employee.id,
            action="created",
            after_state=employee.model_dump(exclude={"password_hash"}),
            ip_address=http_request.client.host,
            user_agent=http_request.headers.get("user-agent")
        )

        return EmployeeResponse.from_user(employee)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


# ────────────────────────────────────────────────────────
#  Update
# ────────────────────────────────────────────────────────

@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: str,
    request: UpdateEmployeeRequest,
    http_request: Request,
    user: User = Depends(require_management_team),
):
    from beanie import PydanticObjectId

    target_employee = await user_service.get_employee_by_id(employee_id)
    if not target_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if user.tenant_id is not None and target_employee.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee belongs to a different tenant/company.",
        )

    before_state = target_employee.model_dump(exclude={"password_hash"})
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None and target_employee.id not in visible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update employees under your hierarchy.",
        )

    reward_points = request.reward_points
    role = request.role
    reporting_manager_id = request.reporting_manager_id
    hr_reporting_manager_id = request.hr_reporting_manager_id

    if user.role != UserRole.ADMIN:
        reward_points = target_employee.reward_points
        allowed_ref_ids = (visible_ids or set()) | {user.id}

        for field_name, field_val in [
            ("Reporting Manager", reporting_manager_id),
            ("HR Reporting Manager", hr_reporting_manager_id),
        ]:
            if field_val and PydanticObjectId(field_val) not in allowed_ref_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"The selected {field_name} is not in your hierarchy.",
                )

    final_role = role if role is not None else target_employee.role
    if hasattr(final_role, "value"):
        final_role = final_role.value

    final_reporting = reporting_manager_id if reporting_manager_id is not None else (
        str(target_employee.reporting_manager_id) if target_employee.reporting_manager_id else None)
    final_hr_reporting = hr_reporting_manager_id if hr_reporting_manager_id is not None else (
        str(target_employee.hr_reporting_manager_id) if target_employee.hr_reporting_manager_id else None)

    await validate_hierarchy_rules(
        role=final_role,
        reporting_manager_id=final_reporting,
        hr_reporting_manager_id=final_hr_reporting,
        user_id=employee_id,
    )

    try:
        employee = await user_service.update_employee(
            employee_id,
            name=request.name,
            email=request.email,
            is_active=request.is_active,
            mobile=request.mobile,
            alternate_mobile=request.alternate_mobile,
            reward_points=reward_points,
            role=role,
            password=request.password,
            reporting_manager_id=reporting_manager_id,
            hr_reporting_manager_id=hr_reporting_manager_id,
            identity_card_type=request.identity_card_type,
            identity_card_url=request.identity_card_url,
            emergency_contact=request.emergency_contact,
            job_title=request.job_title,
            department=request.department,
            branch=request.branch,
            hiring_date=request.hiring_date,
            hiring_company=request.hiring_company,
        )
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

        await AuditService.log_event(
            actor=user,
            entity_type="employee",
            entity_id=employee.id,
            action="updated",
            before_state=before_state,
            after_state=employee.model_dump(exclude={"password_hash"}),
            ip_address=http_request.client.host,
            user_agent=http_request.headers.get("user-agent")
        )

        return EmployeeResponse.from_user(employee)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ────────────────────────────────────────────────────────
#  Delete / Restore
# ────────────────────────────────────────────────────────

@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    http_request: Request,
    user: User = Depends(require_management_team)
):
    """Soft delete an employee."""
    from beanie import PydanticObjectId
    target_employee = await User.get(PydanticObjectId(employee_id))
    if not target_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None and target_employee.id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only manage employees under your hierarchy.")

    before_state = target_employee.model_dump(exclude={"password_hash"})
    employee = await user_service.soft_delete_employee(employee_id)

    await AuditService.log_event(
        actor=user,
        entity_type="employee",
        entity_id=employee.id,
        action="deactivated",
        before_state=before_state,
        after_state=employee.model_dump(exclude={"password_hash"}),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return {"message": f"Employee {employee.name} soft-deleted"}


@router.post("/{employee_id}/restore", response_model=EmployeeResponse)
async def restore_employee(
    employee_id: str,
    http_request: Request,
    user: User = Depends(require_management_team)
):
    """Restore a soft-deleted employee."""
    from beanie import PydanticObjectId
    target_employee = await User.get(PydanticObjectId(employee_id))
    if not target_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None and target_employee.id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only manage employees under your hierarchy.")

    before_state = target_employee.model_dump(exclude={"password_hash"})
    employee = await user_service.restore_employee(employee_id)

    await AuditService.log_event(
        actor=user,
        entity_type="employee",
        entity_id=employee.id,
        action="restored",
        before_state=before_state,
        after_state=employee.model_dump(exclude={"password_hash"}),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return EmployeeResponse.from_user(employee)


@router.delete("/{employee_id}/permanent")
async def permanent_delete_employee(
    employee_id: str,
    http_request: Request,
    user: User = Depends(require_management_team)
):
    """Permanently delete an employee and all associated records."""
    from beanie import PydanticObjectId
    target_employee = await User.get(PydanticObjectId(employee_id))
    if not target_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    visible_ids = await get_visible_employee_ids(user)
    if visible_ids is not None and target_employee.id not in visible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only manage employees under your hierarchy.")

    before_state = target_employee.model_dump(exclude={"password_hash"})
    success = await user_service.hard_delete_employee(employee_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    await AuditService.log_event(
        actor=user,
        entity_type="employee",
        entity_id=target_employee.id,
        action="permanently_deleted",
        before_state=before_state,
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return {"message": "Employee and all associated records permanently deleted"}
