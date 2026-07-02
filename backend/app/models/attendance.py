"""
Attendance model for MongoDB attendance collection.
"""
from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

def ist_now() -> datetime:
    """Return current datetime in IST as a timezone-aware datetime."""
    return datetime.now(IST)

def utc_now() -> datetime:
    """Return current datetime in UTC as a timezone-aware datetime."""
    return datetime.now(timezone.utc)


from typing import Optional, Dict, List


class Attendance(Document):
    user_id: PydanticObjectId
    tenant_id: Optional[PydanticObjectId] = None
    business_unit_id: Optional[PydanticObjectId] = None
    check_in: datetime = Field(default_factory=utc_now)
    check_out: Optional[datetime] = None
    location_in: Optional[Dict[str, float]] = None  # {"lat": 0.0, "lng": 0.0}
    location_out: Optional[Dict[str, float]] = None # {"lat": 0.0, "lng": 0.0}
    address_in: Optional[str] = None
    address_out: Optional[str] = None
    status: str = Field(default="present") # present, late, etc.
    remarks: Optional[str] = None
    # Smart attendance fields
    location_drift_km: Optional[float] = None  # Distance between check-in and check-out
    distance_from_office_in: Optional[float] = None  # Distance from office at check-in (meters)
    distance_from_office_out: Optional[float] = None  # Distance from office at check-out (meters)
    flags: List[str] = Field(default_factory=list)  # Anomaly flags
    device_fingerprint: Optional[str] = None  # Browser fingerprint hash
    is_auto_closed: bool = False  # Whether session was auto-closed by system

    class Settings:
        name = "attendance"
        indexes = [
            "user_id",
            "tenant_id",
            "business_unit_id",
            "check_in",
            ("tenant_id", "check_in"),
            ("user_id", "check_in"),
            ("tenant_id", "business_unit_id", "check_in")
        ]

    model_config = {
        "json_schema_extra": {
            "example": {
                "user_id": "507f1f77bcf86cd799439011",
                "tenant_id": "507f1f77bcf86cd799439012",
                "check_in": "2024-05-08T09:00:00Z",
                "location_in": {"lat": 12.9716, "lng": 77.5946},
                "status": "present"
            }
        }
    }

