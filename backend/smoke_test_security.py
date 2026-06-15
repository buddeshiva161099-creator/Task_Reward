"""Security Remediation Smoke Test.

Verifies:
1. Cookie setting on login (access_token and owner_access_token cookies with httponly/SameSite=Lax).
2. HTTP Security headers presence and information leakage headers removal.
3. Secure, authenticated, tenant-isolated uploads route.
4. Token version increment and revocation on password change.
"""
import json
import time
import urllib.request
import urllib.error
import os
from http.cookies import SimpleCookie
from pymongo import MongoClient

API = "http://127.0.0.1:8000"
OWNER_PASSWORD = "Tharunkumar123@#!"


def load_env():
    env = {}
    if os.path.exists(".env"):
        with open(".env") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        env[parts[0].strip()] = parts[1].strip()
    return env


def parse_cookies(headers):
    cookies = {}
    set_cookies = headers.get_all("Set-Cookie")
    if set_cookies:
        for cookie_str in set_cookies:
            c = SimpleCookie()
            c.load(cookie_str)
            for key, morsel in c.items():
                cookies[key] = {
                    "value": morsel.value,
                    "httponly": bool(morsel.get("httponly")),
                    "samesite": morsel.get("samesite") or "",
                    "secure": bool(morsel.get("secure")),
                }
    return cookies


