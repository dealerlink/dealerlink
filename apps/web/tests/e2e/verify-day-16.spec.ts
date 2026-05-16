/**
 * Day 16 verify — accessibility + polish.
 *
 * Runs axe-core on the key pages and asserts zero serious/critical
 * violations, exercises the skip-to-content link, and checks the empty-state
 * + 404 + document-title polish. The empty/loading/error *components*
 * themselves are unit-tested in app/_components/states.test.tsx.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers';

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded user needs password rotation');
  }
}

/** Assert axe finds no serious/critical violation on the current page. */
async function expectNoSeriousA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  if (blocking.length > 0) {
    console.error(
      'a11y violations:',
      blocking.map((v) => `${v.id} (${v.impact}) — ${v.nodes.length} node(s)`),
    );
  }
  expect(blocking).toEqual([]);
}

test.describe('Day 16 — accessibility', () => {
  test('dashboard has no serious/critical axe violations', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('dealers list + dealer detail have no serious/critical violations', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/dealers');
    await expect(page.locator('table')).toBeVisible();
    await expectNoSeriousA11y(page);

    await page.locator('table tbody tr a[href^="/dealers/"]').first().click();
    await page.waitForURL(/\/dealers\/[0-9a-f-]+$/);
    await expectNoSeriousA11y(page);
  });

  test('quotation builder has no serious/critical violations', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/quotations/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousA11y(page);
  });

  test('order detail has no serious/critical violations', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/orders');
    const firstOrder = page.locator('table tbody tr a[href^="/orders/"]').first();
    if ((await firstOrder.count()) === 0) test.skip(true, 'No seeded orders');
    await firstOrder.click();
    await page.waitForURL(/\/orders\/[0-9a-f-]+$/);
    await expectNoSeriousA11y(page);
  });

  test('skip-to-content link is the first tab stop', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/dashboard');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveText(/skip to content/i);
  });

  test('a filtered-out list shows the empty state with a clear-filters action', async ({
    page,
  }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/dealers?search=zzznomatchzzz');
    await expect(page.getByText('No dealers match these filters')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Clear filters' })).toBeVisible();
  });

  test('an unknown route renders the branded 404 page', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/this-route-does-not-exist-zzz');
    await expect(page.getByText('This page could not be found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to dashboard' })).toBeVisible();
  });

  test('key pages carry a non-default document title', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    for (const [path, title] of [
      ['/dashboard', 'Dashboard · Dealerlink'],
      ['/dealers', 'Dealers · Dealerlink'],
      ['/reports/sales-summary', 'Sales Summary · Dealerlink'],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(title);
    }
  });
});
