/**
 * Day 6 verify — inventory + procurement workflow.
 *
 * Smoke: /inventory loads with seeded items, /inventory/procurements
 * shows the seeded procurements, status pills appear.
 */
import { expect, test } from '@playwright/test';

import { loginAs } from './helpers';

test.describe('Day 6 — inventory + procurements', () => {
  test('/inventory list renders with seeded items', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/inventory');
    await expect(page.locator('h1')).toContainText('Inventory');
    // Seed creates ~500 items; expect at least one row.
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('/inventory/procurements shows seeded procurements', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/inventory/procurements');
    await expect(page.locator('h1')).toContainText('Procurements');
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('/dashboard renders inventory KPI cards', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/dashboard');
    // KPI labels appear once as a card title; item-row status pills also contain
    // these words. Match the uppercase card title exactly to avoid strict-mode collisions.
    await expect(page.getByText('In stock', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Reserved', { exact: true }).first()).toBeVisible();
  });

  test('procurement detail page renders for a seeded procurement', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/inventory/procurements');
    const firstLink = page.locator('tbody tr a').first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await expect(page.locator('h1')).toContainText(/PROC-/);
  });
});
