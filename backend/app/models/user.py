"""
User model for MongoDB users collection.
"""
from beanie import Document, PydanticObjectId
from pydantic import EmailStr, Field
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional


class UserRole(str, Enum):
    PLATFORM_OWNER = "platform_owner"
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
    raw_password: Optional[str] = None  # Deprecated: retained only to read legacy documents; never populate.
    failed_login_attempts: int = Field(default=0)
    lockout_until: Optional[datetime] = None
    performance_target: Optional[float] = Field(default=None, description="Custom performance target points for payroll calculations")
    role: UserRole = UserRole.EMPLOYEE
    token_version: int = Field(default=0)
    tenant_id: Optional[PydanticObjectId] = None
    primary_company_id: Optional[PydanticObjectId] = None
    scope_company_ids: List[PydanticObjectId] = Field(default_factory=list)
    business_unit_id: Optional[PydanticObjectId] = None
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
    is_platform_owner: bool = Field(default=False)
    must_change_password: bool = Field(default=False)
    last_login_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    last_active: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    profile_picture: Optional[str] = None

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
        indexes = [
            "email",
            "tenant_id",
            "primary_company_id",
            "scope_company_ids",
            "business_unit_id",
            "role",
            "is_platform_owner",
            ("tenant_id", "business_unit_id"),
            ("tenant_id", "primary_company_id"),
        ]

    def model_dump(self, *args, **kwargs):
        if kwargs.get("mode") == "json":
            exclude = kwargs.setdefault("exclude", set())
            if isinstance(exclude, set):
                exclude.add("password_hash")
                exclude.add("raw_password")
            elif isinstance(exclude, dict):
                exclude["password_hash"] = True
                exclude["raw_password"] = True
        return super().model_dump(*args, **kwargs)

    def model_dump_json(self, *args, **kwargs):
        exclude = kwargs.setdefault("exclude", set())
        if isinstance(exclude, set):
            exclude.add("password_hash")
            exclude.add("raw_password")
        elif isinstance(exclude, dict):
            exclude["password_hash"] = True
            exclude["raw_password"] = True
        return super().model_dump_json(*args, **kwargs)

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
