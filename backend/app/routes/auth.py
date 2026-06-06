"""
Authentication routes - login, register, and current user.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, ChangePasswordRequest
from app.models.user import User, UserRole
from app.auth.password import hash_password, verify_password, validate_password_strength
from app.auth.jwt_handler import create_access_token
from app.auth.dependencies import get_current_user
from app.config import settings

from app.utils.rate_limiter import RateLimiter

login_limiter = RateLimiter(times=5, seconds=60)
register_limiter = RateLimiter(times=3, seconds=60)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(login_limiter)])
async def login(request: LoginRequest):
    """Authenticate user and return JWT token."""
    user = await User.find_one(User.email == request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    token = create_access_token({"sub": str(user.id), "role": user.role.value})

    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role.value,
            "reward_points": user.reward_points,
            "tenant_id": str(user.tenant_id) if user.tenant_id else None,
            "primary_company_id": str(user.primary_company_id) if user.primary_company_id else None,
            "scope_company_ids": [str(c) for c in (user.scope_company_ids or [])],
            "business_unit_id": str(user.business_unit_id) if user.business_unit_id else None,
        },
    )


@router.post("/register", status_code=status.HTTP_201_CREATED, dependencies=[Depends(register_limiter)])
async def register(request: RegisterRequest):
    """Register a new user when public registration is explicitly enabled.

    Production deployments should provision accounts through the protected
    employee-management APIs or the seed script. Keeping this endpoint closed by
    default prevents unauthenticated privilege escalation.
    """
    if not settings.ALLOW_PUBLIC_REGISTRATION:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is disabled. Contact an administrator for account creation.",
        )

    validate_password_strength(request.password)

    if request.role != UserRole.EMPLOYEE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration can only create employee accounts.",
        )

    existing = await User.find_one(User.email == request.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        name=request.name,
        email=request.email,
        password_hash=hash_password(request.password),
        role=UserRole(request.role),
    )
    await user.insert()

    return {
        "message": "User registered successfully",
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role.value,
        },
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user info."""
    from app.utils.ist_time import to_utc_iso
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role.value,
        "reward_points": current_user.reward_points,
        "is_active": current_user.is_active,
        "created_at": to_utc_iso(current_user.created_at),
        "tenant_id": str(current_user.tenant_id) if current_user.tenant_id else None,
        "primary_company_id": str(current_user.primary_company_id) if current_user.primary_company_id else None,
        "scope_company_ids": [str(c) for c in (current_user.scope_company_ids or [])],
        "business_unit_id": str(current_user.business_unit_id) if current_user.business_unit_id else None,
    }



@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user)
):
    """Change the current user's password."""
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )

    if request.current_password == request.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )

    validate_password_strength(request.new_password)

    current_user.password_hash = hash_password(request.new_password)
    current_user.raw_password = None
    await current_user.save()

    return {"message": "Password updated successfully"}
