"""
Fatigue calculation service for scoring and tracking workforce burnout/attrition metrics.
"""
from app.models.user import User
from app.models.attendance import Attendance
from app.models.task import Task, TaskStatus
from app.models.leave import Leave, LeaveStatus
from app.services.user_service import get_visible_employee_ids
from beanie import PydanticObjectId
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

async def get_fatigue_report(current_user: User) -> List[Dict[str, Any]]:
    # 1. Scope Restriction
    visible_ids = await get_visible_employee_ids(current_user)
    if visible_ids is not None:
        employees = await User.find({"_id": {"$in": list(visible_ids)}, "is_deleted": {"$ne": True}}).to_list()
    else:
        employees = await User.find({"tenant_id": current_user.tenant_id, "is_deleted": {"$ne": True}}).to_list()
        
    # 2. Get past 30 days time limit
    now = datetime.now(timezone.utc)
    limit_30d = now - timedelta(days=30)
    
    report = []
    
    for emp in employees:
        # Don't analyze admin callers or platform owners to avoid redundancy
        if emp.role.value in ["platform_owner", "admin"] and emp.id == current_user.id:
            continue
            
        emp_id = emp.id
        
        # Fetch data for this employee over the past 30 days
        attendances = await Attendance.find({"user_id": emp_id, "check_in": {"$gte": limit_30d}}).sort("+check_in").to_list()
        tasks = await Task.find({"assigned_to": emp_id, "created_at": {"$gte": limit_30d}}).to_list()
        leaves = await Leave.find({"user_id": emp_id, "created_at": {"$gte": limit_30d}}).to_list()
        
        # 3. Calculate scores
        # A. Overtime Score (Max 35)
        overtime_score = 0
        total_overtime_hours = 0.0
        overtime_days = 0
        max_overtime_streak = 0
        current_streak = 0
        
        # Sort attendances by date to find consecutive streaks
        for att in attendances:
            if att.check_out and att.check_in:
                duration_hrs = (att.check_out - att.check_in).total_seconds() / 3600.0
                if duration_hrs > 10.0:
                    overtime_score += 5
                    total_overtime_hours += (duration_hrs - 9.0)
                    overtime_days += 1
                    current_streak += 1
                    if current_streak >= 2:
                        overtime_score += 8
                else:
                    if current_streak > max_overtime_streak:
                        max_overtime_streak = current_streak
                    current_streak = 0
        if current_streak > max_overtime_streak:
            max_overtime_streak = current_streak
            
        overtime_score = min(35, overtime_score)
        
        # B. Late arrivals & task failures (Max 35)
        late_failures_score = 0
        late_arrivals = 0
        late_overdue_tasks = 0
        
        for att in attendances:
            if att.status == "late":
                late_arrivals += 1
                late_failures_score += 5
                
        for t in tasks:
            if t.status in [TaskStatus.COMPLETED_LATE, TaskStatus.OVERDUE, TaskStatus.DELAYED]:
                late_overdue_tasks += 1
                late_failures_score += 6
                
        late_failures_score = min(35, late_failures_score)
        
        # C. Short notice leaves (Max 30)
        short_notice_score = 0
        short_notice_leaves = 0
        
        for lv in leaves:
            notice_duration = lv.start_date - lv.created_at
            notice_hours = notice_duration.total_seconds() / 3600.0
            if notice_hours < 24.0:
                short_notice_leaves += 1
                short_notice_score += 10
            elif notice_hours < 48.0:
                short_notice_leaves += 1
                short_notice_score += 5
                
        short_notice_score = min(30, short_notice_score)
        
        # Total fatigue score
        fatigue_score = overtime_score + late_failures_score + short_notice_score
        
        # Categorize risk
        if fatigue_score <= 30:
            risk_category = "low"
        elif fatigue_score <= 60:
            risk_category = "medium"
        elif fatigue_score <= 85:
            risk_category = "high"
        else:
            risk_category = "critical"
            
        # Incident log list
        incidents = []
        # Check for overtime
        for att in attendances:
            if att.check_out and att.check_in:
                dur = (att.check_out - att.check_in).total_seconds() / 3600.0
                if dur > 10.0:
                    date_str = att.check_in.strftime("%d %b")
                    incidents.append({
                        "type": "overtime",
                        "text": f"Extended shift of {dur:.1f} hours worked on {date_str}.",
                        "severity": "medium" if dur < 12 else "high"
                    })
                    
        # Check late arrivals
        for att in attendances:
            if att.status == "late":
                date_str = att.check_in.strftime("%d %b")
                incidents.append({
                    "type": "late_arrival",
                    "text": f"Arrived late for shift on {date_str}.",
                    "severity": "low"
                })
                
        # Check tasks
        for t in tasks:
            if t.status in [TaskStatus.COMPLETED_LATE, TaskStatus.OVERDUE, TaskStatus.DELAYED]:
                date_str = t.deadline.strftime("%d %b")
                desc_trunc = t.work_description[:30] + "..." if len(t.work_description) > 30 else t.work_description
                incidents.append({
                    "type": "task_delay",
                    "text": f"Task '{desc_trunc}' status is {t.status.value} (Deadline: {date_str}).",
                    "severity": "medium" if t.status == TaskStatus.COMPLETED_LATE else "high"
                })
                
        # Check leaves
        for lv in leaves:
            notice = lv.start_date - lv.created_at
            hrs = notice.total_seconds() / 3600.0
            if hrs < 48.0:
                date_str = lv.start_date.strftime("%d %b")
                incidents.append({
                    "type": "leave_short_notice",
                    "text": f"Requested {lv.leave_type.value} leave on {date_str} with notice of {hrs:.1f} hours.",
                    "severity": "medium" if hrs >= 24 else "high"
                })
                
        report.append({
            "id": str(emp.id),
            "name": emp.name,
            "email": emp.email,
            "role": emp.role.value,
            "fatigue_score": fatigue_score,
            "risk_category": risk_category,
            "metrics": {
                "total_overtime_hours": round(total_overtime_hours, 1),
                "overtime_days": overtime_days,
                "overtime_streak_days": max_overtime_streak,
                "late_arrivals": late_arrivals,
                "late_overdue_tasks": late_overdue_tasks,
                "short_notice_leaves": short_notice_leaves
            },
            "incidents": incidents[:6]
        })
        
    report.sort(key=lambda x: x["fatigue_score"], reverse=True)
    return report
