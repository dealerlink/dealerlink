/**
 * F.84 verify — 3% through the request layer.
 *
 * ── WHY ONLY TWO HOPS, AND WHY THESE TWO (D-6) ──────────────────────────────
 *
 * F.55's spec asks for end-to-end reach, and F.84's notes read as though that
 * means driving quotation → PI → order through the UI. The operator has recorded
 * that wording as ASPIRATIONAL. What the evidence supports is narrower and
 * sharper: `docs/F55_AUDIT.md` §2 enumerates the five production paths that reach
 * `computeTax`, and exactly TWO have no Zod schema in front of them —
 *
 *   1. the browser preview, `apps/web/lib/quotation/preview.ts` → `computeTax`,
 *      re-run from the quotation builder's summary card on every line edit;
 *   2. `apps/web/lib/actions/pi/convert-quotation-to-pi.ts`, whose lines come
 *      straight out of `quotation_lines` via `loadQuotationLines`.
 *
 * Those are the two a rate can reach without passing a schema, so those are the
 * two worth driving at a rate that has never flowed through them.
 *
 * THE ORDER HOP IS EXCLUDED, AND NOT BECAUSE IT IS GUARDED. `confirmPi` is a
 * `tenantAction` carrying `confirmPiSchema`, but that schema is
 * `z.object({ id: z.string().uuid() })` — the PI id and nothing else. Order lines
 * take `gstRate: l.gstRate` copied verbatim out of `performa_invoice_lines`. So
 * the hop performs NO rate validation at all, which is precisely why it needs no
 * coverage: there is nothing there that could reject 3%. Excluding it because it
 * is inert is sound; excluding it because it is guarded would have been false.
 *
 * `critical-path.spec.ts` is protected (`docs/STAGE_F_BUILD_v3.md` §9) and is not
 * touched. F.55's one-line authorisation there was scoped to F.55.
 *
 * ── WHAT THIS DOES NOT ASSERT, DELIBERATELY ─────────────────────────────────
 *
 * No D-6 warning at 3%. The F.84 fixture puts a 3% product in the catalogue, so
 * `listTenantGstRates` now returns 3 and `rateIsUnusual` is false for it —
 * asserting a warning here would fail for a correct reason. (That the query
 * returns rates from inactive and discontinued products as well is F.96, filed,
 * not this day's.)
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { loginAs } from './helpers';

/** F.84's accepted, deliberately UNCONVERTED 3% quotation — Chain D, per D-7. */
const UNCONVERTED_3PC = 'QT-2026-0019';
/** The 3% product Chain C and D both bill. */
const THREE_PCT_SKU = 'MR-ASSAY-KIT';

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

async function pickOption(select: Locator, text: string): Promise<void> {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  expect(value, `a <select> option matching "${text}"`).toBeTruthy();
  await select.selectOption(value!);
}

test.describe('F.84 — 3% through the two paths that reach computeTax unguarded', () => {
  test('hop 1: the builder computes live totals for a 3% line in the browser', async ({ page }) => {
    // preview.ts → computeTax, client-side, on every line edit. Before F.55 a 3%
    // line threw here inside a useMemo; the point is that it now computes.
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/quotations/new');
    await expect(page.getByRole('heading', { name: 'New quotation' })).toBeVisible();

    // Any dealer in the tenant's own state, so the split is CGST/SGST and the
    // half-rate is observable as 1.5%.
    await pickOption(page.getByLabel('Dealer'), 'Sharma Solar');
    await pickOption(page.getByLabel('Add a product line'), THREE_PCT_SKU);

    const summary = page.getByText('Totals').locator('..');
    // The rate reached the engine and came back: a CGST figure exists at all.
    await expect(summary.getByText(/CGST/i).first()).toBeVisible({ timeout: 15_000 });
    // And it is the 3% half, not some other rate's.
    await expect(summary.getByText(/1\.5\s*%/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('hop 2: an accepted 3% quotation converts to a PI', async ({ page }) => {
    // convert-quotation-to-pi.ts reads quotation_lines directly and calls
    // computeTax with NO Zod in front of it — the one production path where a
    // stored rate reaches the engine unvalidated. QT-2026-0019 is seeded accepted
    // and unconverted precisely so this has an explicit precondition (D-7) rather
    // than relying on convert-quotation-to-pi happening not to forbid a second PI.
    //
    // Admin, not sales: the action guards `role === 'sales' && preparedBy !== me`,
    // and the seed sets preparedBy to the tenant's sales user.
    //
    // ON RE-RUNS WITHOUT A RESEED, and stated because it is the honest limit of
    // D-7: converting leaves the quotation `accepted` (the status enum has no
    // "converted" value) and `quotation-actions.tsx` shows the link on status
    // alone, so a second local run converts an ALREADY-converted quotation and
    // passes. That works only because convert-quotation-to-pi.ts happens not to
    // forbid a second PI — the very property D-7 exists to avoid depending on.
    // D-7 buys the guarantee where it matters: CI reseeds every run, so the
    // precondition there is always the explicit unconverted Chain D quotation.
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/quotations');
    await page.getByRole('link', { name: UNCONVERTED_3PC }).first().click();
    await expect(page.locator('h1').first()).toContainText(UNCONVERTED_3PC);

    await page.getByRole('link', { name: 'Convert to PI' }).click();
    await expect(page.getByRole('heading', { name: /New PI from/ })).toBeVisible();

    // Same hydration retry critical-path.spec.ts uses: the freshly-navigated form
    // may still be attaching handlers when the first click lands.
    await expect(async () => {
      if (/\/convert-to-pi$/.test(page.url())) {
        await page.getByRole('button', { name: 'Create draft PI' }).click();
      }
      await expect(page).toHaveURL(/\/pi\/[0-9a-f-]+$/);
    }).toPass({ timeout: 60_000 });

    // The PI exists and carries the rate through.
    await expect(page.locator('h1').first()).toContainText(/PI-/);
    await expect(page.getByText('3%').first()).toBeVisible({ timeout: 15_000 });
  });

  test('the catalogue form now suggests 3 (D-8: the datalist, not the placeholder)', async ({
    page,
  }) => {
    // The seeded 3% product reaches a user-visible surface via
    // listTenantGstRates. Asserted on the DATALIST because it is a set and is
    // stable; the placeholder is `String(knownGstRates[0])`, which is
    // order-dependent and would break when F.87's 0% fixture lands.
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/catalog/new');
    const option = page.locator('#gst-rate-suggestions option[value="3"]');
    await expect(option).toHaveCount(1);
  });
});
