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

    overdue_tasks = await Task.find(
        query,
        Task.deadline < now,
        In(Task.status, [TaskStatus.PENDING, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.OVERDUE, TaskStatus.DELAYED])
    ).to_list()

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
    
    all_scoped_users = await User.find(user_query).to_list()
    for u in all_scoped_users:
        if u.role == UserRole.ADMIN:
            continue
        uid = str(u.id)
        count = user_task_counts.get(uid, 0)
        if count >= 4:
            overloaded.append({"user_id": uid, "name": u.name, "task_count": count})
        elif count <= 1:
            underutilized.append({"user_id": uid, "name": u.name, "task_count": count})

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
            "deadline": task.deadline.isoformat() + "Z",
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
        "total_overdue_tasks": len(overdue_tasks),
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

    all_tasks = await Task.find(query).to_list()
    
    # Calculate completions
    user_stats = {}
    for task in all_tasks:
        uid = str(task.assigned_to)
        if uid not in user_stats:
            user_stats[uid] = {"assigned": 0, "completed": 0, "completed_on_time": 0, "total_hours": 0.0, "completed_late": 0}
        
        user_stats[uid]["assigned"] += 1
        if task.status in [TaskStatus.COMPLETED, TaskStatus.COMPLETED_LATE]:
            user_stats[uid]["completed"] += 1
            if task.status == TaskStatus.COMPLETED:
                user_stats[uid]["completed_on_time"] += 1
            else:
                user_stats[uid]["completed_late"] += 1
            
            if task.completed_at:
                duration_hours = (task.completed_at - task.created_at).total_seconds() / 3600
                user_stats[uid]["total_hours"] += duration_hours

    # Fetch users to match names
    user_query = {"is_deleted": {"$ne": True}}
    if user_scope is not None:
        user_query["_id"] = {"$in": user_scope}
    users = await User.find(user_query).to_list()

    performance_records = []
    team_total_productivity = 0.0
    valid_employees_count = 0

    for u in users:
        if u.role == UserRole.ADMIN:
            continue
        uid = str(u.id)
        stats = user_stats.get(uid, {"assigned": 0, "completed": 0, "completed_on_time": 0, "total_hours": 0.0, "completed_late": 0})
        
        assigned = stats["assigned"]
        completed = stats["completed"]
        on_time = stats["completed_on_time"]
        
        prod_score = round((completed / assigned * 100.0), 1) if assigned > 0 else 0.0
        eff_score = round((on_time / assigned * 100.0), 1) if assigned > 0 else 0.0
        avg_completion_time = round(stats["total_hours"] / completed, 1) if completed > 0 else 0.0

        # Query attendance logs for consistency (last 30 days)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        attendance_logs = await Attendance.find(
            Attendance.user_id == u.id,
            Attendance.check_in >= thirty_days_ago
        ).to_list()

        late_logs = [log for log in attendance_logs if log.status == "late"]
        total_days = len(attendance_logs)
        late_pct = (len(late_logs) / total_days * 100.0) if total_days > 0 else 0.0
        consistency_score = max(0.0, round(100.0 - late_pct, 1)) if total_days > 0 else 100.0

        # Burnout risk calculation
        # If user works high hours (average duration > 9.5 hours) and is assigned > 3 active tasks
        high_work_hours = False
        completed_sessions = [s for s in attendance_logs if s.check_out is not None]
        if completed_sessions:
            avg_duration = sum([(s.check_out - s.check_in).total_seconds() / 3600 for s in completed_sessions]) / len(completed_sessions)
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
            "name": u.name,
            "role": u.role.value,
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


