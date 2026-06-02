"""
AI Service - Workforce Intelligence, heuristics calculators, and OpenAI compatible client connector.
"""
import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from beanie import PydanticObjectId
from beanie.operators import In

from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.attendance import Attendance, ist_now
from app.utils.ist_time import to_utc_iso
from app.models.payroll import Payroll
from app.models.ai_insight import CachedAIInsight
from app.routes.employees import get_visible_employee_ids


# -------------------------------------------------------------
# OpenAI Client Adapter (Zero-Dependency)
# -------------------------------------------------------------
def call_openai_chat_completions(prompt: str, system_instruction: str = "You are TaskReward AI, an expert workforce intelligence assistant.") -> Optional[str]:
    """Lightweight, zero-dependency HTTP helper to query OpenAI compatible API endpoints."""
    api_key = os.getenv("OPENAI_API_KEY")
    api_base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    model_name = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")

    if not api_key:
        return None

    url = f"{api_base.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    data = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.5,
        "max_tokens": 800
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            return res_json["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"[AI SERVICE] OpenAI API call failed: {str(e)}")
        return None


# -------------------------------------------------------------
# Core Analytical Heuristics Engine
# -------------------------------------------------------------
async def get_employee_ids_in_scope(current_user: User) -> Optional[List[PydanticObjectId]]:
    """Helper to determine visible employee IDs based on role hierarchy permissions."""
    if current_user.role == UserRole.ADMIN:
        return None  # All employees in company
    
    visible_ids = await get_visible_employee_ids(current_user)
    if visible_ids is not None:
        return list(visible_ids)
    
    # Fallback/Safe scope
    if current_user.role in [UserRole.MANAGER, UserRole.ASSISTANT_MANAGER]:
        # Only reportees
        reportees = await User.find(User.reporting_manager_id == current_user.id).to_list()
        return [r.id for r in reportees]
    
    # Employees see only themselves
    return [current_user.id]


async def run_task_analysis(user_scope: Optional[List[PydanticObjectId]] = None) -> Dict[str, Any]:
    """Analyzes task parameters to detect risk, delay probabilities, overloading, and suggestions."""
    now = datetime.now(timezone.utc)
    query = {}
    if user_scope is not None:
        query["assigned_to"] = {"$in": user_scope}

    active_tasks = await Task.find(
        query,
        In(Task.status, [TaskStatus.PENDING, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.UNDER_REVIEW])
    ).to_list()

    # Performance optimization: use count() instead of fetching all documents
    overdue_tasks_count = await Task.find(
        query,
        Task.deadline < now,
        In(Task.status, [TaskStatus.PENDING, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.OVERDUE, TaskStatus.DELAYED])
    ).count()

    # User workload mapping
    user_task_counts = {}
    for task in active_tasks:
        uid = str(task.assigned_to)
        user_task_counts[uid] = user_task_counts.get(uid, 0) + 1

    # Overloaded vs Underutilized
    overloaded = []
    underutilized = []
    
    # Retrieve scoped users
    user_query = {"is_deleted": {"$ne": True}}
    if user_scope is not None:
        user_query["_id"] = {"$in": user_scope}
    
    # Performance optimization: project only required fields using collection directly
    all_scoped_users = await User.get_pymongo_collection().find(
        user_query,
        {"_id": 1, "name": 1, "role": 1}
    ).to_list(length=None)

    for u in all_scoped_users:
        if u.get("role") == UserRole.ADMIN.value:
            continue
        uid = str(u["_id"])
        count = user_task_counts.get(uid, 0)
        if count >= 4:
            overloaded.append({"user_id": uid, "name": u.get("name"), "task_count": count})
        elif count <= 1:
            underutilized.append({"user_id": uid, "name": u.get("name"), "task_count": count})

    # Task delay predictions
    task_predictions = []
    for task in active_tasks:
        time_left = (task.deadline - now).total_seconds() / 3600  # in hours
        risk_score = 0.0
        prediction = "On Time"
        delay_prob = 0.0

        if time_left < 0:
            risk_score = 100.0
            prediction = "Delayed"
            delay_prob = 1.0
        else:
            # Base probability on time remaining and priority
            priority_weight = {
                TaskPriority.LOW: 0.1,
                TaskPriority.REGULAR: 0.2,
                TaskPriority.MEDIUM: 0.4,
                TaskPriority.HIGH: 0.7,
                TaskPriority.CRITICAL: 0.95
            }.get(task.priority, 0.4)

            # High risk if short time left for complex priorities
            if time_left < 24:
                delay_prob = min(0.98, priority_weight * 1.3)
            elif time_left < 72:
                delay_prob = min(0.85, priority_weight * 0.9)
            else:
                delay_prob = priority_weight * 0.3

            risk_score = round(delay_prob * 100, 1)
            if risk_score > 70:
                prediction = "High Risk"
            elif risk_score > 35:
                prediction = "Medium Risk"
            else:
                prediction = "On Time"

        insights = []
        if prediction != "On Time":
            insights.append(f"Task is at {prediction.lower()} of missing deadline ({round(time_left, 1)} hours remaining).")
        if str(task.assigned_to) in [o["user_id"] for o in overloaded]:
            insights.append("Assignee workload is above capacity threshold.")

        task_predictions.append({
            "task_id": str(task.id),
            "description": task.work_description,
            "assigned_to": str(task.assigned_to),
            "assigned_to_name": task.assigned_to_name,
            "deadline": to_utc_iso(task.deadline),
            "priority": task.priority.value,
            "status": task.status.value,
            "risk_score": risk_score,
            "delay_probability": round(delay_prob, 2),
            "completion_prediction": prediction,
            "insights": insights
        })

    # Allocation recommendations
    allocation_suggestions = []
    for o in overloaded:
        better_options = sorted(underutilized, key=lambda x: x["task_count"])
        if better_options:
            allocation_suggestions.append({
                "from_employee": o["name"],
                "from_employee_id": o["user_id"],
                "suggested_to": [b["name"] for b in better_options[:2]],
                "suggested_to_ids": [b["user_id"] for b in better_options[:2]],
                "reason": f"{o['name']} is overloaded with {o['task_count']} active tasks, while suggested personnel are underutilized."
            })

    return {
        "total_active_tasks": len(active_tasks),
        "total_overdue_tasks": overdue_tasks_count,
        "overloaded_employees": overloaded,
        "underutilized_employees": underutilized,
        "task_predictions": task_predictions,
        "allocation_suggestions": allocation_suggestions
    }


async def run_performance_analysis(user_scope: Optional[List[PydanticObjectId]] = None) -> Dict[str, Any]:
    """Computes employee productivity index, consistency indexes, task completion rates, and burnout indicators."""
    query = {}
    if user_scope is not None:
        query["assigned_to"] = {"$in": user_scope}

    # Performance optimization: Use database-level aggregation for task statistics
    # This avoids fetching all tasks into Python memory, a massive bottleneck for large datasets.
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$assigned_to",
            "assigned": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$in": ["$status", [TaskStatus.COMPLETED.value, TaskStatus.COMPLETED_LATE.value]]}, 1, 0]}},
            "completed_on_time": {"$sum": {"$cond": [{"$eq": ["$status", TaskStatus.COMPLETED.value]}, 1, 0]}},
            "completed_late": {"$sum": {"$cond": [{"$eq": ["$status", TaskStatus.COMPLETED_LATE.value]}, 1, 0]}},
            "total_hours": {"$sum": {
                "$cond": [
                    {"$and": [
                        {"$in": ["$status", [TaskStatus.COMPLETED.value, TaskStatus.COMPLETED_LATE.value]]},
                        {"$ne": ["$completed_at", None]},
                        {"$ne": ["$created_at", None]}
                    ]},
                    {"$divide": [{"$subtract": ["$completed_at", "$created_at"]}, 3600000]},
                    0
                ]
            }}
        }}
    ]
    
    # Use motor directly for aggregate
    aggregation_cursor = await Task.get_pymongo_collection().aggregate(pipeline)
    aggregation_results = await aggregation_cursor.to_list(length=None)
    user_stats = {}
    for res in aggregation_results:
        uid = str(res["_id"])
        user_stats[uid] = {
            "assigned": res["assigned"],
            "completed": res["completed"],
            "completed_on_time": res["completed_on_time"],
            "completed_late": res["completed_late"],
            "total_hours": res["total_hours"]
        }

    # Fetch users to match names
    user_query = {"is_deleted": {"$ne": True}}
    if user_scope is not None:
        user_query["_id"] = {"$in": user_scope}

    # Performance optimization: project required fields using collection directly
    users = await User.get_pymongo_collection().find(
        user_query,
        {"_id": 1, "name": 1, "role": 1}
    ).to_list(length=None)

    # Pre-fetch attendance logs for all users in scope (last 30 days)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    attendance_query = {"check_in": {"$gte": thirty_days_ago}}
    if user_scope:
        attendance_query["user_id"] = {"$in": user_scope}

    # Performance optimization: project required fields for attendance
    all_attendance_logs = await Attendance.get_pymongo_collection().find(
        attendance_query,
        {"user_id": 1, "status": 1, "check_in": 1, "check_out": 1}
    ).to_list(length=None)

    attendance_by_user = {}
    for log in all_attendance_logs:
        uid_str = str(log["user_id"])
        if uid_str not in attendance_by_user:
            attendance_by_user[uid_str] = []
        attendance_by_user[uid_str].append(log)

    performance_records = []
    team_total_productivity = 0.0
    valid_employees_count = 0

    for u in users:
        if u.get("role") == UserRole.ADMIN.value:
            continue
        uid = str(u["_id"])
        stats = user_stats.get(uid, {"assigned": 0, "completed": 0, "completed_on_time": 0, "total_hours": 0.0, "completed_late": 0})
        
        assigned = stats["assigned"]
        completed = stats["completed"]
        on_time = stats["completed_on_time"]
        
        prod_score = round((completed / assigned * 100.0), 1) if assigned > 0 else 0.0
        eff_score = round((on_time / assigned * 100.0), 1) if assigned > 0 else 0.0
        avg_completion_time = round(stats["total_hours"] / completed, 1) if completed > 0 else 0.0

        # Use pre-fetched attendance logs
        attendance_logs = attendance_by_user.get(uid, [])

        late_logs = [log for log in attendance_logs if log.get("status") == "late"]
        total_days = len(attendance_logs)
        late_pct = (len(late_logs) / total_days * 100.0) if total_days > 0 else 0.0
        consistency_score = max(0.0, round(100.0 - late_pct, 1)) if total_days > 0 else 100.0

        # Burnout risk calculation
        # If user works high hours (average duration > 9.5 hours) and is assigned > 3 active tasks
        high_work_hours = False
        completed_sessions = [s for s in attendance_logs if s.get("check_out") is not None]
        if completed_sessions:
            avg_duration = sum([(s["check_out"] - s["check_in"]).total_seconds() / 3600 for s in completed_sessions]) / len(completed_sessions)
            if avg_duration > 9.5:
                high_work_hours = True

        active_count = assigned - completed
        burnout_risk = "Low"
        if high_work_hours and active_count >= 3:
            burnout_risk = "High"
        elif high_work_hours or active_count >= 4:
            burnout_risk = "Medium"

        insights = []
        if prod_score >= 80:
            insights.append("High operational productivity. Recommended for milestone bonus incentives.")
        elif prod_score < 40 and assigned > 2:
            insights.append("Productivity trajectory shows declining trends. Needs supervisor check-in.")
        
        if burnout_risk == "High":
            insights.append("Burnout warning: working extended hours under high backlog volumes.")
        if consistency_score < 70:
            insights.append("Irregular attendance consistency detected. Suggest check-in correction reviews.")

        performance_records.append({
            "user_id": uid,
            "name": u.get("name"),
            "role": u.get("role"),
            "tasks_assigned": assigned,
            "tasks_completed": completed,
            "productivity_score": prod_score,
            "efficiency_score": eff_score,
            "consistency_score": consistency_score,
            "burnout_risk": burnout_risk,
            "avg_completion_hours": avg_completion_time,
            "insights": insights
        })

        team_total_productivity += prod_score
        valid_employees_count += 1

    team_avg_productivity = round(team_total_productivity / valid_employees_count, 1) if valid_employees_count > 0 else 0.0

    return {
        "team_average_productivity": team_avg_productivity,
        "employee_performance": performance_records
    }


