import { test, expect } from '@playwright/test';
import path from 'path';

const SS = path.join(__dirname, '..', '..', 'test-results', 'dialog-screenshots');

const ADMIN_USER = {
  id: '6a2fb33c4470f72d2e9da7af', name: 'Nayagara', email: 'admin@nayagara.com',
  role: 'admin', reward_points: 0, is_active: true, created_at: new Date().toISOString(),
  tenant_id: '6a2fb33a4470f72d2e9da7ae', primary_company_id: null, scope_company_ids: [], business_unit_id: null,
};

const OWNER_DATA = {
  id: '6a23f2c12324f84e1e46c3bf', name: 'Vision Owner', email: 'owner@vision.app',
  role: 'platform_owner', must_change_password: false,
};

const EMPLOYEE_USER = { ...ADMIN_USER, role: 'employee', name: 'Alice Johnson', id: 'emp1', email: 'alice@test.com' };

const MOCK_EMPLOYEES = [
  { id: 'emp1', name: 'Alice Johnson', email: 'alice@test.com', role: 'employee', is_active: true, reward_points: 150, tenant_id: '6a2fb33a4470f72d2e9da7ae', created_at: '2025-01-15' },
  { id: 'emp2', name: 'Bob Smith', email: 'bob@test.com', role: 'employee', is_active: true, reward_points: 80, tenant_id: '6a2fb33a4470f72d2e9da7ae', created_at: '2025-02-20' },
  { id: 'emp3', name: 'Carol White', email: 'carol@test.com', role: 'manager', is_active: true, reward_points: 200, tenant_id: '6a2fb33a4470f72d2e9da7ae', created_at: '2025-03-10' },
];

const MOCK_TASKS = [
  { id: 'task1', title: 'Design homepage', description: 'Create wireframes for homepage', work_description: 'Create wireframes for homepage', status: 'pending', priority: 'high', assigned_to: 'emp1', assigned_to_name: 'Alice Johnson', created_by: '6a2fb33c4470f72d2e9da7af', tenant_id: '6a2fb33a4470f72d2e9da7ae', due_date: '2026-07-01', reward_points: 50, created_at: '2025-06-01', category: 'Design', company_id: null, remarks: [], category_names: ['Design'] },
  { id: 'task2', title: 'Fix login bug', description: 'Resolve auth timeout', work_description: 'Resolve auth timeout', status: 'in_progress', priority: 'critical', assigned_to: 'emp2', assigned_to_name: 'Bob Smith', created_by: '6a2fb33c4470f72d2e9da7af', tenant_id: '6a2fb33a4470f72d2e9da7ae', due_date: '2026-06-20', reward_points: 100, created_at: '2025-06-10', category: 'Bug', company_id: null, remarks: [], category_names: ['Bug'] },
];

const MOCK_COMPANIES = [
  { id: 'comp1', name: 'Acme Corp', description: 'Main company', is_active: true, created_at: '2025-01-01' },
  { id: 'comp2', name: 'Tech Solutions', description: 'Tech division', is_active: true, created_at: '2025-02-01' },
];

const MOCK_CATEGORIES = [
  { id: 'cat1', name: 'Design', color: '#6366f1', tenant_id: '6a2fb33a4470f72d2e9da7ae' },
  { id: 'cat2', name: 'Development', color: '#22c55e', tenant_id: '6a2fb33a4470f72d2e9da7ae' },
];

const MOCK_BUSINESS_UNITS = [
  { id: 'bu1', name: 'Engineering', type: 'department', is_default: false, company_id: 'comp1' },
  { id: 'bu2', name: 'Marketing', type: 'department', is_default: false, company_id: 'comp1' },
];

const MOCK_HOLIDAYS = [
  { id: 'hol1', name: 'Independence Day', date: '2026-08-15', tenant_id: '6a2fb33a4470f72d2e9da7ae' },
  { id: 'hol2', name: 'Diwali', date: '2026-10-20', tenant_id: '6a2fb33a4470f72d2e9da7ae' },
];

const MOCK_PAYROLL = [
  { id: 'pay1', employee_id: 'emp1', employee_name: 'Alice Johnson', month: 6, year: 2026, basic: 30000, hra: 12000, allowance: 5000, pf: 3600, esi: 0, tax: 1500, net_pay: 41900, status: 'draft', days_worked: 26, lop_days: 0, advance_deduction: 0 },
];

