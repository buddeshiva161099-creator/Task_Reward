"""
Task model for MongoDB tasks collection.
"""
from beanie import Document
from pydantic import Field
from datetime import datetime
from enum import Enum
from typing import Optional, List
from beanie import PydanticObjectId


class TaskStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    UNDER_REVIEW = "under_review"
    COMPLETED = "completed"
    COMPLETED_LATE = "completed_late"
    OVERDUE = "overdue"
    DELAYED = "delayed"
    REJECTED = "rejected"


class TaskPriority(str, Enum):
    LOW = "low"
    REGULAR = "regular"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskType(str, Enum):
    ASSIGNED = "assigned"
    PERSONAL = "personal"


class Task(Document):
    work_description: str = Field(..., min_length=1, max_length=2000)
    assigned_to: PydanticObjectId
    assigned_to_name: Optional[str] = None
    created_by: PydanticObjectId
    created_by_name: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.MEDIUM
    task_type: TaskType = TaskType.ASSIGNED
    deadline: datetime
    completed_at: Optional[datetime] = None
    reward_given: bool = False
    reward_points: float = 0.0
    quality_multiplier: float = 1.0
    company_id: Optional[PydanticObjectId] = None
    company_name: Optional[str] = None
    category_ids: List[PydanticObjectId] = Field(default_factory=list)
    category_names: List[str] = Field(default_factory=list)
    remarks: List[dict] = Field(default_factory=list)  # [{"user_id": str, "user_name": str, "text": str, "timestamp": str}]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    recurring_task_id: Optional[PydanticObjectId] = None

    class Settings:
        name = "tasks"
        indexes = ["assigned_to", "created_by", "status", "deadline", "company_id"]

    class Config:
        json_schema_extra = {
            "example": {
                "work_description": "Complete the weekly status report with all details",
                "status": "pending",
                "priority": "high",
                "task_type": "assigned",
                "deadline": "2024-12-31T17:00:00",
            }
        }
