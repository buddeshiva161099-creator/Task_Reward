from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from app.config import settings


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({
        "exp": expire,
        "aud": settings.JWT_AUDIENCE
    })
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str, audience: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Decode and verify a JWT access token."""
    try:
        aud = audience or settings.JWT_AUDIENCE
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM], audience=aud)
        return payload
    except JWTError:
        return None


def check_token_near_expiry(token: str, threshold_minutes: int = 30) -> bool:
    """Check if the token is close to expiring (within threshold_minutes)."""
    try:
        # Decode without verifying expiration to inspect the claims
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_signature": True, "verify_exp": False},
            audience=settings.JWT_AUDIENCE
        )
        exp = payload.get("exp")
        if exp:
            exp_time = datetime.fromtimestamp(exp, timezone.utc)
            # If current time is within threshold_minutes of exp_time, return True
            if exp_time - datetime.now(timezone.utc) <= timedelta(minutes=threshold_minutes):
                return True
    except Exception:
        pass
    return False

