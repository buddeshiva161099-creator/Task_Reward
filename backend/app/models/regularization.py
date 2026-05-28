from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from enum import Enum
from typing import Optional
from app.models.attendance import ist_now


class RegularizationStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    APPROVED = "approved"
    REJECTED = "rejected"


class AttendanceRegularization(Document):
    user_id: PydanticObjectId
    user_name: str
    attendance_id: PydanticObjectId
    requested_check_in: Optional[datetime] = None
    requested_check_out: Optional[datetime] = None
    reason: str
    attachment_url: Optional[str] = None
    status: RegularizationStatus = RegularizationStatus.PENDING
    verified_by: Optional[PydanticObjectId] = None
    verified_by_name: Optional[str] = None
    approved_by: Optional[PydanticObjectId] = None
    approved_by_name: Optional[str] = None
    comments: Optional[str] = None
    created_at: datetime = Field(default_factory=ist_now)

    class Settings:
        name = "attendance_regularizations"
        indexes = ["user_id", "attendance_id", "status"]