async def run_attendance_analysis(user_scope: Optional[List[PydanticObjectId]] = None) -> Dict[str, Any]:
    """Analyzes attendance logs for patterns like late check-ins, early check-outs, and absenteeism."""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    query = {"check_in": {"$gte": thirty_days_ago}}
    if user_scope is not None:
        query["user_id"] = {"$in": user_scope}

    # Performance optimization: project required fields using collection directly
    logs = await Attendance.get_pymongo_collection().find(
        query,
        {"user_id": 1, "status": 1, "check_in": 1, "check_out": 1}
    ).to_list(length=None)
    
    # Group by user
    user_attendance = {}
    for log in logs:
        uid = str(log["user_id"])
        if uid not in user_attendance:
            user_attendance[uid] = []
        user_attendance[uid].append(log)

    late_login_trends = []
    absentee_warnings = []

    # Fetch user names using collection directly
    user_query = {"is_deleted": {"$ne": True}}
    if user_scope is not None:
        user_query["_id"] = {"$in": user_scope}

    users = await User.get_pymongo_collection().find(
        user_query,
        {"_id": 1, "name": 1}
    ).to_list(length=None)

    user_map = {str(u["_id"]): u.get("name") for u in users}

    for uid, records in user_attendance.items():
        name = user_map.get(uid, "Unknown")
        late_count = len([r for r in records if r.get("status") == "late"])
        
        if late_count >= 5:
            late_login_trends.append({
                "user_id": uid,
                "name": name,
                "late_count": late_count,
                "details": f"{name} has {late_count} late check-ins in the last 30 days."
            })

        # Simple absenteeism heuristic (less than 15 days in last 30 days)
        if len(records) < 15:
            absentee_warnings.append({
                "user_id": uid,
                "name": name,
                "days_present": len(records),
                "details": f"{name} was present only {len(records)} days in the last month."
            })

    return {
        "late_login_trends": late_login_trends,
        "absentee_warnings": absentee_warnings
    }


