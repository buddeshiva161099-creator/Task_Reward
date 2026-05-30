"""
User/Employee request/response schemas.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class CreateEmployeeRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    role: Optional[str] = "employee"
    mobile: str = Field(..., min_length=1)
    alternate_mobile: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    hr_reporting_manager_id: Optional[str] = None
    
    # New fields
    identity_card_type: Optional[str] = None
    identity_card_url: Optional[str] = None
    emergency_contact: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    branch: Optional[str] = None
    hiring_date: Optional[str] = None
    hiring_company: Optional[str] = None


class UpdateEmployeeRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    mobile: Optional[str] = None
    alternate_mobile: Optional[str] = None
    reward_points: Optional[float] = None
    role: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    reporting_manager_id: Optional[str] = None
    hr_reporting_manager_id: Optional[str] = None
    
    # New fields
    identity_card_type: Optional[str] = None
    identity_card_url: Optional[str] = None
    emergency_contact: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    branch: Optional[str] = None
    hiring_date: Optional[str] = None
    hiring_company: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    reward_points: float
    is_active: bool
    created_at: str
    raw_password: Optional[str] = None
    mobile: Optional[str] = None
    alternate_mobile: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    hr_reporting_manager_id: Optional[str] = None
    
    # New fields
    identity_card_type: Optional[str] = None
    identity_card_url: Optional[str] = None
    emergency_contact: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    branch: Optional[str] = None
    hiring_date: Optional[str] = None
    hiring_company: Optional[str] = None

    @classmethod
    def from_user(cls, user) -> "EmployeeResponse":
        from app.utils.ist_time import to_utc_iso
        return cls(

            id=str(user.id),
            name=user.name,
            email=user.email,
            role=user.role.value if hasattr(user.role, "value") else str(user.role),
            reward_points=user.reward_points,
            is_active=user.is_active,
            created_at=to_utc_iso(user.created_at),

            raw_password=user.raw_password,
            mobile=user.mobile,
            alternate_mobile=user.alternate_mobile,
            reporting_manager_id=str(user.reporting_manager_id) if user.reporting_manager_id else None,
            hr_reporting_manager_id=str(user.hr_reporting_manager_id) if user.hr_reporting_manager_id else None,
            identity_card_type=user.identity_card_type,
            identity_card_url=user.identity_card_url,
            emergency_contact=user.emergency_contact,
            job_title=user.job_title,
            department=user.department,
            branch=user.branch,
            hiring_date=user.hiring_date,
            hiring_company=user.hiring_company,
        )
