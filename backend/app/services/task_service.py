"""
Task service - business logic for task operations.
"""
from app.models.task import Task, TaskStatus, TaskPriority, TaskType
from app.models.user import User
from app.models.tenant import Tenant
from app.models.category import Category
from app.models.activity_log import ActivityLog
from app.services.reward_service import apply_performance_score
from app.models.notification import Notification
from beanie import PydanticObjectId
from beanie.operators import In, Or
from datetime import datetime
from typing import Optional, List


async def create_task(
    work_description: str,
    assigned_to: str,
    created_by: str,
    priority: str,
    deadline: datetime,
    task_type: str = "assigned",
    tenant_id: Optional[str] = None,
    business_unit_id: Optional[str] = None,
    recurring_task_id: Optional[PydanticObjectId] = None,
    category_ids: Optional[List[str]] = None,
) -> Task:
    """Create a new task.

    If `business_unit_id` is not given explicitly, falls back to the
    assignee's `business_unit_id` (or the creator's), so the task is always
    pinned to a unit when the user is in one.
    """
    assigned_user = await User.get(PydanticObjectId(assigned_to))
    creator_user = await User.get(PydanticObjectId(created_by))
    tenant = await Tenant.get(PydanticObjectId(tenant_id)) if tenant_id else None
    tenant_name = tenant.name if tenant else None
    if not tenant_name and tenant_id:
        from app.models.company import Company
        company = await Company.get(PydanticObjectId(tenant_id))
        if company:
            tenant_name = company.name

    resolved_bu_id: Optional[PydanticObjectId] = None
    if business_unit_id:
        try:
            resolved_bu_id = PydanticObjectId(business_unit_id)
        except Exception:
            resolved_bu_id = None
    if resolved_bu_id is None and assigned_user and assigned_user.business_unit_id:
        resolved_bu_id = assigned_user.business_unit_id
    if resolved_bu_id is None and creator_user and creator_user.business_unit_id:
        resolved_bu_id = creator_user.business_unit_id

    bu_name: Optional[str] = None
    if resolved_bu_id is not None:
        from app.models.business_unit import BusinessUnit
        bu = await BusinessUnit.get(resolved_bu_id)
        if bu:
            bu_name = bu.name

    # Resolve categories
    resolved_category_ids = []
    resolved_category_names = []
    if category_ids:
        for cid in category_ids:
            cat = await Category.get(PydanticObjectId(cid))
            if cat:
                resolved_category_ids.append(cat.id)
                resolved_category_names.append(cat.name)

    task = Task(
        work_description=work_description,
        assigned_to=PydanticObjectId(assigned_to),
        assigned_to_name=assigned_user.name if assigned_user else "Unknown",
        created_by=PydanticObjectId(created_by),
        created_by_name=creator_user.name if creator_user else "Unknown",
        priority=TaskPriority(priority),
        task_type=TaskType(task_type),
        deadline=deadline,
        tenant_id=PydanticObjectId(tenant_id) if tenant_id else None,
        tenant_name=tenant_name,
        business_unit_id=resolved_bu_id,
        business_unit_name=bu_name,
        category_ids=resolved_category_ids,
        category_names=resolved_category_names,
        recurring_task_id=recurring_task_id,
    )
    await task.insert()

    await ActivityLog(
        user_id=PydanticObjectId(created_by),
        action="task_created",
        task_id=task.id,
        details=f"Work '{work_description[:50]}...' assigned to {assigned_user.name if assigned_user else 'Unknown'}",
    ).insert()
    
    # Notify employee if assigned by someone else
    if str(assigned_to) != str(created_by):
        await Notification(
            user_id=PydanticObjectId(assigned_to),
            sender_id=PydanticObjectId(created_by),
            title="New Task Assigned",
            message=f"You have been assigned a new task: {work_description[:100]}",
            type="task_assigned"
        ).insert()

    return task


