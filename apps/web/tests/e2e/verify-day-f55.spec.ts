/**
 * F.55 verify — shape-only GST rate validation on the catalogue surface.
 *
 * WHY THIS FILE EXISTS AT ALL. `apps/web` has no jsdom or testing-library
 * harness — `apps/web/package.json` lists `vitest` and nothing of the kind — so
 * Playwright is the ONLY mechanical check on the two rate inputs and on the
 * warning affordance. `docs/GST_RATE_MODEL_AUDIT.md` §5.4b put that warning on
 * Option A's ledger precisely so it would not be discovered later, and D-6's
 * reasoning was that "a warning nobody can test is indistinguishable from no
 * warning". This is the test that makes it distinguishable.
 *
 * What it proves, and the order matters:
 *   1. The rate control is a NUMERIC INPUT, not a `<select>` — i.e. the hardcoded
 *      option list is actually gone from the rendered page, not merely from source.
 *   2. A rate the old enum could never express (40) can be entered and saved.
 *   3. An unusual rate WARNS and does not REJECT, and a second explicit action
 *      completes the save. A rejection would be a bound wearing different clothes.
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers';

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

const unique = () => `F55-${Date.now().toString(36).toUpperCase()}`;

test.describe('F.55 — GST rate is shape-validated tenant data', () => {
  test('the rate control is a numeric input, not a dropdown of hardcoded slabs', async ({
    page,
  }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/catalog/new');

    const rate = page.getByLabel('GST rate');
    await expect(rate).toBeVisible();
    // The affordance itself is the assertion: a <select> would have no `type`.
    await expect(rate).toHaveAttribute('type', 'number');
    // And the old enumeration must not be rendering anywhere on the page.
    await expect(page.locator('select option', { hasText: /^28%$/ })).toHaveCount(0);
  });

  test('a product saves at 40% — a rate the previous enum could not express', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/catalog/new');

    const sku = unique();
    await page.getByLabel('SKU').fill(sku);
    await page.getByLabel('Name', { exact: false }).first().fill('F55 demerit-rate product');
    await page.getByLabel('HSN code').fill('85414300');
    await page.getByLabel('GST rate').fill('40');
    await page.getByLabel('Default selling price', { exact: false }).fill('1000');

    // 40 is outside the seeded catalogue's rates, so the warning fires first and
    // the first click does NOT save — that is the D-6 contract.
    await page.getByRole('button', { name: /save|create/i }).first().click();
    await expect(page.getByTestId('gst-rate-warning')).toBeVisible();

    // Second, explicit click completes it. The warning never blocked anything.
    await page.getByRole('button', { name: /save|create/i }).first().click();
    await expect(page).toHaveURL(/\/catalog\/[0-9a-f-]+/, { timeout: 15_000 });
    await expect(page.getByText('40', { exact: false }).first()).toBeVisible();
  });

  test('a rate already in the catalogue raises no warning', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto('/catalog/new');

    // Renamed 2026-09-19: the title said "saves with no warning", and this body
    // never clicks Save — it asserts the warning is absent on input. The assertion
    // was always sound; the name over-claimed (F.84 drafting, R-3).
    //
    // 18 is in the seeded catalogue, so nothing unusual to warn about. This is the
    // control: without it, a warning that fired on EVERY value would pass the
    // test above and be indistinguishable from a correct one.
    await page.getByLabel('GST rate').fill('18');
    await expect(page.getByTestId('gst-rate-warning')).toHaveCount(0);
  });
});
