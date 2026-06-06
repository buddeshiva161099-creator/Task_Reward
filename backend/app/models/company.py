"""
Company model for MongoDB companies collection.

A Company is a sub-organization inside a Tenant. The tenant admin creates
Companies from the /admin/companies settings page; each Company is the
top-level grouping that employees (and per-Company managers) are pinned to.
Business Units live under a Company.

Tenant admins start with no Company pinned; their `primary_company_id` is
NULL until they create their first company. Empty tenant is allowed.
"""
from beanie import Document, PydanticObjectId
from pymongo import IndexModel
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional


class Company(Document):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    tenant_id: PydanticObjectId = Field(..., index=True)
    is_active: bool = Field(default=True, index=True)
    is_default: bool = Field(default=False)
    created_by: Optional[PydanticObjectId] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

    class Settings:
        name = "companies"
        indexes = [
            IndexModel(
                [("tenant_id", 1), ("name", 1)],
                name="tenant_id_1_name_1",
                unique=True,
            ),
            IndexModel(
                [("tenant_id", 1), ("is_active", 1)],
                name="tenant_id_1_is_active_1",
            ),
        ]
