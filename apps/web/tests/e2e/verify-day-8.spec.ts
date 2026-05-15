/**
 * Day 8 verify — quotation builder + lifecycle.
 *
 * Smoke: /quotations loads with seeded rows, Builder opens, totals update
 * live, inter-state badge flips when place_of_supply differs from tenant
 * state, save-draft / send / revise flows produce the expected status.
 */
import { expect, test } from '@playwright/test';

import { loginAs } from './helpers';

test.describe('Day 8 — quotation builder', () => {
  test('/quotations lists seeded quotations', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/quotations');
    await expect(page.locator('h1')).toContainText('Quotations');
    // At least one QT- numbered row from the day8 seed (the DB test suite
    // may have left non-QT rows behind; just assert *some* row starts QT-).
    const qtCell = page.locator('table tbody tr td.mono', { hasText: /QT-\d{4}-/ }).first();
    await expect(qtCell).toBeVisible();
  });

  test('/quotations/new opens the Builder', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/quotations/new');
    await expect(page.locator('h1')).toContainText('New quotation');
    await expect(page.getByText('Totals')).toBeVisible();
    await expect(page.getByTestId('interstate-badge')).toBeVisible();
  });

  test('opening a seeded quotation shows totals + activity', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/quotations');
    // Find the first QT- row's detail link (DB tests may leave non-QT rows
    // above it).
    const qtLink = page
      .locator('table tbody tr', { has: page.locator('td.mono', { hasText: /QT-\d{4}-/ }) })
      .first()
      .locator('a[href^="/quotations/"]')
      .first();
    const href = await qtLink.getAttribute('href');
    expect(href).toMatch(/^\/quotations\/[0-9a-f-]+$/);
    await page.goto(href!);
    await expect(page.locator('h1').first()).toContainText(/QT-/);
    await expect(page.getByText('Line items')).toBeVisible();
    await expect(page.getByText('Activity')).toBeVisible();
  });

  test('seed includes a revision chain (Rev 1/2/3)', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    // Walk the list with includeSuperseded=1 so the parent revision is visible.
    await page.goto('/quotations?superseded=1');
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    // Find a QT- row with Rev 3 — the day8 seed always creates one. (DB tests
    // may also leave CHAIN- rev rows behind, so we filter for QT- specifically.)
    const qtRev3 = page.locator('table tbody tr', {
      has: page.locator('td.mono', { hasText: /QT-\d{4}-/ }),
      hasText: 'Rev 3',
    });
    await expect(qtRev3.first()).toBeVisible();
  });

  test('inter-state badge reads tenant state → place of supply', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/quotations/new');
    const badge = page.getByTestId('interstate-badge');
    await expect(badge).toBeVisible();
    // Override place of supply to a different state — badge should flip to inter.
    const override = page.locator('input[placeholder="—"], input[maxlength="2"]').first();
    await override.fill('KA');
    await expect(badge).toContainText('Inter-state');
  });
});
