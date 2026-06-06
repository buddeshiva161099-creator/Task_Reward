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
):
    """Get admin dashboard analytics data with optimized batch queries and hierarchy filtering."""
    if visible_ids is None:
        from app.services.user_service import get_visible_employee_ids

        visible_ids = await get_visible_employee_ids(current_user)

    bu_filter = {"business_unit_id": business_unit_id} if business_unit_id is not None else {}

    if visible_ids is not None:
        total_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_deleted != True,
            User.tenant_id == current_user.tenant_id,
            In(User.id, list(visible_ids)),
            **bu_filter,
        ).count()
        active_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_active == True,
            User.is_deleted != True,
            User.tenant_id == current_user.tenant_id,
            In(User.id, list(visible_ids)),
            **bu_filter,
        ).count()
    else:
        total_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_deleted != True,
            User.tenant_id == current_user.tenant_id,
            **bu_filter,
        ).count()
        active_employees = await User.find(
            In(User.role, NON_ADMIN_ROLES),
            User.is_active == True,
            User.is_deleted != True,
            User.tenant_id == current_user.tenant_id,
            **bu_filter,
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
        task_counts = await get_task_counts(user_ids=list(visible_ids), business_unit_id=business_unit_id)
        leaderboard = await get_leaderboard(limit=5, user_ids=list(visible_ids))
    else:
        task_counts = await get_task_counts(business_unit_id=business_unit_id)
        leaderboard = await get_leaderboard(limit=5)

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
    users = await User.find(In(User.id, user_ids)).to_list()
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
            Task.reward_given == True, In(Task.assigned_to, list(visible_ids))
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
        "attendance_today": await _get_today_attendance_stats(
            total_employees, visible_ids
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

    task_counts = await get_task_counts(user_id=user_id)

    # Recent activity for this employee
    recent_activities = (
        await ActivityLog.find(ActivityLog.user_id == PydanticObjectId(user_id))
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
        Task.reward_given == True,
    ).count()

    # Priority distribution - optimized with single aggregation
    priority_pipeline = [
        {"$match": {"assigned_to": PydanticObjectId(user_id)}},
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
        Task.completed_at >= month_start,
        Task.completed_at < month_end,
        In(
            Task.status,
            [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE, TaskStatus.DELAYED],
        ),
    ).count()

    due_this_month = await Task.find(
        Task.assigned_to == PydanticObjectId(user_id),
        Task.deadline >= month_start,
        Task.deadline < month_end,
    ).count()

    efficiency_rate = (
        round((completed_this_month / due_this_month * 100.0), 1)
        if due_this_month > 0
        else (100.0 if completed_this_month > 0 else 0.0)
    )

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
        ),
    }


async def get_all_attendance_summary(
    visible_employee_ids=None,
    business_unit_id: Optional[PydanticObjectId] = None,
):
    """Get last 5 days attendance summary for all employees (or a hierarchy-scoped subset)."""
    if visible_employee_ids is not None:
        employees = await User.find(In(User.id, list(visible_employee_ids))).to_list()
    else:
        employees = await User.find(In(User.role, NON_ADMIN_ROLES)).to_list()

    if business_unit_id is not None:
        employees = [e for e in employees if e.business_unit_id == business_unit_id]

    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    five_days_ago = today_start - timedelta(days=4)

    # Build user_id set for scoped attendance query (avoids full-table scan)
    employee_ids = [emp.id for emp in employees]
    if not employee_ids:
        return []
    logs = await Attendance.find(
        Attendance.check_in >= five_days_ago, In(Attendance.user_id, employee_ids)
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
                "date": to_utc_iso(day),
                "status": "present" if record else "absent",
            }
            if record:
                entry["check_in"] = (
                    to_utc_iso(record.check_in) if record.check_in else None
                )
                entry["check_out"] = (
                    to_utc_iso(record.check_out) if record.check_out else None
                )
                entry["location_in"] = record.location_in
                entry["location_out"] = record.location_out
                entry["address_in"] = record.address_in
                entry["address_out"] = record.address_out
                entry["is_regularized"] = bool(
                    record.remarks and "Regularized" in (record.remarks or "")
                )
            history.append(entry)
        history.reverse()
        summary.append(
            {
                "user_id": uid,
                "user_name": emp.name,
                "user_email": emp.email,
                "reward_points": emp.reward_points,
                "history": history,
            }
        )
    return summary


async def _get_today_attendance_stats(total_employees: int, visible_employee_ids=None):
    """Helper to get today's attendance stats using optimized database-level aggregation."""
    # Using IST for consistent day boundaries.
    today_start = ist_now().replace(hour=0, minute=0, second=0, microsecond=0)

    match_query = GTE(Attendance.check_in, today_start)
    if visible_employee_ids is not None:
        match_query = {
            "$and": [match_query, In(Attendance.user_id, list(visible_employee_ids))]
        }

    # Get count of unique users who checked in today
    present_count = len(await Attendance.distinct("user_id", match_query))
    absent_count = max(0, total_employees - present_count)

    return {"present": present_count, "absent": absent_count, "total": total_employees}


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
    user_ids: Optional[List[PydanticObjectId]], start_date: datetime, end_date: datetime
) -> dict:
    """Calculate performance metrics using a single MongoDB aggregation pipeline."""
    from app.models.task import Task, TaskStatus

    match_query = {"deadline": {"$gte": start_date, "$lte": end_date}}
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
