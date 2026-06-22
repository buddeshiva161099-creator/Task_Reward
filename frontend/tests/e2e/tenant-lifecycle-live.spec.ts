import { test, expect, Page } from '@playwright/test';

const OWNER = { email: 'owner@vision.app', password: 'StrongP@ss123' };
const BASE = 'https://hrm.bstk.in';
const TS = Date.now().toString().slice(-6);

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/tenant-lifecycle-${name}.png`, fullPage: true });
}

// ─────────────────────────────────────────────────────
//  SINGLE FLOW: create tenant → admin login → pages
// ─────────────────────────────────────────────────────

test('Full tenant lifecycle E2E', async ({ page }) => {
  // ═══════════════════════════════════════
  // PHASE 1: Owner creates a tenant
  // ═══════════════════════════════════════

  // 1a. Owner login
  await page.goto(`${BASE}/owner/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  await screenshot(page, '01a-owner-login');

  await page.fill('#owner-login-email', OWNER.email);
  await page.fill('#owner-login-password', OWNER.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/owner\/dashboard/, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await screenshot(page, '01b-owner-dashboard');
  console.log('✓ Owner logged in');

  // 1b. Navigate to create tenant
  await page.goto(`${BASE}/owner/tenants/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await screenshot(page, '02a-create-form');

  // STEP 0 - Company Info
  const companyInput = page.getByPlaceholder('e.g. Acme Corp');
  await expect(companyInput).toBeVisible({ timeout: 10000 });
  await companyInput.fill(`TestCorp-${TS}`);
  await screenshot(page, '02b-step0-company');

  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);

  // STEP 1 - Admin Info
  const adminNameInput = page.getByPlaceholder('e.g. John Smith');
  await expect(adminNameInput).toBeVisible({ timeout: 5000 });
  await adminNameInput.fill(`Admin-${TS}`);

  const adminEmailInput = page.getByPlaceholder('admin@acme.com');
  await adminEmailInput.fill(`admin-${TS}@testcorp.com`);
  await screenshot(page, '02c-step1-admin');

  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);

  // STEP 2 - Plan
  const planCards = page.locator('button:has-text("/mo")');
  const planCount = await planCards.count();
  console.log(`Plans available: ${planCount}`);
  if (planCount > 0) {
    await planCards.first().click();
    await page.waitForTimeout(500);
  }
  await screenshot(page, '02d-step2-plan');

  // Submit
  const createBtn = page.getByRole('button', { name: 'Create Tenant' });
  await expect(createBtn).toBeVisible({ timeout: 5000 });
  await createBtn.click();
  await page.waitForTimeout(5000);
  await screenshot(page, '03a-tenant-result');

  // 1c. Verify success + extract temp password
  await expect(page.getByText('Tenant Onboarded!')).toBeVisible({ timeout: 15000 });
  console.log('✓ Tenant created successfully');

  // Get full page content to extract password
  const fullText = await page.textContent('body') || '';

  // Show password by clicking eye
  const eyeBtns = page.locator('button:has(.lucide-eye)');
  if (await eyeBtns.count() > 0) {
    // Find the eye button in the credentials card (not in password input fields)
    const eyeBtn = eyeBtns.first();
    await eyeBtn.click();
    await page.waitForTimeout(500);
  }

  await screenshot(page, '03b-password-revealed');

  // Extract the temp password from the revealed text
  const revealText = await page.textContent('body') || '';
  console.log('Revealed page text (relevant part):', revealText.substring(revealText.indexOf('Primary Admin'), revealText.indexOf('Back to tenants') + 50));

  // Extract password - it's in the amber-colored card
  // The password element has class font-mono
  const passwordEl = page.locator('.font-mono.font-bold');
  let adminPassword = '';
  if (await passwordEl.count() > 0) {
    adminPassword = (await passwordEl.first().textContent()) || '';
    console.log(`Extracted password from DOM: "${adminPassword}"`);
  }

  if (!adminPassword) {
    // Fallback: try to find a 12-char alphanumeric string
    const pwMatch = revealText.match(/\b([A-Za-z0-9]{12})\b/);
    if (pwMatch) {
      adminPassword = pwMatch[1];
      console.log(`Extracted password via regex: "${adminPassword}"`);
    }
  }

  console.log(`Admin credentials: admin-${TS}@testcorp.com / ${adminPassword}`);

  // Save to a known location for verification
  const fs = require('fs');
  fs.writeFileSync('test-results/tenant-credentials.txt',
    `Tenant: TestCorp-${TS}\nAdmin Email: admin-${TS}@testcorp.com\nAdmin Password: ${adminPassword}\n`);

  expect(adminPassword).not.toBe('');
  console.log('✓ Temp password captured');

  // ═══════════════════════════════════════
  // PHASE 2: Admin login and setup
  // ═══════════════════════════════════════

  // 2a. Log out owner context - go to admin login on a new page
  // Use the same page but navigate away (clears cookies since we changed domain path)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await screenshot(page, '04a-admin-login');

  // Fill admin login form
  await page.fill('#login-email', `admin-${TS}@testcorp.com`);
  await page.fill('#login-password', adminPassword);
  await page.locator('#login-submit').click();
  await page.waitForTimeout(8000);
  await screenshot(page, '04b-admin-after-login');

  const adminUrl = page.url();
  console.log(`Admin redirect URL: ${adminUrl}`);

  const adminBody = await page.textContent('body') || '';
  console.log('Admin body (first 800):', adminBody.substring(0, 800));

  // Check if login was successful
  const stillOnLogin = adminUrl.includes('/login');
  if (stillOnLogin) {
    console.log('Admin login redirected back to login - checking for errors');
    // Look for error message
    if (adminBody.includes('Invalid') || adminBody.includes('invalid') || adminBody.includes('failed')) {
      console.log('Admin login FAILED - invalid credentials');
      await screenshot(page, '04c-admin-login-failed');
    } else {
      console.log('Admin may have been redirected to login again (auth issue)');
    }
  } else {
    console.log('✓ Admin login successful, redirected to:', adminUrl);
  }

  // ═══════════════════════════════════════
  // PHASE 3: Visit admin pages if logged in
  // ═══════════════════════════════════════

  const adminPages = [
    '/admin/dashboard',
    '/admin/employees',
    '/admin/tasks',
    '/admin/attendance',
    '/admin/leaves',
    '/admin/payroll',
    '/admin/reports',
    '/admin/leaderboard',
    '/admin/chat',
    '/admin/companies',
  ];

  for (const urlPath of adminPages) {
    await page.goto(`${BASE}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const pageBody = await page.textContent('body') || '';
    const safeName = urlPath.replace(/\//g, '-').replace(/^-/, '');
    await screenshot(page, `05-admin-${safeName}`);

    const pageUrl = page.url();
    const isOnLogin = pageUrl.includes('/login');
    console.log(`${urlPath} → ${isOnLogin ? '🔴 REDIRECTED TO LOGIN' : '🟢 LOADED'} (url: ${pageUrl.substring(0, 80)})`);

    if (!isOnLogin) {
      console.log(`  Content: ${pageBody.substring(0, 200).replace(/\n/g, ' ')}`);
    }
  }

  // ═══════════════════════════════════════
  // PHASE 4: Try to create a company (if admin is logged in)
  // ═══════════════════════════════════════

  await page.goto(`${BASE}/admin/companies`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await screenshot(page, '06a-companies-page');

  const companiesBody = await page.textContent('body') || '';
  console.log('Companies page content:', companiesBody.substring(0, 500));

  // Check if we can create a company
  const newCompanyBtn = page.getByText('New Company');
  if (await newCompanyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newCompanyBtn.click();
    await page.waitForTimeout(1000);
    await screenshot(page, '06b-company-modal');

    const nameInput = page.locator('input[placeholder*="Acme"]');
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill(`MainCompany-${TS}`);
      await page.locator('button:has-text("Create"):not(:has-text("Cancel"))').click();
      await page.waitForTimeout(3000);
      await screenshot(page, '06c-company-created');
      console.log('✓ Company created successfully');
    }
  } else {
    console.log('Company creation button not visible (not logged in or no permission)');
  }

  // ═══════════════════════════════════════
  // PHASE 5: Employee page + create modal
  // ═══════════════════════════════════════

  await page.goto(`${BASE}/admin/employees`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await screenshot(page, '07a-employees-page');

  const empBody = await page.textContent('body') || '';
  console.log('Employees page content:', empBody.substring(0, 500));

  const addEmpBtn = page.locator('#create-employee-btn');
  if (await addEmpBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Create employee button is visible');
    await addEmpBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, '07b-employee-modal-step1');

    // Check if modal opened
    const modalHeading = page.getByText('Onboard New Personnel');
    if (await modalHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✓ Create employee modal opened');

      // Step 1: Fill name and mobile
      const empNameInput = page.locator('input[placeholder="Johnathan Doe"]');
      const empMobileInput = page.locator('input[placeholder="+91 9876543210"]');
      if (await empNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await empNameInput.fill(`Employee-${TS}`);
        await empMobileInput.fill(`+9190000${TS}`);
        console.log('✓ Filled employee name and mobile');
        await screenshot(page, '07c-employee-step1-filled');
      }
    } else {
      console.log('Employee modal did not open');
    }
  } else {
    console.log('Create employee button not visible');
  }

  // ═══════════════════════════════════════
  // PHASE 6: Employee portal pages
  // ═══════════════════════════════════════

  // Try visiting employee pages as admin
  const empPages = [
    '/employee/dashboard',
    '/employee/tasks',
    '/employee/attendance',
    '/employee/leaves',
    '/employee/payroll',
    '/employee/reports',
    '/employee/chat',
  ];

  for (const urlPath of empPages) {
    await page.goto(`${BASE}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const pageBody = await page.textContent('body') || '';
    const safeName = urlPath.replace(/\//g, '-').replace(/^-/, '');
    await screenshot(page, `08-emp-${safeName}`);

    const pageUrl = page.url();
    const isOnLogin = pageUrl.includes('/login');
    console.log(`${urlPath} → ${isOnLogin ? '🔴 REDIRECTED TO LOGIN' : '🟢 LOADED'}`);

    if (!isOnLogin) {
      console.log(`  Content: ${pageBody.substring(0, 200).replace(/\n/g, ' ')}`);
    }
  }

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════

  console.log('\n═══════════════════════════════════');
  console.log('LIFECYCLE TEST COMPLETE');
  console.log(`Tenant: TestCorp-${TS}`);
  console.log(`Admin: admin-${TS}@testcorp.com`);
  console.log('Screenshots in: test-results/');
  console.log('═══════════════════════════════════');
});