async def run_payroll_analysis(user_scope: Optional[List[PydanticObjectId]] = None) -> Dict[str, Any]:
    """Scans payroll records for spikes, outliers, and variance compared to history."""
    # This is restricted to Admin/HR, scope is managed by caller
    query = {}
    if user_scope is not None:
        query["user_id"] = {"$in": user_scope}

    # Performance optimization: project necessary fields using collection directly
    payrolls = await Payroll.get_pymongo_collection().find(
        query,
        {"user_id": 1, "net_salary": 1, "month_year": 1}
    ).sort("month_year", -1).limit(100).to_list(length=None)

    alerts = []
    if not payrolls:
        return {"alerts": [], "summary": "Insufficient payroll data for AI analysis."}

    # Group by user to find variance
    user_payroll_history = {}
    for p in payrolls:
        uid = str(p["user_id"])
        if uid not in user_payroll_history:
            user_payroll_history[uid] = []
        user_payroll_history[uid].append(p["net_salary"])

    for uid, salaries in user_payroll_history.items():
        if len(salaries) > 1:
            current = salaries[0]
            avg_past = sum(salaries[1:]) / len(salaries[1:])
            variance = ((current - avg_past) / avg_past * 100.0) if avg_past > 0 else 0.0

            if abs(variance) > 25:
                # Fetch user name for the alert
                u = await User.get(PydanticObjectId(uid))
                user_name = u.name if u else "Unknown"
                trend = "spike" if variance > 0 else "drop"
                alerts.append(f"Significant salary {trend} of {round(abs(variance), 1)}% detected for {user_name} this month.")

    return {
        "alerts": alerts,
        "summary": f"Analyzed {len(payrolls)} payroll records. {len(alerts)} significant variances detected."
    }