async def run_payroll_analysis(user_scope: Optional[List[PydanticObjectId]] = None) -> Dict[str, Any]:
    """Performs anomaly detection on payroll items like overtime spikes, variances, and suspicious deductions."""
    query = {}
    if user_scope is not None:
        query["user_id"] = {"$in": user_scope}

    payroll_records = await Payroll.find(query).to_list()
    if not payroll_records:
        return {"alerts": [], "payout_spikes": [], "overtime_anomalies": []}

    # Group payrolls by month to inspect spikes
    monthly_payouts = {}
    for pr in payroll_records:
        month = pr.month
        monthly_payouts[month] = monthly_payouts.get(month, 0.0) + pr.net_salary

    # Compute variance spike relative to average or prior month
    months_sorted = sorted(list(monthly_payouts.keys()))
    payout_spikes = []
    for i in range(1, len(months_sorted)):
        prev_month = months_sorted[i-1]
        curr_month = months_sorted[i]
        prev_val = monthly_payouts[prev_month]
        curr_val = monthly_payouts[curr_month]

        if prev_val > 0:
            variance_pct = ((curr_val - prev_val) / prev_val) * 100.0
            if variance_pct > 15.0:
                payout_spikes.append({
                    "month": curr_month,
                    "previous_payout": round(prev_val, 2),
                    "current_payout": round(curr_val, 2),
                    "increase_pct": round(variance_pct, 1),
                    "details": f"Net payout spike of {round(variance_pct, 1)}% detected from {prev_month} to {curr_month}."
                })

    alerts = []
    overtime_anomalies = []
    suspicious_deductions = []

    for pr in payroll_records:
        # 1. Overtime claiming spike: overtime > 20% of basic base salary
        base_pay = pr.basic + pr.hra + pr.special_allowance
        if base_pay > 0 and pr.overtime_pay / base_pay > 0.2:
            overtime_anomalies.append({
                "employee_name": pr.user_name,
                "month": pr.month,
                "overtime_pay": pr.overtime_pay,
                "base_pay": base_pay,
                "ratio_pct": round((pr.overtime_pay / base_pay) * 100.0, 1),
                "details": f"Overtime pay (₹{pr.overtime_pay}) is {round((pr.overtime_pay / base_pay) * 100, 1)}% of base salary."
            })

        # 2. Suspicious Deductions: total deductions (PF + ESI + Tax + Penalty) > 40% of gross salary
        gross = base_pay + pr.overtime_pay + pr.incentives + pr.bonuses
        total_ded = pr.pf_deduction + pr.esi_deduction + pr.tax_deduction + pr.penalties + pr.lop_deduction
        if gross > 0 and total_ded / gross > 0.4:
            suspicious_deductions.append({
                "employee_name": pr.user_name,
                "month": pr.month,
                "gross": gross,
                "deductions": total_ded,
                "ratio_pct": round((total_ded / gross) * 100, 1),
                "details": f"High withholdings detected: deductions represent {round((total_ded / gross) * 100, 1)}% of gross earnings."
            })

        # 3. Flat Outliers: Net salary is 0 or negative
        if pr.net_salary <= 0:
            alerts.append(f"Employee {pr.user_name} has a net payout of ₹0.00 for {pr.month}. Verify check-ins or LOP configurations.")

    # Combine all alerts
    for spike in payout_spikes:
        alerts.append(spike["details"])
    for ot in overtime_anomalies:
        alerts.append(f"Unusual Overtime claim detected for {ot['employee_name']} in {ot['month']}: ₹{ot['overtime_pay']}.")
    for sd in suspicious_deductions:
        alerts.append(f"Suspiciously high deductions for {sd['employee_name']} in {sd['month']} (₹{sd['deductions']}).")

    return {
        "alerts": alerts,
        "payout_spikes": payout_spikes,
        "overtime_anomalies": overtime_anomalies,
        "suspicious_deductions": suspicious_deductions
    }


async def run_attendance_analysis(user_scope: Optional[List[PydanticObjectId]] = None) -> Dict[str, Any]:
    """Generates attendance analytics, late logins trends, and frequent absence reports."""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    query = {
        "check_in": {"$gte": thirty_days_ago}
    }
    if user_scope is not None:
        query["user_id"] = {"$in": user_scope}

    logs = await Attendance.find(query).to_list()
    
    # Process late check-ins and absences
    user_attendance = {}
    for log in logs:
        uid = str(log.user_id)
        if uid not in user_attendance:
            user_attendance[uid] = {"total": 0, "late": 0, "on_time": 0, "absent": 0}
        
        user_attendance[uid]["total"] += 1
        if log.status == "late":
            user_attendance[uid]["late"] += 1
        elif log.status == "present":
            user_attendance[uid]["on_time"] += 1

    # Fetch users in scope
    user_query = {"is_deleted": {"$ne": True}}
    if user_scope is not None:
        user_query["_id"] = {"$in": user_scope}
    users = await User.find(user_query).to_list()

    late_login_trends = []
    absentee_warnings = []
    consistency_records = []

    for u in users:
        if u.role == UserRole.ADMIN:
            continue
        uid = str(u.id)
        stats = user_attendance.get(uid, {"total": 0, "late": 0, "on_time": 0, "absent": 0})
        
        total = stats["total"]
        late = stats["late"]
        
        late_pct = (late / total * 100.0) if total > 0 else 0.0
        consistency_score = max(0.0, round(100.0 - late_pct, 1)) if total > 0 else 100.0

        if late_pct > 25.0 and total >= 4:
            late_login_trends.append({
                "name": u.name,
                "user_id": uid,
                "late_checkins": late,
                "total_checkins": total,
                "late_ratio_pct": round(late_pct, 1),
                "details": f"{u.name} checked in late {late} times out of {total} days ({round(late_pct, 1)}%)."
            })

        # Calculate absent warning (e.g. checked in < 70% of weekdays in last 30 days)
        # Assuming 20 working days in a month, if checked in < 14 times
        if total < 12:
            absence_count = 20 - total
            absentee_warnings.append({
                "name": u.name,
                "user_id": uid,
                "checked_in_days": total,
                "predicted_absences": absence_count,
                "details": f"High absenteeism pattern: {u.name} logged only {total} working sessions in past 30 days."
            })

        consistency_records.append({
            "name": u.name,
            "user_id": uid,
            "consistency_score": consistency_score,
            "total_logs": total
        })

    alerts = []
    for late_t in late_login_trends:
        alerts.append(f"Late check-in trend: {late_t['details']}")
    for ab_w in absentee_warnings:
        alerts.append(f"Absentee warning: {ab_w['details']}")

    return {
        "alerts": alerts,
        "late_login_trends": late_login_trends,
        "absentee_warnings": absentee_warnings,
        "consistency_rankings": consistency_records
    }


