"""
Dashboard service - analytics and summary data for dashboards.
"""

from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus
from app.models.activity_log import ActivityLog
from app.models.tenant import Tenant
from app.services.task_service import get_task_counts
from app.services.reward_service import get_leaderboard
from app.models.attendance import Attendance, ist_now, IST
from app.utils.ist_time import to_utc_iso
from beanie import PydanticObjectId
from beanie.operators import In, NE, GTE
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
        date_str = to_utc_iso(day)
    else:
        day_dt = datetime.combine(day, datetime.min.time()).replace(tzinfo=IST)
        date_str = to_utc_iso(day_dt)

    entry: dict = {
        "date": date_str,
        "status": "present" if record else "absent",
    }
    if record:
        entry["check_in"] = to_utc_iso(record.check_in) if record.check_in else None
        entry["check_out"] = to_utc_iso(record.check_out) if record.check_out else None
        entry["location_in"] = record.location_in
        entry["location_out"] = record.location_out
        entry["address_in"] = record.address_in
        entry["address_out"] = record.address_out
        entry["is_regularized"] = bool(
            record.remarks and "Regularized" in (record.remarks or "")
        )
    return entry


async def get_admin_dashboard(
    current_user: User,
    filter_type: str = "month",
    custom_start: Optional[str] = None,
    custom_end: Optional[str] = None,
    visible_ids: Optional[set] = None,
    business_unit_id: Optional[PydanticObjectId] = None,
    employee_id: Optional[str] = None,
):
    """Get admin dashboard analytics data with optimized batch queries and hierarchy filtering."""
    if employee_id:
        from app.services.user_service import get_visible_employee_ids
        allowed_ids = await get_visible_employee_ids(current_user)
        target_uid = PydanticObjectId(employee_id)
        if allowed_ids is not None:
            if target_uid in allowed_ids:
                visible_ids = {target_uid}
            else:
                visible_ids = set()
        else:
            visible_ids = {target_uid}
    elif visible_ids is None:
        from app.services.user_service import get_visible_employee_ids

        visible_ids = await get_visible_employee_ids(current_user)

    bu_filter = {"business_unit_id": business_unit_id} if business_unit_id is not None else {}

    if visible_ids is not None:
        total_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_deleted != True,
            User.tenant_id == current_user.tenant_id,
            In(User.id, list(visible_ids)),
            bu_filter,
        ).count()
        active_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_active == True,
            User.is_deleted != True,
            User.tenant_id == current_user.tenant_id,
            In(User.id, list(visible_ids)),
            bu_filter,
        ).count()
    else:
        total_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_deleted != True,
            User.tenant_id == current_user.tenant_id,
            bu_filter,
        ).count()
        active_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_active == True,
            User.is_deleted != True,
            User.tenant_id == current_user.tenant_id,
            bu_filter,
        ).count()

    # Get today's attendance stats with a single query
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    att_query = GTE(Attendance.check_in, today_start)
    if visible_ids is not None:
        att_query = {"$and": [att_query, In(Attendance.user_id, list(visible_ids))]}
    att_query = {"$and": [att_query, {"tenant_id": current_user.tenant_id}]} if "$and" in att_query else {"$and": [att_query, {"tenant_id": current_user.tenant_id}]}
    if business_unit_id is not None:
        att_query = {"$and": [att_query, {"business_unit_id": business_unit_id}]}

    present_user_ids = await Attendance.distinct("user_id", att_query)
    present_user_ids = [PydanticObjectId(uid) for uid in present_user_ids]

    # Get precise counts for each role and calculate present/absent stats per role using aggregation
    role_counts = {
        role.value: {"total": 0, "present": 0, "absent": 0} for role in UserRole
    }
    role_counts["total_all_inclusive"] = {"total": 0, "present": 0, "absent": 0}

    user_match = NE(User.is_deleted, True)
    user_match = {"$and": [user_match, {"tenant_id": current_user.tenant_id}]} if isinstance(user_match, dict) else {"$and": [{"is_deleted": {"$ne": True}}, {"tenant_id": current_user.tenant_id}]}
    if visible_ids is not None:
        user_match = {"$and": [user_match, In(User.id, list(visible_ids))]}
    if business_unit_id is not None:
        user_match = {"$and": [user_match, {"business_unit_id": business_unit_id}]}

    pipeline = [
        {"$match": user_match},
        {"$project": {"role": 1, "is_present": {"$in": ["$_id", present_user_ids]}}},
        {
            "$group": {
                "_id": "$role",
                "total": {"$sum": 1},
                "present": {"$sum": {"$cond": ["$is_present", 1, 0]}},
            }
        },
    ]

    role_stats = await User.aggregate(pipeline).to_list()
    for stat in role_stats:
        r_val = stat["_id"]
        role_counts[r_val] = {
            "total": stat["total"],
            "present": stat["present"],
            "absent": stat["total"] - stat["present"],
        }
        role_counts["total_all_inclusive"]["total"] += stat["total"]
        role_counts["total_all_inclusive"]["present"] += stat["present"]
        role_counts["total_all_inclusive"]["absent"] += stat["total"] - stat["present"]

    if visible_ids is not None:
        task_counts = await get_task_counts(user_ids=list(visible_ids), business_unit_id=business_unit_id, tenant_id=current_user.tenant_id)
        leaderboard = await get_leaderboard(limit=5, user_ids=list(visible_ids), tenant_id=current_user.tenant_id)
    else:
        task_counts = await get_task_counts(business_unit_id=business_unit_id, tenant_id=current_user.tenant_id)
        leaderboard = await get_leaderboard(limit=5, tenant_id=current_user.tenant_id)

    # Task priority distribution - optimized with single aggregation
    priority_pipeline = []
    priority_pipeline.append({"$match": {"tenant_id": current_user.tenant_id}})
    if business_unit_id is not None:
        priority_pipeline.append({"$match": {"business_unit_id": business_unit_id}})
    if visible_ids is not None:
        priority_pipeline.append(
            {"$match": {"assigned_to": {"$in": list(visible_ids)}}}
        )
    priority_pipeline.append({"$group": {"_id": "$priority", "count": {"$sum": 1}}})

    priority_results = await Task.aggregate(priority_pipeline).to_list()
    priority_dist = {"critical": 0, "high": 0, "medium": 0, "regular": 0}
    for res in priority_results:
        if res["_id"] in priority_dist:
            priority_dist[res["_id"]] = res["count"]

    # Recent activity - optimized with batch user fetching
    if visible_ids is not None:
        recent_activities = (
            await ActivityLog.find(
                In(ActivityLog.user_id, list(visible_ids)),
                ActivityLog.tenant_id == current_user.tenant_id,
            )
            .sort("-timestamp")
            .limit(10)
            .to_list()
        )
    else:
        recent_activities = (
            await ActivityLog.find(ActivityLog.tenant_id == current_user.tenant_id)
            .sort("-timestamp")
            .limit(10)
            .to_list()
        )

    user_ids = list(set([a.user_id for a in recent_activities]))
    users = await User.find(In(User.id, user_ids), User.tenant_id == current_user.tenant_id).to_list()
    user_map = {u.id: u.name for u in users}

    activity_list = [
        {
            "id": str(a.id),
            "user_id": str(a.user_id),
            "user_name": user_map.get(a.user_id, "Unknown"),
            "action": a.action,
            "details": a.details,
            "timestamp": to_utc_iso(a.timestamp),
        }
        for a in recent_activities
    ]

    # Total rewards given
    if visible_ids is not None:
        total_rewards = await Task.find(
            Task.reward_given == True, Task.tenant_id == current_user.tenant_id, In(Task.assigned_to, list(visible_ids))
        ).count()
    else:
        total_rewards = await Task.find(Task.reward_given == True, Task.tenant_id == current_user.tenant_id).count()

    return {
        "employees": {
            "total": total_employees,
            "active": active_employees,
            "role_counts": role_counts,
        },
        "tasks": task_counts,
        "priority_distribution": priority_dist,
        "attendance_today": await _get_today_attendance_stats(
            total_employees, visible_ids, tenant_id=current_user.tenant_id
        ),
        "leaderboard": leaderboard,
        "recent_activity": activity_list,
        "total_rewards_given": total_rewards,
        "performance_tracking": await get_performance_metrics(
            user_ids=list(visible_ids) if visible_ids is not None else None,
            start_date=get_date_range_for_filter(filter_type, custom_start, custom_end)[
                0
            ],
            end_date=get_date_range_for_filter(filter_type, custom_start, custom_end)[
                1
            ],
            tenant_id=current_user.tenant_id,
        ),
    }


