"""
Task request/response schemas.
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime


class RemarkEntry(BaseModel):
    user_id: str
    user_name: str
    text: str
    timestamp: str


class RecurrenceRuleSchema(BaseModel):
    type: str  # daily, weekly, monthly
    interval: int = 1
    weekdays: Optional[List[int]] = None
    month_day: Optional[int] = None
    end_type: str = "never"  # never, count, date
    end_value: Optional[str] = None

class CreateTaskRequest(BaseModel):
    work_description: str = Field(..., min_length=1, max_length=2000)
    assigned_to: Optional[str] = None  # Single employee
    assigned_to_list: Optional[List[str]] = None  # Multiple employees
    priority: str = Field(default="medium", pattern="^(regular|medium|high|critical)$")
    is_recurrent: bool = False
    deadline: Optional[datetime] = None
    tenant_id: Optional[str] = None  # Single company
    company_id_list: Optional[List[str]] = None  # Multiple companies
    for_all: bool = False
    recurrence: Optional[RecurrenceRuleSchema] = None
    category_ids: Optional[List[str]] = None

    @validator("deadline")
    def deadline_must_be_future(cls, v, values):
        """For recurring tasks, deadline must be provided and be in the future. Non‑recurring tasks may omit deadline."""
        from datetime import datetime, timezone
        if values.get("is_recurrent"):
            if v is None:
                raise ValueError("Deadline is required for recurring tasks")
            # Ensure v is timezone-aware for comparison (assume UTC if naive)
            v_aware = v
            if v_aware.tzinfo is None:
                v_aware = v_aware.replace(tzinfo=timezone.utc)
            if v_aware <= datetime.now(timezone.utc):
                raise ValueError("Deadline must be a future date for recurring tasks")
        return v

    @validator("recurrence")
    def recurrence_required_if_recurrent(cls, v, values):
        if values.get("is_recurrent") and v is None:
            raise ValueError("Recurrence options must be specified for recurring tasks")
        return v


class UpdateTaskRequest(BaseModel):
    work_description: Optional[str] = Field(None, min_length=1, max_length=2000)
    status: Optional[str] = Field(None, pattern="^(pending|in_progress|completed|overdue|completed_late|rejected)$")
    priority: Optional[str] = Field(None, pattern="^(regular|medium|high|critical)$")
    deadline: Optional[datetime] = None
    remarks: Optional[str] = Field(None, max_length=1000)  # New remark text to append
    category_ids: Optional[List[str]] = None
    tenant_id: Optional[str] = None
    assigned_to: Optional[str] = None
    quality_multiplier: Optional[float] = None


class TaskResponse(BaseModel):
    id: str
    work_description: str
    assigned_to: str
    assigned_to_name: Optional[str] = None
    created_by: str
    created_by_name: Optional[str] = None
    status: str
    priority: str
    task_type: str
    deadline: str
    completed_at: Optional[str]
    reward_given: bool
    reward_points: float = 0.0
    quality_multiplier: float = 1.0
    tenant_id: Optional[str] = None
    company_name: Optional[str] = None  # legacy alias (now represents Tenant name for display)
    category_ids: List[str] = []
    category_names: List[str] = []
    remarks: List[RemarkEntry] = []
    created_at: str

    is_recurring: bool = False
    
    @classmethod
    def from_task(cls, task, assigned_name: str = None, creator_name: str = None, tenant_name: str = None, category_names: list = None) -> "TaskResponse":
        from app.utils.ist_time import to_utc_iso
        return cls(
            id=str(task.id),
            work_description=task.work_description,
            assigned_to=str(task.assigned_to),
            assigned_to_name=assigned_name or task.assigned_to_name,
            created_by=str(task.created_by),
            created_by_name=creator_name or task.created_by_name,
            status=task.status.value,
            priority=task.priority.value,
            task_type=task.task_type.value,
            deadline=to_utc_iso(task.deadline),
            completed_at=to_utc_iso(task.completed_at) if task.completed_at else None,
            reward_given=task.reward_given,
            reward_points=task.reward_points,
            quality_multiplier=task.quality_multiplier,
            tenant_id=str(task.tenant_id) if task.tenant_id else None,
            company_name=tenant_name or task.company_name or "Personal / Internal",
            category_ids=[str(cid) for cid in (task.category_ids or [])],
            category_names=category_names if category_names is not None else (task.category_names or []),
            remarks=[RemarkEntry(**r) for r in (task.remarks or [])],
            created_at=to_utc_iso(task.created_at),
            is_recurring=bool(task.recurring_task_id),
        )


