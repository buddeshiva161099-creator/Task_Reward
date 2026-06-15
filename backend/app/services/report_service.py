"""
Report service - generates CSV and Excel reports using Pandas and OpenPyXL.
"""
import pandas as pd
from io import BytesIO
from app.models.task import Task
from app.models.attendance import Attendance
from app.models.user import User, UserRole
from beanie import PydanticObjectId
from datetime import datetime, timezone
from typing import Optional
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo


def _scope(q: dict, tenant_id) -> dict:
    """Append tenant_id filter; refuse if missing (tenant isolation)."""
    if tenant_id is None:
        return q
    q["tenant_id"] = tenant_id
    return q


async def _scope_tasks(q: dict, tenant_id) -> dict:
    """Append tenant_id or company_id filter for tasks; refuse if missing (tenant isolation)."""
    if tenant_id is None:
        return q
    from app.models.company import Company
    tenant_oid = PydanticObjectId(tenant_id)
    companies = await Company.find(Company.tenant_id == tenant_oid).to_list()
    company_ids = [c.id for c in companies]
    tenant_match_ids = [tenant_oid] + company_ids
    q["tenant_id"] = {"$in": tenant_match_ids}
    return q


async def _get_task_data(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    priority: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    tz_name: Optional[str] = None,
    tenant_id = None,
) -> pd.DataFrame:
    """Fetch and filter task data into a DataFrame with specific SaaS requirements."""
    query = {}

    if status:
        query["status"] = status
    if employee_id:
        query["assigned_to"] = PydanticObjectId(employee_id)
    if priority:
        query["priority"] = priority
    if start_date:
        query["created_at"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["created_at"] = {"$lte": datetime.fromisoformat(end_date)}

    query = await _scope_tasks(query, tenant_id)

    tasks = await Task.find(query).sort("-created_at").to_list()

    rows = []
    # Determine timezone for formatting
    tz = ZoneInfo(tz_name) if tz_name else None

    def fmt_dt(dt: datetime) -> str:
        """Format datetime in local timezone if provided."""
        if dt is None:
            return ""
        if tz:
            dt = dt.replace(tzinfo=timezone.utc).astimezone(tz)
        return dt.strftime("%d-%m-%Y %H:%M:%S")

    for i, task in enumerate(tasks, 1):
        # Calculate Time Variance (Deadline - Completed Time)
        time_variance = ""
        if task.completed_at:
            variance = task.deadline - task.completed_at
            hours = variance.total_seconds() / 3600
            if hours > 0:
                time_variance = f"{hours:.1f}h Early"
            else:
                time_variance = f"{abs(hours):.1f}h Late"

        # Format Remarks (Join all remark texts)
        remarks_str = " | ".join([r.get("text", "") for r in task.remarks]) if task.remarks else ""

        rows.append({
            "s.no": i,
            "employee name": task.assigned_to_name or "Unknown",
            "company name": task.company_name or "Personal / Internal",
            "category": ", ".join(task.category_names) if task.category_names else "",
            "work description": task.work_description,
            "work priority": task.priority.value.capitalize(),
            "dead-line": fmt_dt(task.deadline),
            "completed time": fmt_dt(task.completed_at) if task.completed_at else "",
            "Time variance": time_variance,
            "Status": task.status.value.capitalize(),
            "Remarks": remarks_str,
            "points": 1 if task.status == "completed" else 0,
            "created time": fmt_dt(task.created_at),
            "Assigned by": task.created_by_name or "Unknown"
        })

    df = pd.DataFrame(rows)
    # Convert all column names to UPPERCASE as per requirement
    df.columns = [str(c).upper() for c in df.columns]
    return df


async def generate_tasks_csv(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    priority: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    tz_name: Optional[str] = None,
    tenant_id = None,
) -> str:
    """Generate CSV string of task data."""
    df = await _get_task_data(status, employee_id, priority, start_date, end_date, tz_name, tenant_id=tenant_id)
    return df.to_csv(index=False)


async def generate_tasks_excel(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    priority: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    tz_name: Optional[str] = None,
    tenant_id = None,
) -> BytesIO:
    """Generate Excel file of task data."""
    df = await _get_task_data(status, employee_id, priority, start_date, end_date, tz_name, tenant_id=tenant_id)
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Tasks", index=False)
    output.seek(0)
    return output


async def generate_employees_excel(tenant_id=None) -> BytesIO:
    """Generate Excel file of employee data with reward info."""
    user_q = {"role": UserRole.EMPLOYEE.value}
    user_q = _scope(user_q, tenant_id)
    employees = await User.find(user_q).sort("-reward_points").to_list()
    employee_ids = [emp.id for emp in employees]

    if not employee_ids:
        df = pd.DataFrame(columns=[
            "EMPLOYEE ID", "NAME", "EMAIL", "STATUS",
            "REWARD POINTS", "TOTAL TASKS", "COMPLETED TASKS",
            "COMPLETION RATE", "JOINED"
        ])
        output = BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Employees", index=False)
        output.seek(0)
        return output

    # Optimized batch task count using aggregation
    task_match = {"assigned_to": {"$in": employee_ids}}
    task_match = await _scope_tasks(task_match, tenant_id)
    pipeline = [
        {"$match": task_match},
        {"$group": {
            "_id": "$assigned_to",
            "total_tasks": {"$sum": 1},
            "completed_tasks": {
                "$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}
            }
        }}
    ]
    task_stats_list = await Task.aggregate(pipeline).to_list()
    task_stats_map = {str(stat["_id"]): stat for stat in task_stats_list}

    rows = []
    for emp in employees:
        stats = task_stats_map.get(str(emp.id), {"total_tasks": 0, "completed_tasks": 0})
        total_tasks = stats["total_tasks"]
        completed_tasks = stats["completed_tasks"]

        rows.append({
            "Employee ID": str(emp.id),
            "Name": emp.name,
            "Email": emp.email,
            "Status": "Active" if emp.is_active else "Inactive",
            "Reward Points": emp.reward_points,
            "Total Tasks": total_tasks,
            "Completed Tasks": completed_tasks,
            "Completion Rate": f"{(completed_tasks / total_tasks * 100):.1f}%" if total_tasks > 0 else "0%",
            "Joined": emp.created_at.strftime("%d-%m-%Y %H:%M:%S"),
        })

    df = pd.DataFrame(rows)
    # Convert all column names to UPPERCASE as per requirement
    df.columns = [str(c).upper() for c in df.columns]
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Employees", index=False)
    output.seek(0)
    return output


async def generate_attendance_excel(
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    tz_name: Optional[str] = None,
    tenant_id = None,
) -> BytesIO:
    """Generate Excel file of attendance data."""
    query = {}
    if user_id:
        query["user_id"] = PydanticObjectId(user_id)
    
    if start_date:
        query["check_in"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "check_in" in query:
            query["check_in"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["check_in"] = {"$lte": datetime.fromisoformat(end_date)}

    query = _scope(query, tenant_id)

    records = await Attendance.find(query).sort("-check_in").to_list()

    # Pre-fetch user names if needed
    user_map = {}
    if not user_id and records:
        user_ids = list(set([r.user_id for r in records]))
        user_q = {"_id": {"$in": user_ids}}
        user_q = _scope(user_q, tenant_id)
        users = await User.find(user_q).to_list()
        user_map = {u.id: {"name": u.name, "email": u.email} for u in users}

    # Determine timezone for formatting
    tz = ZoneInfo(tz_name) if tz_name else None

    def to_local(dt: datetime) -> datetime:
        """Convert a UTC datetime to local timezone."""
        if dt is None:
            return None
        if tz:
            return dt.replace(tzinfo=timezone.utc).astimezone(tz)
        return dt

    rows = []
    for i, rec in enumerate(records, 1):
        local_check_in = to_local(rec.check_in)
        local_check_out = to_local(rec.check_out) if rec.check_out else None

        # Calculate duration if checked out
        duration_str = ""
        if rec.check_out:
            diff = rec.check_out - rec.check_in
            hours = diff.total_seconds() / 3600
            duration_str = f"{hours:.2f}h"

        row = {
            "S.No": i,
            "Date": local_check_in.strftime("%d-%m-%Y"),
        }

        if not user_id:
            user_info = user_map.get(rec.user_id, {"name": "Unknown", "email": "Unknown"})
            row["Employee Name"] = user_info["name"]
            row["Email"] = user_info["email"]

        row.update({
            "Check In": local_check_in.strftime("%H:%M:%S"),
            "Check Out": local_check_out.strftime("%H:%M:%S") if local_check_out else "N/A",
            "Duration": duration_str,
            "Status": rec.status.upper(),
            "Address (In)": rec.address_in or "",
            "Address (Out)": rec.address_out or "",
            "Remarks": rec.remarks or ""
        })
        rows.append(row)

    df = pd.DataFrame(rows)
    # Convert all column names to UPPERCASE
    df.columns = [str(c).upper() for c in df.columns]
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Attendance", index=False)
    output.seek(0)
    return output


async def generate_leaves_excel(user_id: Optional[str] = None, tenant_id=None) -> BytesIO:
    """Generate Excel file of leave requests."""
    from app.models.leave import Leave
    
    query = {}
    if user_id:
        query["user_id"] = PydanticObjectId(user_id)
        
    query = _scope(query, tenant_id)
    leaves = await Leave.find(query).sort("-created_at").to_list()
    
    # Pre-fetch user names
    user_map = {}
    if not user_id and leaves:
        user_ids = list(set([l.user_id for l in leaves]))
        user_q = {"_id": {"$in": user_ids}}
        user_q = _scope(user_q, tenant_id)
        users = await User.find(user_q).to_list()
        user_map = {u.id: {"name": u.name, "email": u.email} for u in users}
        
    rows = []
    for i, l in enumerate(leaves, 1):
        row = {
            "S.No": i,
        }
        if not user_id:
            user_info = user_map.get(l.user_id, {"name": l.user_name or "Unknown", "email": "Unknown"})
            row["Employee Name"] = user_info["name"]
            row["Email"] = user_info["email"]
            
        days = (l.end_date - l.start_date).days + 1
        row.update({
            "Leave Type": l.leave_type.value.upper(),
            "Start Date": l.start_date.strftime("%d-%m-%Y"),
            "End Date": l.end_date.strftime("%d-%m-%Y"),
            "Total Days": days,
            "Status": l.status.value.upper(),
            "Reason": l.reason,
            "Comments": l.comments or "",
            "Verified By": l.verified_by_name or "",
            "Approved By": l.approved_by_name or "",
            "Created Date": l.created_at.strftime("%d-%m-%Y %H:%M:%S")
        })
        rows.append(row)
        
    df = pd.DataFrame(rows)
    df.columns = [str(c).upper() for c in df.columns]
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Leaves", index=False)
    output.seek(0)
    return output


async def generate_reward_ledger_excel(user_id: Optional[str] = None, tenant_id=None) -> BytesIO:
    """Generate Excel file of reward points ledger entries."""
    from app.models.ledger import RewardLedgerEntry
    
    query = {}
    if user_id:
        query["user_id"] = PydanticObjectId(user_id)
        
    query = _scope(query, tenant_id)
    entries = await RewardLedgerEntry.find(query).sort("-created_at").to_list()
    
    # Pre-fetch user names
    user_map = {}
    if entries:
        user_ids = list(set([e.user_id for e in entries]))
        user_q = {"_id": {"$in": user_ids}}
        user_q = _scope(user_q, tenant_id)
        users = await User.find(user_q).to_list()
        user_map = {u.id: {"name": u.name, "email": u.email} for u in users}
    
    rows = []
    for i, e in enumerate(entries, 1):
        user_info = user_map.get(e.user_id, {"name": "Unknown", "email": "Unknown"})
        row = {
            "S.No": i,
            "Employee Name": user_info["name"],
            "Email": user_info["email"],
            "Amount": e.amount,
            "Transaction Type": e.transaction_type.upper(),
            "Description": e.description or "",
            "Timestamp": e.created_at.strftime("%d-%m-%Y %H:%M:%S")
        }
        rows.append(row)
        
    df = pd.DataFrame(rows)
    df.columns = [str(c).upper() for c in df.columns]
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Reward Points Ledger", index=False)
    output.seek(0)
    return output


async def generate_audit_excel(actor_id: Optional[str] = None, entity_type: Optional[str] = None, tenant_id=None) -> BytesIO:
    """Generate Excel file of audit log events."""
    from app.models.audit_event import AuditEvent
    
    query = {}
    if actor_id:
        query["actor_id"] = PydanticObjectId(actor_id)
    if entity_type:
        query["entity_type"] = entity_type
        
    query = _scope(query, tenant_id)
    events = await AuditEvent.find(query).sort("-timestamp").to_list()
    
    rows = []
    for i, e in enumerate(events, 1):
        row = {
            "S.No": i,
            "Actor Name": e.actor_name or "System",
            "Actor Role": e.actor_role or "System",
            "Action": e.action.upper(),
            "Entity Type": e.entity_type.upper(),
            "Entity ID": str(e.entity_id) if e.entity_id else "",
            "Correlation ID": e.correlation_id or "",
            "IP Address": e.ip_address or "",
            "User Agent": e.user_agent or "",
            "Timestamp": e.timestamp.strftime("%d-%m-%Y %H:%M:%S")
        }
        rows.append(row)
        
    df = pd.DataFrame(rows)
    df.columns = [str(c).upper() for c in df.columns]
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Audit Trails", index=False)
    output.seek(0)
    return output