async def get_employee_dashboard(
    user_id: str,
    filter_type: str = "month",
    custom_start: Optional[str] = None,
    custom_end: Optional[str] = None,
):
    """Get employee personal dashboard data with optimized batch queries."""
    user = await User.get(PydanticObjectId(user_id))
    if not user:
        return None

    task_counts = await get_task_counts(user_id=user_id, tenant_id=user.tenant_id)

    # Recent activity for this employee
    recent_activities = (
        await ActivityLog.find(
            ActivityLog.user_id == PydanticObjectId(user_id),
            ActivityLog.tenant_id == user.tenant_id
        )
        .sort("-timestamp")
        .limit(10)
        .to_list()
    )

    activity_list = [
        {
            "id": str(a.id),
            "user_id": str(a.user_id),
            "user_name": user.name,
            "action": a.action,
            "details": a.details,
            "timestamp": to_utc_iso(a.timestamp),
        }
        for a in recent_activities
    ]

    # Rewards earned
    rewards_earned = await Task.find(
        Task.assigned_to == PydanticObjectId(user_id),
        Task.tenant_id == user.tenant_id,
        Task.reward_given == True,
    ).count()

    # Priority distribution - optimized with single aggregation
    priority_pipeline = [
        {"$match": {"assigned_to": PydanticObjectId(user_id), "tenant_id": user.tenant_id}},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
    ]
    priority_results = await Task.aggregate(priority_pipeline).to_list()
    priority_distribution = {"critical": 0, "high": 0, "medium": 0, "regular": 0}
    for res in priority_results:
        if res["_id"] in priority_distribution:
            priority_distribution[res["_id"]] = res["count"]

    # Optimized attendance history (batch fetch last 90 days)
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    history_start = today_start - timedelta(days=89)

    attendance_records = await Attendance.find(
        Attendance.user_id == PydanticObjectId(user_id),
        Attendance.tenant_id == user.tenant_id,
        Attendance.check_in >= history_start,
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

    # Fetch tenant to check work days configuration dynamically
    tenant = await Tenant.get(user.tenant_id) if user.tenant_id else None
    if not tenant:
        tenant = await Tenant.find_one(Tenant.is_active == True)
    work_days_set = (
        {d.strip().lower() for d in tenant.work_days}
        if (tenant and tenant.work_days)
        else None
    )

    # Last 90 days attendance history for detailed calendar
    attendance_history_detailed = []
    for i in range(90):
        day = today_start - timedelta(days=i)
        record = attendance_map.get(day.date())
        if record:
            attendance_history_detailed.append(_build_history_entry(day, record))
        else:
            day_name_lower = day.strftime("%A").lower()
            is_workday = (
                (day_name_lower in work_days_set)
                if work_days_set is not None
                else (day.weekday() < 5)
            )
            if is_workday:
                attendance_history_detailed.append(_build_history_entry(day, None))

    # Calculate monthly task efficiency rate
    month_start = today_start.replace(day=1)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)

    completed_this_month = await Task.find(
        Task.assigned_to == PydanticObjectId(user_id),
        Task.tenant_id == user.tenant_id,
        Task.completed_at >= month_start,
        Task.completed_at < month_end,
        In(
            Task.status,
            [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE, TaskStatus.DELAYED],
        ),
    ).count()

    due_this_month = await Task.find(
        Task.assigned_to == PydanticObjectId(user_id),
        Task.tenant_id == user.tenant_id,
        Task.deadline >= month_start,
        Task.deadline < month_end,
    ).count()

    efficiency_rate = (
        round((completed_this_month / due_this_month * 100.0), 1)
        if due_this_month > 0
        else (100.0 if completed_this_month > 0 else 0.0)
    )

    # Calculate current check-in streak
    streak = 0
    for idx, entry in enumerate(attendance_history_detailed):
        if entry.get("status") == "present":
            streak += 1
        elif entry.get("status") == "absent":
            # Allow skipping today if they haven't checked in yet, but break if yesterday was also absent
            if idx == 0:
                continue
            break

    return {
        "user": {
            "name": user.name,
            "email": user.email,
            "reward_points": user.reward_points,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
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
        "attendance_streak": streak,
        "due_this_month": due_this_month,
        "efficiency_rate": efficiency_rate,
        "performance_tracking": await get_performance_metrics(
            user_ids=[PydanticObjectId(user_id)],
            start_date=get_date_range_for_filter(filter_type, custom_start, custom_end)[
                0
            ],
            end_date=get_date_range_for_filter(filter_type, custom_start, custom_end)[
                1
            ],
            tenant_id=user.tenant_id,
        ),
    }


async def get_all_attendance_summary(
    visible_employee_ids=None,
    business_unit_id: Optional[PydanticObjectId] = None,
    tenant_id: Optional[PydanticObjectId] = None,
):
    """Get last 5 days attendance summary for all employees (or a hierarchy-scoped subset)."""
    # Performance Optimization: Using raw PyMongo collection access and projections to bypass Beanie overhead.
    user_query = {}
    if tenant_id is not None:
        user_query["tenant_id"] = tenant_id

    if visible_employee_ids is not None:
        user_query["_id"] = {"$in": list(visible_employee_ids)}
    else:
        # Use .value for Enums when querying raw collection
        user_query["role"] = {"$in": [r.value for r in NON_ADMIN_ROLES]}

    if business_unit_id is not None:
        user_query["business_unit_id"] = business_unit_id

    # Use raw Motor collection for speed and bypass Pydantic validation/model creation
    user_collection = User.get_pymongo_collection()
    employees = await user_collection.find(
        user_query,
        {"_id": 1, "name": 1, "email": 1, "reward_points": 1, "role": 1}
    ).to_list(length=100000)

    if not employees:
        return []

    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    five_days_ago = today_start - timedelta(days=4)

    employee_ids = [emp["_id"] for emp in employees]

    # Scoped attendance query with projection
    att_collection = Attendance.get_pymongo_collection()
    logs = await att_collection.find(
        {
            "check_in": {"$gte": five_days_ago},
            "user_id": {"$in": employee_ids}
        },
        {
            "user_id": 1, "check_in": 1, "check_out": 1,
            "location_in": 1, "location_out": 1,
            "address_in": 1, "address_out": 1, "remarks": 1
        }
    ).to_list(length=500000)

    # Pre-calculate daily ISO strings to avoid redundant to_utc_iso calls in the nested loops
    days_data = []
    for i in range(5):
        day = today_start - timedelta(days=i)
        days_data.append({
            "iso": to_utc_iso(day),
            "date_str": day.date().isoformat()
        })
    days_data.reverse()  # History is displayed in chronological order

    # Map logs by user_id and date for O(1) lookup in the main loop
    log_map: dict = {}
    for log in logs:
        uid = str(log["user_id"])
        # Ensure UTC awareness for correct IST conversion
        check_in = log.get("check_in")
        if check_in and check_in.tzinfo is None:
            log["check_in"] = check_in.replace(tzinfo=timezone.utc)

        check_out = log.get("check_out")
        if check_out and check_out.tzinfo is None:
            log["check_out"] = check_out.replace(tzinfo=timezone.utc)

        dt = log["check_in"]
        date_str = dt.astimezone(IST).date().isoformat()

        if uid not in log_map:
            log_map[uid] = {}
        if date_str not in log_map[uid]:
            log_map[uid][date_str] = log

    summary = []
    for emp in employees:
        uid_str = str(emp["_id"])
        history = []
        emp_logs = log_map.get(uid_str, {})

        for d in days_data:
            record = emp_logs.get(d["date_str"])
            entry = {
                "date": d["iso"],
                "status": "present" if record else "absent",
            }
            if record:
                # Maintain null-safety for check_in/out as required by frontend components
                entry.update({
                    "check_in": to_utc_iso(record["check_in"]) if record.get("check_in") else None,
                    "check_out": to_utc_iso(record["check_out"]) if record.get("check_out") else None,
                    "location_in": record.get("location_in"),
                    "location_out": record.get("location_out"),
                    "address_in": record.get("address_in"),
                    "address_out": record.get("address_out"),
                    "flags": record.get("flags", []),
                    "is_auto_closed": bool(record.get("is_auto_closed")),
                    "location_drift_km": record.get("location_drift_km"),
                    "is_regularized": bool(record.get("remarks") and "Regularized" in record.get("remarks"))
                })
            history.append(entry)

        summary.append({
            "user_id": uid_str,
            "user_name": emp.get("name"),
            "user_email": emp.get("email"),
            "reward_points": emp.get("reward_points", 0),
            "role": emp.get("role"),
            "history": history,
        })
    return summary


async def _get_today_attendance_stats(total_employees: int, visible_employee_ids=None, tenant_id: Optional[PydanticObjectId] = None):
    """Helper to get today's attendance stats using optimized database-level aggregation."""
    # Using IST for consistent day boundaries.
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)

    match_query = GTE(Attendance.check_in, today_start)
    if tenant_id is not None:
        match_query = {"$and": [match_query, {"tenant_id": tenant_id}]}

    if visible_employee_ids is not None:
        if isinstance(match_query, dict) and "$and" in match_query:
            match_query["$and"].append(In(Attendance.user_id, list(visible_employee_ids)))
        else:
            match_query = {
                "$and": [match_query, In(Attendance.user_id, list(visible_employee_ids))]
            }

    # Get count of unique users who checked in today
    present_count = len(await Attendance.distinct("user_id", match_query))

    # Get count of users on leave today
    from app.models.leave import Leave, LeaveStatus
    leave_query = {
        "status": LeaveStatus.APPROVED,
        "start_date": {"$lte": today_start},
        "end_date": {"$gte": today_start}
    }
    if tenant_id is not None:
        leave_query["tenant_id"] = tenant_id
    if visible_employee_ids is not None:
        leave_query["user_id"] = {"$in": list(visible_employee_ids)}
    
    on_leave_count = await Leave.find(leave_query).count()
    absent_count = max(0, total_employees - present_count - on_leave_count)

    return {
        "present": present_count,
        "absent": absent_count,
        "on_leave": on_leave_count,
        "total": total_employees
    }


