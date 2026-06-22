import { test, expect } from '@playwright/test';

const OWNER = { email: 'owner@vision.app', password: 'StrongP@ss123' };

test('Owner login via hrm.bstk.in', async ({ page }) => {
  await page.goto('https://hrm.bstk.in/owner/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);

  await page.fill('#owner-login-email', OWNER.email);
  await page.fill('#owner-login-password', OWNER.password);

  await page.screenshot({ path: 'test-results/owner-login-02-filled.png', fullPage: true });

  await page.locator('button[type="submit"]').click();

  try {
    await expect(page).toHaveURL(/\/owner\/dashboard/, { timeout: 30000 });
    console.log('SUCCESS: Owner logged in and redirected to dashboard');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'test-results/owner-login-03-dashboard.png', fullPage: true });
    const bodyText = await page.textContent('body');
    console.log('Dashboard content (first 1500 chars):', bodyText?.substring(0, 1500));
  } catch (e) {
    console.log('FAILED - current URL:', page.url());
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/owner-login-03-failed.png', fullPage: true });
    const bodyText = await page.textContent('body');
    console.log('Page text:', bodyText?.substring(0, 1500));
    throw e;
  }
});
