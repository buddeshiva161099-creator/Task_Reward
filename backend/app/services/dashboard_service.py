"""
Dashboard service - analytics and summary data for dashboards.
"""
from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus
from app.models.activity_log import ActivityLog
from app.services.task_service import get_task_counts
from app.services.reward_service import get_leaderboard
from app.models.attendance import Attendance, ist_now, IST
from beanie import PydanticObjectId
from beanie.operators import In, NE
from datetime import datetime, timedelta, timezone
from typing import Optional, List

NON_ADMIN_ROLES = [
    UserRole.HR_MANAGER,
    UserRole.ASSISTANT_HR_MANAGER,
    UserRole.MANAGER,
    UserRole.ASSISTANT_MANAGER,
    UserRole.EMPLOYEE,
]


def _build_history_entry(day, record) -> dict:
    """Build an attendance history entry dict. Module-level helper (reused across functions)."""
    # Convert day to UTC isoformat string ending in Z
    if isinstance(day, datetime):
        day_utc = day.astimezone(timezone.utc)
        date_str = day_utc.isoformat().replace("+00:00", "Z")
    else:
        day_utc = datetime.combine(day, datetime.min.time()).replace(tzinfo=IST).astimezone(timezone.utc)
        date_str = day_utc.isoformat().replace("+00:00", "Z")

    entry: dict = {
        "date": date_str,
        "status": "present" if record else "absent",
    }
    if record:
        entry["check_in"] = record.check_in.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if record.check_in else None
        entry["check_out"] = record.check_out.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if record.check_out else None
        entry["location_in"] = record.location_in
        entry["location_out"] = record.location_out
        entry["address_in"] = record.address_in
        entry["address_out"] = record.address_out
        entry["is_regularized"] = bool(record.remarks and "Regularized" in (record.remarks or ""))
    return entry


