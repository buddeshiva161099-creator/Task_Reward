"""
Append-only transactional ledger models for Leave and Reward Points.
"""
from beanie import Document
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional
from beanie import PydanticObjectId


class LeaveLedgerEntry(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    leave_type: str = Field(..., max_length=50)  # "casual", "sick", "earned"
    amount: float = Field(...)  # positive for accrual/credit, negative for usage/debit
    transaction_type: str = Field(..., max_length=50)  # "accrual", "usage", "adjustment", "expiration"
    reference_id: Optional[PydanticObjectId] = None  # reference to Leave document or adjustment ID
    description: Optional[str] = Field(default=None, max_length=500)
    actor_id: Optional[PydanticObjectId] = None  # who performed the transaction (e.g. HR/Manager/System)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "leave_ledger"
        indexes = [
            "user_id",
            "tenant_id",
            ("user_id", "leave_type"),
            ("user_id", "created_at")
        ]


class RewardLedgerEntry(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    amount: float = Field(...)  # positive for earned, negative for deducted/used
    transaction_type: str = Field(..., max_length=50)  # "earned", "deducted", "adjusted", "expired"
    reference_id: Optional[PydanticObjectId] = None  # reference to Task document or other event
    description: Optional[str] = Field(default=None, max_length=500)
    actor_id: Optional[PydanticObjectId] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "reward_ledger"
        indexes = [
            "user_id",
            "tenant_id",
            ("user_id", "transaction_type"),
            ("user_id", "created_at")
        ]
