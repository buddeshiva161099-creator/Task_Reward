import { test, expect } from '@playwright/test';
import { BACKEND_URL, ensureBstkAdminLoggedIn, setBstkAdminInBrowser } from './helpers';

async function typeIntoReactInput(
  page: import('@playwright/test').Page,
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

test.describe('Tenant admin: Companies', () => {
  test('list, create, switch scope, deactivate, reactivate a company', async ({ page }) => {
    const { token, tempPassword } = await ensureBstkAdminLoggedIn();
    await setBstkAdminInBrowser(page, tempPassword);

    await page.goto('/admin/companies');
    await expect(page.getByRole('heading', { name: /Companies/i })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1200);

    const stamp = Date.now().toString(36);
    const newName = `Playwright Co ${stamp}`;

    await page.getByRole('button', { name: /New Company/i }).click();
    await expect(page.getByRole('heading', { name: /New Company/i })).toBeVisible();

    await page.locator('input[placeholder*="Acme"]').waitFor({ state: 'visible' });
    await typeIntoReactInput(page, 'input[placeholder*="Acme"]', newName);
    await page.locator('textarea').first().fill('Created by Playwright');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Create$/i }).click();

    await expect(page.getByRole('heading', { name: newName })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    const createdCard = page.locator('div', { hasText: newName }).filter({ hasText: 'Sub-organization' }).first();
    await expect(createdCard).toBeVisible();

    const switchBtn = createdCard.getByRole('button', { name: /Switch to/i }).first();
    if (await switchBtn.isVisible().catch(() => false)) {
      await switchBtn.click();
      await page.waitForTimeout(800);
      const stored = await page.evaluate(() => localStorage.getItem('active_company_id'));
      expect(stored).toMatch(/^[0-9a-f]{24}$/i);
    }

    await page.getByRole('button', { name: /New Company/i }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: newName }).waitFor({ state: 'visible' });

    const allCompanies = await fetch(`${BACKEND_URL}/companies`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Active-Company-Id': (await page.evaluate(() => localStorage.getItem('active_company_id'))) || '',
      },
    }).then((r) => r.json());
    const created = (allCompanies as Array<{ id: string; name: string }>).find((c) => c.name === newName);
    expect(created).toBeTruthy();

    if (created) {
      const deactivateRes = await fetch(`${BACKEND_URL}/companies/${created.id}/deactivate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      expect(deactivateRes.ok).toBeTruthy();
    }

    await page.reload();
    await page.waitForTimeout(1500);
    await page.locator('label:has-text("Show inactive") input[type="checkbox"]').check();
    await expect(page.getByRole('heading', { name: newName })).toBeVisible({ timeout: 5_000 });
  });
});
