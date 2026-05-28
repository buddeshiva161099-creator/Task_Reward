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
