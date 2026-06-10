/**
 * Operator read-only tenant view — E2E (ADR-014, DEV.82).
 *
 * Browser-level proof of the wiring that the unit/integration tests can't cover:
 * the operator console "Enter workspace" button lands the operator IN the
 * tenant's app (not the old dead-end at the tenant login), the read-only banner
 * is shown, the operator can READ a tenant data page (RLS-scoped via the
 * impersonation cookie), and "Exit impersonation" returns to the operator
 * console.
 *
 * The WRITE-block itself is proven deterministically at the action layer
 * (lib/actions/wrap.test.ts) and the DB layer (packages/db tests/impersonation
 * — SET TRANSACTION READ ONLY), so this spec asserts the wiring + read path,
 * not a UI write attempt (which is fragile in a browser).
 *
 * Dev routing: there are no subdomains on localhost, so enterImpersonation
 * redirects to /dashboard?tenant=demo and the impersonation cookie carries the
 * tenant scope on subsequent navigations.
 */
import { expect, test } from '@playwright/test';

import { loginAsOperator } from './helpers';

test.describe('Operator read-only tenant view (ADR-014)', () => {
  test.setTimeout(3 * 60_000);

  test('operator enters a tenant read-only, reads data, and exits', async ({ page }) => {
    // Cold dev-server route compilation on first hit can exceed the default
    // 15s on this Windows box; give navigations headroom so a cold run is not
    // flaky (the suite's globalTimeout still bounds the whole thing).
    page.setDefaultTimeout(30_000);

    await test.step('login as operator and open the demo tenant', async () => {
      await loginAsOperator(page);
      await page.goto('/admin/tenants');
      const demoRow = page.locator('.grid').filter({ hasText: 'demo.dealerlink.in' }).first();
      await demoRow.getByRole('link', { name: 'Open' }).click();
      await expect(page).toHaveURL(/\/admin\/tenants\/[0-9a-f-]+/);
    });

    await test.step('Enter workspace → lands in the tenant app with the read-only banner', async () => {
      await page.getByRole('button', { name: 'Enter workspace' }).click();
      // Dev: redirected into the tenant app, scoped to demo.
      await page.waitForURL(/tenant=demo/, { timeout: 30_000 });
      // Persistent banner — never confused with the tenant's own session.
      await expect(page.getByText('Operator impersonation')).toBeVisible();
      await expect(page.getByText(/read-only\. Mutations are blocked/i)).toBeVisible();
    });

    await test.step('operator can READ a tenant data page (RLS-scoped via cookie)', async () => {
      // No ?tenant= here on purpose: the cookie alone scopes the read, and the
      // slug/cookie check trusts the cookie when no slug is present (dev nav).
      await page.goto('/dealers');
      // Did NOT bounce to /login or /admin → the read view rendered.
      await expect(page).toHaveURL(/\/dealers/);
      // Banner is present on every tenant page while impersonating.
      await expect(page.getByText('Operator impersonation')).toBeVisible();
    });

    await test.step('Exit impersonation → back to the operator console', async () => {
      await page.getByRole('button', { name: /Exit impersonation/i }).click();
      await page.waitForURL(/\/admin/, { timeout: 30_000 });
      await expect(page.getByText('Operator impersonation')).toHaveCount(0);
    });
  });
});