async def get_dashboard_intelligence_summary(current_user: User) -> Dict[str, Any]:
    """Orchestrates all analyzers to generate a unified intelligence object for the dashboard."""
    # Check Cache first
    cache = await CachedAIInsight.find_one(
        CachedAIInsight.user_id == current_user.id,
        CachedAIInsight.insight_type == "dashboard_summary",
        CachedAIInsight.created_at >= datetime.now(timezone.utc) - timedelta(hours=2)
    )
    if cache:
        return cache.content

    scope = await get_employee_ids_in_scope(current_user)

    # Parallel data extraction/heuristics
    task_intel = await run_task_analysis(scope)
    perf_intel = await run_performance_analysis(scope)
    attendance_intel = await run_attendance_analysis(scope)
    
    payroll_intel = {"alerts": []}
    if current_user.role in [UserRole.ADMIN, UserRole.HR_MANAGER]:
        payroll_intel = await run_payroll_analysis(scope)

    # 1. Logic-based Alerts & Recommendations
    alerts = []
    recommendations = []

    if task_intel["total_overdue_tasks"] > 0:
        alerts.append(f"Critical: {task_intel['total_overdue_tasks']} assignments are past deadline across your scope.")
        recommendations.append("Prioritize overdue tasks for immediate completion to prevent project delays.")

    if task_intel["overloaded_employees"]:
        alerts.append(f"Warning: {len(task_intel['overloaded_employees'])} team members are exceeding workload capacity.")
        recommendations.append("Redistribute tasks from overloaded members to underutilized ones using AI suggestions.")

    for trend in attendance_intel["late_login_trends"]:
        alerts.append(f"Trend: Frequent late logins detected for {trend['name']}.")
    
    if payroll_intel["alerts"]:
        alerts.append(f"Payroll: {len(payroll_intel['alerts'])} salary variances require administrative validation.")
        recommendations.append("Review high-variance payroll records to ensure accuracy before final disbursement.")

    if perf_intel["team_average"] < 60:
        recommendations.append("Team productivity index is below target. Consider skill-gap analysis or automated LOP salary deductions.")

    # Fallbacks for empty recommendations
    if not recommendations:
        recommendations = ["Workforce capacity is operating within standard thresholds. No immediate reallocation required."]
    if not alerts:
        alerts = ["All operations are running smoothly. Zero critical warnings flagged."]

    # 2. Build Summary Prompt or Local Synthesis
    role_name = current_user.role.value.replace("_", " ").upper()
    summary_text = ""

    # Synthesize facts into a local text
    if current_user.role in [UserRole.ADMIN, UserRole.HR_MANAGER]:
        summary_text = (
            f"Overall workforce productivity stands at {perf_intel['team_average']}%."
            f"There are currently {task_intel['total_active_tasks']} active tasks under tracking, "
            f"with {task_intel['total_overdue_tasks']} flagged as overdue. "
            f"AI anomaly scanner detected {len(payroll_intel.get('alerts', []))} payroll variance warnings "
            f"and {len(attendance_intel.get('late_login_trends', []))} late login trends requiring HR review."
        )
    elif current_user.role in [UserRole.MANAGER, UserRole.ASSISTANT_MANAGER]:
        summary_text = (
            f"Team productivity performance averages {perf_intel['team_average']}%."
            f"Active backlog contains {task_intel['total_active_tasks']} assignments. "
            f"Workload tracking detected {len(task_intel['overloaded_employees'])} overloaded members. "
            f"Please verify allocations to ensure timely delivery."
        )
    else:
        # Find personal statistics
        p_stats = next((p for p in perf_intel["employee_performance"] if p["user_id"] == str(current_user.id)), None)
        if p_stats:
            summary_text = (
                f"Your personal productivity index is {p_stats['productivity_score']}% with an efficiency score of {p_stats['efficiency_score']}%. "
                f"Attendance consistency stands at {p_stats['consistency_score']}% with a '{p_stats['burnout_risk']}' burnout risk level."
            )
        else:
            summary_text = "Personal performance scorecard is compiling. Ensure tasks are logged to compile AI insights."

    # Try LLM synthesis
    prompt = (
        f"Role: {role_name}\n"
        f"Facts Compiled:\n"
        f"- Productivity Score: {perf_intel['team_average']}%\n"
        f"- Total Scopes: {task_intel['total_active_tasks']} active tasks, {task_intel['total_overdue_tasks']} overdue.\n"
        f"- Alerts Flagged: {alerts}\n"
        f"- Recommendations: {recommendations}\n"
        f"Synthesize these facts into a concise 3-sentence executive summary paragraph matching the perspective of a {role_name} checking their dashboard dashboard."
    )
    
    llm_summary = call_openai_chat_completions(prompt, "You are a professional HR assistant summarizing operational workforce metrics.")
    if llm_summary:
        summary_text = llm_summary.strip()

    content = {
        "ai_summary": summary_text,
        "alerts": alerts,
        "recommendations": recommendations,
        "task_intelligence": {
            "overloaded": task_intel["overloaded_employees"],
            "underutilized": task_intel["underutilized_employees"],
            "allocation_suggestions": task_intel["allocation_suggestions"]
        },
        "performance_intelligence": {
            "team_average": perf_intel["team_average"],
            "burnout_risks": [{"name": p["name"], "risk": p["burnout_risk"]} for p in perf_intel["employee_performance"] if p["burnout_risk"] != "Low"]
        },
        "attendance_intelligence": {
            "late_login_trends": attendance_intel["late_login_trends"]
        }
    }

    # Save to Cache
    new_cache = CachedAIInsight(
        user_id=current_user.id,
        insight_type="dashboard_summary",
        content=content
    )
    await new_cache.insert()

    return content


