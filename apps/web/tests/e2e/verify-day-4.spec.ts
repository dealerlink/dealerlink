/**
 * Day 4 verify — operator admin app exists.
 *
 * Smoke check: /admin/tenants returns a page (not a server error).
 */
import { expect, test } from '@playwright/test';

test.describe('Day 4 — operator admin', () => {
  test('/admin/tenants reachable', async ({ page }) => {
    const res = await page.goto('/admin/tenants');
    expect([200, 302, 307, 308]).toContain(res?.status() ?? 200);
  });
});
