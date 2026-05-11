/**
 * Day 5 verify — dealers + products lists are reachable when logged in.
 *
 * Requires a logged-in session. We log in inline rather than depend on a
 * shared fixture so each verify spec is self-contained.
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

test.describe('Day 5 — dealer master + catalog', () => {
  test('/dealers list renders with seeded data', async ({ page }) => {
    await login(page);
    await page.goto('/dealers');
    await expect(page.locator('h1')).toContainText('Dealers');
    // Seed creates 20 dealers per tenant; expect at least 1 row.
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('/catalog list renders with seeded data', async ({ page }) => {
    await login(page);
    await page.goto('/catalog');
    await expect(page.locator('h1')).toContainText(/Catalog|Products/i);
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });
});