def req(method, path, body=None, token=None, cookies_dict=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    # Format cookie header if cookies are provided
    if cookies_dict:
        cookie_header = "; ".join([f"{k}={v}" for k, v in cookies_dict.items()])
        headers["Cookie"] = cookie_header

    data = None
    if body is not None:
        data = json.dumps(body).encode()

    r = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            resp_headers = resp.info()
            is_json = "application/json" in resp_headers.get("Content-Type", "")
            if is_json:
                return resp.status, json.loads(raw) if raw else {}, resp_headers
            else:
                return resp.status, raw, resp_headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        resp_headers = e.info()
        is_json = "application/json" in resp_headers.get("Content-Type", "")
        if is_json:
            try:
                return e.code, json.loads(raw), resp_headers
            except Exception:
                return e.code, {"raw": raw}, resp_headers
        else:
            return e.code, raw, resp_headers


def main():
    print("==================================================")
    print(" RUNNING SECURITY REMEDIATION SMOKE TESTS")
    print("==================================================")

    # Load DB configuration to find correct users and tenants dynamically
    env = load_env()
    mongo_url = env.get("MONGODB_URL", "mongodb://localhost:27017")
    
    client = MongoClient(mongo_url)
    
    db_name = env.get("DATABASE_NAME", "employee_task_reward_atlas_1_db")
        
    print(f"Connecting to MongoDB: {mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url} DB: {db_name}")
    db = client[db_name]
    
    # Find Platform Owner
    owner_user = db["users"].find_one({"role": "platform_owner"})
    if not owner_user:
        raise SystemExit("[ERROR] No platform owner user found in database.")
    owner_email = owner_user["email"]
    print(f"Discovered Platform Owner: {owner_email}")

    # Find Tenant
    tenant = db["tenants"].find_one()
    if not tenant:
        raise SystemExit("[ERROR] No tenant found in database.")
    tenant_id = str(tenant["_id"])
    tenant_name = tenant.get("name")
    print(f"Discovered Tenant: {tenant_name} (ID: {tenant_id})")

    # Find Tenant Admin
    admin_user = db["users"].find_one({"role": "admin", "tenant_id": tenant["_id"]})
    if not admin_user:
        raise SystemExit(f"[ERROR] No admin user found for tenant {tenant_id}.")
    admin_email = admin_user["email"]
    admin_id = str(admin_user["_id"])
    print(f"Discovered Tenant Admin: {admin_email} (ID: {admin_id})")

    # 1. PLATFORM OWNER LOGIN & COOKIE SETTING
    print("\n[TEST 1] Platform Owner Login & Cookie setting")
    s, b, h = req("POST", "/platform/auth/login", {"email": owner_email, "password": OWNER_PASSWORD})
    assert s == 200, f"Platform owner login failed: {s} {b}"
    owner_token = b["access_token"]
    cookies = parse_cookies(h)
    
    assert "owner_access_token" in cookies, "owner_access_token cookie not found in response headers"
    owner_cookie_info = cookies["owner_access_token"]
    assert owner_cookie_info["httponly"], "owner_access_token must have HttpOnly attribute"
    assert owner_cookie_info["samesite"].lower() == "lax", f"owner_access_token SameSite attribute is {owner_cookie_info['samesite']}, expected Lax"
    print("  -> OK (owner_access_token cookie set correctly with HttpOnly, SameSite=Lax)")

    # 2. HTTP SECURITY HEADERS
    print("\n[TEST 2] HTTP Security Headers Presence & Info Leakage Removal")
    s_h, _, h_h = req("GET", "/")
    
    assert "Content-Security-Policy" in h_h, "CSP header is missing"
    assert "X-Frame-Options" in h_h, "X-Frame-Options is missing"
    assert "X-Content-Type-Options" in h_h, "X-Content-Type-Options is missing"
    assert "Referrer-Policy" in h_h, "Referrer-Policy is missing"
    assert "Permissions-Policy" in h_h, "Permissions-Policy is missing"
    
    assert "X-Powered-By" not in h_h, "X-Powered-By header was not stripped"
    if "Server" in h_h:
        print(f"  [WARNING] Server header is present: '{h_h['Server']}'. "
              "Note: Local Uvicorn appends this header unless started with --no-server-header. "
              "Ensure production deployments run Uvicorn with --no-server-header or strip it at the proxy layer.")
    
    print(f"  -> CSP: {h_h['Content-Security-Policy']}")
    print(f"  -> X-Frame-Options: {h_h['X-Frame-Options']}")
    print(f"  -> X-Content-Type-Options: {h_h['X-Content-Type-Options']}")
    print("  -> OK (All security headers present and information leakage headers stripped)")

    # 3. TENANT ADMIN LOGIN & COOKIE SETTING
    print("\n[TEST 3] Tenant Admin Login & Cookie setting")
    print("  Resetting Tenant Admin password via Platform Owner API...")
    s_reset, b_reset, _ = req(
        "POST", 
        f"/platform/tenants/{tenant_id}/admins/{admin_id}/reset-password", 
        token=owner_token
    )
    assert s_reset == 200, f"Reset tenant admin password failed: {s_reset} {b_reset}"
    temp_pw_a = b_reset["temp_password"]
    
    s_login, b_login, h_login = req("POST", "/auth/login", {"email": admin_email, "password": temp_pw_a})
    assert s_login == 200, f"Tenant admin login failed: {s_login} {b_login}"
    
    cookies_a = parse_cookies(h_login)
    assert "access_token" in cookies_a, "access_token cookie not found in login response headers"
    admin_cookie_info = cookies_a["access_token"]
    assert admin_cookie_info["httponly"], "access_token must have HttpOnly attribute"
    assert admin_cookie_info["samesite"].lower() == "lax", f"access_token SameSite attribute is {admin_cookie_info['samesite']}, expected Lax"
    print("  -> OK (access_token cookie set correctly with HttpOnly, SameSite=Lax)")
    
    # Create Tenant B and Admin B to test isolation
    print("\nCreating Tenant B for isolation testing...")
    suffix = str(int(time.time()))
    tenant_b_payload = {
        "tenant_name": f"SecTest B {suffix}",
        "name": f"SecTest B {suffix}",
        "slug": f"sectest-{suffix}",
        "domain": f"sectest-{suffix}.test",
        "industry": "Testing",
        "company_size": "1-10",
        "country": "IN",
        "timezone": "Asia/Kolkata",
        "currency": "INR",
        "primary_contact_name": "Admin B",
        "primary_contact_email": f"admin_b_{suffix}@test.com",
        "admin_name": "Admin B",
        "admin_email": f"admin_b_{suffix}@test.com",
        "admin_password": "TempPassB1!",
        "plan_code": "starter",
    }
    s_b, b_b, _ = req("POST", "/platform/tenants", tenant_b_payload, token=owner_token)
    assert s_b in (200, 201), f"Onboard Tenant B failed: {s_b} {b_b}"
    
    temp_pw_b = b_b.get("temp_password") or "TempPassB1!"
    admin_b_email = f"admin_b_{suffix}@test.com"
    
    # Log in as Tenant B admin
    s_login_b, b_login_b, h_login_b = req("POST", "/auth/login", {"email": admin_b_email, "password": temp_pw_b})
    assert s_login_b == 200, f"Tenant B admin login failed: {s_login_b} {b_login_b}"
    cookies_b = parse_cookies(h_login_b)
    assert "access_token" in cookies_b, "access_token cookie not found in Tenant B login response"

    # 4. SECURED UPLOADS & TENANT ISOLATION
    print("\n[TEST 4] Secured Uploads & Tenant Isolation Scoping")
    # Prepare dummy files in uploads directory
    tenant_a_dir = os.path.join("uploads", "chat", f"tenant_{tenant_id}")
    os.makedirs(tenant_a_dir, exist_ok=True)
    test_file_path = os.path.join(tenant_a_dir, "test_sec.txt")
    with open(test_file_path, "w") as f:
        f.write("CONFIDENTIAL_TENANT_A_SECRET_KEY")

    # Try accessing file unauthenticated
    file_url = f"/uploads/chat/tenant_{tenant_id}/test_sec.txt"
    s_file_unauth, b_file_unauth, _ = req("GET", file_url)
    assert s_file_unauth == 401, f"Expected 401 for unauthenticated file read, got: {s_file_unauth} {b_file_unauth}"
    print("  -> OK (Unauthenticated access blocked: 401)")

    # Try accessing file with Tenant A credentials (as cookie)
    s_file_a, b_file_a, _ = req("GET", file_url, cookies_dict={"access_token": cookies_a["access_token"]["value"]})
    assert s_file_a == 200, f"Expected 200 for Tenant A admin, got: {s_file_a} {b_file_a}"
    assert b_file_a == "CONFIDENTIAL_TENANT_A_SECRET_KEY", f"Expected file content, got: {b_file_a}"
    print("  -> OK (Tenant A admin can view their own file)")

    # Try accessing file with Platform Owner credentials (as cookie)
    s_file_owner, b_file_owner, _ = req("GET", file_url, cookies_dict={"owner_access_token": cookies["owner_access_token"]["value"]})
    assert s_file_owner == 200, f"Expected 200 for Platform Owner, got: {s_file_owner} {b_file_owner}"
    assert b_file_owner == "CONFIDENTIAL_TENANT_A_SECRET_KEY", f"Expected file content, got: {b_file_owner}"
    print("  -> OK (Platform Owner can view the file)")

    # Try accessing file with Tenant B credentials (as cookie)
    s_file_b, b_file_b, _ = req("GET", file_url, cookies_dict={"access_token": cookies_b["access_token"]["value"]})
    assert s_file_b == 403, f"Expected 403 for Tenant B admin, got: {s_file_b} {b_file_b}"
    print("  -> OK (Tenant B admin is blocked from accessing Tenant A's file: 403)")

    # Clean up test file
    if os.path.exists(test_file_path):
        os.remove(test_file_path)

    # 5. TOKEN REVOCATION ON PASSWORD CHANGE
    print("\n[TEST 5] Token version check & invalidation on Password Change")
    # Log in again as Tenant B to get fresh cookies
    s_fresh, b_fresh, h_fresh = req("POST", "/auth/login", {"email": admin_b_email, "password": temp_pw_b})
    cookies_fresh_b = parse_cookies(h_fresh)
    access_token_b = cookies_fresh_b["access_token"]["value"]

    # Verify that we can access /auth/me with the current cookie
    s_me, b_me, _ = req("GET", "/auth/me", cookies_dict={"access_token": access_token_b})
    assert s_me == 200, f"Initial access to /auth/me failed: {s_me} {b_me}"
    
    # Change password for Tenant B admin
    new_pw = "NewPassword123@#!"
    s_chg, b_chg, _ = req(
        "POST", 
        "/auth/change-password", 
        {"current_password": temp_pw_b, "new_password": new_pw},
        cookies_dict={"access_token": access_token_b}
    )
    assert s_chg == 200, f"Password change failed: {s_chg} {b_chg}"
    print("  Password changed successfully.")

    # Try using the old cookie on /auth/me (should fail with 401 because token_version in user has incremented)
    s_me_old, b_me_old, _ = req("GET", "/auth/me", cookies_dict={"access_token": access_token_b})
    assert s_me_old == 401, f"Expected 401 for invalidated token, got: {s_me_old} {b_me_old}"
    assert "invalidated" in str(b_me_old.get("detail", "")).lower(), f"Unexpected error detail: {b_me_old}"
    print("  -> OK (Old token properly rejected after password change)")

    # Login with the new password and verify success
    s_new_login, b_new_login, h_new_login = req("POST", "/auth/login", {"email": admin_b_email, "password": new_pw})
    assert s_new_login == 200, f"Login with new password failed: {s_new_login} {b_new_login}"
    print("  -> OK (Can log in with new password)")

    print("\n==================================================")
    print(" ALL SECURITY SMOKE TESTS COMPLETED SUCCESSFULLY!")
    print("==================================================")


if __name__ == "__main__":
    main()
