import type { Page, BrowserContext } from '@playwright/test';

export const TENANTS = {
  bstk: { id: '6a215ffdf6d2ac752d1454f2', adminId: '6a215ffdf6d2ac752d1454f4', adminEmail: 'tharun@bstk.in' },
  acme: { id: '6a2163e6f6d2ac752d145523', adminId: '6a2163e6f6d2ac752d145525', adminEmail: 'shiva@company.com' },
  nayagara: { id: '6a2fb33a4470f72d2e9da7ae', adminId: '6a2fb33c4470f72d2e9da7af', adminEmail: 'admin@nayagara.com' },
} as const;

export const OWNER = { email: 'superadmin@bstk.in', password: 'Tharunkumar123@#!' };

export const BACKEND_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000';
const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';

export interface LoginResult { token: string; tempPassword: string; }

export async function ownerLogin(): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
  });
  if (!res.ok) throw new Error(`owner login failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

export async function resetTenantAdminPassword(tenantId: string, adminId: string): Promise<string> {
  const ownerToken = await platformOwnerLogin();
  const res = await fetch(
    `${BACKEND_URL}/platform/tenants/${tenantId}/admins/${adminId}/reset-password`,
    { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}` } },
  );
  if (!res.ok) throw new Error(`reset failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.temp_password as string;
}

export async function tenantAdminLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`tenant admin login failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

export async function platformOwnerLogin(): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/platform/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
  });
  if (!res.ok) throw new Error(`platform owner login failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

export async function ensureBstkAdminLoggedIn(): Promise<LoginResult> {
  const temp = await resetTenantAdminPassword(TENANTS.bstk.id, TENANTS.bstk.adminId);
  const token = await tenantAdminLogin(TENANTS.bstk.adminEmail, temp);
  return { token, tempPassword: temp };
}

export async function ensureNayagaraAdminLoggedIn(): Promise<LoginResult> {
  const token = await tenantAdminLogin(TENANTS.nayagara.adminEmail, 'y2DDZDNOplzg');
  return { token, tempPassword: 'y2DDZDNOplzg' };
}

// Fast API-based login: inject cookie + localStorage via addInitScript, skip UI login
export async function apiLoginAsNayagaraAdmin(page: Page): Promise<void> {
  const token = await tenantAdminLogin(TENANTS.nayagara.adminEmail, 'y2DDZDNOplzg');

  const userData = {
    id: TENANTS.nayagara.adminId,
    name: 'Nayagara',
    email: TENANTS.nayagara.adminEmail,
    role: 'admin',
    reward_points: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    tenant_id: TENANTS.nayagara.id,
    primary_company_id: null,
    scope_company_ids: [],
    business_unit_id: null,
  };

  // Set cookies for ALL possible domains the API might be accessed from
  await page.context().addCookies([
    { name: 'access_token', value: token, url: 'http://localhost:8000', httpOnly: true, sameSite: 'Lax' },
    { name: 'access_token', value: token, url: 'http://127.0.0.1:8000', httpOnly: true, sameSite: 'Lax' },
  ]);

  // Use addInitScript to set localStorage before ANY page loads
  await page.addInitScript((data) => {
    localStorage.setItem('user', JSON.stringify(data));
  }, userData);

  // Route intercept with broad matching
  await page.route('**/*auth*me*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userData),
    });
  });
}

// Fast API-based owner login
export async function apiLoginAsOwner(page: Page): Promise<void> {
  const token = await platformOwnerLogin();

  const ownerData = {
    id: '6a23f2c12324f84e1e46c3bf',
    name: 'Vision Owner',
    email: OWNER.email,
    role: 'platform_owner',
    must_change_password: false,
  };

  await page.context().addCookies([
    { name: 'owner_access_token', value: token, url: 'http://localhost:8000', httpOnly: true, sameSite: 'Lax' },
    { name: 'owner_access_token', value: token, url: 'http://127.0.0.1:8000', httpOnly: true, sameSite: 'Lax' },
  ]);

  await page.addInitScript((data) => {
    localStorage.setItem('platform_owner', JSON.stringify(data));
  }, ownerData);

  await page.route('**/*platform*me*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ownerData),
    });
  });
}

// UI-based login (only needed when testing the login flow itself)
export async function setNayagaraAdminInBrowser(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForFormReady(page, '#login-email');
  await typeIntoReactInput(page, '#login-email', TENANTS.nayagara.adminEmail);
  await typeIntoReactInput(page, '#login-password', 'y2DDZDNOplzg');
  await page.waitForTimeout(400);
  const navP = page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
  await page.locator('#login-submit').click();
  await navP;
}

export async function setOwnerInBrowserWithCredentials(page: Page): Promise<void> {
  await page.goto('/owner/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#owner-login-email').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForFormReady(page, '#owner-login-email');
  await typeIntoReactInput(page, '#owner-login-email', OWNER.email);
  await typeIntoReactInput(page, '#owner-login-password', OWNER.password);
  await page.waitForTimeout(400);
  const navP = page.waitForURL(/\/owner\/dashboard/, { timeout: 20_000 });
  await page.locator('#owner-login-submit').click();
  await navP;
}

export async function typeIntoReactInput(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error(`element not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, val: value },
  );
  const v = await page.locator(selector).inputValue();
  if (v !== value) {
    throw new Error(`failed to set ${selector}: got "${v}", expected "${value}"`);
  }
}

export async function waitForFormReady(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) return false;
      const node = el as unknown as Record<string, unknown>;
      const keys = Object.keys(node);
      const allProps = Object.getOwnPropertyNames(node);
      return [...keys, ...allProps].some((k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
    },
    selector,
    { timeout: 20_000 },
  ).catch(() => undefined);
  await page.waitForTimeout(800);
}

export async function setOwnerInBrowser(page: Page): Promise<void> {
  await page.goto('/owner/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#owner-login-email').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForFormReady(page, '#owner-login-email');
  await typeIntoReactInput(page, '#owner-login-email', OWNER.email);
  await typeIntoReactInput(page, '#owner-login-password', OWNER.password);
  await page.waitForTimeout(400);
  const navP = page.waitForURL(/\/owner\/dashboard/, { timeout: 20_000 });
  await page.locator('#owner-login-submit').click();
  await navP;
}

export async function setBstkAdminInBrowser(page: Page, temp: string): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForFormReady(page, '#login-email');
  await typeIntoReactInput(page, '#login-email', TENANTS.bstk.adminEmail);
  await typeIntoReactInput(page, '#login-password', temp);
  await page.waitForTimeout(400);
  const navP = page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 });
  await page.locator('#login-submit').click();
  await navP;
}
