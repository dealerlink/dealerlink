/**
 * Day 6 verify — inventory + procurement workflow.
 *
 * Smoke: /inventory loads with seeded items, /inventory/procurements
 * shows the seeded procurements, status pills appear.
 */
import { expect, test } from '@playwright/test';

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@demo.dealerlink.in';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'DemoAdmin!2026';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|inventory|change-password/, { timeout: 10_000 });
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

test.describe('Day 6 — inventory + procurements', () => {
  test('/inventory list renders with seeded items', async ({ page }) => {
    await login(page);
    await page.goto('/inventory');
    await expect(page.locator('h1')).toContainText('Inventory');
    // Seed creates ~500 items; expect at least one row.
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('/inventory/procurements shows seeded procurements', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/procurements');
    await expect(page.locator('h1')).toContainText('Procurements');
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('/dashboard renders inventory KPI cards', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await expect(page.getByText(/In stock/i)).toBeVisible();
    await expect(page.getByText(/Reserved/i)).toBeVisible();
  });

  test('procurement detail page renders for a seeded procurement', async ({ page }) => {
    await login(page);
    await page.goto('/inventory/procurements');
    const firstLink = page.locator('tbody tr a').first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await expect(page.locator('h1')).toContainText(/PROC-/);
  });
});