async def get_tasks(
    user_id: Optional[str] = None,
    user_ids: Optional[List[PydanticObjectId]] = None,
    created_by: Optional[PydanticObjectId] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    is_admin: bool = False,
    tenant_id: Optional[PydanticObjectId] = None,
    business_unit_id: Optional[PydanticObjectId] = None,
) -> List[Task]:
    """Get tasks with optional filters. Optimized with database-level RBAC and overdue marking.

    When `tenant_id` is provided, results are tenant-scoped. When
    `business_unit_id` is also provided, only tasks in that unit are returned
    (otherwise tasks in *any* unit of the tenant are returned).
    """
    if user_ids is not None:
        user_ids = [PydanticObjectId(uid) for uid in user_ids]
    if created_by is not None:
        created_by = PydanticObjectId(created_by)
    if tenant_id is not None:
        tenant_id = PydanticObjectId(tenant_id)
    if business_unit_id is not None:
        business_unit_id = PydanticObjectId(business_unit_id)

    query_parts = []

    if user_id:
        query_parts.append(Task.assigned_to == PydanticObjectId(user_id))
    elif user_ids is not None:
        if created_by:
            # For management roles: see tasks assigned to hierarchy OR tasks they created
            query_parts.append(Or(In(Task.assigned_to, user_ids), Task.created_by == created_by))
        else:
            query_parts.append(In(Task.assigned_to, user_ids))
    elif not is_admin and not user_id:
        # Default security fallback
        return []

    if status:
        query_parts.append(Task.status == status)

    if priority:
        query_parts.append(Task.priority == priority)

    if tenant_id is not None:
        from app.models.company import Company
        companies = await Company.find(Company.tenant_id == tenant_id).to_list()
        company_ids = [c.id for c in companies]
        tenant_match_ids = [tenant_id] + company_ids
        query_parts.append(In(Task.tenant_id, tenant_match_ids))
        if business_unit_id is not None:
            query_parts.append(Task.business_unit_id == business_unit_id)

    # 1. Optimized Batch Auto-mark overdue tasks before fetching
    from datetime import timezone
    now = datetime.now(timezone.utc)

    # Use the same base filters for the update to maintain consistency
    overdue_update_query = {
        "status": {"$in": [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]},
        "deadline": {"$lt": now}
    }

    # Apply user filters to the update query too if present
    if user_id:
        overdue_update_query["assigned_to"] = PydanticObjectId(user_id)
    elif user_ids is not None:
        if created_by:
            overdue_update_query["$or"] = [
                {"assigned_to": {"$in": user_ids}},
                {"created_by": created_by}
            ]
        else:
            overdue_update_query["assigned_to"] = {"$in": user_ids}

    if tenant_id is not None:
        from app.models.company import Company
        companies = await Company.find(Company.tenant_id == tenant_id).to_list()
        company_ids = [c.id for c in companies]
        tenant_match_ids = [tenant_id] + company_ids
        overdue_update_query["tenant_id"] = {"$in": tenant_match_ids}
        if business_unit_id is not None:
            overdue_update_query["business_unit_id"] = business_unit_id

    # Batch update status to OVERDUE for all matching tasks
    await Task.find(overdue_update_query).update({"$set": {"status": TaskStatus.OVERDUE, "updated_at": now}})

    # 2. Fetch the tasks using the constructed query
    tasks = await Task.find(*query_parts).sort("-created_at").to_list()

    return tasks


async def get_task_by_id(task_id: str) -> Optional[Task]:
    """Get a specific task by ID."""
    return await Task.get(PydanticObjectId(task_id))


