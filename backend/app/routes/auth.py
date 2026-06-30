"""
Authentication routes - login, register, and current user.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Response, UploadFile, File
from typing import Optional
from pydantic import BaseModel
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, ChangePasswordRequest
from app.models.user import User, UserRole
from app.auth.password import hash_password, verify_password, validate_password_strength
from app.auth.jwt_handler import create_access_token
from app.auth.dependencies import get_current_user
from app.config import settings

from app.utils.rate_limiter import RateLimiter

login_limiter = RateLimiter(times=5, seconds=60)
register_limiter = RateLimiter(times=3, seconds=60)
change_password_limiter = RateLimiter(times=5, seconds=60)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(login_limiter)])
async def login(request: LoginRequest, response: Response):
    """Authenticate user and return JWT token."""
    from datetime import datetime, timezone, timedelta

    user = await User.find_one(User.email == request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Check for active lockout
    now = datetime.now(timezone.utc)
    if user.lockout_until:
        lockout_time = user.lockout_until
        if lockout_time.tzinfo is None:
            lockout_time = lockout_time.replace(tzinfo=timezone.utc)
        if lockout_time > now:
            remaining_minutes = int((lockout_time - now).total_seconds() / 60) + 1
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is locked due to multiple failed login attempts. Please try again after {remaining_minutes} minutes.",
            )

    if not verify_password(request.password, user.password_hash):
        # Increment failed login attempts
        failed_attempts = getattr(user, "failed_login_attempts", 0) + 1
        update_fields = {"failed_login_attempts": failed_attempts}
        
        if failed_attempts >= 5:
            update_fields["lockout_until"] = now + timedelta(minutes=15)
            update_fields["failed_login_attempts"] = 0
            await user.set(update_fields)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is locked due to multiple failed login attempts. Please try again after 15 minutes.",
            )
        else:
            await user.set(update_fields)
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Reset lockout counters on successful login
    if getattr(user, "failed_login_attempts", 0) > 0 or user.lockout_until:
        await user.set({"failed_login_attempts": 0, "lockout_until": None})

    token = create_access_token({
        "sub": str(user.id),
        "role": user.role.value,
        "token_version": getattr(user, "token_version", 0)
    })

    # Set httpOnly cookie for the token
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

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



@router.post("/change-password", dependencies=[Depends(change_password_limiter)])
async def change_password(
    request: ChangePasswordRequest,
    response: Response,
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
    current_user.token_version = (current_user.token_version or 0) + 1
    await current_user.save()

    # Clear cookie on password change
    response.delete_cookie(key="access_token", path="/")

    return {"message": "Password updated successfully"}


@router.post("/logout")
async def logout(response: Response):
    """Log out user by clearing cookies."""
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="owner_access_token", path="/")
    return {"message": "Successfully logged out"}


@router.get("/announcement")
async def get_active_announcement():
    from app.models.notification import Notification
    from beanie import PydanticObjectId
    
    special_id = PydanticObjectId("000000000000000000000000")
    announcement = await Notification.find(
        Notification.user_id == special_id,
        Notification.type == "broadcast"
    ).sort("-created_at").first_or_none()
    
    if announcement:
        return {
            "message": announcement.message,
            "banner_type": announcement.title,
            "image_url": announcement.image_url,
            "created_at": announcement.created_at.isoformat()
        }
    return None


@router.get("/announcements")
async def get_active_announcements():
    from app.models.notification import Notification
    from beanie import PydanticObjectId
    
    special_id = PydanticObjectId("000000000000000000000000")
    announcements = await Notification.find(
        Notification.user_id == special_id,
        Notification.type == "broadcast"
    ).sort("created_at").to_list()
    
    return [
        {
            "id": str(a.id),
            "message": a.message,
            "banner_type": a.title,
            "image_url": a.image_url,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in announcements
    ]


class TenantAnnouncementPayload(BaseModel):
    message: str
    banner_type: str = "info"
    image_url: Optional[str] = None


@router.get("/announcements/tenant")
async def get_tenant_announcements(
    current_user: User = Depends(get_current_user)
):
    from app.models.notification import Notification
    from beanie import PydanticObjectId
    from typing import Optional
    
    special_id = PydanticObjectId("000000000000000000000000")
    
    from beanie.operators import Or
    
    announcements = await Notification.find(
        Notification.user_id == special_id,
        Notification.type == "broadcast",
        Or(
            Notification.tenant_id == current_user.tenant_id,
            Notification.tenant_id == None
        )
    ).sort("created_at").to_list()
    
    return [
        {
            "id": str(a.id),
            "message": a.message,
            "banner_type": a.title,
            "image_url": a.image_url,
            "tenant_id": str(a.tenant_id) if a.tenant_id else None,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in announcements
    ]


@router.post("/announcements/tenant")
async def create_tenant_announcement(
    payload: TenantAnnouncementPayload,
    current_user: User = Depends(get_current_user)
):
    from app.models.notification import Notification
    from beanie import PydanticObjectId
    
    allowed_roles = {UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.MANAGER}
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden. Only Admins or Managers can publish announcements."
        )
        
    message = payload.message.strip()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be blank."
        )
        
    special_id = PydanticObjectId("000000000000000000000000")
    announcement = Notification(
        user_id=special_id,
        tenant_id=current_user.tenant_id,
        title=payload.banner_type.strip(),
        message=message,
        type="broadcast",
        image_url=payload.image_url.strip() if payload.image_url else None
    )
    await announcement.insert()
    return {"status": "success", "message": "Tenant announcement posted successfully."}


@router.delete("/announcements/tenant/{id}")
async def delete_tenant_announcement(
    id: str,
    current_user: User = Depends(get_current_user)
):
    from app.models.notification import Notification
    from beanie import PydanticObjectId
    
    allowed_roles = {UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.MANAGER}
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden. Only Admins or Managers can delete announcements."
        )
        
    ann_id = PydanticObjectId(id)
    announcement = await Notification.find_one(
        Notification.id == ann_id,
        Notification.tenant_id == current_user.tenant_id,
        Notification.type == "broadcast"
    )
    if not announcement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found or belongs to another tenant."
        )
        
    await announcement.delete()
    return {"status": "success", "message": "Announcement deleted successfully."}


@router.post("/announcements/tenant/upload")
async def upload_tenant_announcement_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    from app.utils.uploads import build_stored_filename
    from pathlib import Path
    from typing import Optional
    
    allowed_roles = {UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.MANAGER}
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden. Only Admins or Managers can upload announcement assets."
        )
        
    max_bytes = 5 * 1024 * 1024
    tenant_folder = f"tenant_{current_user.tenant_id}" if current_user.tenant_id else "global"
    upload_dir = Path("uploads") / "announcements" / tenant_folder
    upload_dir = upload_dir.resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    stored_filename = build_stored_filename(file.filename)
    destination = (upload_dir / stored_filename).resolve()
    
    if upload_dir not in destination.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path destination.")
        
    bytes_written = 0
    with destination.open("wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                buffer.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File exceeds the 5MB upload limit."
                )
            buffer.write(chunk)
            
    file_url = f"/uploads/announcements/{tenant_folder}/{stored_filename}"
    return {
        "status": "success",
        "file_url": file_url
    }
