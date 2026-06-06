"""
BusinessUnit model.

A BusinessUnit is an organizational sub-unit within a Company (sub-org).
Each BusinessUnit belongs to exactly one Company, and a Company is itself
contained in a Tenant. So a BusinessUnit has both:
  - `tenant_id` (FK to Tenant — the SaaS customer)
  - `company_id` (FK to the new Company entity — the sub-org inside the tenant)

- `type` lets tenants label units semantically (HQ vs Branch vs Department
  vs Subsidiary) without forcing a rigid hierarchy.
- Each Company has at most one default HQ unit (`is_default = True`).
  Auto-created on first Company create; cannot be deactivated.
- Business units can hold their own policy overrides (work hours, geofence,
  leave policy) on top of the tenant-level defaults.
"""
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional


BUSINESS_UNIT_TYPE_HQ = "hq"
BUSINESS_UNIT_TYPE_BRANCH = "branch"
BUSINESS_UNIT_TYPE_DEPARTMENT = "department"
BUSINESS_UNIT_TYPE_SUBSIDIARY = "subsidiary"

BUSINESS_UNIT_TYPES = [
    BUSINESS_UNIT_TYPE_HQ,
    BUSINESS_UNIT_TYPE_BRANCH,
    BUSINESS_UNIT_TYPE_DEPARTMENT,
    BUSINESS_UNIT_TYPE_SUBSIDIARY,
]


class BusinessUnit(Document):
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field(default=BUSINESS_UNIT_TYPE_DEPARTMENT)
    code: Optional[str] = Field(default=None, max_length=50)
    tenant_id: PydanticObjectId = Field(..., index=True)
    company_id: PydanticObjectId = Field(..., index=True)

    description: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = Field(default=True)
    is_default: bool = Field(default=False)

    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    timezone: Optional[str] = Field(default=None, max_length=100)
    currency: Optional[str] = Field(default=None, max_length=10)

    contact_email: Optional[str] = Field(default=None, max_length=200)
    contact_phone: Optional[str] = Field(default=None, max_length=50)

    work_days: Optional[list[str]] = None
    work_start_time: Optional[str] = None
    work_end_time: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "business_units"
        indexes = [
            "tenant_id",
            "company_id",
            "type",
            "is_active",
            "is_default",
            ("tenant_id", "company_id", "is_active"),
            ("company_id", "name"),
        ]
