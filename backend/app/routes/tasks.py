"""
Task management routes - CRUD for tasks.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, Request
from app.schemas.task import CreateTaskRequest, UpdateTaskRequest, TaskResponse
from app.services import task_service
from app.auth.dependencies import get_current_user
from app.auth.tenant_scope import get_active_business_unit_id, require_tenant_id
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from beanie import PydanticObjectId
from beanie.operators import In, Or
from typing import List, Optional
from app.models.category import Category
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/tasks", tags=["Task Management"])


async def _resolve_company_name(tenant_id) -> Optional[str]:
    """Resolve tenant name or company name from tenant_id."""
    if not tenant_id:
        return None
    tenant = await Tenant.get(tenant_id)
    if tenant:
        return tenant.name
    from app.models.company import Company
    company = await Company.get(tenant_id)
    return company.name if company else None


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    request: CreateTaskRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Create a new task. Supports multiple assignees, multiple tenants, and recurrence.
    The task is stamped with the active business unit (or the assignee's, or the
    creator's) so the task is visible only inside the matching unit context."""
    from app.services.user_service import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(current_user)
    
    # 1. Determine target employees
    target_employees = []
    if request.for_all:
        if current_user.role == UserRole.MANAGER:
            # Find all users in their hierarchy scope
            if visible_ids is not None:
                target_employees = await User.find(
                    In(User.id, list(visible_ids)),
                    User.is_active == True,
                ).to_list()
            else:
                target_employees = await User.find(
                    User.is_active == True,
                    User.tenant_id == current_user.tenant_id
                ).to_list() if current_user.tenant_id else []
        elif current_user.role == UserRole.ASSISTANT_MANAGER:
            if visible_ids is not None:
                target_employees = await User.find(
                    In(User.id, list(visible_ids)),
                    User.is_active == True,
                ).to_list()
            else:
                target_employees = await User.find(
                    User.is_active == True,
                    User.tenant_id == current_user.tenant_id
                ).to_list() if current_user.tenant_id else []
        else:
            target_employees = await User.find(
                In(User.role, [UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER,
                               UserRole.MANAGER, UserRole.ASSISTANT_MANAGER, UserRole.EMPLOYEE]),
                User.is_active == True,
                User.tenant_id == current_user.tenant_id
            ).to_list() if current_user.tenant_id else []
    elif request.assigned_to_list:
        target_employees = await User.find(In(User.id, [PydanticObjectId(uid) for uid in request.assigned_to_list])).to_list()
    elif request.assigned_to:
        emp = await User.get(PydanticObjectId(request.assigned_to))
        if emp: target_employees = [emp]

    # Validate hierarchy for specific assignees
    if current_user.role != UserRole.ADMIN:
        if visible_ids is not None:
            allowed_ids = visible_ids | {current_user.id}
            for emp in target_employees:
                if emp.id not in allowed_ids:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You can only assign tasks to employees under your hierarchy."
                    )

    if not target_employees:
        target_employees = [current_user]

    # 2. Determine target tenants
    target_tenants = []
    if request.company_id_list:
        target_tenants = [PydanticObjectId(cid) for cid in request.company_id_list]
    elif request.tenant_id:
        target_tenants = [PydanticObjectId(request.tenant_id)]
    else:
        target_tenants = [current_user.tenant_id] if current_user.tenant_id else [None]

    # 3. Create initial task instances first
    last_task = None
    created_tasks = []
    for cid in target_tenants:
        for emp in target_employees:
            resolved_bu = active_bu_id or emp.business_unit_id or current_user.business_unit_id
            task_instance = await task_service.create_task(
                work_description=request.work_description,
                assigned_to=str(emp.id),
                created_by=str(current_user.id),
                priority=request.priority,
                deadline=request.deadline,
                task_type="assigned" if emp.id != current_user.id else "personal",
                tenant_id=str(cid) if cid else None,
                recurring_task_id=None,
                category_ids=request.category_ids,
                business_unit_id=resolved_bu,
            )
            created_tasks.append(task_instance)
            last_task = task_instance

    if not last_task:
        raise HTTPException(status_code=400, detail="Failed to create tasks.")

    # 4. Handle Recurrence Registration
    recurring_rule = None
    if request.is_recurrent and request.recurrence:
        from app.models.recurring_task import RecurrenceRule, RecurrenceType, RecurrenceEndType
        from app.models.task import TaskPriority
        from datetime import datetime, timezone
        from app.services.recurrence_service import calculate_next_run

        parsed_end_date = None
        occurrences_count = None
        db_end_type = RecurrenceEndType.NEVER

        if request.recurrence.end_type == "date" and request.recurrence.end_value:
            db_end_type = RecurrenceEndType.ON_DATE
            try:
                # Handle ISO format dates
                parsed_end_date = datetime.fromisoformat(request.recurrence.end_value.replace("Z", ""))
            except Exception:
                parsed_end_date = None
        elif request.recurrence.end_type == "count" and request.recurrence.end_value:
            db_end_type = RecurrenceEndType.AFTER_OCCURRENCES
            try:
                occurrences_count = int(request.recurrence.end_value)
            except Exception:
                occurrences_count = None

        recurring_rule = RecurrenceRule(
            name=f"Recurring: {request.work_description[:40]}",
            created_by=current_user.id,
            task_template_id=last_task.id, # Keep for legacy database fallback compatibility
            work_description=request.work_description,
            priority=TaskPriority(request.priority),
            assigned_to_list=[emp.id for emp in target_employees],
            company_ids=[cid for cid in target_tenants if cid is not None],
            category_ids=[PydanticObjectId(cid) for cid in request.category_ids] if request.category_ids else [],
            recurrence_type=RecurrenceType(request.recurrence.type),
            interval=request.recurrence.interval,
            weekdays=request.recurrence.weekdays,
            month_days=[request.deadline.day] if (request.recurrence.type == "monthly" and request.deadline) else ([request.recurrence.month_day] if request.recurrence.month_day else None),
            start_date=datetime.now(timezone.utc),
            end_type=db_end_type,
            end_date=parsed_end_date,
            occurrences=occurrences_count,
            occurrence_count=1,
            is_active=True
        )
        # Calculate next run time after the initial deadline
        recurring_rule.next_run = request.deadline
        recurring_rule.next_run = calculate_next_run(recurring_rule)
        await recurring_rule.insert()

        # Link all created tasks back to the rule
        for task in created_tasks:
            task.recurring_task_id = recurring_rule.id
            await task.save()

    if not last_task:
        raise HTTPException(status_code=400, detail="Failed to create tasks.")

    # Notify assignees
    for emp in target_employees:
        if emp.id != current_user.id:
            await NotificationService.notify_user(
                user_id=emp.id,
                sender_id=current_user.id,
                title="New Task Assigned",
                message=f"You have been assigned a new task: {request.work_description}",
                type="task_assigned"
            )

    # Audit logging (log the last created task as a representative)
    await AuditService.log_event(
        actor=current_user,
        entity_type="task",
        entity_id=last_task.id,
        action="created",
        after_state=last_task.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    # Resolve names for response (using the last created task)
    assigned_user = await User.get(last_task.assigned_to)
    creator = await User.get(last_task.created_by)
    tenant_name = await _resolve_company_name(last_task.tenant_id)

    # Resolve categories
    cat_names = []
    for cid in (last_task.category_ids or []):
        cat = await Category.get(cid)
        if cat:
            cat_names.append(cat.name)

    return TaskResponse.from_task(
        last_task,
        assigned_name=assigned_user.name if assigned_user else None,
        creator_name=creator.name if creator else None,
        tenant_name=tenant_name,
        category_names=cat_names,
    )


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    employee_id: Optional[str] = None,
    all_tasks: bool = Query(False, description="Admins can set this to True to see all tasks"),
    current_user: User = Depends(get_current_user),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Get tasks. Admins see all; managers/employees see according to hierarchy.
    When a business unit is active, the result is narrowed to that unit only."""
    from app.services.user_service import get_visible_employee_ids

    visible_ids = await get_visible_employee_ids(current_user)
    tenant_cid = require_tenant_id(current_user)

    # 1. If employee_id is requested, verify permission
    if employee_id:
        emp_obj_id = PydanticObjectId(employee_id)
        if visible_ids is not None and emp_obj_id not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view tasks of employees under your hierarchy."
            )
        # Fetch only for this employee
        tasks = await task_service.get_tasks(
            user_id=employee_id,
            status=status_filter,
            priority=priority,
            is_admin=True,
            tenant_id=tenant_cid,
            business_unit_id=active_bu_id,
        )
    else:
        # No employee_id filter.
        # Admin: see all if all_tasks=True, else only their own.
        # HR_MANAGER / ASSISTANT_HR_MANAGER: only their own assigned tasks in the
        #   employee portal (same as a regular employee). Their management portal
        #   always passes employee_id explicitly, so it takes the branch above.
        # Manager / Assistant Manager: tasks within their hierarchy if all_tasks=True, else only their own.
        # Employee: only their own tasks.
        if current_user.role == UserRole.ADMIN and all_tasks:
            tasks = await task_service.get_tasks(
                user_id=None,
                status=status_filter,
                priority=priority,
                is_admin=True,
                tenant_id=tenant_cid,
                business_unit_id=active_bu_id,
            )
        elif current_user.role in [UserRole.MANAGER, UserRole.ASSISTANT_MANAGER] and all_tasks:
            # Optimized: Push hierarchy and ownership filtering to the database level
            tasks = await task_service.get_tasks(
                user_ids=list(visible_ids) if visible_ids is not None else [],
                created_by=current_user.id,
                status=status_filter,
                priority=priority,
                is_admin=False, # We use explicit user_ids/created_by instead of admin override
                tenant_id=tenant_cid,
                business_unit_id=active_bu_id,
            )
        else:
            # HR_MANAGER, ASSISTANT_HR_MANAGER, and EMPLOYEE all see only
            # tasks that are assigned to themselves.
            tasks = await task_service.get_tasks(
                user_id=str(current_user.id),
                status=status_filter,
                priority=priority,
                is_admin=False,
                tenant_id=tenant_cid,
                business_unit_id=active_bu_id,
            )

    # Batch resolve related entity names
    user_ids = set()
    tenant_ids = set()
    category_ids_set = set()

    for task in tasks:
        user_ids.add(task.assigned_to)
        user_ids.add(task.created_by)
        if task.tenant_id:
            tenant_ids.add(task.tenant_id)
        for cid in (task.category_ids or []):
            category_ids_set.add(cid)

    # Parallel batch fetching
    import asyncio
    from app.models.company import Company
    users_data, tenants_data, companies_data, categories_data = await asyncio.gather(
        User.find({"_id": {"$in": list(user_ids)}}).to_list(),
        Tenant.find({"_id": {"$in": list(tenant_ids)}}).to_list(),
        Company.find({"_id": {"$in": list(tenant_ids)}}).to_list(),
        Category.find({"_id": {"$in": list(category_ids_set)}}).to_list()
    )

    user_map = {u.id: u.name for u in users_data}
    company_map = {t.id: t.name for t in tenants_data}
    company_map.update({c.id: c.name for c in companies_data})
    category_map = {cat.id: cat.name for cat in categories_data}

    result = []
    for task in tasks:
        # Resolve category names from map
        cat_names = [category_map.get(cid, "Unknown") for cid in (task.category_ids or [])]

        result.append(TaskResponse.from_task(
            task,
            assigned_name=user_map.get(task.assigned_to, "Unknown"),
            creator_name=user_map.get(task.created_by, "Unknown"),
            tenant_name=company_map.get(task.tenant_id) if task.tenant_id else None,
            category_names=cat_names,
        ))

    return result


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    request: UpdateTaskRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """Update a task. Employees can only update their own tasks."""
    db_task = await task_service.get_task_by_id(task_id)
    if not db_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Check the hierarchy of the task's assignee before proceeding with updates if the editor is not Admin
    if current_user.role != UserRole.ADMIN:
        if current_user.role not in [UserRole.MANAGER, UserRole.ASSISTANT_MANAGER, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER]:
            # For regular employee, verify they only update their own task
            if db_task.assigned_to != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only update your own tasks."
                )
        else:
            # It's a management role. Check hierarchy
            from app.services.user_service import get_visible_employee_ids
            visible_ids = await get_visible_employee_ids(current_user)
            if visible_ids is not None and PydanticObjectId(db_task.assigned_to) not in visible_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only update tasks of employees under your hierarchy."
                )

    # Check hierarchy of new assignee if being reassigned
    if request.assigned_to and current_user.role != UserRole.ADMIN:
        from app.services.user_service import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(current_user)
        allowed_ref_ids = (visible_ids or set()) | {current_user.id}
        if PydanticObjectId(request.assigned_to) not in allowed_ref_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only assign tasks to employees under your hierarchy."
            )

    before_state = db_task.model_dump()
    is_management = current_user.role in [UserRole.ADMIN, UserRole.MANAGER, UserRole.ASSISTANT_MANAGER, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER]
    try:
        task = await task_service.update_task(
            task_id=task_id,
            user_id=str(current_user.id),
            is_admin=is_management,
            work_description=request.work_description,
            status=request.status,
            priority=request.priority,
            deadline=request.deadline,
            remarks=request.remarks,
            category_ids=request.category_ids,
            tenant_id=request.tenant_id,
            assigned_to=request.assigned_to,
            quality_multiplier=request.quality_multiplier,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Notify assignee if task is completed
    if request.status == "completed" and db_task.status != "completed":
        # If reassigned and completed, notify the creator
        await NotificationService.notify_user(
            user_id=db_task.created_by,
            sender_id=current_user.id,
            title="Task Completed",
            message=f"{current_user.name} completed the task: {db_task.work_description}",
            type="task_completed"
        )
    elif request.status == "rejected" and db_task.status != "rejected":
         await NotificationService.notify_user(
            user_id=db_task.assigned_to,
            sender_id=current_user.id,
            title="Task Rejected",
            message=f"Your task '{db_task.work_description}' was rejected by {current_user.name}.",
            type="system"
        )

    await AuditService.log_event(
        actor=current_user,
        entity_type="task",
        entity_id=task.id,
        action="updated",
        before_state=before_state,
        after_state=task.model_dump(),
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    assigned_user = await User.get(task.assigned_to)
    creator = await User.get(task.created_by)
    tenant_name = await _resolve_company_name(task.tenant_id)

    cat_names = []
    for cid in (task.category_ids or []):
        cat = await Category.get(cid)
        if cat:
            cat_names.append(cat.name)

    return TaskResponse.from_task(
        task,
        assigned_name=assigned_user.name if assigned_user else None,
        creator_name=creator.name if creator else None,
        tenant_name=tenant_name,
        category_names=cat_names,
    )


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """Delete a task (management only)."""
    db_task = await task_service.get_task_by_id(task_id)
    if not db_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Allowed to delete if Admin, or creator, or if Manager/AM/HR/Assistant HR and the task assignee is in their hierarchy
    allowed = False
    if current_user.role == UserRole.ADMIN:
        allowed = True
    elif db_task.created_by == current_user.id:
        allowed = True
    elif current_user.role in [UserRole.MANAGER, UserRole.ASSISTANT_MANAGER, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER]:
        from app.services.user_service import get_visible_employee_ids
        visible_ids = await get_visible_employee_ids(current_user)
        if visible_ids is not None and PydanticObjectId(db_task.assigned_to) in visible_ids:
            allowed = True

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this task."
        )

    before_state = db_task.model_dump()
    success = await task_service.delete_task(task_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await AuditService.log_event(
        actor=current_user,
        entity_type="task",
        entity_id=db_task.id,
        action="deleted",
        before_state=before_state,
        ip_address=http_request.client.host,
        user_agent=http_request.headers.get("user-agent")
    )

    return {"message": "Task deleted successfully"}


@router.get("/recurring-rules")
async def list_recurring_rules(
    current_user: User = Depends(get_current_user),
):
    from app.models.recurring_task import RecurrenceRule
    
    tenant_cid = require_tenant_id(current_user)
    
    tenant_users = await User.find(User.tenant_id == tenant_cid).to_list()
    tenant_user_ids = [u.id for u in tenant_users]
    
    rules = await RecurrenceRule.find(
        RecurrenceRule.status != "terminated",
        Or(
            In(RecurrenceRule.created_by, tenant_user_ids),
            RecurrenceRule.company_ids == tenant_cid
        )
    ).to_list()
    
    if current_user.role == UserRole.EMPLOYEE:
        rules = [
            r for r in rules 
            if r.created_by == current_user.id or current_user.id in r.assigned_to_list
        ]
            
    result = []
    for r in rules:
        assignee_names = []
        for uid in r.assigned_to_list:
            user = await User.get(uid)
            if user:
                assignee_names.append(user.name)
                
        result.append({
            "id": str(r.id),
            "name": r.name,
            "work_description": r.work_description,
            "priority": r.priority.value if hasattr(r.priority, "value") else str(r.priority),
            "recurrence_type": r.recurrence_type.value if hasattr(r.recurrence_type, "value") else str(r.recurrence_type),
            "interval": r.interval,
            "weekdays": r.weekdays,
            "month_days": r.month_days,
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "created_at": r.created_at.isoformat() if getattr(r, "created_at", None) else (r.start_date.isoformat() if r.start_date else None),
            "end_type": r.end_type.value if hasattr(r.end_type, "value") else str(r.end_type),
            "end_date": r.end_date.isoformat() if r.end_date else None,
            "occurrences": r.occurrences,
            "occurrence_count": r.occurrence_count,
            "is_active": r.is_active,
            "status": r.status,
            "paused_until_date": r.paused_until_date.isoformat() if r.paused_until_date else None,
            "next_run": r.next_run.isoformat() if r.next_run else None,
            "assignee_names": assignee_names,
        })
    return result


@router.post("/recurring-rules/{rule_id}/pause")
async def pause_recurring_rule(
    rule_id: str,
    days: Optional[int] = Query(None),
    weeks: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
):
    from app.models.recurring_task import RecurrenceRule
    from datetime import datetime, timezone, timedelta
    from app.auth.tenant_scope import require_tenant_id
    
    rule = await RecurrenceRule.get(PydanticObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Recurring rule not found")
        
    tenant_cid = require_tenant_id(current_user)
    creator = await User.get(rule.created_by)
    is_same_tenant = (creator and creator.tenant_id == tenant_cid) or (tenant_cid in rule.company_ids)
    if not is_same_tenant:
        raise HTTPException(status_code=403, detail="Access denied. You cannot modify rules for another tenant.")
        
    if current_user.role != UserRole.ADMIN and rule.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this rule")
        
    rule.status = "paused"
    if days:
        rule.paused_until_date = datetime.now(timezone.utc) + timedelta(days=days)
    elif weeks:
        rule.paused_until_date = datetime.now(timezone.utc) + timedelta(weeks=weeks)
    else:
        rule.paused_until_date = None
        
    await rule.save()
    return {
        "message": "Rule paused successfully",
        "status": rule.status,
        "paused_until_date": rule.paused_until_date.isoformat() if rule.paused_until_date else None
    }


@router.post("/recurring-rules/{rule_id}/resume")
async def resume_recurring_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
):
    from app.models.recurring_task import RecurrenceRule
    from datetime import datetime, timezone
    from app.auth.tenant_scope import require_tenant_id
    
    rule = await RecurrenceRule.get(PydanticObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Recurring rule not found")
        
    tenant_cid = require_tenant_id(current_user)
    creator = await User.get(rule.created_by)
    is_same_tenant = (creator and creator.tenant_id == tenant_cid) or (tenant_cid in rule.company_ids)
    if not is_same_tenant:
        raise HTTPException(status_code=403, detail="Access denied. You cannot modify rules for another tenant.")
        
    if current_user.role != UserRole.ADMIN and rule.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this rule")
        
    rule.status = "active"
    rule.is_active = True
    rule.paused_until_date = None
    
    now = datetime.now(timezone.utc)
    from app.services.recurrence_service import calculate_next_run
    while rule.next_run and rule.next_run <= now:
        rule.next_run = calculate_next_run(rule)
        
    await rule.save()
    return {
        "message": "Rule resumed successfully",
        "status": rule.status,
        "next_run": rule.next_run.isoformat() if rule.next_run else None
    }


@router.delete("/recurring-rules/{rule_id}")
async def delete_recurring_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
):
    from app.models.recurring_task import RecurrenceRule
    from app.auth.tenant_scope import require_tenant_id
    
    rule = await RecurrenceRule.get(PydanticObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Recurring rule not found")
        
    tenant_cid = require_tenant_id(current_user)
    creator = await User.get(rule.created_by)
    is_same_tenant = (creator and creator.tenant_id == tenant_cid) or (tenant_cid in rule.company_ids)
    if not is_same_tenant:
        raise HTTPException(status_code=403, detail="Access denied. You cannot modify rules for another tenant.")
        
    if current_user.role != UserRole.ADMIN and rule.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this rule")
        
    rule.status = "terminated"
    rule.is_active = False
    await rule.save()
    await rule.delete()
    return {"message": "Recurring rule terminated successfully"}
