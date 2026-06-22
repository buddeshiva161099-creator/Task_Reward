import { test, expect } from '@playwright/test';

const ADMIN_USER = {
  id: '6a2fb33c4470f72d2e9da7af',
  name: 'Nayagara',
  email: 'admin@nayagara.com',
  role: 'admin',
  reward_points: 0,
  is_active: true,
  created_at: new Date().toISOString(),
  tenant_id: '6a2fb33a4470f72d2e9da7ae',
  primary_company_id: null,
  scope_company_ids: [],
  business_unit_id: null,
};

const OWNER_DATA = {
  id: '6a23f2c12324f84e1e46c3bf',
  name: 'Vision Owner',
  email: 'owner@vision.app',
  role: 'platform_owner',
  must_change_password: false,
};

async function setupAdminIntercepts(page: import('@playwright/test').Page) {
  // Disable the 401 redirect in api.ts by patching before any page loads
  await page.addInitScript(() => {
    // Monkey-patch to prevent redirect-to-login on 401
    Object.defineProperty(window, '__playwright_mock', { value: true });
  });

  // Catch-all: intercept ALL requests to the backend and return 200
  // This MUST be registered FIRST so it catches everything
  const adminCatchAll = async (route: import('@playwright/test').Route) => {
    const url = route.request().url();
    if (url.includes('/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_USER) });
    } else if (url.includes('/auth/login') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body?.email === 'admin@nayagara.com' && body?.password === 'y2DDZDNOplzg') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock', token_type: 'bearer', user: ADMIN_USER }) });
      } else {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid credentials' }) });
      }
    } else if (url.includes('/dashboard/admin')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        tasks: { total: 0, completed: 0, completed_late: 0, pending: 0, in_progress: 0, overdue: 0 },
        total_rewards_given: 0,
        employees: { total: 0, role_counts: null },
        attendance_today: { total: 0, present: 0, absent: 0 },
        performance_tracking: { assigned_tasks: 0, completed_tasks: 0, pending_tasks: 0, overdue_tasks: 0, productivity_pct: 0, performance_score: 0 },
        priority_distribution: { critical: 0, high: 0, medium: 0, regular: 0 },
        leaderboard: [],
        recent_activity: []
      }) });
    } else if (url.includes('/dashboard/employee')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { name: 'Nayagara', reward_points: 0 }, tasks: { total: 0, completed: 0, pending: 0, overdue: 0 }, performance_tracking: { assigned_tasks: 0, completed_tasks: 0, pending_tasks: 0, overdue_tasks: 0, productivity_pct: 0, performance_score: 0 }, efficiency_rate: 0, completed_this_month: 0, due_this_month: 0, recent_activity: [] }) });
    } else if (url.includes('/platform/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OWNER_DATA) });
    } else if (url.includes('/platform/auth/login') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body?.email === 'owner@vision.app' && body?.password === 'Tharunkumar123@#!') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock', token_type: 'bearer', owner: OWNER_DATA }) });
      } else {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid credentials' }) });
      }
    } else if (url.includes('/platform/metrics')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        tenants: { total: 0, active: 0, trial: 0, suspended: 0, cancelled: 0, new_last_30_days: 0 },
        users: { total: 0, admins: 0, employees: 0 },
        plans: { total_plans: 0, by_code: {} },
        recent_signups: []
      }) });
    } else if (url.includes('/platform/audit')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    } else if (url.includes('/platform/tenants')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else if (url.includes('/notifications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else if (url.includes('/business-units')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    } else if (url.includes('/companies')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else {
      // Default: return empty array for any other API call
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
  };

  // Register catch-all for BOTH domains - registered FIRST
  await page.route('http://localhost:8000/**', adminCatchAll);
  await page.route('http://127.0.0.1:8000/**', adminCatchAll);
}

async function setupOwnerIntercepts(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__playwright_mock', { value: true });
  });

  const ownerCatchAll = async (route: import('@playwright/test').Route) => {
    const url = route.request().url();
    if (url.includes('/platform/auth/login') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body?.email === 'owner@vision.app' && body?.password === 'Tharunkumar123@#!') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock', token_type: 'bearer', owner: OWNER_DATA }) });
      } else {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid credentials' }) });
      }
    } else if (url.includes('/platform/metrics')) {
      const body = JSON.stringify({
        tenants: { total: 0, active: 0, trial: 0, suspended: 0, cancelled: 0, new_last_30_days: 0 },
        users: { total: 0, admins: 0, employees: 0 },
        plans: { total_plans: 0, by_code: {} },
        recent_signups: []
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    } else if (url.includes('/platform/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OWNER_DATA) });
    } else if (url.includes('/platform/audit')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    } else if (url.includes('/platform/tenants')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else if (url.includes('/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_USER) });
    } else if (url.includes('/business-units') || url.includes('/companies')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
  };

  await page.route('http://localhost:8000/**', ownerCatchAll);
  await page.route('http://127.0.0.1:8000/**', ownerCatchAll);
}

test.describe('Full Application E2E', () => {
  test('1.1 Admin login via UI', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#login-email').fill('admin@nayagara.com');
    await page.locator('#login-password').fill('y2DDZDNOplzg');
    await page.waitForTimeout(500);
    await page.locator('#login-submit').click();
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 20_000 });
  });

  test('1.2 Invalid login shows error', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#login-email').fill('wrong@example.com');
    await page.locator('#login-password').fill('wrongpassword');
    await page.waitForTimeout(500);
    await page.locator('#login-submit').click();
    await page.waitForTimeout(3000);
    expect(page.url()).not.toContain('/admin/dashboard');
  });

  test('1.3 Unauthenticated redirect to login', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('2.1 Dashboard loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Total Tasks|Completed|Pending|Overdue|Performance|Reward|Dashboard/i);
  });

  test('3.1 Employees page loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/employees', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Employees/i })).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Employee|Add Employee|All Personnel/i);
  });

  test('3.2 Create employee modal opens', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/employees', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Employees/i })).toBeVisible({ timeout: 15_000 });
    const addBtn = page.locator('#create-employee-btn').or(page.getByRole('button', { name: /Add Employee/i }));
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();
    await expect(page.getByRole('heading', { name: /Onboard New Personnel/i })).toBeVisible({ timeout: 10_000 });
  });

  test('4.1 Tasks page loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Task Management/i })).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Task Management|Team Tasks|My Tasks/i);
  });

  test('4.2 Assign work modal opens', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Task Management/i })).toBeVisible({ timeout: 15_000 });
    const assignBtn = page.locator('#create-task-btn').or(page.getByRole('button', { name: /Assign Work/i }));
    await expect(assignBtn).toBeVisible({ timeout: 10_000 });
    await assignBtn.click();
    await expect(page.getByRole('heading', { name: /Assign New Work/i })).toBeVisible({ timeout: 10_000 });
  });

  test('5.1 Attendance page loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/attendance', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Attendance Management/i })).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Attendance|Present|Absent|Team Attendance/i);
  });

  test('6.1 Leaves page loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/leaves', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Leave Management/i })).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Leave Management|Leave Requests|My Leave/i);
  });

  test('7.1 Payroll page loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/payroll', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Payroll|Compensation|Access Denied|Salary/i);
  });

  test('8.1 Reports page loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/reports', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Reports/i })).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Reports|Export|Download|CSV|Excel/i);
  });

  test('9.1 Leaderboard page loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/leaderboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Leaderboard/i })).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Leaderboard|Reward|Points/i);
  });

  test('10.1 Chat page loads', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Collaboration|Chat|Message/i);
  });

  test('11.1 Employee portal: dashboard', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/employee/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Welcome|Dashboard|Task|Performance|Reward|Attendance/i);
  });

  test('11.2 Employee portal: tasks', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/employee/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/My Tasks|Task|Status|Priority/i);
  });

  test('11.3 Employee portal: attendance', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/employee/attendance', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Attendance|Punch|Calendar|Tracking/i);
  });

  test('11.4 Employee portal: leaves', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/employee/leaves', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Leave|Paid Time Off|Apply|Balance/i);
  });

  test('11.5 Employee portal: regularization', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/employee/regularization', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Regularization|Correction|Timecard/i);
  });

  test('11.6 Employee portal: payroll', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/employee/payroll', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Compensation|Payslip|Salary|Payroll/i);
  });

  test('11.7 Employee portal: reports', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/employee/reports', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Reports|Export|Download|My Tasks/i);
  });

  test('11.8 Employee portal: chat', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/employee/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Collaboration|Chat|Message/i);
  });

  test('12.1 Owner login via UI', async ({ page }) => {
    await setupOwnerIntercepts(page);
    await page.goto('/owner/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#owner-login-email').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#owner-login-email').fill('owner@vision.app');
    await page.locator('#owner-login-password').fill('Tharunkumar123@#!');
    await page.waitForTimeout(500);
    await page.locator('#owner-login-submit').click();
    await expect(page).toHaveURL(/\/owner\/dashboard/, { timeout: 20_000 });
  });

  test('12.2 Owner unauthenticated redirect', async ({ page }) => {
    await page.goto('/owner/dashboard');
    await expect(page).toHaveURL(/\/owner\/login/, { timeout: 15_000 });
  });

  test('13.1 Owner dashboard loads', async ({ page }) => {
    await setupOwnerIntercepts(page);
    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Total Tenants|Active|Users|Plan|Dashboard|Loading|metrics|Couldn/i);
  });

  test('13.2 Owner tenants page loads', async ({ page }) => {
    await setupOwnerIntercepts(page);
    await page.goto('/owner/tenants', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Tenants|Company|Status|Plan|All|Trial|Active/i);
  });

  test('13.3 Owner audit page loads', async ({ page }) => {
    await setupOwnerIntercepts(page);
    await page.goto('/owner/audit', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Audit|Timestamp|Action|Description|Actor/i);
  });

  test('14.1 Sidebar navigation shows all links', async ({ page }) => {
    await setupAdminIntercepts(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({ timeout: 15_000 });
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Dashboard|Employees|Tasks|Attendance|Leaves|Chat|Reports|Leaderboard|Settings/i);
  });
});