const MOCK_NOTIFICATIONS = [
  { id: 'notif1', title: 'New task assigned', message: 'You have been assigned a new task', is_read: false, created_at: '2026-06-15T10:00:00' },
];

const MOCK_CHAT_CONTACTS = [
  { id: 'emp1', name: 'Alice Johnson', role: 'employee', is_online: true, last_message: 'Hello', last_message_time: '2026-06-15T10:00:00' },
];

const MOCK_METRICS = {
  tenants: { total: 5, active: 3, trial: 1, suspended: 1, cancelled: 0, new_last_30_days: 2 },
  users: { total: 15, admins: 3, employees: 12 },
  plans: { total_plans: 3, by_code: { premium: 2, basic: 1 } },
  recent_signups: [
    { id: 'u1', name: 'Alice Johnson', email: 'alice@test.com', role: 'employee', tenant_id: 't1', created_at: '2026-06-10T12:00:00Z' }
  ]
};

async function interceptAdmin(page: import('@playwright/test').Page) {
  await page.addInitScript(() => { Object.defineProperty(window, '__playwright_mock', { value: true }); });
  const h = async (route: import('@playwright/test').Route) => {
    const u = route.request().url(), m = route.request().method();
    const ok = (b: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    const emp = (b: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('/auth/me')) return ok(ADMIN_USER);
    if (u.includes('/auth/login') && m === 'POST') return ok({ access_token: 'mock', token_type: 'bearer', user: ADMIN_USER });
    if (u.includes('/dashboard/admin')) return ok({ tasks: { total: 5, completed: 2, completed_late: 0, pending: 2, in_progress: 1, overdue: 0 }, total_rewards_given: 150, employees: { total: 3, role_counts: { employee: 2, manager: 1 } }, attendance_today: { total: 3, present: 2, absent: 1 }, performance_tracking: { assigned_tasks: 5, completed_tasks: 2, pending_tasks: 2, overdue_tasks: 0, productivity_pct: 40, performance_score: 75 }, priority_distribution: { critical: 1, high: 1, medium: 2, regular: 1 }, leaderboard: [{ user_id: 'emp1', name: 'Alice Johnson', reward_points: 150, rank: 1 }], recent_activity: [] });
    if (u.includes('/employees') && !u.includes('/employees/') && m === 'GET') return ok(MOCK_EMPLOYEES);
    if (u.includes('/employees') && m === 'POST') return ok({ id: 'new_emp', created_at: new Date().toISOString() });
    if (u.includes('/tasks') && !u.includes('/tasks/') && m === 'GET') return ok(MOCK_TASKS);
    if (u.includes('/tasks') && m === 'POST') return ok({ id: 'new_task' });
    if (u.includes('/companies/all') || (u.includes('/companies') && m === 'GET')) return ok(MOCK_COMPANIES);
    if (u.includes('/companies') && m === 'POST') return ok({ id: 'new_comp', is_active: true });
    if (u.includes('/categories') && m === 'GET') return ok(MOCK_CATEGORIES);
    if (u.includes('/categories') && m === 'POST') return ok({ id: 'new_cat' });
    if (u.includes('/business-units') && m === 'GET') return ok({ items: MOCK_BUSINESS_UNITS });
    if (u.includes('/business-units') && m === 'POST') return ok({ id: 'new_bu' });
    if (u.includes('/holidays') && m === 'GET') return ok(MOCK_HOLIDAYS);
    if (u.includes('/holidays') && m === 'POST') return ok({ id: 'new_hol' });
    if (u.includes('/payroll') && m === 'GET') return ok(MOCK_PAYROLL);
    if (u.includes('/attendance') || u.includes('/leaves') || u.includes('/leaderboard') || u.includes('/reports')) return ok([]);
    if (u.includes('/notifications')) return ok(MOCK_NOTIFICATIONS);
    if (u.includes('/chat/contacts')) return ok(MOCK_CHAT_CONTACTS);
    if (u.includes('/chat/messages') || u.includes('/chat/groups')) return ok([]);
    if (u.includes('/search')) return ok({ employees: [], companies: [], tasks: [] });
    if (u.includes('/ai/')) return ok({ message: 'AI assistant available', suggestions: [] });
    if (u.includes('/dashboard/employee')) return ok({ user: { name: 'Nayagara', reward_points: 0 }, tasks: { total: 0, completed: 0, pending: 0, overdue: 0 }, performance_tracking: { assigned_tasks: 0, completed_tasks: 0, pending_tasks: 0, overdue_tasks: 0, productivity_pct: 0, performance_score: 0 }, efficiency_rate: 0, completed_this_month: 0, due_this_month: 0, recent_activity: [] });
    if (u.includes('/platform/metrics')) return ok(MOCK_METRICS);
    if (u.includes('/platform/audit-log')) return ok({ items: [], total: 0 });
    if (u.includes('/platform/')) return ok(OWNER_DATA);
    return ok([]);
  };
  await page.route('http://localhost:8000/**', h);
  await page.route('http://127.0.0.1:8000/**', h);
}

async function interceptEmployee(page: import('@playwright/test').Page) {
  await page.addInitScript(() => { Object.defineProperty(window, '__playwright_mock', { value: true }); });
  const h = async (route: import('@playwright/test').Route) => {
    const u = route.request().url(), m = route.request().method();
    const ok = (b: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('/auth/me')) return ok(EMPLOYEE_USER);
    if (u.includes('/auth/login') && m === 'POST') return ok({ access_token: 'mock', token_type: 'bearer', user: EMPLOYEE_USER });
    if (u.includes('/dashboard/employee')) return ok({ user: { name: 'Alice Johnson', reward_points: 150 }, tasks: { total: 5, completed: 2, pending: 2, overdue: 1 }, performance_tracking: { assigned_tasks: 5, completed_tasks: 2, pending_tasks: 2, overdue_tasks: 1, productivity_pct: 40, performance_score: 75 }, efficiency_rate: 75, completed_this_month: 2, due_this_month: 3, recent_activity: [] });
    if (u.includes('/tasks') && m === 'GET') return ok(MOCK_TASKS);
    if (u.includes('/tasks') && m === 'POST') return ok({ id: 'new_task' });
    if (u.includes('/attendance') || u.includes('/leaves') || u.includes('/payroll') || u.includes('/reports')) return ok([]);
    if (u.includes('/notifications')) return ok(MOCK_NOTIFICATIONS);
    if (u.includes('/chat/')) return ok([]);
    if (u.includes('/search')) return ok({ employees: [], companies: [], tasks: [] });
    if (u.includes('/ai/')) return ok({ message: 'AI assistant available', suggestions: [] });
    if (u.includes('/business-units') || u.includes('/companies')) return ok({ items: [] });
    if (u.includes('/platform/')) return ok([]);
    return ok([]);
  };
  await page.route('http://localhost:8000/**', h);
  await page.route('http://127.0.0.1:8000/**', h);
}

async function ss(page: import('@playwright/test').Page, name: string, fullPage = false) {
  await page.screenshot({ path: path.join(SS, name), fullPage });
}

test.describe('Dialog Screenshots', () => {
  test('A01: Admin Global Search', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('button[aria-label="Open search"]');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A01-admin-global-search.png');
  });

  test('A02: Admin Notification Bell', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('button[aria-label="View notifications"]');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A02-admin-notifications.png');
  });

  test('A03: Admin AI Copilot', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('button[aria-label="Open AI Copilot"]');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A03-admin-ai-copilot.png');
  });

  test('A04: Admin Change Password', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const gear = page.locator('header button[aria-label="Open settings"]');
    if (await gear.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gear.hover(); await page.waitForTimeout(500);
      const pwd = page.getByRole('button', { name: 'Password' });
      if (await pwd.isVisible({ timeout: 2000 }).catch(() => false)) { await pwd.click(); await page.waitForTimeout(1000); }
    }
    await ss(page, 'A04-admin-change-password.png');
  });

  test('A05: Admin Create Employee', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/employees', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('#create-employee-btn');
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A05-admin-create-employee.png');
  });

  test('A06: Admin Assign Work', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('#create-task-btn');
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A06-admin-create-task.png');
  });

  test('A07: Admin New Company', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/companies', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.getByRole('button', { name: 'New Company' });
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A07-admin-create-company.png');
  });

  test('A08: Admin New Category', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/settings/categories', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.getByRole('button', { name: 'New Category' });
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A08-admin-create-category.png');
  });

  test('A09: Admin New Business Unit', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/settings/business-units', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.getByRole('button', { name: 'New Business Unit' });
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A09-admin-create-business-unit.png');
  });

  test('A10: Admin Add Holiday', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/settings/holidays', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('button:has-text("Add Holiday")').first();
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A10-admin-add-holiday.png');
  });

  test('A11: Admin Chat Create Group', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const btn = page.locator('button[title="Create Group"]');
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'A11-admin-chat-create-group.png');
  });

  test('A12: Admin Scope Switcher', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btns = page.locator('header button').filter({ hasText: /Company|BU|Scope|Nayagara/ });
    if (await btns.count() > 0) { await btns.first().click(); await page.waitForTimeout(1000); }
    await ss(page, 'A12-admin-scope-switcher.png');
  });

  test('E01: Employee Global Search', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('button[aria-label="Open search"]');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'E01-employee-global-search.png');
  });

  test('E02: Employee Notification Bell', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('button[aria-label="View notifications"]');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'E02-employee-notifications.png');
  });

  test('E03: Employee AI Copilot', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('button[aria-label="Open AI Copilot"]');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'E03-employee-ai-copilot.png');
  });

  test('E04: Employee Change Password', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const gear = page.locator('header button[aria-label="Open settings"]');
    if (await gear.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gear.hover(); await page.waitForTimeout(500);
      const pwd = page.getByRole('button', { name: 'Change Password' });
      if (await pwd.isVisible({ timeout: 2000 }).catch(() => false)) { await pwd.click(); await page.waitForTimeout(1000); }
    }
    await ss(page, 'E04-employee-change-password.png');
  });

  test('E05: Employee Create Personal Task', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const btn = page.locator('#create-personal-task-btn');
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'E05-employee-create-personal-task.png');
  });

  test('E06: Employee Chat Create Group', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const btn = page.locator('button[title="Create Group"]');
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1000); }
    await ss(page, 'E06-employee-chat-create-group.png');
  });

  test('P01: Admin Dashboard page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P01-admin-dashboard.png', true);
  });

  test('P02: Admin Employees page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/employees', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P02-admin-employees.png', true);
  });

  test('P03: Admin Tasks page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P03-admin-tasks.png', true);
  });

  test('P04: Admin Attendance page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/attendance', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P04-admin-attendance.png', true);
  });

  test('P05: Admin Leaves page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/leaves', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P05-admin-leaves.png', true);
  });

  test('P06: Admin Payroll page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/payroll', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P06-admin-payroll.png', true);
  });

  test('P07: Admin Reports page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/reports', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P07-admin-reports.png', true);
  });

  test('P08: Admin Leaderboard page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/leaderboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P08-admin-leaderboard.png', true);
  });

  test('P09: Admin Chat page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P09-admin-chat.png', true);
  });

  test('P10: Admin Companies page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/companies', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P10-admin-companies.png', true);
  });

  test('P11: Employee Dashboard page', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P11-employee-dashboard.png', true);
  });

  test('P12: Employee Tasks page', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P12-employee-tasks.png', true);
  });

  test('P13: Employee Attendance page', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/attendance', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P13-employee-attendance.png', true);
  });

  test('P14: Employee Leaves page', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/leaves', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P14-employee-leaves.png', true);
  });

  test('P15: Employee Payroll page', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/payroll', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P15-employee-payroll.png', true);
  });

  test('P16: Employee Chat page', async ({ page }) => {
    await interceptEmployee(page);
    await page.goto('/employee/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P16-employee-chat.png', true);
  });

  test('P17: Admin Settings Categories page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/settings/categories', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P17-admin-categories.png', true);
  });

  test('P18: Admin Settings Business Units page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/settings/business-units', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P18-admin-business-units.png', true);
  });

  test('P19: Admin Settings Holidays page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/admin/settings/holidays', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P19-admin-holidays.png', true);
  });

  test('P20: Owner Dashboard page', async ({ page }) => {
    await interceptAdmin(page);
    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await ss(page, 'P20-owner-dashboard.png', true);
  });
});
