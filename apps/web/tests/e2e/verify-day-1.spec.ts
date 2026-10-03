/**
 * Day 1 verify — app shell, nav, /api/health.
 */
import { expect, test } from '@playwright/test';

import { healthDetailHeaders } from './health-token';

test.describe('Day 1 — foundation', () => {
  test('/api/health returns ok JSON, and withholds its detail unauthenticated', async ({
    request,
  }) => {
    // F.176 — the detail now requires the bearer token. Both halves are asserted
    // here rather than one: a route that withheld from everybody would pass the
    // first three lines and have removed the operator's diagnostic.
    const open = await request.get('/api/health');
    expect(open.status()).toBe(200);
    const openBody = await open.json();
    expect(openBody.status).toMatch(/ok|degraded/);
    expect(openBody.detail).toBe('withheld');
    expect(openBody.checks).toBeUndefined();

    const res = await request.get('/api/health', { headers: healthDetailHeaders });
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