# -------------------------------------------------------------
# Natural Language Copilot Assistant
# -------------------------------------------------------------
async def run_ai_copilot_assistant(user_message: str, current_user: User) -> Dict[str, Any]:
    """Conversational query processor that retrieves contextual facts from the DB and returns role-based AI assistance."""
    message_lc = user_message.lower()
    scope = await get_employee_ids_in_scope(current_user)

    # 1. Fact-Retrieval based on user query keywords
    retrieved_facts = []
    
    if "overdue" in message_lc or "delayed" in message_lc or "missed" in message_lc:
        # Fetch overdue tasks
        now = datetime.now(timezone.utc)
        query = {"deadline": {"$lt": now}, "status": {"$in": [TaskStatus.PENDING, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS]}}
        if scope is not None:
            query["assigned_to"] = {"$in": scope}
        tasks = await Task.find(query).limit(5).to_list()
        
        if tasks:
            task_list = [f"'{t.work_description}' assigned to {t.assigned_to_name} (Deadline: {t.deadline.strftime('%d-%b-%Y')})" for t in tasks]
            retrieved_facts.append(f"Overdue Tasks found in scope:\n- " + "\n- ".join(task_list))
        else:
            retrieved_facts.append("No overdue tasks found in scope.")

    if "overload" in message_lc or "capacity" in message_lc or "allocation" in message_lc or "workload" in message_lc:
        task_intel = await run_task_analysis(scope)
        if task_intel["overloaded_employees"]:
            over = [f"{o['name']} ({o['task_count']} active tasks)" for o in task_intel["overloaded_employees"]]
            retrieved_facts.append("Overloaded employees detected:\n- " + "\n- ".join(over))
        else:
            retrieved_facts.append("No employees are currently overloaded (threshold >= 4 tasks).")
            
        if task_intel["allocation_suggestions"]:
            sugg = [s["reason"] for s in task_intel["allocation_suggestions"]]
            retrieved_facts.append("Reallocation Suggestions:\n- " + "\n- ".join(sugg))

    if "productivity" in message_lc or "best" in message_lc or "performance" in message_lc or "highest" in message_lc:
        perf_intel = await run_performance_analysis(scope)
        sorted_perf = sorted(perf_intel["employee_performance"], key=lambda x: x["productivity_score"], reverse=True)
        top_perf = [f"{p['name']} (Productivity: {p['productivity_score']}%, Burnout Risk: {p['burnout_risk']})" for p in sorted_perf[:5]]
        retrieved_facts.append(f"Top performing employees by completion rate:\n- " + "\n- ".join(top_perf))
        retrieved_facts.append(f"Team average productivity stands at {perf_intel['team_average']}%")

    if "attendance" in message_lc or "late" in message_lc or "absent" in message_lc:
        attendance_intel = await run_attendance_analysis(scope)
        if attendance_intel["late_login_trends"]:
            late = [l["details"] for l in attendance_intel["late_login_trends"]]
            retrieved_facts.append("Late check-in trends:\n- " + "\n- ".join(late))
        if attendance_intel["absentee_warnings"]:
            absent = [a["details"] for a in attendance_intel["absentee_warnings"]]
            retrieved_facts.append("Absentee warnings:\n- " + "\n- ".join(absent))
        if not retrieved_facts:
            retrieved_facts.append("Attendance records show no critical late or absence warnings in scope.")

    if "payroll" in message_lc or "salary" in message_lc or "spike" in message_lc or "anomaly" in message_lc:
        if current_user.role in [UserRole.ADMIN, UserRole.HR_MANAGER]:
            payroll_intel = await run_payroll_analysis(scope)
            if payroll_intel["alerts"]:
                retrieved_facts.append("Payroll anomalies / warnings detected:\n- " + "\n- ".join(payroll_intel["alerts"][:5]))
            else:
                retrieved_facts.append("No payroll outliers or variance spikes detected.")
        else:
            retrieved_facts.append("Access Denied: payroll intelligence insights are restricted to administrative personnel.")

    # 2. Synthesize conversational response
    role_name = current_user.role.value.replace("_", " ").upper()
    facts_text = "\n".join(retrieved_facts) if retrieved_facts else "No specific operational domain requested. Summarize general status."
    
    local_answer = ""
    if retrieved_facts:
        local_answer = f"Here are the facts extracted regarding your query:\n\n" + "\n\n".join(retrieved_facts)
    else:
        local_answer = (
            f"Hello {current_user.name}! I am your AI-Driven Workforce Assistant. "
            f"You are logged in as a {role_name}.\n\n"
            f"You can ask me questions such as:\n"
            f"- 'Show overdue tasks'\n"
            f"- 'Who has the highest productivity?'\n"
            f"- 'Show attendance issues or late patterns'\n"
            f"- 'Who is overloaded or underutilized?'\n"
            f"- 'Generate payroll summaries and spikes' (Admins/HR only)"
        )

    # Try LLM Response
    llm_prompt = (
        f"You are the in-app TaskReward AI Copilot assisting a user logged in as a {role_name}.\n"
        f"User Query: '{user_message}'\n\n"
        f"Operational Context & Facts retrieved from DB:\n"
        f"{facts_text}\n\n"
        f"Generate a friendly, helpful, and professional response answering the user's query using the facts retrieved above. "
        f"Always respect role constraints and do not output values for domains they are not allowed to access. Keep formatting clean with bullet points."
    )
    
    llm_answer = call_openai_chat_completions(llm_prompt, "You are a professional corporate assistant copilot for TaskReward.")
    answer_text = llm_answer.strip() if llm_answer else local_answer

    return {
        "query": user_message,
        "answer": answer_text,
        "facts_retrieved": len(retrieved_facts) > 0
    }
