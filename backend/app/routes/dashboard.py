"""
Dashboard routes - analytics data for admin and employee dashboards.
"""
from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user, require_management_team
from app.auth.tenant_scope import get_active_business_unit_id
from app.services import dashboard_service, fatigue_service
from app.models.user import User

from typing import Optional

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/admin")
async def admin_dashboard(
    filter_type: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    employee_id: Optional[str] = None,
    admin: User = Depends(require_management_team),
    active_bu_id = Depends(get_active_business_unit_id),
):
    """Get admin dashboard analytics data with date filters and employee filtering."""
    return await dashboard_service.get_admin_dashboard(
        admin,
        filter_type,
        start_date,
        end_date,
        business_unit_id=active_bu_id,
        employee_id=employee_id,
    )


@router.get("/employee")
async def employee_dashboard(
    filter_type: str = "month",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get employee personal dashboard data with date filters."""
    return await dashboard_service.get_employee_dashboard(str(current_user.id), filter_type, start_date, end_date)


@router.get("/fatigue")
async def fatigue_dashboard(
    current_user: User = Depends(require_management_team)
):
    """Get employee fatigue & attrition prediction analytics."""
    return await fatigue_service.get_fatigue_report(current_user)
