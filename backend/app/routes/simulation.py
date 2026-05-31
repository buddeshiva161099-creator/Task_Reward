"""
Simulation routes - seeds the 5 corporate employees and triggers the automated payroll engine to verify payouts.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.user import User, UserRole
from app.models.company import Company
from app.models.task import Task, TaskStatus, TaskPriority, TaskType
from app.models.attendance import Attendance
from app.models.payroll import Payroll, SalaryStructure, PayrollStatus
from app.auth.dependencies import require_admin
from beanie import PydanticObjectId
from datetime import datetime, timedelta
import bcrypt

router = APIRouter(prefix="/simulation", tags=["Simulation Engine"])

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

@router.post("/seed", response_model=dict)
async def seed_simulation_data(admin: User = Depends(require_admin)):
    """Reset and seed the database with the exact 5-employee corporate scenario."""
    # 1. Clean slate for simulation records
    emails = ["sujeeth@corp.com", "mounika@corp.com", "nishitha@corp.com", "umesh@corp.com", "shiva@corp.com"]
    sim_users = await User.find({"email": {"$in": emails}}).to_list()
    sim_user_ids = [u.id for u in sim_users]

    # Delete existing payrolls, attendance, tasks, salary structures
    if sim_user_ids:
        await Payroll.find({"user_id": {"$in": sim_user_ids}}).delete()
        await Attendance.find({"user_id": {"$in": sim_user_ids}}).delete()
        await Task.find({"assigned_to": {"$in": sim_user_ids}}).delete()
        await SalaryStructure.find({"user_id": {"$in": sim_user_ids}}).delete()
        await User.find({"_id": {"$in": sim_user_ids}}).delete()

    # 2. Get or create Company
    company = await Company.find_one(Company.name == "TaskReward Corp")
    if not company:
        company = Company(
            name="TaskReward Corp",
            description="Corporate simulation company for task reward & payroll tracking",
            work_days=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            work_start_time="09:30 AM",
            work_end_time="06:30 PM",
            cut_out_time="10:00 AM",
            task_priority_points={"critical": 10.0, "high": 5.0, "medium": 3.0, "regular": 1.0, "low": 1.0},
            delay_penalties={"on_time": 1.0, "1_day_late": 0.75, "2_days_late": 0.50, "3_days_late": 0.25, "4_plus_days_late": 0.0},
            early_completion_multiplier=1.1,
            quality_multipliers={"rework": 0.8, "standard": 1.0, "exemplary": 1.2},
            attendance_points={"present": 1.0, "late_under_30": 0.75, "late_over_30": 0.50, "excused": 0.0, "unexcused": -1.0, "overtime": 1.25},
            attendance_bonus_threshold=95.0,
            attendance_bonus_percentage=5.0,
            performance_incentive_pool_percentage=25.0
        )
        await company.insert()

    # 3. Create Users
    # Password hash for default 'password123'
    pw_hash = get_password_hash("password123")

    users_data = [
        {"name": "Sujeeth", "email": "sujeeth@corp.com", "role": UserRole.MANAGER, "base_salary": 60000.0, "points": 250.8},
        {"name": "Mounika", "email": "mounika@corp.com", "role": UserRole.ASSISTANT_MANAGER, "base_salary": 50000.0, "points": 190.0},
        {"name": "Nishitha", "email": "nishitha@corp.com", "role": UserRole.HR_MANAGER, "base_salary": 40000.0, "points": 152.0},
        {"name": "Umesh", "email": "umesh@corp.com", "role": UserRole.EMPLOYEE, "base_salary": 30000.0, "points": 109.25},
        {"name": "Shiva", "email": "shiva@corp.com", "role": UserRole.EMPLOYEE, "base_salary": 20000.0, "points": 148.2}
    ]

    seeded_users = {}
    for ud in users_data:
        user = User(
            name=ud["name"],
            email=ud["email"],
            password_hash=pw_hash,
            role=ud["role"],
            company_id=company.id,
            reward_points=ud["points"],
            hiring_date="2026-05-01",
            is_active=True
        )
        await user.insert()
        seeded_users[ud["name"]] = user

        # 4. Salary Structures
        # Base Salary ratios
        basic = ud["base_salary"] * 0.6
        hra = ud["base_salary"] * 0.3
        allowance = ud["base_salary"] * 0.1
        pf = ud["base_salary"] * 0.03
        esi = ud["base_salary"] * 0.01
        tax = ud["base_salary"] * 0.02 if ud["base_salary"] >= 30000 else 200.0

        structure = SalaryStructure(
            user_id=user.id,
            basic=basic,
            hra=hra,
            special_allowance=allowance,
            pf_deduction=pf,
            esi_deduction=esi,
            tax_deduction=tax,
            created_at=datetime.utcnow()
        )
        await structure.insert()
        
        user.salary_structure_id = structure.id
        await user.save()

    # 5. Seed Attendance Logs for 20 workdays in 2026-05
    month_str = "2026-05"
    base_date = datetime(2026, 5, 1)

    # Weekdays in May 2026 (total 21 weekdays)
    weekdays_days = [1, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29]

    for name, user in seeded_users.items():
        logs = []
        if name == "Sujeeth":
            # 20 present days, 5 overtime on weekdays
            for i in range(16):
                d = weekdays_days[i]
                logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 18, 0), status="present"))
            for i in range(16, 21):
                d = weekdays_days[i]
                logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 21, 0), status="approved_overtime", remarks="Approved Overtime shift"))
        elif name == "Mounika":
            # 20 present days -> all 21 weekdays present
            for i in range(21):
                d = weekdays_days[i]
                logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 18, 0), status="present"))
        elif name == "Nishitha":
            # 19 present, 1 excused leave day -> 20 present, 1 excused leave weekday
            for i in range(20):
                d = weekdays_days[i]
                logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 18, 0), status="present"))
            d = weekdays_days[20]
            logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 18, 0), status="excused_leave", remarks="Excused Leave Day"))
        elif name == "Umesh":
            # 15 present, 5 late (>30 min) -> 16 present, 5 late weekdays
            for i in range(16):
                d = weekdays_days[i]
                logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 18, 0), status="present"))
            for i in range(16, 21):
                d = weekdays_days[i]
                logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 10, 15), check_out=datetime(2026, 5, d, 18, 0), status="late_over_30", remarks="Late check-in > 30 mins"))
        elif name == "Shiva":
            # 18 present, 1 late (<30 min), 1 unexcused absence, 2 overtime
            for i in range(17):
                d = weekdays_days[i]
                logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 18, 0), status="present"))
            # 1 day late under 30 min
            d = weekdays_days[17]
            logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 15), check_out=datetime(2026, 5, d, 18, 0), status="late_under_30", remarks="Late check-in < 30 mins"))
            # 2 Overtime shifts
            for i in range(18, 20):
                d = weekdays_days[i]
                logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 21, 0), status="approved_overtime", remarks="Approved Overtime shift"))
            # 1 unexcused absence
            d = weekdays_days[20]
            logs.append(Attendance(user_id=user.id, company_id=company.id, check_in=datetime(2026, 5, d, 9, 0), check_out=datetime(2026, 5, d, 18, 0), status="unexcused_absence", remarks="Unexcused Absence"))

        for l in logs:
            await l.insert()

    # 6. Seed Tasks
    # Shiva also needs strictly more than 5 backlog tasks (>5 "4+ Days Late" tasks) to trigger the backlog penalty.
    for name, user in seeded_users.items():
        points = user.reward_points
        # Completed task holding all of their points
        t_comp = Task(
            work_description=f"Core Work Package for {name}",
            assigned_to=user.id,
            assigned_to_name=user.name,
            created_by=admin.id,
            created_by_name=admin.name,
            priority=TaskPriority.CRITICAL,
            task_type=TaskType.ASSIGNED,
            deadline=base_date + timedelta(days=15),
            completed_at=base_date + timedelta(days=14),
            reward_given=True,
            reward_points=points,
            company_id=company.id,
            company_name=company.name,
            status=TaskStatus.COMPLETED
        )
        await t_comp.insert()

        # Seed Shiva's backlog penalty tasks
        if name == "Shiva":
            # Add 6 overdue tasks with deadlines in April 2026 (strictly more than 5 backlog tasks overdue by 4+ days)
            for b in range(1, 7):
                t_back = Task(
                    work_description=f"Backlog Item #{b} for Shiva",
                    assigned_to=user.id,
                    assigned_to_name=user.name,
                    created_by=admin.id,
                    created_by_name=admin.name,
                    priority=TaskPriority.REGULAR,
                    task_type=TaskType.ASSIGNED,
                    deadline=datetime(2026, 4, 1) + timedelta(days=b),
                    status=TaskStatus.OVERDUE,
                    company_id=company.id,
                    company_name=company.name
                )
                await t_back.insert()

    return {
        "status": "success",
        "message": "Seeded 5 corporate simulation employees, attendance logs, tasks, and salary structures successfully."
    }

@router.post("/run-payroll", response_model=list)
async def run_simulation_payroll(admin: User = Depends(require_admin)):
    """Automatically run automated payroll drafting for all 5 simulation employees and return results."""
    emails = ["sujeeth@corp.com", "mounika@corp.com", "nishitha@corp.com", "umesh@corp.com", "shiva@corp.com"]
    month_str = "2026-05"
    
    payrolls_results = []
    
    for email in emails:
        user = await User.find_one(User.email == email)
        if not user:
            raise HTTPException(status_code=404, detail=f"User {email} not found. Please run seed endpoint first.")

        # Clean existing payroll draft for this month
        existing = await Payroll.find_one(Payroll.user_id == user.id, Payroll.month == month_str)
        if existing:
            await existing.delete()

        # Trigger draft endpoint logic directly
        from app.routes.payroll import create_payroll_draft, PayrollDraftRequest
        draft_req = PayrollDraftRequest(
            user_id=str(user.id),
            month=month_str,
            automated=True
        )
        res = await create_payroll_draft(draft_req, hr_user=admin)
        
        # Reload the created payroll
        payroll = await Payroll.find_one(Payroll.user_id == user.id, Payroll.month == month_str)
        payrolls_results.append({
            "employee_name": user.name,
            "role": user.role.value,
            "base_salary": payroll.base_salary,
            "earned_salary": payroll.earned_salary,
            "overtime_pay": payroll.overtime_pay,
            "incentives": payroll.incentives,
            "bonuses": payroll.bonuses,
            "penalties": payroll.penalties,
            "deductions": payroll.deductions,
            "net_salary": payroll.net_salary,
            "remarks": payroll.remarks
        })

    return payrolls_results
