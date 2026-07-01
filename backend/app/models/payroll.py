from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


class SalaryStructure(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    business_unit_id: Optional[PydanticObjectId] = None
    basic: float = Field(default=0.0)
    hra: float = Field(default=0.0)
    special_allowance: float = Field(default=0.0)
    pf_deduction: float = Field(default=0.0)
    esi_deduction: float = Field(default=0.0)
    tax_deduction: float = Field(default=0.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "salary_structures"
        indexes = ["user_id", "tenant_id", "business_unit_id"]


class PayrollStatus(str, Enum):
    DRAFT = "draft"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    LOCKED = "locked"
    PAID = "paid"


class Payroll(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    business_unit_id: Optional[PydanticObjectId] = None
    user_name: str
    month: str  # Format: YYYY-MM
    status: PayrollStatus = PayrollStatus.DRAFT
    
    # Base configuration structure copy
    basic: float = Field(default=0.0)
    hra: float = Field(default=0.0)
    special_allowance: float = Field(default=0.0)
    pf_deduction: float = Field(default=0.0)
    esi_deduction: float = Field(default=0.0)
    tax_deduction: float = Field(default=0.0)
    
    # Days details
    present_days: float = Field(default=0.0)
    absent_days: float = Field(default=0.0)
    paid_leaves: float = Field(default=0.0)
    approved_regularization_days: float = Field(default=0.0)
    payable_days: float = Field(default=0.0)
    holidays_weekends: float = Field(default=0.0)
    total_working_days: float = Field(default=0.0)
    
    # Financial details
    base_salary: float = Field(default=0.0)
    earned_salary: float = Field(default=0.0)
    lop_deduction: float = Field(default=0.0)
    overtime_pay: float = Field(default=0.0)
    incentives: float = Field(default=0.0)
    bonuses: float = Field(default=0.0)
    penalties: float = Field(default=0.0)
    deductions: float = Field(default=0.0)
    net_salary: float = Field(default=0.0)
    
    drafted_by: Optional[PydanticObjectId] = None
    drafted_by_name: Optional[str] = None
    reviewed_by: Optional[PydanticObjectId] = None
    reviewed_by_name: Optional[str] = None
    approved_by: Optional[PydanticObjectId] = None
    approved_by_name: Optional[str] = None
    remarks: Optional[str] = Field(default=None, max_length=1000)

    # Versioning & Recalculation
    version_number: int = Field(default=1)
    recalculation_required: bool = Field(default=False)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "payrolls"
        indexes = ["user_id", "tenant_id", "business_unit_id", "month", "status"]


class PayrollHistory(Document):
    payroll_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    business_unit_id: Optional[PydanticObjectId] = None
    version_number: int
    payroll_snapshot: dict
    reason_for_change: Optional[str] = None
    created_by: Optional[PydanticObjectId] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "payroll_history"
        indexes = ["payroll_id", "tenant_id", "business_unit_id", "version_number"]
