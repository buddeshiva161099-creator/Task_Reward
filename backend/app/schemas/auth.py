"""
Authentication request/response schemas.
"""
from pydantic import BaseModel, EmailStr, Field

from app.auth.password import MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=MAX_PASSWORD_LENGTH)


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
    role: str = Field(default="employee", pattern="^(admin|hr_manager|assistant_hr_manager|manager|assistant_manager|employee)$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    reward_points: float
    is_active: bool
    created_at: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=MAX_PASSWORD_LENGTH)
    new_password: str = Field(..., min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