# -------------------------------------------------------------
# AI Dashboard Summary Aggregator
# -------------------------------------------------------------
async def generate_ai_dashboard_summary(current_user: User) -> Dict[str, Any]:
    """Generates role-appropriate AI summary cards, alerts, and suggestions for the main dashboard."""
    # Check cache first (cache lifetime 1 hour)
    cached = await CachedAIInsight.find(
        CachedAIInsight.user_id == current_user.id,
        CachedAIInsight.insight_type == "dashboard_summary",
        CachedAIInsight.created_at >= datetime.now(timezone.utc) - timedelta(hours=1)
    ).sort("-created_at").first_or_none()

    if cached:
        return cached.content

    # Determine user query scope
    scope = await get_employee_ids_in_scope(current_user)

    # Gather data facts
    task_intel = await run_task_analysis(scope)
    perf_intel = await run_performance_analysis(scope)
    attendance_intel = await run_attendance_analysis(scope)
    
    payroll_intel = {"alerts": []}
    if current_user.role in [UserRole.ADMIN, UserRole.HR_MANAGER]:
        payroll_intel = await run_payroll_analysis(scope)

    # 1. Prepare Heuristics alerts & recommendations
    alerts = []
    recommendations = []

    # Compile Alerts
    if current_user.role in [UserRole.ADMIN, UserRole.HR_MANAGER]:
        # Scoped warnings
        alerts.extend(payroll_intel.get("alerts", [])[:3])
        alerts.extend(attendance_intel.get("alerts", [])[:3])
        
        # Recommendations
        if task_intel.get("allocation_suggestions"):
            for sugg in task_intel["allocation_suggestions"][:2]:
                recommendations.append(sugg["reason"])
        if len(attendance_intel.get("absentee_warnings", [])) > 0:
            recommendations.append("Initiate HR reviews for personnel showing attendance patterns below threshold.")
    
    elif current_user.role in [UserRole.MANAGER, UserRole.ASSISTANT_MANAGER]:
        # Team management scope
        for pred in task_intel.get("task_predictions", []):
            if pred["risk_score"] > 60:
                alerts.append(f"Team Task at risk: '{pred['description']}' assigned to {pred['assigned_to_name']} ({pred['risk_score']}% risk).")
        
        for o in task_intel.get("overloaded_employees", []):
            alerts.append(f"Team Member workload warning: {o['name']} is overloaded with {o['task_count']} active tasks.")
        
        # Recommendations
        if task_intel.get("allocation_suggestions"):
            for sugg in task_intel["allocation_suggestions"][:2]:
                recommendations.append(f"Reallocate tasks: {sugg['reason']}")
    
    else:
        # Personal Employee Scope
        for pred in task_intel.get("task_predictions", []):
            if pred["risk_score"] > 50 and pred["assigned_to"] == str(current_user.id):
                alerts.append(f"Personal deadline warning: '{pred['description']}' has a {pred['risk_score']}% risk of missing target.")
        
        # Find personal consistency
        for rank in attendance_intel.get("consistency_rankings", []):
            if rank["user_id"] == str(current_user.id):
                if rank["consistency_score"] < 80:
                    alerts.append(f"Consistency warning: your attendance consistency score is {rank['consistency_score']}%. Try logging in on time.")
        
        # Personal recommendations
        recommendations.append("Ensure task remarks are updated to log completion barriers early.")
        recommendations.append("Complete pending regularizations to prevent automated LOP salary deductions.")

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
            f"Overall workforce productivity stands at {perf_intel['team_average_productivity']}%. "
            f"There are currently {task_intel['total_active_tasks']} active tasks under tracking, "
            f"with {task_intel['total_overdue_tasks']} flagged as overdue. "
            f"AI anomaly scanner detected {len(payroll_intel.get('alerts', []))} payroll variance warnings "
            f"and {len(attendance_intel.get('late_login_trends', []))} late login trends requiring HR review."
        )
    elif current_user.role in [UserRole.MANAGER, UserRole.ASSISTANT_MANAGER]:
        summary_text = (
            f"Team productivity performance averages {perf_intel['team_average_productivity']}%. "
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
        f"- Productivity Score: {perf_intel['team_average_productivity']}%\n"
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
            "team_average": perf_intel["team_average_productivity"],
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
        retrieved_facts.append(f"Team average productivity stands at {perf_intel['team_average_productivity']}%")

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