async def get_admin_dashboard(current_user: User, filter_type: str = "month", custom_start: Optional[str] = None, custom_end: Optional[str] = None):
    """Get admin dashboard analytics data with optimized batch queries and hierarchy filtering."""
    from app.routes.employees import get_visible_employee_ids
    visible_ids = await get_visible_employee_ids(current_user)

    if visible_ids is not None:
        total_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_deleted != True,
            In(User.id, list(visible_ids))
        ).count()
        active_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_active == True,
            User.is_deleted != True,
            In(User.id, list(visible_ids))
        ).count()
    else:
        total_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES), User.is_deleted != True
        ).count()
        active_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES), User.is_active == True, User.is_deleted != True
        ).count()

    # Get precise counts for each role and calculate present/absent stats per role
    role_counts = {
        "employee": {"total": 0, "present": 0, "absent": 0},
        "manager": {"total": 0, "present": 0, "absent": 0},
        "assistant_manager": {"total": 0, "present": 0, "absent": 0},
        "hr_manager": {"total": 0, "present": 0, "absent": 0},
        "assistant_hr_manager": {"total": 0, "present": 0, "absent": 0},
        "admin": {"total": 0, "present": 0, "absent": 0},
        "total_all_inclusive": {"total": 0, "present": 0, "absent": 0}
    }

    # Fetch all non-deleted users (within hierarchy scope if applicable)
    if visible_ids is not None:
        all_active_users = await User.find(
            User.is_deleted != True,
            In(User.id, list(visible_ids))
        ).to_list()
    else:
        all_active_users = await User.find(User.is_deleted != True).to_list()

    # Fetch today's check-ins
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    if visible_ids is not None:
        today_attendance = await Attendance.find(
            Attendance.check_in >= today_start,
            In(Attendance.user_id, list(visible_ids))
        ).to_list()
    else:
        today_attendance = await Attendance.find(Attendance.check_in >= today_start).to_list()
    present_user_ids = {str(r.user_id) for r in today_attendance}

    for u in all_active_users:
        role_val = u.role.value if hasattr(u.role, 'value') else str(u.role)
        is_present = str(u.id) in present_user_ids

        # Update specific role stats
        if role_val in role_counts:
            role_counts[role_val]["total"] += 1
            if is_present:
                role_counts[role_val]["present"] += 1
            else:
                role_counts[role_val]["absent"] += 1

        # Update total all-inclusive stats
        role_counts["total_all_inclusive"]["total"] += 1
        if is_present:
            role_counts["total_all_inclusive"]["present"] += 1
        else:
            role_counts["total_all_inclusive"]["absent"] += 1

    if visible_ids is not None:
        task_counts = await get_task_counts(user_ids=list(visible_ids))
        leaderboard = await get_leaderboard(limit=5, user_ids=list(visible_ids))
    else:
        task_counts = await get_task_counts()
        leaderboard = await get_leaderboard(limit=5)

    # Task priority distribution - optimized with single aggregation
    priority_pipeline = []
    if visible_ids is not None:
        priority_pipeline.append({"$match": {"assigned_to": {"$in": list(visible_ids)}}})
    priority_pipeline.append({"$group": {"_id": "$priority", "count": {"$sum": 1}}})
    
    priority_results = await Task.aggregate(priority_pipeline).to_list()
    priority_dist = {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "regular": 0
    }
    for res in priority_results:
        if res["_id"] in priority_dist:
            priority_dist[res["_id"]] = res["count"]

    # Recent activity - optimized with batch user fetching
    if visible_ids is not None:
        recent_activities = await ActivityLog.find(
            In(ActivityLog.user_id, list(visible_ids))
        ).sort("-timestamp").limit(10).to_list()
    else:
        recent_activities = await ActivityLog.find().sort("-timestamp").limit(10).to_list()
        
    user_ids = list(set([a.user_id for a in recent_activities]))
    users = await User.find(In(User.id, user_ids)).to_list()
    user_map = {u.id: u.name for u in users}

    activity_list = [
        {
            "id": str(a.id),
            "user_id": str(a.user_id),
            "user_name": user_map.get(a.user_id, "Unknown"),
            "action": a.action,
            "details": a.details,
            "timestamp": a.timestamp.isoformat() + "Z",
        }
        for a in recent_activities
    ]

    # Total rewards given
    if visible_ids is not None:
        total_rewards = await Task.find(
            Task.reward_given == True,
            In(Task.assigned_to, list(visible_ids))
        ).count()
    else:
        total_rewards = await Task.find(Task.reward_given == True).count()

    return {
        "employees": {
            "total": total_employees,
            "active": active_employees,
            "role_counts": role_counts,
        },
        "tasks": task_counts,
        "priority_distribution": priority_dist,
        "attendance_today": await _get_today_attendance_stats(total_employees, visible_ids),
        "leaderboard": leaderboard,
        "recent_activity": activity_list,
        "total_rewards_given": total_rewards,
        "performance_tracking": await get_performance_metrics(
            user_ids=list(visible_ids) if visible_ids is not None else None,
            start_date=get_date_range_for_filter(filter_type, custom_start, custom_end)[0],
            end_date=get_date_range_for_filter(filter_type, custom_start, custom_end)[1]
        )
    }



