from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from app.models.recurring_task import RecurrenceRule, RecurrenceType, RecurrenceEndType
from app.models.task import Task, TaskPriority, TaskType
from app.services import task_service
from beanie import PydanticObjectId
from typing import List, Optional

def calculate_next_run(rule: RecurrenceRule) -> Optional[datetime]:
    """Calculate the next run time based on the recurrence rule using robust dateutil logic."""
    # Use the rule's start_date if next_run not set
    # Note: reference is usually the PREVIOUS run time or start_date
    reference = rule.next_run or rule.start_date
    
    if rule.recurrence_type == RecurrenceType.DAILY:
        return reference + relativedelta(days=rule.interval)
    
    if rule.recurrence_type == RecurrenceType.WEEKLY:
        if not rule.weekdays:
            return reference + relativedelta(weeks=rule.interval)
        
        # We need to find the next valid weekday according to the rule
        sorted_weekdays = sorted(rule.weekdays)
        current_weekday = reference.weekday()

        # Look for the next weekday in the current week
        for wd in sorted_weekdays:
            if wd > current_weekday:
                return reference + relativedelta(days=wd - current_weekday)

        # If no more weekdays this week, move to the next interval week's first weekday
        days_to_sunday = 6 - current_weekday
        return reference + relativedelta(days=days_to_sunday + 1) + relativedelta(weeks=rule.interval - 1, weekday=sorted_weekdays[0])

    if rule.recurrence_type == RecurrenceType.MONTHLY:
        # If month_days are specified, use the first one (simplified logic for now)
        target_day = rule.month_days[0] if rule.month_days else rule.start_date.day

        next_date = reference + relativedelta(months=rule.interval, day=target_day)
        # relativedelta(day=target_day) handles month-end (e.g., Jan 31 -> Feb 28) correctly
        return next_date

    if rule.recurrence_type == RecurrenceType.YEARLY:
        return reference + relativedelta(years=rule.interval)

    # Fallback – treat as daily
    return reference + relativedelta(days=1)

async def spawn_tasks_from_rule(rule: RecurrenceRule):
    """Create individual tasks from a recurring rule."""
    if not rule.is_active:
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

    if not work_description and rule.task_template_id:
        template_task = await Task.get(rule.task_template_id)
        if template_task:
            work_description = template_task.work_description
            priority = template_task.priority
            category_ids = template_task.category_ids or []
            if not assignee_ids:
                assignee_ids = [template_task.assigned_to]
            if not company_ids:
                company_ids = [template_task.company_id] if template_task.company_id else []
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
    for cid in companies_to_spawn:
        for uid in assignee_ids:
            # Preserve the original time of day
            deadline = rule.next_run
            
            await task_service.create_task(
                work_description=work_description,
                assigned_to=str(uid),
                created_by=str(rule.created_by),
                priority=priority.value if hasattr(priority, "value") else str(priority),
                deadline=deadline,
                task_type="assigned" if uid != rule.created_by else "personal",
                company_id=str(cid) if cid else None,
                recurring_task_id=rule.id,
                category_ids=[str(cat_id) for cat_id in category_ids],
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
