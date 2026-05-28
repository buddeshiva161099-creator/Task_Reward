"""
Dashboard routes - analytics data for admin and employee dashboards.
"""
from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user, require_management_team
from app.services import dashboard_service
from app.models.user import User

from typing import Optional

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/admin")
async def admin_dashboard(
    filter_type: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin: User = Depends(require_management_team)
):
    """Get admin dashboard analytics data with date filters."""
    return await dashboard_service.get_admin_dashboard(admin, filter_type, start_date, end_date)


@router.get("/employee")
async def employee_dashboard(
    filter_type: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get employee personal dashboard data with date filters."""
    return await dashboard_service.get_employee_dashboard(str(current_user.id), filter_type, start_date, end_date)
