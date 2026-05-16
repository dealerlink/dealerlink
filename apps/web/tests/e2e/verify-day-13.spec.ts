/**
 * Day 13 verify — dispatch creation, serial pick, fulfilment tracking.
 *
 * Covers the warehouse surface end-to-end: role gating (dispatch manages,
 * accounts views, sales is redirected), creating a dispatch from a seeded
 * confirmed order via the UI, and marking a dispatch delivered.
 *
 * List locators match seeded numbers (`DSP-2026-…`, `ORD-…`) so DB-test
 * residue never shadows the seeded rows (DEV.31).
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers';

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded user needs password rotation');
  }
}

test.describe('Day 13 — dispatch creation + fulfilment', () => {
  test('dispatch role sees the dispatch list with seeded dispatches', async ({ page }) => {
    await loginAs(page, 'demo', 'dispatch');
    await skipIfPasswordRotation(page);

    await page.goto('/dispatch');
    await expect(page.getByRole('heading', { name: 'Dispatch', exact: true })).toBeVisible();
    const seededRows = page.locator('table tbody tr', {
      has: page.locator('td.mono', { hasText: /DSP-\d{4}-/ }),
    });
    expect(await seededRows.count()).toBeGreaterThan(0);
    await expect(page.getByRole('link', { name: '+ New dispatch' })).toBeVisible();
  });

  test('sales role cannot access /dispatch — redirected to dashboard', async ({ page }) => {
    await loginAs(page, 'demo', 'sales');
    await skipIfPasswordRotation(page);

    await page.goto('/dispatch');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('accounts role can view dispatches but cannot create', async ({ page }) => {
    await loginAs(page, 'demo', 'accounts');
    await skipIfPasswordRotation(page);

    await page.goto('/dispatch');
    await expect(page.getByRole('heading', { name: 'Dispatch', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '+ New dispatch' })).toHaveCount(0);
  });

  test('dispatch role creates a dispatch from a confirmed order via the UI', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'demo', 'dispatch');
    await skipIfPasswordRotation(page);

    await page.goto('/dispatch/new');
    await expect(page.getByRole('heading', { name: 'New dispatch' })).toBeVisible();

    // Pick a SEEDED dispatchable order (ORD-2026-…) so DB-test residue
    // (ORD-DSP-…, ORD-RACE-… from dispatch.test.ts) never shadows it (DEV.31).
    const seededRow = page
      .locator('table tbody tr', { has: page.locator('td', { hasText: /ORD-\d{4}-/ }) })
      .first();
    if ((await seededRow.count()) === 0) {
      test.skip(true, 'No seeded dispatchable orders');
    }
    await seededRow.locator('a[href^="/dispatch/new?order="]').click();
    await page.waitForURL(/\/dispatch\/new\?order=/);

    // Select serials for every line with stock, then create.
    const selectButtons = page.getByRole('button', { name: 'Select up to remaining' });
    const n = await selectButtons.count();
    for (let i = 0; i < n; i++) await selectButtons.nth(i).click();
    const createBtn = page.getByRole('button', { name: 'Create dispatch' });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Lands on the new dispatch's detail page.
    await page.waitForURL(/\/dispatch\/[0-9a-f-]+$/, { timeout: 20_000 });
    await expect(page.locator('h1').first()).toContainText(/DSP-/);
    await expect(page.locator('h1').first().getByText('in transit')).toBeVisible();
    // The serials that left the warehouse are listed.
    await expect(page.getByText(/Line items ·/)).toBeVisible();
  });

  test('marking a dispatch delivered updates its status', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'demo', 'dispatch');
    await skipIfPasswordRotation(page);

    // Open a seeded in-transit dispatch.
    await page.goto('/dispatch?status=in_transit');
    const inTransitRow = page.locator('table tbody tr', {
      has: page.locator('td.mono', { hasText: /DSP-\d{4}-/ }),
    });
    expect(await inTransitRow.count()).toBeGreaterThan(0);
    await inTransitRow.first().locator('a[href^="/dispatch/"]').click();
    await expect(page.locator('h1').first()).toContainText(/DSP-/);

    // Mark it delivered.
    await page.getByRole('button', { name: 'Mark delivered' }).click();
    await page.getByPlaceholder('Name of the person who signed').fill('Verify Tester');
    await page.getByRole('button', { name: 'Confirm delivery' }).click();

    await expect(page.locator('h1').first().getByText('delivered')).toBeVisible({
      timeout: 20_000,
    });
  });
});