def get_date_range_for_filter(
    filter_type: str,
    custom_start: Optional[str] = None,
    custom_end: Optional[str] = None,
):
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
            end_date = datetime(now_ist.year, end_month + 1, 1) - timedelta(
                microseconds=1
            )

    elif filter_type == "year":
        start_date = datetime(now_ist.year, 1, 1)
        end_date = datetime(now_ist.year + 1, 1, 1) - timedelta(microseconds=1)

    elif filter_type == "custom" and custom_start and custom_end:
        try:
            start_date = datetime.strptime(custom_start.split("T")[0], "%Y-%m-%d")
            end_date = datetime.strptime(custom_end.split("T")[0], "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, microsecond=999999
            )
        except Exception:
            start_date = datetime(now_ist.year, now_ist.month, 1)
            if now_ist.month == 12:
                end_date = datetime(now_ist.year + 1, 1, 1) - timedelta(microseconds=1)
            else:
                end_date = datetime(now_ist.year, now_ist.month + 1, 1) - timedelta(
                    microseconds=1
                )
    else:  # Default: month
        start_date = datetime(now_ist.year, now_ist.month, 1)
        if now_ist.month == 12:
            end_date = datetime(now_ist.year + 1, 1, 1) - timedelta(microseconds=1)
        else:
            end_date = datetime(now_ist.year, now_ist.month + 1, 1) - timedelta(
                microseconds=1
            )

    return start_date, end_date


