/**
 * Day 11 verify — PI + order lifecycle.
 *
 * Covers the cross-module choreography: convert an accepted quotation to a
 * PI, send it, confirm it (which spawns an order + advances the deal), then
 * open the order and exercise the confirm-with-reservation modal. A second
 * test checks a seeded confirmed order's reserved serials, and a third
 * checks a three-party PI renders both Bill-To and Ship-To.
 *
 * The list-filtering locators match seeded document numbers (`PI-2026-…`,
 * `ORD-2026-…`) specifically so DB-test residue (`*-TEST-*` rows, DEV.31)
 * never shadows the seeded rows the assertions expect.
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers';

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

test.describe('Day 11 — PI + order lifecycle', () => {
  test('convert an accepted quotation → send → confirm PI → order', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    page.on('dialog', (d) => void d.accept());

    // Collect accepted-quotation links. The day8 seed created some quotations
    // for dealers later set inactive; convert rejects those, so we walk the
    // list until one converts cleanly.
    await page.goto('/quotations?status=accepted');
    const hrefs = (
      await page
        .locator('table tbody tr a[href^="/quotations/"]')
        .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')))
    ).filter((h): h is string => !!h && /^\/quotations\/[0-9a-f-]+$/.test(h));
    expect(hrefs.length).toBeGreaterThan(0);

    let converted = false;
    for (const href of hrefs) {
      await page.goto(`${href}/convert-to-pi`);
      await expect(page.getByRole('heading', { name: /New PI from/ })).toBeVisible();
      await page.getByRole('button', { name: 'Create draft PI' }).click();
      try {
        await page.waitForURL(/\/pi\/[0-9a-f-]+$/, { timeout: 15_000 });
        converted = true;
        break;
      } catch {
        // This quotation could not convert (e.g. inactive dealer) — try next.
      }
    }
    expect(converted, 'expected at least one accepted quotation to convert').toBe(true);

    // On the new PI (draft). Scope status assertions to the hero heading —
    // the activity feed repeats the same status words.
    const hero = page.locator('h1').first();
    await expect(hero).toContainText(/PI-/);
    await expect(hero.getByText('draft', { exact: true })).toBeVisible();

    // Send it.
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(hero.getByText('sent', { exact: true })).toBeVisible({ timeout: 20_000 });

    // Confirm the PI → spawns an order.
    await page.getByRole('button', { name: 'Confirm PI' }).click();
    await expect(page.getByText(/Order ORD-.* created\./)).toBeVisible({ timeout: 20_000 });

    // Follow through to the order.
    await page.getByRole('link', { name: /View order ORD-/ }).click();
    const orderHero = page.locator('h1').first();
    await expect(orderHero).toContainText(/ORD-/);
    await expect(orderHero.getByText('pending', { exact: true })).toBeVisible();

    // The confirm-order modal previews the per-line reservation (or shortage).
    // Retry the click — the freshly-navigated order page may still be
    // hydrating when the first click lands.
    await expect(async () => {
      await page.getByRole('button', { name: 'Confirm order' }).click();
      await expect(page.getByText(/Confirm ORD-/)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByText(/reserve \d|short/).first()).toBeVisible();
  });

  test('a seeded confirmed order lists its reserved serials', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    // Walk confirmed orders for a seeded ORD-2026- one WITH reservations.
    // DB-test residue uses ORD-TEST-… numbers; and since Day 13 a returned
    // dispatch can leave a confirmed order with its serials released — so
    // pick the first confirmed order that actually has reserved serials.
    await page.goto('/orders?status=confirmed');
    const seededRows = page.locator('table tbody tr', {
      has: page.locator('td.mono', { hasText: /ORD-\d{4}-/ }),
    });
    const count = await seededRows.count();
    expect(count).toBeGreaterThan(0);
    const orderHrefs: string[] = [];
    for (let i = 0; i < count; i++) {
      const href = await seededRows.nth(i).locator('a[href^="/orders/"]').getAttribute('href');
      if (href) orderHrefs.push(href);
    }

    let foundReservations = false;
    for (const href of orderHrefs) {
      await page.goto(`${href}?tab=reservations`);
      await expect(page.locator('h1').first()).toContainText(/ORD-/);
      const rows = page.locator('table tbody tr');
      if ((await rows.count()) > 0 && (await page.getByText('reserved').count()) > 0) {
        await expect(rows.first()).toBeVisible();
        await expect(page.getByText('reserved').first()).toBeVisible();
        foundReservations = true;
        break;
      }
    }
    expect(foundReservations, 'a seeded confirmed order with reserved serials').toBe(true);
  });

  test('a three-party PI shows distinct Bill-To and Ship-To blocks', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/pi');
    // Seeded three-party PIs label the dealer cell with "ship → …".
    const threePartyRow = page.locator('table tbody tr', { hasText: /ship →/ });
    expect(await threePartyRow.count()).toBeGreaterThan(0);
    await threePartyRow.first().locator('a[href^="/pi/"]').click();

    await expect(page.locator('h1').first()).toContainText(/PI-/);
    await expect(page.getByText('Bill to', { exact: true })).toBeVisible();
    await expect(page.getByText('Ship to', { exact: true })).toBeVisible();
  });
});
