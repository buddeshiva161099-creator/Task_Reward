"""
FastAPI dependencies for authentication and authorization.
"""
from fastapi import Depends, HTTPException, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.auth.jwt_handler import decode_access_token
from app.models.user import User, UserRole
from beanie import PydanticObjectId
from typing import List

security = HTTPBearer()


async def get_current_user(
    request: Request,
    response: Response = None,
) -> User:
    """Extract and validate the current user from JWT token (via header or cookie) and verify token version."""
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    
    if not token:
        if request.url.path.startswith("/platform"):
            token = request.cookies.get("owner_access_token") or request.cookies.get("access_token")
        else:
            token = request.cookies.get("access_token") or request.cookies.get("owner_access_token")


    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = await User.get(PydanticObjectId(user_id))
    if user is None:
        if response:
            response.delete_cookie("access_token")
            response.delete_cookie("owner_access_token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    # Validate token version to handle password resets/logout invalidation
    token_version = payload.get("token_version", 0)
    if getattr(user, "token_version", 0) != token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated",
        )

    return user


class RoleChecker:
    """Dependency factory for checking if a user has specific roles."""
    def __init__(self, allowed_roles: List[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_user)):
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in self.allowed_roles]}",
            )
        return user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is an admin."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def require_platform_owner(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is a Platform Owner (super admin).

    A platform owner must have role=PLATFORM_OWNER AND must not be
    attached to any tenant (tenant_id is None). This guard prevents
    privilege escalation if a tenant user is somehow granted the role.
    """
    if current_user.role != UserRole.PLATFORM_OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform owner access required",
        )
    if current_user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform owners must not be linked to a tenant",
        )
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform owner account is deactivated",
        )
    return current_user


# Enterprise RBAC Role Helpers
require_hr_team = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER])
require_task_team = RoleChecker([UserRole.ADMIN, UserRole.MANAGER, UserRole.ASSISTANT_MANAGER])
require_any_hr_manager = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER, UserRole.MANAGER])
require_any_manager = RoleChecker([UserRole.ADMIN, UserRole.MANAGER])
require_management_team = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER, UserRole.MANAGER, UserRole.ASSISTANT_MANAGER])
# HR admin dependency – only ADMIN and HR_MANAGER can manage recurrences
require_hr_admin = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER])
require_hr_manager = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER])



