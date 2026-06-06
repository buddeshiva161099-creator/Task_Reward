"""
Task management routes - CRUD for tasks.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, Request
from app.schemas.task import CreateTaskRequest, UpdateTaskRequest, TaskResponse
from app.services import task_service
from app.auth.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.company import Company
from beanie import PydanticObjectId
from beanie.operators import In, Or
from typing import List, Optional
from app.models.category import Category
from app.services.audit_service import AuditService
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/tasks", tags=["Task Management"])


async def _resolve_company_name(company_id) -> Optional[str]:
    """Resolve company name from company_id."""
    if not company_id:
        return None
    company = await Company.get(company_id)
    return company.name if company else None


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    request: CreateTaskRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """Create a new task. Supports multiple assignees, multiple companies, and recurrence."""
    from app.routes.employees import get_visible_employee_ids
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
                target_employees = await User.find(User.is_active == True).to_list()
        elif current_user.role == UserRole.ASSISTANT_MANAGER:
            if visible_ids is not None:
                target_employees = await User.find(
                    In(User.id, list(visible_ids)),
                    User.is_active == True,
                ).to_list()
            else:
                target_employees = await User.find(User.is_active == True).to_list()
        else:
            target_employees = await User.find(
                In(User.role, [UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER,
                               UserRole.MANAGER, UserRole.ASSISTANT_MANAGER, UserRole.EMPLOYEE]),
                User.is_active == True
            ).to_list()
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

    # 2. Determine target companies
    target_companies = []
    if request.company_id_list:
        target_companies = [PydanticObjectId(cid) for cid in request.company_id_list]
    elif request.company_id:
        target_companies = [PydanticObjectId(request.company_id)]
    else:
        target_companies = [None]

    # 3. Create initial task instances first
    last_task = None
    created_tasks = []
    for cid in target_companies:
        for emp in target_employees:
            task_instance = await task_service.create_task(
                work_description=request.work_description,
                assigned_to=str(emp.id),
                created_by=str(current_user.id),
                priority=request.priority,
                deadline=request.deadline,
                task_type="assigned" if emp.id != current_user.id else "personal",
                company_id=str(cid) if cid else None,
                recurring_task_id=None,
                category_ids=request.category_ids,
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
            company_ids=[cid for cid in target_companies if cid is not None],
            category_ids=[PydanticObjectId(cid) for cid in request.category_ids] if request.category_ids else [],
            recurrence_type=RecurrenceType(request.recurrence.type),
            interval=request.recurrence.interval,
            weekdays=request.recurrence.weekdays,
            month_days=[request.recurrence.month_day] if request.recurrence.month_day else None,
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
    company_name = await _resolve_company_name(last_task.company_id)

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
        company_name=company_name,
        category_names=cat_names,
    )


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    employee_id: Optional[str] = None,
    all_tasks: bool = Query(False, description="Admins can set this to True to see all tasks"),
    current_user: User = Depends(get_current_user),
):
    """Get tasks. Admins see all; managers/employees see according to hierarchy."""
    from app.routes.employees import get_visible_employee_ids

    visible_ids = await get_visible_employee_ids(current_user)

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
            )
        elif current_user.role in [UserRole.MANAGER, UserRole.ASSISTANT_MANAGER] and all_tasks:
            # Optimized: Push hierarchy and ownership filtering to the database level
            tasks = await task_service.get_tasks(
                user_ids=list(visible_ids) if visible_ids is not None else [],
                created_by=current_user.id,
                status=status_filter,
                priority=priority,
                is_admin=False, # We use explicit user_ids/created_by instead of admin override
            )
        else:
            # HR_MANAGER, ASSISTANT_HR_MANAGER, and EMPLOYEE all see only
            # tasks that are assigned to themselves.
            tasks = await task_service.get_tasks(
                user_id=str(current_user.id),
                status=status_filter,
                priority=priority,
                is_admin=False,
            )

    # Batch resolve related entity names
    user_ids = set()
    company_ids = set()
    category_ids_set = set()
    
    for task in tasks:
        user_ids.add(task.assigned_to)
        user_ids.add(task.created_by)
        if task.company_id:
            company_ids.add(task.company_id)
        for cid in (task.category_ids or []):
            category_ids_set.add(cid)

    # Parallel batch fetching
    import asyncio
    users_data, companies_data, categories_data = await asyncio.gather(
        User.find({"_id": {"$in": list(user_ids)}}).to_list(),
        Company.find({"_id": {"$in": list(company_ids)}}).to_list(),
        Category.find({"_id": {"$in": list(category_ids_set)}}).to_list()
    )

    user_map = {u.id: u.name for u in users_data}
    company_map = {c.id: c.name for c in companies_data}
    category_map = {cat.id: cat.name for cat in categories_data}

    result = []
    for task in tasks:
        # Resolve category names from map
        cat_names = [category_map.get(cid, "Unknown") for cid in (task.category_ids or [])]

        result.append(TaskResponse.from_task(
            task,
            assigned_name=user_map.get(task.assigned_to, "Unknown"),
            creator_name=user_map.get(task.created_by, "Unknown"),
            company_name=company_map.get(task.company_id) if task.company_id else None,
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
            from app.routes.employees import get_visible_employee_ids
            visible_ids = await get_visible_employee_ids(current_user)
            if visible_ids is not None and PydanticObjectId(db_task.assigned_to) not in visible_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only update tasks of employees under your hierarchy."
                )

    # Check hierarchy of new assignee if being reassigned
    if request.assigned_to and current_user.role != UserRole.ADMIN:
        from app.routes.employees import get_visible_employee_ids
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
            company_id=request.company_id,
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
    company_name = await _resolve_company_name(task.company_id)

    cat_names = []
    for cid in (task.category_ids or []):
        cat = await Category.get(cid)
        if cat:
            cat_names.append(cat.name)

    return TaskResponse.from_task(
        task,
        assigned_name=assigned_user.name if assigned_user else None,
        creator_name=creator.name if creator else None,
        company_name=company_name,
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
        from app.routes.employees import get_visible_employee_ids
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
