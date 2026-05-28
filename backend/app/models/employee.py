'''Employee model for MongoDB employees collection.'''
from beanie import Document, PydanticObjectId
from pydantic import Field, EmailStr
from datetime import datetime
from typing import Optional

class Employee(Document):
    # Core personal details
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr = Field(..., unique=True)
    role: str = Field(..., max_length=50)

    # Company affiliation – links to a Company document
    company_id: PydanticObjectId = Field(..., description="Reference to the subsidiary/company the employee belongs to")
    location: str = Field(..., description="Work location / office name")

    # Hierarchy
    manager_id: Optional[PydanticObjectId] = Field(default=None, description="Reference to the employee's direct manager, if any")

    # Compliance / legal fields – optional and can be extended per jurisdiction
    work_permit_number: Optional[str] = Field(default=None, max_length=50)
    tax_id: Optional[str] = Field(default=None, max_length=50)
    national_id: Optional[str] = Field(default=None, max_length=50)

    # Audit information
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "employees"
        indexes = ["email"]
