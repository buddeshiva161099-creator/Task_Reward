"""
FastAPI dependencies for authentication and authorization.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.auth.jwt_handler import decode_access_token
from app.models.user import User, UserRole
from beanie import PydanticObjectId
from typing import List

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    """Extract and validate the current user from JWT token."""
    token = credentials.credentials
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
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


# Enterprise RBAC Role Helpers
require_hr_team = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER])
require_task_team = RoleChecker([UserRole.ADMIN, UserRole.MANAGER, UserRole.ASSISTANT_MANAGER])
require_any_hr_manager = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER, UserRole.MANAGER])
require_any_manager = RoleChecker([UserRole.ADMIN, UserRole.MANAGER])
require_management_team = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ASSISTANT_HR_MANAGER, UserRole.MANAGER, UserRole.ASSISTANT_MANAGER])
# HR admin dependency – only ADMIN and HR_MANAGER can manage recurrences
require_hr_admin = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER])
require_hr_manager = RoleChecker([UserRole.ADMIN, UserRole.HR_MANAGER])



