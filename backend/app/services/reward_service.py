"""
Reward service - handles dynamic task performance scoring and leaderboard rankings.
"""
from datetime import datetime, timedelta
from app.models.task import Task
from app.models.user import User
from app.models.activity_log import ActivityLog
from beanie import PydanticObjectId
from typing import Tuple, Optional


async def apply_performance_score(task: Task, is_rejection: bool = False) -> Tuple[float, str]:
    """
    Calculate and award performance points based on completion and deadline timing, or rejection.
    
    Rules:
    - Base priority points: Critical=10, High=5, Medium=3, Regular=1, Low=1
    - Delay penalties: On-time=100%, 1 Day=75%, 2 Days=50%, 3 Days=25%, 4+ Days=0%
    - Early completion: 1.1x boost if >= 24h before deadline
    - Quality modifiers: 0.8x to 1.2x (default 1.0x)
    
    Returns a tuple of (points_applied, details_message).
    """
    if task.reward_given:
        return 0.0, "Points already calculated and applied for this task."

    user = await User.get(task.assigned_to)
    if not user:
        return 0.0, "Assigned user not found."

    from app.models.company import Company
    company = None
    if task.company_id:
        company = await Company.get(task.company_id)
    if not company and user.company_id:
        company = await Company.get(user.company_id)
    if not company:
        company = await Company.find_one(Company.is_active == True)

    priority_points = company.task_priority_points if company else {
        "critical": 10.0, "high": 5.0, "medium": 3.0, "regular": 1.0, "low": 1.0
    }
    delay_penalties_map = company.delay_penalties if company else {
        "on_time": 1.0, "1_day_late": 0.75, "2_days_late": 0.50, "3_days_late": 0.25, "4_plus_days_late": 0.0
    }
    early_mult_val = company.early_completion_multiplier if company else 1.1

    points = 0.0
    details = ""

    if is_rejection:
        points = 0.0
        details = f"Task rejected for '{task.work_description[:30]}...'"
    else:
        # Base Points (Case insensitive comparison)
        priority_key = task.priority.value.lower() if hasattr(task.priority, 'value') else str(task.priority).lower()
        base_points = priority_points.get(priority_key, 1.0)
        
        # Delay Penalty
        delay_mult = 1.0
        completed_at = task.completed_at or datetime.utcnow()
        if completed_at > task.deadline:
            delay = completed_at - task.deadline
            delay_days = int((delay.total_seconds() + 86399) // 86400)
            if delay_days == 1:
                delay_mult = delay_penalties_map.get("1_day_late", 0.75)
            elif delay_days == 2:
                delay_mult = delay_penalties_map.get("2_days_late", 0.50)
            elif delay_days == 3:
                delay_mult = delay_penalties_map.get("3_days_late", 0.25)
            else:
                delay_mult = delay_penalties_map.get("4_plus_days_late", 0.0)
        
        # Early completion boost (24h+)
        early_mult = 1.0
        if completed_at <= task.deadline and (task.deadline - completed_at >= timedelta(days=1)):
            early_mult = early_mult_val

        # Quality modifier
        quality_mult = task.quality_multiplier or 1.0

        points = base_points * delay_mult * early_mult * quality_mult
        details = f"Earned {points:.2f} points (Base: {base_points}, Timeliness: {delay_mult:.2f}x, Early: {early_mult:.2f}x, Quality: {quality_mult:.2f}x) for completion of '{task.work_description[:30]}...'"

    # Apply points to user, enforcing ge=0 constraint on the schema
    new_points = max(0.0, user.reward_points + points)
    await user.set({"reward_points": new_points})

    # Save details on the task
    await task.set({
        "reward_given": True,
        "reward_points": points
    })

    # Record log
    await ActivityLog(
        user_id=user.id,
        action="performance_score_applied",
        task_id=task.id,
        details=f"Score: {points:+.2f} points. {details}",
    ).insert()

    return points, details


async def get_leaderboard(limit: int = 10, user_ids: Optional[list] = None):
    """Get top employees by reward points (all non-admin roles). Filtered by user_ids list if provided."""
    from app.models.user import UserRole
    from beanie.operators import In
    NON_ADMIN_ROLES = [
        UserRole.HR_MANAGER,
        UserRole.ASSISTANT_HR_MANAGER,
        UserRole.MANAGER,
        UserRole.ASSISTANT_MANAGER,
        UserRole.EMPLOYEE,
    ]
    query_conditions = [User.is_active == True]
    if user_ids is not None:
        query_conditions.append(In(User.id, user_ids))
    else:
        query_conditions.append(In(User.role, NON_ADMIN_ROLES))

    employees = await User.find(*query_conditions).sort("-reward_points").limit(limit).to_list()

    return [
        {
            "id": str(emp.id),
            "name": emp.name,
            "email": emp.email,
            "reward_points": emp.reward_points,
        }
        for emp in employees
    ]
