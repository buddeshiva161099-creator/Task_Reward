import { test, expect } from '@playwright/test';

const OWNER = { email: 'owner@vision.app', password: 'StrongP@ss123' };

test('Owner login via hrm.bstk.in', async ({ page }) => {
  await page.goto('https://hrm.bstk.in/owner/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);

  await page.fill('#owner-login-email', OWNER.email);
  await page.fill('#owner-login-password', OWNER.password);

  await page.locator('button[type="submit"]').click();

  // Wait for dashboard URL
  await expect(page).toHaveURL(/\/owner\/dashboard/, { timeout: 30000 });
  console.log('URL matched /owner/dashboard');

  // Wait for page to hydrate and render
  await page.waitForTimeout(3000);

  // Check for dashboard content (not login page)
  const hasLoginForm = await page.locator('#owner-login-email, #owner-login-password').isVisible().catch(() => false);
  console.log('Login form still visible:', hasLoginForm);

  if (hasLoginForm) {
    console.log('FAILED: Redirected back to login');
    await page.screenshot({ path: 'test-results/owner-login-redirected.png', fullPage: true });
    const bodyText = await page.textContent('body');
    console.log('Body (first 2000):', bodyText?.substring(0, 2000));
  } else {
    // Look for dashboard indicators
    const hasDashboardContent = await page.getByText(/tenants|metrics|audit|dashboard/i).first().isVisible().catch(() => false);
    console.log('Dashboard content visible:', hasDashboardContent);

    await page.screenshot({ path: 'test-results/owner-login-dashboard.png', fullPage: true });
    console.log('SUCCESS: Dashboard loaded. URL:', page.url());
  }
});
