from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from enum import Enum
from typing import Optional
from app.models.attendance import ist_now


class LeaveType(str, Enum):
    CASUAL = "casual"
    SICK = "sick"
    EARNED = "earned"
    LOSS_OF_PAY = "loss_of_pay"
    WFH = "work_from_home"


class LeaveStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    APPROVED = "approved"
    REJECTED = "rejected"


class Leave(Document):
    user_id: PydanticObjectId
    user_name: str
    leave_type: LeaveType
    start_date: datetime
    end_date: datetime
    reason: str
    status: LeaveStatus = LeaveStatus.PENDING
    verified_by: Optional[PydanticObjectId] = None
    verified_by_name: Optional[str] = None
    approved_by: Optional[PydanticObjectId] = None
    approved_by_name: Optional[str] = None
    comments: Optional[str] = None
    created_at: datetime = Field(default_factory=ist_now)

    class Settings:
        name = "leaves"
        indexes = ["user_id", "status"]