async def get_employee_dashboard(user_id: str, filter_type: str = "month", custom_start: Optional[str] = None, custom_end: Optional[str] = None):
    """Get employee personal dashboard data with optimized batch queries."""
    user = await User.get(PydanticObjectId(user_id))
    if not user:
        return None
        
    task_counts = await get_task_counts(user_id=user_id)

    # Recent activity for this employee
    recent_activities = await ActivityLog.find(
        ActivityLog.user_id == PydanticObjectId(user_id)
    ).sort("-timestamp").limit(10).to_list()

    activity_list = [
        {
            "id": str(a.id),
            "user_id": str(a.user_id),
            "user_name": user.name,
            "action": a.action,
            "details": a.details,
            "timestamp": a.timestamp.isoformat() + "Z",
        }
        for a in recent_activities
    ]

    # Rewards earned
    rewards_earned = await Task.find(
        Task.assigned_to == PydanticObjectId(user_id),
        Task.reward_given == True,
    ).count()

    # Priority distribution - optimized with single aggregation
    priority_pipeline = [
        {"$match": {"assigned_to": PydanticObjectId(user_id)}},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}}
    ]
    priority_results = await Task.aggregate(priority_pipeline).to_list()
    priority_distribution = {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "regular": 0
    }
    for res in priority_results:
        if res["_id"] in priority_distribution:
            priority_distribution[res["_id"]] = res["count"]

    # Optimized attendance history (batch fetch last 90 days)
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    history_start = today_start - timedelta(days=89)
    
    attendance_records = await Attendance.find(
        Attendance.user_id == PydanticObjectId(user_id),
        Attendance.check_in >= history_start
    ).to_list()
    
    # Map records by date for fast lookup (take the first/most recent record per day)
    attendance_map: dict = {}
    for r in attendance_records:
        key = r.check_in.astimezone(IST).date()
        if key not in attendance_map:
            attendance_map[key] = r
    
    # Attendance status today
    attendance_status = "present" if today_start.date() in attendance_map else "absent"

    # Last 5 days attendance history
    attendance_history = []
    for i in range(5):
        day = today_start - timedelta(days=i)
        record = attendance_map.get(day.date())
        attendance_history.append(_build_history_entry(day, record))
    attendance_history.reverse()

    # Last 90 days attendance history for detailed calendar
    attendance_history_detailed = []
    for i in range(90):
        day = today_start - timedelta(days=i)
        record = attendance_map.get(day.date())
        if record:
            attendance_history_detailed.append(_build_history_entry(day, record))
        elif day.weekday() < 5:  # Mon-Fri
            attendance_history_detailed.append(_build_history_entry(day, None))

    # Calculate monthly task efficiency rate
    month_start = today_start.replace(day=1)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)

    completed_this_month = await Task.find(
        Task.assigned_to == PydanticObjectId(user_id),
        Task.completed_at >= month_start,
        Task.completed_at < month_end,
        In(Task.status, [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE, TaskStatus.DELAYED])
    ).count()

    due_this_month = await Task.find(
        Task.assigned_to == PydanticObjectId(user_id),
        Task.deadline >= month_start,
        Task.deadline < month_end
    ).count()

    efficiency_rate = round((completed_this_month / due_this_month * 100.0), 1) if due_this_month > 0 else (100.0 if completed_this_month > 0 else 0.0)

    return {
        "user": {
            "name": user.name,
            "email": user.email,
            "reward_points": user.reward_points,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
            "mobile": user.mobile,
            "alternate_mobile": user.alternate_mobile,
        },
        "tasks": task_counts,
        "priority_distribution": priority_distribution,
        "recent_activity": activity_list,
        "rewards_earned": rewards_earned,
        "attendance_status": attendance_status,
        "attendance_history": attendance_history,
        "attendance_history_detailed": attendance_history_detailed,
        "due_this_month": due_this_month,
        "performance_tracking": await get_performance_metrics(
            user_ids=[PydanticObjectId(user_id)],
            start_date=get_date_range_for_filter(filter_type, custom_start, custom_end)[0],
            end_date=get_date_range_for_filter(filter_type, custom_start, custom_end)[1]
        )
    }

async def get_all_attendance_summary(visible_employee_ids=None):
    """Get last 5 days attendance summary for all employees (or a hierarchy-scoped subset)."""
    if visible_employee_ids is not None:
        employees = await User.find(In(User.id, list(visible_employee_ids))).to_list()
    else:
        employees = await User.find(In(User.role, NON_ADMIN_ROLES)).to_list()
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    five_days_ago = today_start - timedelta(days=4)

    # Build user_id set for scoped attendance query (avoids full-table scan)
    employee_ids = [emp.id for emp in employees]
    logs = await Attendance.find(
        Attendance.check_in >= five_days_ago,
        In(Attendance.user_id, employee_ids)
    ).to_list()
    
    # Map logs by user_id and date → store the full record (first per day)
    log_map: dict = {}
    for log in logs:
        uid = str(log.user_id)
        date_str = log.check_in.astimezone(IST).date().isoformat()
        if uid not in log_map:
            log_map[uid] = {}
        if date_str not in log_map[uid]:
            log_map[uid][date_str] = log  # store full Attendance object
        
    summary = []
    for emp in employees:
        uid = str(emp.id)
        history = []
        for i in range(5):
            day = today_start - timedelta(days=i)
            date_str = day.date().isoformat()
            record = log_map.get(uid, {}).get(date_str)
            entry = {
                "date": day.isoformat() + "Z",
                "status": "present" if record else "absent",
            }
            if record:
                entry["check_in"] = record.check_in.isoformat() + "Z" if record.check_in else None
                entry["check_out"] = record.check_out.isoformat() + "Z" if record.check_out else None
                entry["location_in"] = record.location_in
                entry["location_out"] = record.location_out
                entry["address_in"] = record.address_in
                entry["address_out"] = record.address_out
                entry["is_regularized"] = bool(record.remarks and "Regularized" in (record.remarks or ""))
            history.append(entry)
        history.reverse()
        summary.append({
            "user_id": uid,
            "user_name": emp.name,
            "user_email": emp.email,
            "reward_points": emp.reward_points,
            "history": history
        })
    return summary



