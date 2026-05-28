from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from app.models.recurring_task import RecurrenceRule, RecurrenceType, RecurrenceEndType
from app.models.task import Task, TaskPriority, TaskType
from app.services import task_service
from beanie import PydanticObjectId
from typing import List, Optional

def calculate_next_run(rule: RecurrenceRule) -> Optional[datetime]:
    """Calculate the next run time based on the recurrence rule."""
    now = datetime.now(timezone.utc)
    # Use the rule's start_date if next_run not set
    reference = rule.next_run or rule.start_date
    
    if rule.recurrence_type == RecurrenceType.DAILY:
        return reference + timedelta(days=rule.interval)
    
    if rule.recurrence_type == RecurrenceType.WEEKLY:
        if not rule.weekdays:
            return reference + timedelta(weeks=rule.interval)
        
        sorted_weekdays = sorted(rule.weekdays)
        current_weekday = reference.weekday()
        for wd in sorted_weekdays:
            if wd > current_weekday:
                return reference + timedelta(days=wd - current_weekday)
        # Next week first weekday
        days_to_next = 7 - current_weekday + sorted_weekdays[0]
        return reference + timedelta(days=days_to_next + (rule.interval - 1) * 7)

    if rule.recurrence_type == RecurrenceType.MONTHLY:
        # Increment month keeping day within month bounds
        month = reference.month + rule.interval
        year = reference.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(reference.day, 28)  # safe day
        return reference.replace(year=year, month=month, day=day)

    # Fallback – treat as daily
    return reference + timedelta(days=1)

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

    # Determine assignees – for now, we just use the task_template's assigned_to field if present
    # In a real implementation you would store assignee list in the rule or derive from company hierarchy.
    template_task = await Task.get(rule.task_template_id)
    if not template_task:
        raise ValueError("Task template not found")
    assignee_ids = [template_task.assigned_to]
    company_ids = [template_task.company_id] if template_task.company_id else [None]

    # Spawn tasks
    for cid in company_ids:
        for uid in assignee_ids:
            deadline = rule.next_run.replace(hour=23, minute=59, second=59) if rule.next_run else None
            await task_service.create_task(
                work_description=template_task.work_description,
                assigned_to=str(uid),
                created_by=str(rule.created_by),
                priority=template_task.priority.value,
                deadline=deadline,
                task_type="assigned",
                company_id=str(cid) if cid else None,
                recurring_task_id=rule.id,
            )

    rule.last_occurrence = rule.next_run
    rule.next_run = calculate_next_run(rule)
    rule.occurrence_count += 1
    await rule.save()

async def process_recurrence() -> None:
    """Background loop to check and spawn recurring tasks."""
    now = datetime.now(timezone.utc)
    pending_rules = await RecurrenceRule.find(
        RecurrenceRule.is_active == True,
        RecurrenceRule.next_run <= now,
    ).to_list()
    
    for rule in pending_rules:
        await spawn_tasks_from_rule(rule)
