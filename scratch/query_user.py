import asyncio
from app.database.connection import init_db
from app.models.user import User
from app.models.payroll import SalaryStructure, Payroll

async def main():
    await init_db()
    
    # Query user THaurn
    user = await User.find_one({"name": {"$regex": "THaurn", "$options": "i"}})
    if not user:
        user = await User.get("6a1add3f2674fc5d4274b973")
    
    if user:
        print("USER FOUND:")
        print("ID:", user.id)
        print("Name:", user.name)
        print("Role:", user.role)
        print("Hiring Date:", user.hiring_date)
        print("Created At:", user.created_at)
        
        struct = await SalaryStructure.find_one(SalaryStructure.user_id == user.id)
        if struct:
            print("\nSALARY STRUCTURE:")
            print("Basic:", struct.basic)
            print("HRA:", struct.hra)
            print("Special Allowance:", struct.special_allowance)
            print("PF Deduction:", struct.pf_deduction)
            print("ESI Deduction:", struct.esi_deduction)
            print("Tax Deduction:", struct.tax_deduction)
            
        payroll = await Payroll.find_one(Payroll.user_id == user.id, Payroll.month == "2026-05")
        if payroll:
            print("\nPAYROLL DRAFT:")
            print("Status:", payroll.status)
            print("Base Salary:", payroll.base_salary)
            print("Earned Salary:", payroll.earned_salary)
            print("LOP Deduction:", payroll.lop_deduction)
            print("Net Salary:", payroll.net_salary)
            print("Total Working Days:", payroll.total_working_days)
            print("Present Days:", payroll.present_days)
            print("Absent Days:", payroll.absent_days)
            print("Holidays/Weekends:", payroll.holidays_weekends)
            print("Remarks:", payroll.remarks)
    else:
        print("USER NOT FOUND")

if __name__ == "__main__":
    asyncio.run(main())
