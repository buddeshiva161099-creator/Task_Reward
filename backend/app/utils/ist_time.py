import datetime
from datetime import timezone, timedelta

# Indian Standard Time timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

def to_ist(dt: datetime.datetime) -> datetime.datetime:
    """Convert a datetime to IST timezone.
    If dt is naive, it is assumed to be UTC.
    Returns a timezone‑aware datetime in IST.
    """
    if dt.tzinfo is None:
        # Assume naive datetime is UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)


def to_utc_iso(dt: datetime.datetime) -> str:
    """Convert a naive or aware datetime to a clean ISO 8601 UTC string ending in 'Z'.
    """
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt_utc = dt.replace(tzinfo=timezone.utc)
    else:
        dt_utc = dt.astimezone(timezone.utc)
    return dt_utc.replace(tzinfo=None).isoformat() + "Z"

