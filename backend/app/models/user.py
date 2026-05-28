"""
User model for MongoDB users collection.
"""
from beanie import Document, PydanticObjectId
from pydantic import EmailStr, Field
from datetime import datetime
from enum import Enum
from typing import Optional


class UserRole(str, Enum):
    ADMIN = "admin"
    HR_MANAGER = "hr_manager"
    ASSISTANT_HR_MANAGER = "assistant_hr_manager"
    MANAGER = "manager"
    ASSISTANT_MANAGER = "assistant_manager"
    EMPLOYEE = "employee"


class User(Document):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr = Field(..., unique=True)
    password_hash: str
    raw_password: Optional[str] = None  # Store plain text password for admin view
    role: UserRole = UserRole.EMPLOYEE
    company_id: Optional[PydanticObjectId] = None
    department_id: Optional[PydanticObjectId] = None
    branch_id: Optional[PydanticObjectId] = None
    reporting_manager_id: Optional[PydanticObjectId] = None
    hr_reporting_manager_id: Optional[PydanticObjectId] = None
    salary_structure_id: Optional[PydanticObjectId] = None
    reward_points: float = Field(default=0.0, ge=0.0)
    mobile: Optional[str] = None
    alternate_mobile: Optional[str] = None
    is_active: bool = Field(default=True)
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    last_active: datetime = Field(default_factory=datetime.utcnow)

    # New required and optional fields for employees
    identity_card_type: Optional[str] = None
    identity_card_url: Optional[str] = None
    emergency_contact: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    branch: Optional[str] = None
    hiring_date: Optional[str] = None
    hiring_company: Optional[str] = None

    class Settings:
        name = "users"
        indexes = ["email"]

    class Config:
        json_schema_extra = {
            "example": {
                "name": "John Doe",
                "email": "john@example.com",
                "password_hash": "hashed_password",
                "role": "employee",
                "reward_points": 0,
                "is_active": True,
            }
        }
