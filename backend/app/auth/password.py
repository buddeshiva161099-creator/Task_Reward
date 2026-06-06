"""
Password hashing utilities using bcrypt.
"""
import re
from fastapi import HTTPException, status

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 128

# Common / breached passwords that must be rejected regardless of complexity.
COMMON_WEAK_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789",
    "1234567890", "qwerty", "qwerty123", "letmein", "welcome",
    "admin123", "administrator", "iloveyou", "monkey123", "dragon",
    "passw0rd", "p@ssw0rd", "abc12345", "11111111", "00000000",
    "sunshine", "princess", "football", "baseball", "superman",
    "trustno1", "welcome1", "changeme", "secret", "secret123",
}

_PASSWORD_COMPLEXITY_RE = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$"
)


def hash_password(password: str) -> str:
    """Hash a plaintext password."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(password: str) -> None:
    """Reject passwords that are too short, too long, common, or low-entropy.

    Raises HTTP 400 with a clear message if the password does not meet policy.
    Centralized here so login, register, change-password, and admin resets all
    apply the same rules.
    """
    if password is None or not isinstance(password, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required.",
        )

    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.",
        )

    if len(password) > MAX_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at most {MAX_PASSWORD_LENGTH} characters long.",
        )

    if password.lower() in COMMON_WEAK_PASSWORDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password is too common. Please choose a more unique password.",
        )

    if not _PASSWORD_COMPLEXITY_RE.match(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Password must include at least one lowercase letter, one uppercase "
                "letter, one digit, and one special character."
            ),
        )
