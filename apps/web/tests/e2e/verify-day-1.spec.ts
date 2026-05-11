/**
 * Day 1 verify — app shell, nav, /api/health.
 */
import { expect, test } from '@playwright/test';

test.describe('Day 1 — foundation', () => {
  test('/api/health returns ok JSON', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toMatch(/ok|degraded/);
    expect(body.checks.db).toBeDefined();
  });

  test('login page renders the Aurora shell', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Dealerlink|Sign in/i);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});
