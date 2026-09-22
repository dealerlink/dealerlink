/**
 * Day 16 verify — accessibility + polish.
 *
 * Runs axe-core on the key pages and asserts zero serious/critical
 * violations, exercises the skip-to-content link, and checks the empty-state
 * + 404 + document-title polish. The empty/loading/error *components*
 * themselves are unit-tested in app/_components/states.test.tsx.
 */
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { adminDb, closeDbConnection } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';

import { loginAs } from './helpers';

// Playwright transpiles specs to CJS, so `import.meta` is unavailable. The
// runner's cwd is `apps/web` (see playwright.config.ts `testDir`).
const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

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
  // Any spec that queries the DB through `adminDb` opens a postgres pool in the
  // Playwright process and must close it here, or the run holds an open handle after
  // the last test. `verify-day-19.spec.ts:52-54` is the established pattern.
  test.afterAll(async () => {
    await closeDbConnection();
  });

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

  /**
   * PINNED TO AN INTRA-STATE ORDER, AND THE PIN IS THE TEST'S EVIDENCE.
   *
   * This used to open `.first()` row of `/orders` — "whatever order sorts first".
   * Neither list query has a unique tiebreaker (`lib/queries/orders.ts:70`,
   * `quotations.ts:85`) and test-created rows sort above every seeded one, so the
   * scanned document varied between runs. That is how F.3 shipped a serious
   * `definition-list` / `dlitem` violation through a GREEN run on its own PR and
   * broke the next one.
   *
   * **The intra-state pin is not a detail.** The defect lived only in
   * `TaxSummaryBlock`'s intra-state branch, which renders a CGST/SGST pair per rate;
   * the inter-state branch returns `<Row>` directly and was never broken. **An
   * unpinned scan that lands on an inter-state order passes whether or not the fix
   * works** — it would be a green result that could not have failed.
   *
   * Resolved by SHAPE, not by order number: `tenant_state_at_issue = place_of_supply`
   * with at least one line at a non-zero rate. 42 seeded orders match, so this does
   * not depend on any one document surviving a reseed.
   */
  test('order detail (INTRA-STATE, pinned) has no serious/critical violations', async ({
    page,
  }) => {
    // Intra-state is required BY THE ORDER'S OWN DATA, not by the stored
    // `place_of_supply` alone. Those two can disagree: 34 of 68 seeded orders have
    // `place_of_supply <> ship_to_dealer.state` (measured 2026-09-22, filed as its
    // own row), and ADR-012 makes the SHIP-TO state the place of supply for goods.
    // Selecting on the stored column ALONE is not sufficient: it resolves to
    // ORD-2026-0003, whose `place_of_supply` is MH while its ship-to dealer is in AS.
    // That document renders CGST/SGST and so would exercise the branch, but it cannot
    // honestly be called intra-state.
    // Requiring tenant state = ship-to state as well makes the pin true of the
    // document rather than true of one of its columns.
    const rows = (await adminDb.execute(sql`
      SELECT o.id::text AS id
      FROM orders o
      JOIN tenants t ON t.id = o.tenant_id
      JOIN dealers sd ON sd.id = o.ship_to_dealer_id
      WHERE t.slug = 'demo'
        AND o.tenant_state_at_issue = o.place_of_supply
        AND o.tenant_state_at_issue = sd.state
        AND EXISTS (
          SELECT 1 FROM order_lines l WHERE l.order_id = o.id AND l.gst_rate > 0
        )
      ORDER BY o.order_number
      LIMIT 1
    `)) as unknown as { id: string }[];
    const orderId = rows[0]?.id;
    expect(
      orderId,
      'corpus must contain an intra-state order with a taxable line — the intra-state tax block is what this scan exists to cover',
    ).toBeTruthy();

    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto(`/orders/${orderId}`);

    // NON-VACUITY GUARD. axe can only find the violation if the intra-state tax
    // block actually rendered. Without this, a page that failed to render the block
    // at all would scan clean and the assertion below would pass for the wrong
    // reason — the same shape of vacuous pass DEV.138 collects.
    await expect(
      page.locator('[data-testid^="cgst-row-"]').first(),
      'the intra-state CGST rows must be on the page for this scan to mean anything',
    ).toBeVisible();
    await expect(page.locator('[data-testid^="igst-row-"]')).toHaveCount(0);

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