async def update_task(task_id: str, user_id: str, is_admin: bool, **kwargs) -> Optional[Task]:
    """Update a task. Handles status changes, remarks, and reward logic."""
    task = await Task.get(PydanticObjectId(task_id))
    if not task:
        return None

    # Non-admin can only update their own tasks
    if not is_admin and str(task.assigned_to) != user_id:
        raise PermissionError("Cannot update tasks assigned to other users")

    # Handle remarks separately — they are appended, not replaced
    remark_text = kwargs.pop("remarks", None)

    update_data = {}
    for key, value in kwargs.items():
        if value is not None:
            if key == "status":
                update_data["status"] = TaskStatus(value)
            elif key == "priority":
                update_data["priority"] = TaskPriority(value)
            elif key == "assigned_to":
                update_data["assigned_to"] = PydanticObjectId(value)
                user = await User.get(PydanticObjectId(value))
                if user:
                    update_data["assigned_to_name"] = user.name
            elif key == "tenant_id":
                update_data["tenant_id"] = PydanticObjectId(value)
                tenant = await Tenant.get(PydanticObjectId(value))
                update_data["tenant_name"] = tenant.name if tenant else "Personal / Internal"
            elif key == "category_ids":
                resolved_ids = []
                resolved_names = []
                for cid in value:
                    cat = await Category.get(PydanticObjectId(cid))
                    if cat:
                        resolved_ids.append(cat.id)
                        resolved_names.append(cat.name)
                update_data["category_ids"] = resolved_ids
                update_data["category_names"] = resolved_names
            else:
                update_data[key] = value

    # Append remark if provided
    if remark_text:
        user = await User.get(PydanticObjectId(user_id))
        from datetime import timezone
        new_remark = {
            "user_id": user_id,
            "user_name": user.name if user else "Unknown",
            "text": remark_text,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        current_remarks = task.remarks or []
        current_remarks.append(new_remark)
        update_data["remarks"] = current_remarks

    # Handle completion
    new_status = update_data.get("status")
    if new_status in [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE, TaskStatus.DELAYED] and task.status not in [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE, TaskStatus.DELAYED]:
        from datetime import timezone
        now = datetime.now(timezone.utc)
        update_data["completed_at"] = now
        # If past deadline, set status to DELAYED or COMPLETED_LATE
        if task.deadline < now:
            update_data["status"] = TaskStatus.DELAYED

    from datetime import timezone
    update_data["updated_at"] = datetime.now(timezone.utc)
    await task.set(update_data)

    # Reload the task
    task = await Task.get(PydanticObjectId(task_id))

    # Apply Performance Scoring
    final_status = task.status
    if final_status in [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE, TaskStatus.DELAYED] and not task.reward_given:
        await apply_performance_score(task, is_rejection=False)
    elif final_status == TaskStatus.REJECTED and not task.reward_given:
        await apply_performance_score(task, is_rejection=True)

    # Log actions
    if final_status in [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE, TaskStatus.DELAYED]:
        await ActivityLog(
            user_id=task.assigned_to,
            action="task_completed",
            task_id=task.id,
            details=f"Work '{task.work_description[:50]}...' completed ({final_status.value})",
        ).insert()

        # Notify creator if completed by employee
        if task.created_by != task.assigned_to:
            await Notification(
                user_id=task.created_by,
                sender_id=task.assigned_to,
                title="Task Completed",
                message=f"{task.assigned_to_name} completed the task: {task.work_description[:100]}",
                type="task_completed"
            ).insert()

    return task


async def delete_task(task_id: str) -> bool:
    """Delete a task."""
    task = await Task.get(PydanticObjectId(task_id))
    if not task:
        return False
    await task.delete()
    return True


async def get_task_counts(
    user_id: Optional[str] = None,
    user_ids: Optional[list] = None,
    business_unit_id: Optional[PydanticObjectId] = None,
    tenant_id: Optional[PydanticObjectId] = None,
):
    """Get task count summary using a single aggregation pipeline."""
    base_query = {}
    if tenant_id is not None:
        base_query["tenant_id"] = tenant_id
    if user_id:
        base_query["assigned_to"] = PydanticObjectId(user_id)
    elif user_ids is not None:
        base_query["assigned_to"] = {"$in": user_ids}
    if business_unit_id is not None:
        base_query["business_unit_id"] = business_unit_id


    # Auto-update overdue tasks first (this still requires an update_many or individual updates)
    from datetime import timezone
    now = datetime.now(timezone.utc)
    # Use find().set() for batch update if supported, or loop for simple logic.
    # Beanie supports update_many:
    await Task.find(
        {**base_query, "status": {"$in": [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]}, "deadline": {"$lt": now}}
    ).update({"$set": {"status": TaskStatus.OVERDUE, "updated_at": now}})

    # Single aggregation for all counts
    pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    
    aggregation_results = await Task.aggregate(pipeline).to_list()
    
    # Initialize defaults
    counts = {
        "total": 0,
        "completed": 0,
        "completed_late": 0,
        "pending": 0,
        "in_progress": 0,
        "overdue": 0,
    }
    
    for res in aggregation_results:
        status = res["_id"]
        count = res["count"]
        if status in counts:
            counts[status] = count
        counts["total"] += count

    return counts
