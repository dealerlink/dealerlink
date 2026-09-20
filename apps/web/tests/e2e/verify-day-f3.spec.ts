/**
 * F.3 verify — a mixed-rate document says what it charged, on screen.
 *
 * ── DOCUMENTS ARE RESOLVED BY SHAPE, NOT BY NUMBER ──────────────────────────
 *
 * Every document below is found by QUERYING for the property under test — more
 * than one distinct `gst_rate` among its lines, and the supply type — rather than
 * by a hardcoded `QT-` number. Two reasons:
 *
 *   1. The property is what the test is about. A test addressing `QT-2026-0016`
 *      asserts something about one row; a test addressing "a multi-rate
 *      intra-state quotation" asserts something about the feature, and fails
 *      loudly if the corpus stops containing one.
 *   2. F.84's D-3 kept number-addressing for the 14 REFERENCE cases, on the
 *      ground that appending seed chains after Chain B keeps prior counters fixed
 *      (`packages/db/src/seeds/multi-rate.ts:722-737`). That argument protects
 *      documents the reference matrix already names. It does not extend to a new
 *      assertion about a document this day did not seed.
 *
 * `critical-path.spec.ts` is protected (`docs/STAGE_F_BUILD_v3.md` §9) and is not
 * touched. F.55's one-line authorisation there was scoped to F.55.
 *
 * ── WHAT IT ASSERTS, AND WHY EACH ONE CAN FAIL ──────────────────────────────
 *
 * - **More than one rate row.** Before F.3 these screens rendered exactly one
 *   CGST/SGST pair labelled `mixed` (the builder) or with no rate at all (the
 *   saved views). One row per rate is the feature; a count of 1 on a document with
 *   two distinct rates is the old behaviour.
 * - **Every rate row names its rate.** P-7. A row reading `CGST` with no
 *   percentage is what a customer could not verify.
 * - **Two decimals, always.** P-8. `groupedINR` used `minimumFractionDigits: 0`,
 *   so 211.50 rendered `₹211.5`. The assertion targets an amount whose SECOND
 *   DECIMAL IS ZERO, because that is the only case the old formatter got wrong —
 *   asserting on `562.39` would have passed before the fix too.
 */
import path from 'node:path';

import { adminDb } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';

import { loginAs } from './helpers';

// Playwright transpiles specs to CJS, so `import.meta` is unavailable here. The
// runner's cwd is `apps/web` (see playwright.config.ts `testDir`).
const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

/**
 * Find a quotation for the `demo` tenant with more than one distinct GST rate and
 * the requested supply type. Returns its id, or null if the corpus has none — the
 * caller fails rather than skipping, because an absent fixture is a real problem.
 */
async function findMultiRateQuotation(supply: 'intra' | 'inter'): Promise<string | null> {
  const cmp = supply === 'intra' ? sql`=` : sql`<>`;
  const rows = (await adminDb.execute(sql`
    SELECT q.id::text AS id
    FROM quotations q
    JOIN tenants t ON t.id = q.tenant_id
    WHERE t.slug = 'demo'
      AND q.tenant_state_at_issue ${cmp} q.place_of_supply
      AND (
        SELECT count(DISTINCT l.gst_rate) FROM quotation_lines l WHERE l.quotation_id = q.id
      ) > 1
    ORDER BY q.quote_number
    LIMIT 1
  `)) as unknown as { id: string }[];
  return rows[0]?.id ?? null;
}

/** Every rendered tax amount on the page, as raw strings. */
async function taxAmounts(page: Page): Promise<string[]> {
  const rows = page.locator(
    '[data-testid^="cgst-row-"], [data-testid^="sgst-row-"], [data-testid^="igst-row-"]',
  );
  const n = await rows.count();
  const out: string[] = [];
  for (let i = 0; i < n; i += 1)
    out.push(((await rows.nth(i).locator('dd').textContent()) ?? '').trim());
  return out;
}

/** Every rendered tax row label. */
async function taxLabels(page: Page): Promise<string[]> {
  const rows = page.locator(
    '[data-testid^="cgst-row-"], [data-testid^="sgst-row-"], [data-testid^="igst-row-"]',
  );
  const n = await rows.count();
  const out: string[] = [];
  for (let i = 0; i < n; i += 1)
    out.push(((await rows.nth(i).locator('dt').textContent()) ?? '').trim());
  return out;
}

test.describe('F.3 — the rate-wise tax block on screen', () => {
  test('an intra-state multi-rate quotation shows one CGST/SGST pair PER RATE', async ({
    page,
  }) => {
    const id = await findMultiRateQuotation('intra');
    expect(
      id,
      'corpus must contain an intra-state multi-rate quotation (F.81 Chain A)',
    ).toBeTruthy();

    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto(`/quotations/${id}`);

    const cgst = page.locator('[data-testid^="cgst-row-"]');
    const sgst = page.locator('[data-testid^="sgst-row-"]');

    // The feature: more than ONE pair. Before F.3 this was always exactly one.
    await expect(cgst).not.toHaveCount(1);
    expect(await cgst.count(), 'more than one CGST row').toBeGreaterThan(1);
    expect(await sgst.count(), 'one SGST row per CGST row').toBe(await cgst.count());

    // Intra-state carries no IGST row at all.
    await expect(page.locator('[data-testid^="igst-row-"]')).toHaveCount(0);

    // P-7: every row names its rate.
    for (const label of await taxLabels(page)) {
      expect(label, 'every tax row states a rate').toMatch(/(CGST|SGST) @ \d+(\.\d+)?%/);
    }
  });

  test('an inter-state multi-rate quotation shows one IGST row PER RATE', async ({ page }) => {
    const id = await findMultiRateQuotation('inter');
    expect(
      id,
      'corpus must contain an inter-state multi-rate quotation (F.81 Chain B)',
    ).toBeTruthy();

    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto(`/quotations/${id}`);

    const igst = page.locator('[data-testid^="igst-row-"]');
    expect(await igst.count(), 'more than one IGST row').toBeGreaterThan(1);

    // Inter-state carries neither a CGST nor an SGST row.
    await expect(page.locator('[data-testid^="cgst-row-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="sgst-row-"]')).toHaveCount(0);

    for (const label of await taxLabels(page)) {
      expect(label, 'every IGST row states the full rate').toMatch(/IGST @ \d+(\.\d+)?%/);
    }
  });

  test('P-8: every tax amount renders with exactly two decimals', async ({ page }) => {
    const id = await findMultiRateQuotation('intra');
    expect(id).toBeTruthy();

    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto(`/quotations/${id}`);

    const amounts = await taxAmounts(page);
    expect(amounts.length, 'tax rows must exist to assert on').toBeGreaterThan(1);

    for (const a of amounts) {
      expect(a, 'two decimals, always').toMatch(/^₹[\d,]+\.\d{2}$/);
    }

    // THE DISCRIMINATING CASE. A value whose second decimal is 0 is the only one
    // the old formatter rendered wrongly — `minimumFractionDigits: 0` dropped it,
    // so 3972.50 became "₹3,972.5". Asserting only on a `.39`-ending amount would
    // have passed before the fix, which is the whole point of picking this one.
    const trailingZero = amounts.filter((a) => /\.\d0$/.test(a));
    expect(
      trailingZero.length,
      `expected at least one amount ending in a zero second decimal; got ${amounts.join(', ')}`,
    ).toBeGreaterThan(0);
  });
});
