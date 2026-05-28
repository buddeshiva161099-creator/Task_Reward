import urllib.request
import urllib.parse
import json
import sys

def make_request(url, data=None, headers=None, method="GET"):
    if headers is None:
        headers = {}
    
    req_data = None
    if data is not None:
        req_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode("utf-8")
            return response.status, json.loads(res_data)
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        print(f"HTTP Error {e.code} for {url}: {err_content}")
        return e.code, err_content
    except Exception as e:
        print(f"Connection Error: {e}")
        return 0, str(e)

def main():
    base_url = "http://localhost:8000"
    print("=== AUTOMATED SIMULATION VERIFICATION ===")
    
    # 1. Login as Admin
    print("1. Logging in as Admin...")
    login_url = f"{base_url}/auth/login"
    login_data = {
        "email": "admin@company.com",
        "password": "Admin@123"
    }
    
    status, res = make_request(login_url, data=login_data, method="POST")
    if status != 200:
        print(f"Failed to login: {status} - {res}")
        sys.exit(1)
    
    token = res["access_token"]
    print("Login successful! Access token obtained.")
        
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    # 2. Trigger Seed
    print("\n2. Seeding simulation data...")
    seed_url = f"{base_url}/simulation/seed"
    status, res = make_request(seed_url, headers=headers, method="POST")
    if status != 200:
        print(f"Failed to seed data: {status} - {res}")
        sys.exit(1)
    print(f"Seeding result: {res['message']}")
        
    # 3. Run Simulation Payroll
    print("\n3. Running simulated payroll...")
    run_url = f"{base_url}/simulation/run-payroll"
    status, results = make_request(run_url, headers=headers, method="POST")
    if status != 200:
        print(f"Failed to run simulation payroll: {status} - {results}")
        sys.exit(1)
        
    print(f"Obtained {len(results)} payroll draft results.")
        
    # Expected Gross Pay figures:
    # Sujeeth: Rs. 85,500
    # Mounika: Rs. 65,000
    # Nishitha: Rs. 52,000
    # Umesh: Rs. 32,625
    # Shiva: Rs. 24,750
    
    expected = {
        "Sujeeth": 85500.0,
        "Mounika": 65000.0,
        "Nishitha": 52000.0,
        "Umesh": 32625.0,
        "Shiva": 24750.0
    }
    
    failed = False
    print("\n=== VERIFYING RESULTS ===")
    for res in results:
        name = res["employee_name"]
        base_salary = res["base_salary"]
        incentives = res["incentives"]
        bonuses = res["bonuses"]
        deductions = res["deductions"]
        remarks = res["remarks"]
        
        calculated_gross = base_salary + incentives + bonuses - deductions
        
        target = expected.get(name, 0.0)
        print(f"\nEmployee: {name}")
        print(f"  Base Salary: Rs. {base_salary:,.2f}")
        print(f"  Performance Incentive: Rs. {incentives:,.2f}")
        print(f"  Bonuses (incl. Attendance): Rs. {bonuses:,.2f}")
        print(f"  Deductions: Rs. {deductions:,.2f}")
        print(f"  Calculated Gross Pay: Rs. {calculated_gross:,.2f}")
        print(f"  Remarks: {remarks}")
        
        if abs(calculated_gross - target) > 1e-2:
            print(f"  [FAIL] Expected Gross Pay Rs. {target:,.2f}, but got Rs. {calculated_gross:,.2f}!")
            failed = True
        else:
            print(f"  [PASS] Gross Pay matches expected Rs. {target:,.2f}!")
            
    if failed:
        print("\n=== VERIFICATION STATUS: FAILED ===")
        sys.exit(1)
    else:
        print("\n=== VERIFICATION STATUS: ALL PASSED SUCCESSFULLY! ===")
        sys.exit(0)

if __name__ == "__main__":
    main()