async def _get_today_attendance_stats(total_employees: int, visible_employee_ids=None):
    """Helper to get today's attendance stats."""
    # Using IST for consistent day boundaries.
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Unique users who checked in today
    if visible_employee_ids is not None:
        present_records = await Attendance.find(
            Attendance.check_in >= today_start,
            In(Attendance.user_id, list(visible_employee_ids))
        ).to_list()
    else:
        present_records = await Attendance.find(
            Attendance.check_in >= today_start
        ).to_list()
    present_count = len({str(r.user_id) for r in present_records})
    absent_count = max(0, total_employees - present_count)
    
    return {
        "present": present_count,
        "absent": absent_count,
        "total": total_employees
    }


def get_date_range_for_filter(filter_type: str, custom_start: Optional[str] = None, custom_end: Optional[str] = None):
    from app.models.attendance import ist_now
    from datetime import datetime, timedelta
    
    now_ist = ist_now()
    
    if filter_type == "quarter":
        month = now_ist.month
        quarter = (month - 1) // 3 + 1
        start_month = (quarter - 1) * 3 + 1
        start_date = datetime(now_ist.year, start_month, 1)
        end_month = start_month + 2
        if end_month == 12:
            end_date = datetime(now_ist.year + 1, 1, 1) - timedelta(microseconds=1)
        else:
            end_date = datetime(now_ist.year, end_month + 1, 1) - timedelta(microseconds=1)
            
    elif filter_type == "year":
        start_date = datetime(now_ist.year, 1, 1)
        end_date = datetime(now_ist.year + 1, 1, 1) - timedelta(microseconds=1)
        
    elif filter_type == "custom" and custom_start and custom_end:
        try:
            start_date = datetime.strptime(custom_start.split("T")[0], "%Y-%m-%d")
            end_date = datetime.strptime(custom_end.split("T")[0], "%Y-%m-%d").replace(hour=23, minute=59, second=59, microsecond=999999)
        except Exception:
            start_date = datetime(now_ist.year, now_ist.month, 1)
            if now_ist.month == 12:
                end_date = datetime(now_ist.year + 1, 1, 1) - timedelta(microseconds=1)
            else:
                end_date = datetime(now_ist.year, now_ist.month + 1, 1) - timedelta(microseconds=1)
    else: # Default: month
        start_date = datetime(now_ist.year, now_ist.month, 1)
        if now_ist.month == 12:
            end_date = datetime(now_ist.year + 1, 1, 1) - timedelta(microseconds=1)
        else:
            end_date = datetime(now_ist.year, now_ist.month + 1, 1) - timedelta(microseconds=1)
            
    return start_date, end_date


async def get_performance_metrics(
    user_ids: Optional[List[PydanticObjectId]],
    start_date: datetime,
    end_date: datetime
) -> dict:
    from app.models.task import Task, TaskStatus
    from beanie.operators import In
    
    query_conds = []
    if user_ids is not None:
        query_conds.append(In(Task.assigned_to, user_ids))
        
    query_conds.append(Task.deadline >= start_date)
    query_conds.append(Task.deadline <= end_date)
    
    tasks = await Task.find(*query_conds).to_list()
    
    assigned = len(tasks)
    completed = 0
    completed_on_time = 0
    pending = 0
    overdue = 0
    
    now = datetime.now(timezone.utc)
    
    for t in tasks:
        if t.status in [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE]:
            completed += 1
            if t.completed_at and t.completed_at <= t.deadline:
                completed_on_time += 1
        elif t.status == TaskStatus.OVERDUE or (t.deadline < now):
            overdue += 1
        else:
            pending += 1
            
    productivity_pct = round((completed / assigned * 100.0), 1) if assigned > 0 else 0.0
    performance_score = round((completed_on_time / assigned * 100.0), 1) if assigned > 0 else 0.0
    
    return {
        "assigned_tasks": assigned,
        "completed_tasks": completed,
        "pending_tasks": pending,
        "overdue_tasks": overdue,
        "productivity_pct": productivity_pct,
        "performance_score": performance_score
    }