async def get_performance_metrics(
    user_ids: Optional[List[PydanticObjectId]],
    start_date: datetime,
    end_date: datetime,
    tenant_id: Optional[PydanticObjectId] = None,
) -> dict:
    """Calculate performance metrics using a single MongoDB aggregation pipeline."""
    from app.models.task import Task, TaskStatus

    match_query = {"deadline": {"$gte": start_date, "$lte": end_date}}
    if tenant_id is not None:
        match_query["tenant_id"] = tenant_id
    if user_ids is not None:
        match_query["assigned_to"] = {"$in": user_ids}


    now = datetime.now(timezone.utc)

    pipeline = [
        {"$match": match_query},
        {
            "$group": {
                "_id": None,
                "assigned": {"$sum": 1},
                "completed": {
                    "$sum": {
                        "$cond": [
                            {
                                "$in": [
                                    "$status",
                                    [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE],
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
                "completed_on_time": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {
                                        "$in": [
                                            "$status",
                                            [
                                                TaskStatus.COMPLETED,
                                                TaskStatus.COMPLETED_LATE,
                                            ],
                                        ]
                                    },
                                    {"$lte": ["$completed_at", "$deadline"]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
                "overdue": {
                    "$sum": {
                        "$cond": [
                            {
                                "$or": [
                                    {"$eq": ["$status", TaskStatus.OVERDUE]},
                                    {
                                        "$and": [
                                            {
                                                "$not": {
                                                    "$in": [
                                                        "$status",
                                                        [
                                                            TaskStatus.COMPLETED,
                                                            TaskStatus.COMPLETED_LATE,
                                                        ],
                                                    ]
                                                }
                                            },
                                            {"$lt": ["$deadline", now]},
                                        ]
                                    },
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
                "pending": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {
                                        "$not": {
                                            "$in": [
                                                "$status",
                                                [
                                                    TaskStatus.COMPLETED,
                                                    TaskStatus.COMPLETED_LATE,
                                                ],
                                            ]
                                        }
                                    },
                                    {"$not": {"$eq": ["$status", TaskStatus.OVERDUE]}},
                                    {"$gte": ["$deadline", now]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
            }
        },
    ]

    results = await Task.aggregate(pipeline).to_list()
    res = (
        results[0]
        if results
        else {
            "assigned": 0,
            "completed": 0,
            "completed_on_time": 0,
            "overdue": 0,
            "pending": 0,
        }
    )

    assigned = res["assigned"]
    completed = res["completed"]
    completed_on_time = res["completed_on_time"]

    productivity_pct = round((completed / assigned * 100.0), 1) if assigned > 0 else 0.0
    performance_score = (
        round((completed_on_time / assigned * 100.0), 1) if assigned > 0 else 0.0
    )

    return {
        "assigned_tasks": assigned,
        "completed_tasks": completed,
        "pending_tasks": res["pending"],
        "overdue_tasks": res["overdue"],
        "productivity_pct": productivity_pct,
        "performance_score": performance_score,
    }


async def get_monthly_attendance_summary(
    year: int,
    month: int,
    visible_employee_ids=None,
    business_unit_id: Optional[PydanticObjectId] = None,
    tenant_id: Optional[PydanticObjectId] = None,
):
    """Get complete month attendance summary for all employees."""
    import calendar

    tenant = await Tenant.get(tenant_id) if tenant_id else None
    if not tenant:
        tenant = await Tenant.find_one(Tenant.is_active == True)

    work_days = tenant.work_days if tenant else ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    work_start_time = tenant.work_start_time if tenant else "09:00"
    work_end_time = tenant.work_end_time if tenant else "18:00"
    half_day_min_hours = tenant.half_day_min_hours if tenant else 4.0
    full_day_min_hours = tenant.full_day_min_hours if tenant else 8.0
    work_days_set = {d.strip().lower() for d in work_days} if work_days else None

    user_query = {}
    if tenant_id is not None:
        user_query["tenant_id"] = tenant_id

    if visible_employee_ids is not None:
        user_query["_id"] = {"$in": list(visible_employee_ids)}
    else:
        user_query["role"] = {"$in": [r.value for r in NON_ADMIN_ROLES]}

    if business_unit_id is not None:
        user_query["business_unit_id"] = business_unit_id

    user_collection = User.get_pymongo_collection()
    employees = await user_collection.find(
        user_query,
        {"_id": 1, "name": 1, "email": 1, "reward_points": 1, "role": 1}
    ).to_list(length=100000)

    if not employees:
        return {
            "work_days": work_days,
            "work_start_time": work_start_time,
            "work_end_time": work_end_time,
            "half_day_min_hours": half_day_min_hours,
            "full_day_min_hours": full_day_min_hours,
            "summaries": []
        }

    last_day = calendar.monthrange(year, month)[1]
    history_start = datetime(year, month, 1, 0, 0, 0, tzinfo=IST)
    history_end = datetime(year, month, last_day, 23, 59, 59, tzinfo=IST)

    employee_ids = [emp["_id"] for emp in employees]

    att_collection = Attendance.get_pymongo_collection()
    logs = await att_collection.find(
        {
            "user_id": {"$in": employee_ids},
            "check_in": {"$gte": history_start, "$lte": history_end}
        },
        {
            "user_id": 1, "check_in": 1, "check_out": 1,
            "location_in": 1, "location_out": 1,
            "address_in": 1, "address_out": 1, "remarks": 1,
            "flags": 1, "is_auto_closed": 1, "location_drift_km": 1
        }
    ).to_list(length=500000)

    from app.models.regularization import AttendanceRegularization, RegularizationStatus
    reg_collection = AttendanceRegularization.get_pymongo_collection()
    regs = await reg_collection.find(
        {
            "user_id": {"$in": employee_ids},
            "status": RegularizationStatus.APPROVED.value,
            "created_at": {"$gte": history_start, "$lte": history_end}
        },
        {"user_id": 1, "attendance_id": 1}
    ).to_list(length=500000)

    from app.models.leave import Leave, LeaveStatus
    leave_collection = Leave.get_pymongo_collection()
    leaves = await leave_collection.find(
        {
            "user_id": {"$in": employee_ids},
            "status": LeaveStatus.APPROVED.value,
            "end_date": {"$gte": history_start},
            "start_date": {"$lte": history_end}
        },
        {"user_id": 1, "start_date": 1, "end_date": 1, "leave_type": 1}
    ).to_list(length=500000)

    from app.models.holiday import Holiday
    hol_collection = Holiday.get_pymongo_collection()
    hol_list = await hol_collection.find(
        {
            "date": {"$gte": history_start, "$lte": history_end},
            "$or": [{"tenant_id": tenant_id}, {"tenant_id": None}]
        }
    ).to_list(length=1000)

    log_map: dict = {}
    for log in logs:
        uid = str(log["user_id"])
        check_in = log.get("check_in")
        if check_in and check_in.tzinfo is None:
            log["check_in"] = check_in.replace(tzinfo=timezone.utc)
        check_out = log.get("check_out")
        if check_out and check_out.tzinfo is None:
            log["check_out"] = check_out.replace(tzinfo=timezone.utc)

        dt = log["check_in"]
        date_str = dt.astimezone(IST).date().isoformat()

        if uid not in log_map:
            log_map[uid] = {}
        if date_str not in log_map[uid]:
            log_map[uid][date_str] = log

    reg_map: dict = {}
    attendance_id_map = {str(log["_id"]): log for log in logs}
    for reg in regs:
        uid = str(reg["user_id"])
        attn = attendance_id_map.get(str(reg.get("attendance_id")))
        if attn:
            dt = attn["check_in"]
            date_str = dt.astimezone(IST).date().isoformat()
            if uid not in reg_map:
                reg_map[uid] = set()
            reg_map[uid].add(date_str)

    leave_map: dict = {}
    for leave in leaves:
        uid = str(leave["user_id"])
        if uid not in leave_map:
            leave_map[uid] = []
        leave_map[uid].append({
            "start": leave["start_date"].astimezone(IST).date(),
            "end": leave["end_date"].astimezone(IST).date(),
            "leave_type": leave.get("leave_type")
        })

    holiday_map = {}
    for h in hol_list:
        h_date = h["date"]
        if h_date.tzinfo is None:
            h_date = h_date.replace(tzinfo=timezone.utc)
        holiday_map[h_date.astimezone(IST).date().isoformat()] = h.get("name", "Holiday")

    days_data = []
    for d in range(1, last_day + 1):
        day = datetime(year, month, d)
        days_data.append({
            "iso": to_utc_iso(day),
            "date_str": day.date().isoformat()
        })

    summary = []
    for emp in employees:
        uid_str = str(emp["_id"])
        history = []
        emp_logs = log_map.get(uid_str, {})
        emp_regs = reg_map.get(uid_str, set())
        emp_leaves = leave_map.get(uid_str, [])

        for d in days_data:
            record = emp_logs.get(d["date_str"])
            is_holiday = d["date_str"] in holiday_map
            is_regularized = d["date_str"] in emp_regs
            
            leave_type = None
            d_date = datetime.strptime(d["date_str"], "%Y-%m-%d").date()
            for l in emp_leaves:
                if l["start"] <= d_date <= l["end"]:
                    leave_type = l["leave_type"]
                    break

            # Calculate daily status based on rules
            if is_holiday:
                status_str = "holiday"
            elif is_regularized:
                status_str = "regularized"
            elif leave_type:
                status_str = "leave"
            elif record:
                status_str = record.get("status") or "present"
                check_in = record.get("check_in")
                check_out = record.get("check_out")
                if check_in and check_out:
                    duration_hours = (check_out - check_in).total_seconds() / 3600.0
                    if duration_hours < half_day_min_hours:
                        status_str = "half_day_absent"
                    elif duration_hours < full_day_min_hours:
                        status_str = "half_day_present"
                    elif "early_checkout" in record.get("flags", []):
                        if "late" in status_str:
                            status_str = "late_and_early_checkout"
                        else:
                            status_str = "early_checkout"
            else:
                day_name_lower = d_date.strftime("%A").lower()
                is_workday = day_name_lower in work_days_set if work_days_set is not None else (d_date.weekday() < 5)
                if not is_workday:
                    status_str = "weekend"
                else:
                    status_str = "absent"

            entry = {
                "date": d["iso"],
                "status": status_str,
            }
            if record:
                entry.update({
                    "check_in": to_utc_iso(record["check_in"]) if record.get("check_in") else None,
                    "check_out": to_utc_iso(record["check_out"]) if record.get("check_out") else None,
                    "location_in": record.get("location_in"),
                    "location_out": record.get("location_out"),
                    "address_in": record.get("address_in"),
                    "address_out": record.get("address_out"),
                    "flags": record.get("flags", []),
                    "is_auto_closed": bool(record.get("is_auto_closed")),
                    "location_drift_km": record.get("location_drift_km"),
                    "is_regularized": is_regularized or bool(record.get("remarks") and "Regularized" in record.get("remarks"))
                })
            elif is_holiday:
                entry.update({"holiday_name": holiday_map[d["date_str"]]})
            elif leave_type:
                entry.update({"leave_type": str(leave_type)})

            history.append(entry)

        summary.append({
            "user_id": uid_str,
            "user_name": emp.get("name"),
            "user_email": emp.get("email"),
            "reward_points": emp.get("reward_points", 0),
            "role": emp.get("role"),
            "history": history,
        })
    return {
        "work_days": work_days,
        "work_start_time": work_start_time,
        "work_end_time": work_end_time,
        "half_day_min_hours": half_day_min_hours,
        "full_day_min_hours": full_day_min_hours,
        "summaries": summary
    }

