import * as fs from "fs";
import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const TS = Date.now().toString().slice(-6);
const ADMIN_EMAIL = `admin-${TS}@bootstrap.com`;
const ADMIN_PASS = 'TestPass@123';

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/setup-${name}.png`, fullPage: true });
}

async function waitForHydration(page: Page) {
  // Wait for RSC payload to finish streaming and React to hydrate
  await page.waitForLoadState('networkidle').catch(() => {});
  // Wait for the page to not have raw RSC chunks visible
  for (let i = 0; i < 20; i++) {
    const text = await page.textContent('body').catch(() => '');
    if (!text.includes('self.__next_f')) break;
    await page.waitForTimeout(1000);
  }
}

// ─── Bootstrap: Create a fresh tenant specifically for this test ───

test('Setup: Create tenant via owner portal', async ({ page }) => {
  // Owner login
  await page.goto(`${BASE}/owner/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  await page.fill('#owner-login-email', 'owner@vision.app');
  await page.fill('#owner-login-password', 'StrongP@ss123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/owner\/dashboard/, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Go to create tenant
  await page.goto(`${BASE}/owner/tenants/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Step 0
  await page.getByPlaceholder('e.g. Acme Corp').fill(`BootCorp-${TS}`);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);

  // Step 1
  await page.getByPlaceholder('e.g. John Smith').fill(`Admin-${TS}`);
  await page.getByPlaceholder('admin@acme.com').fill(ADMIN_EMAIL);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);

  // Step 2 - select plan
  const planCards = page.locator('button:has-text("/mo")');
  if (await planCards.count() > 0) {
    await planCards.first().click();
    await page.waitForTimeout(500);
  }

  await page.getByRole('button', { name: 'Create Tenant' }).click();
  await page.waitForTimeout(5000);
  await expect(page.getByText('Tenant Onboarded!')).toBeVisible({ timeout: 15000 });

  // Reveal and save password
  const eyeBtn = page.locator('button:has(.lucide-eye)').first();
  if (await eyeBtn.isVisible().catch(() => false)) {
    await eyeBtn.click();
    await page.waitForTimeout(500);
  }

  // Extract password
  const passwordEl = page.locator('.font-mono.font-bold');
  let tempPassword = '';
  if (await passwordEl.count() > 0) {
    tempPassword = (await passwordEl.first().textContent()) || '';
  }
  if (!tempPassword) {
    const text = await page.textContent('body') || '';
    const match = text.match(/\b([A-Za-z0-9]{12})\b/);
    if (match) tempPassword = match[1];
  }

  console.log(`Created tenant: BootCorp-${TS}`);
  console.log(`Admin: ${ADMIN_EMAIL} / ${tempPassword}`);

  // Save credentials to file for subsequent tests

  fs.writeFileSync('test-results/bootstrap-credentials.txt',
    `TS=${TS}\nADMIN_EMAIL=${ADMIN_EMAIL}\nADMIN_PASS=${tempPassword}\n`);

  expect(tempPassword).not.toBe('');
});

// ─── Create company and employees ───

test('Setup: Admin creates company and employees', async ({ page }) => {
  // Read credentials

  const credsRaw = fs.readFileSync('test-results/bootstrap-credentials.txt', 'utf-8');
  const creds: Record<string, string> = {};
  credsRaw.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v) creds[k.trim()] = v.trim();
  });
  const adminEmail = creds['ADMIN_EMAIL'] || ADMIN_EMAIL;
  const adminPass = creds['ADMIN_PASS'] || ADMIN_PASS;
  const ts = creds['TS'] || TS;

  console.log(`Logging in as admin: ${adminEmail}`);

  // Login as admin
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
  await page.fill('#login-email', adminEmail);
  await page.fill('#login-password', adminPass);
  await page.locator('#login-submit').click();
  await page.waitForTimeout(8000);
  await screenshot(page, '01-admin-login');

  const url = page.url();
  console.log(`After login URL: ${url}`);

  // Check if login succeeded
  if (url.includes('/login')) {
    const body = await page.textContent('body') || '';
    console.log('Login page body:', body.substring(0, 500));
    // Check for error
    await screenshot(page, '02-login-failed');
    expect(body).not.toContain('Invalid');
    return;
  }

  console.log('✓ Admin logged in');

  // Navigate to companies
  await page.goto(`${BASE}/admin/companies`, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
  await page.waitForTimeout(3000);
  await screenshot(page, '10-companies-page');

  // Wait for the New Company button
  const newCompanyBtn = page.getByRole('button', { name: /New Company/i });
  await expect(newCompanyBtn).toBeVisible({ timeout: 15000 });
  console.log('✓ New Company button visible');

  // Click to create company
  await newCompanyBtn.click();
  await page.waitForTimeout(2000);
  await screenshot(page, '11-company-modal');

  // Fill company name
  const nameInput = page.locator('input[placeholder*="Acme"]');
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(`MainCorp-${ts}`);

  // Click Create
  await page.getByRole('button', { name: /^Create$/ }).click();
  await page.waitForTimeout(3000);
  await screenshot(page, '12-company-created');

  // Verify company was created
  const pageBody = await page.textContent('body') || '';
  console.log('After company creation:', pageBody.substring(0, 500));
  const companyCreated = pageBody.includes('MainCorp') || pageBody.includes('success') || pageBody.includes('Updated');
  console.log(`Company created: ${companyCreated}`);

  // ═══ Create a manager (no hierarchy needed) ═══
  await page.goto(`${BASE}/admin/employees`, { waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
  await page.waitForTimeout(3000);
  await screenshot(page, '20-employees-page');

  // Wait for create button
  const createBtn = page.locator('#create-employee-btn');
  await expect(createBtn).toBeVisible({ timeout: 15000 });
  console.log('✓ Create employee button visible');

  await createBtn.click();
  await page.waitForTimeout(2000);
  await screenshot(page, '21-employee-modal');

  // Check modal opened
  await expect(page.getByText('Onboard New Personnel')).toBeVisible({ timeout: 5000 });
  console.log('✓ Employee modal opened');

  // Step 1: Name + Mobile
  const empName = `Manager-${ts}`;
  await page.locator('input[placeholder="Johnathan Doe"]').fill(empName);
  await page.locator('input[placeholder="+91 9876543210"]').fill(`+9190000${ts}`);

  // Proceed to step 2
  await page.getByRole('button', { name: 'Next: Job Details' }).click();
  await page.waitForTimeout(1000);
  await screenshot(page, '22-step2-job');

  // Proceed to step 3
  await page.getByRole('button', { name: 'Next: Hierarchy' }).click();
  await page.waitForTimeout(1000);
  await screenshot(page, '23-step3-hierarchy');

  // Select role = manager (no hierarchy needed)
  const roleSelect = page.locator('select').filter({ hasText: /Employee|Admin|Manager|HR/i });
  if (await roleSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    await roleSelect.selectOption('manager');
    await page.waitForTimeout(500);
  }

  // Proceed to step 4
  await page.getByRole('button', { name: 'Next: System Access' }).click();
  await page.waitForTimeout(1000);
  await screenshot(page, '24-step4-credentials');

  // Step 4: Check email and password are auto-filled
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    const emailVal = await emailInput.inputValue();
    console.log(`Auto-generated email: ${emailVal}`);
  }

  // Submit
  await page.getByRole('button', { name: /Complete Onboard|Submit/i }).click().catch(async () => {
    // Fallback: try submitting the form directly
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });
  await page.waitForTimeout(5000);
  await screenshot(page, '25-employee-created');

  const resultBody = await page.textContent('body') || '';
  console.log('After employee creation:', resultBody.substring(0, 500));

  // Check for welcome credentials modal
  const welcomeModal = page.getByText('Welcome Credentials').or(page.getByText('Welcome'));
  const welcomeVisible = await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`Welcome modal visible: ${welcomeVisible}`);

  if (welcomeVisible) {
    await screenshot(page, '26-welcome-credentials');
    // Capture the password
    const welcomeText = await page.textContent('body') || '';
    const pwMatch = welcomeText.match(/Temporary Password[^]*?([A-Za-z0-9!@#$%^&*]{10,})/);
    if (pwMatch) {
      console.log(`Employee password: ${pwMatch[1]}`);
    }
  }

  console.log('✓ Employee creation flow completed');
});
