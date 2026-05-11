/**
 * Day 5 verify — dealers + products lists are reachable when logged in.
 */
import { expect, test } from '@playwright/test';

import { loginAs } from './helpers';

test.describe('Day 5 — dealer master + catalog', () => {
  test('/dealers list renders with seeded data', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/dealers');
    await expect(page.locator('h1')).toContainText('Dealers');
    // Seed creates 20 dealers per tenant; expect at least 1 row.
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('/catalog list renders with seeded data', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    // Force table view — default is grid (cards), which has no tbody.
    await page.goto('/catalog?view=table');
    await expect(page.locator('h1')).toContainText(/Catalog|Products/i);
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });
});
