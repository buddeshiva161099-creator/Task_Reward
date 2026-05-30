"""Recurring task models.
"""
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field, validator
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from app.models.task import TaskPriority

class RecurrenceType(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    CUSTOM = "custom"

class RecurrenceEndType(str, Enum):
    NEVER = "never"
    ON_DATE = "on_date"
    AFTER_OCCURRENCES = "after_occurrences"

class RecurrenceRule(Document):
    """Defines a rule that generates tasks on a schedule.

    The engine looks at ``next_run`` to decide when to spawn a new task.
    ``is_active`` can be toggled off when the rule finishes.
    """
    name: str = Field(..., description="Human readable rule name")
    created_by: PydanticObjectId = Field(..., description="User who created the rule")
    task_template_id: Optional[PydanticObjectId] = Field(default=None, description="Template task to clone for each occurrence")
    
    # Decoupled task template configuration
    work_description: Optional[str] = Field(default=None, description="Blueprint task description")
    priority: Optional[TaskPriority] = Field(default=TaskPriority.MEDIUM, description="Blueprint task priority")
    company_ids: List[PydanticObjectId] = Field(default_factory=list, description="Target companies list")
    category_ids: List[PydanticObjectId] = Field(default_factory=list, description="Target categories list")
    recurrence_type: RecurrenceType
    interval: int = Field(1, description="Every N days / weeks / months")
    weekdays: Optional[List[int]] = None  # 0=Mon … 6=Sun, used for weekly
    month_days: Optional[List[int]] = None  # 1‑31, used for monthly
    start_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_type: RecurrenceEndType = RecurrenceEndType.NEVER
    end_date: Optional[datetime] = None
    occurrences: Optional[int] = None  # Used when end_type == AFTER_OCCURRENCES
    occurrence_count: int = Field(0, description="Number of times the rule has fired")
    is_active: bool = Field(True, description="Whether the rule is currently active")
    next_run: Optional[datetime] = None
    last_occurrence: Optional[datetime] = None
    assigned_to_list: List[PydanticObjectId] = Field(default_factory=list, description="Users assigned to this rule")

    @validator("weekdays", each_item=True)
    def _valid_weekday(cls, v):
        if not 0 <= v <= 6:
            raise ValueError("weekday must be 0‑6")
        return v

    @validator("month_days", each_item=True)
    def _valid_month_day(cls, v):
        if not 1 <= v <= 31:
            raise ValueError("month day must be 1‑31")
        return v

    class Settings:
        name = "recurring_rules"
