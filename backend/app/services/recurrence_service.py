from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from app.models.recurring_task import RecurrenceRule, RecurrenceType, RecurrenceEndType
from app.models.task import Task, TaskPriority, TaskType
from app.services import task_service
from beanie import PydanticObjectId
from typing import List, Optional

def calculate_next_run(rule: RecurrenceRule) -> Optional[datetime]:
    """Calculate the next run time based on the recurrence rule using robust dateutil logic."""
    reference = rule.next_run or rule.start_date
    
    if rule.recurrence_type == RecurrenceType.DAILY:
        return reference + relativedelta(days=rule.interval)
    
    if rule.recurrence_type == RecurrenceType.WEEKLY:
        if not rule.weekdays:
            return reference + relativedelta(weeks=rule.interval)
        
        sorted_weekdays = sorted(rule.weekdays)
        current_weekday = reference.weekday()

        # Look for the next weekday in the current week
        for wd in sorted_weekdays:
            if wd > current_weekday:
                return reference + timedelta(days=wd - current_weekday)

        # If no more weekdays this week, find the Monday of the next week
        days_to_monday = 7 - current_weekday
        next_monday = reference + timedelta(days=days_to_monday)
        # Add (interval - 1) weeks to get to the target week
        target_week_start = next_monday + timedelta(weeks=rule.interval - 1)
        # Add the first weekday of that target week
        first_wd = sorted_weekdays[0]
        return target_week_start + timedelta(days=first_wd)

    if rule.recurrence_type == RecurrenceType.MONTHLY:
        if not rule.month_days:
            return reference + relativedelta(months=rule.interval)
        
        sorted_month_days = sorted(rule.month_days)
        current_day = reference.day

        # Look for the next day in the current month
        for md in sorted_month_days:
            if md > current_day:
                try:
                    return reference.replace(day=md)
                except ValueError:
                    pass

        # If no more days in current month, go to the target month start
        next_month = reference + relativedelta(months=rule.interval)
        for md in sorted_month_days:
            try:
                return next_month.replace(day=md)
            except ValueError:
                pass

        return next_month.replace(day=1)

    if rule.recurrence_type == RecurrenceType.YEARLY:
        return reference + relativedelta(years=rule.interval)

    return reference + relativedelta(days=1)

async def spawn_tasks_from_rule(rule: RecurrenceRule):
    """Create individual tasks from a recurring rule."""
    if not rule.is_active or rule.status != "active":
        return

    # Check paused_until_date
    if rule.paused_until_date:
        now = datetime.now(timezone.utc)
        if now < rule.paused_until_date:
            return  # Skip spawning because it is temporarily paused
        # If it just resumed, catch up by advancing next_run past the paused period
        while rule.next_run and rule.next_run <= now:
            rule.next_run = calculate_next_run(rule)
        rule.paused_until_date = None
        await rule.save()
        return

    # End condition – date or count
    if rule.end_type == RecurrenceEndType.AFTER_OCCURRENCES and rule.occurrence_count >= (rule.occurrences or 0):
        rule.is_active = False
        await rule.save()
        return
    if rule.end_type == RecurrenceEndType.ON_DATE and rule.end_date and datetime.now(timezone.utc) > rule.end_date:
        rule.is_active = False
        await rule.save()
        return

    # 1. Determine configuration (with legacy fallback support)
    work_description = rule.work_description
    priority = rule.priority
    category_ids = rule.category_ids or []
    assignee_ids = rule.assigned_to_list or []
    company_ids = rule.company_ids or []
    business_unit_id = None

    template_task = None
    if rule.task_template_id:
        template_task = await Task.get(rule.task_template_id)
        if template_task:
            business_unit_id = template_task.business_unit_id

    if not work_description and rule.task_template_id:
        if template_task:
            work_description = template_task.work_description
            priority = template_task.priority
            category_ids = template_task.category_ids or []
            if not assignee_ids:
                assignee_ids = [template_task.assigned_to]
            if not company_ids:
                company_ids = [template_task.tenant_id] if template_task.tenant_id else []
        else:
            # Blueprint task deleted and no configuration exists on the rule
            rule.is_active = False
            await rule.save()
            import logging
            logging.getLogger("app").warning(
                f"Deactivated recurring rule {rule.id} ('{rule.name}') because its template task was deleted "
                "and no decoupled configuration exists."
            )
            return

    # Standardize empty company list to [None] to ensure the loop runs at least once
    companies_to_spawn = company_ids if company_ids else [None]

    # Spawn tasks
    from app.models.task import TaskStatus
    from beanie.operators import In
    
    for cid in companies_to_spawn:
        for uid in assignee_ids:
            # Check if this specific employee already has an active task in the chain
            existing = await Task.find(
                Task.recurring_task_id == rule.id,
                Task.assigned_to == uid,
                Task.tenant_id == cid,
                In(Task.status, [TaskStatus.PENDING, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.UNDER_REVIEW])
            ).first_or_none()
            if existing:
                continue

            # Preserve the original time of day
            deadline = rule.next_run
            
            await task_service.create_task(
                work_description=work_description,
                assigned_to=str(uid),
                created_by=str(rule.created_by),
                priority=priority.value if hasattr(priority, "value") else str(priority),
                deadline=deadline,
                task_type="assigned" if uid != rule.created_by else "personal",
                tenant_id=str(cid) if cid else None,
                recurring_task_id=rule.id,
                category_ids=[str(cat_id) for cat_id in category_ids],
                business_unit_id=str(business_unit_id) if business_unit_id else None,
            )

    rule.last_occurrence = rule.next_run
    rule.next_run = calculate_next_run(rule)
    rule.occurrence_count += 1
    await rule.save()

async def process_recurrence() -> None:
    """Background loop to check and spawn recurring tasks with a safety catch-up limit."""
    now = datetime.now(timezone.utc)

    # Process only rules due for generation
    pending_rules = await RecurrenceRule.find(
        RecurrenceRule.is_active == True,
        RecurrenceRule.status == "active",
        RecurrenceRule.next_run <= now,
    ).to_list()
    
    for rule in pending_rules:
        # Safety: If next_run is extremely far in the past (e.g., server was down for a month),
        # we don't want to spawn 1000 tasks. Limit catch-up to max 5 occurrences per rule per cycle.
        spawn_count = 0
        while rule.is_active and rule.next_run <= now and spawn_count < 5:
            await spawn_tasks_from_rule(rule)
            spawn_count += 1
            # Refresh rule state from DB as spawn_tasks_from_rule updates it
            rule = await RecurrenceRule.get(rule.id)

async def handle_task_submission(task: Task):
    """Callback when a task is completed/submitted, to immediately create the next recurrence occurrence."""
    if not task.recurring_task_id:
        return
    rule = await RecurrenceRule.get(task.recurring_task_id)
    if not rule or not rule.is_active or rule.status != "active":
        return

    # Check paused_until_date
    if rule.paused_until_date:
        now = datetime.now(timezone.utc)
        if now < rule.paused_until_date:
            return  # Skip since it is paused

    # If a task in this recurrence chain for the same employee and company is already active,
    # we don't spawn a new one to prevent duplication.
    from app.models.task import TaskStatus
    from beanie.operators import In
    existing_active = await Task.find(
        Task.recurring_task_id == rule.id,
        Task.assigned_to == task.assigned_to,
        Task.tenant_id == task.tenant_id,
        In(Task.status, [TaskStatus.PENDING, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.UNDER_REVIEW])
    ).first_or_none()

    if not existing_active:
        # Spawn the next task occurrence
        await spawn_tasks_from_rule(rule)
