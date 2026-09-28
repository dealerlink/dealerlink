/**
 * F.5a verify — the delivery-arrangement control asks its question only when the
 * question can arise, and the classification it drives comes from the server.
 *
 * ## THE NEGATIVE CASE IS THE POINT, NOT A COURTESY
 *
 * Acceptance criterion 14 is that the control appears **only** when Ship-To differs
 * from Bill-To. A test that merely finds the control when the parties differ would
 * pass just as well if the control were rendered unconditionally — and an
 * unconditional control is a real defect, not a cosmetic one: it asks the user to
 * classify a transaction that has no third party, and whatever they answer gets
 * stored as a determination nobody was entitled to make. So absence is asserted
 * first, on the same page, before anything is changed.
 *
 * Both halves run against ONE document in ONE flow. Two separate documents would
 * let the pair pass for unrelated reasons — a control missing on document A and
 * present on document B is consistent with the control depending on something else
 * entirely. Toggling Ship-To on a single page holds everything else fixed.
 *
 * ## DOCUMENTS ARE RESOLVED BY SHAPE, NOT BY NUMBER
 *
 * The quotation is found by QUERYING for the property under test — accepted, in
 * `demo`, with a dealer whose state is known — rather than by a hardcoded `QT-`
 * number. F.84's D-3 kept number-addressing for the 14 REFERENCE cases only, on an
 * argument about pinned counters that does not extend to a new assertion about a
 * document this day did not seed. It also means this spec keeps working when the
 * corpus grows, and fails loudly if the corpus stops containing a convertible
 * quotation.
 *
 * ## WHAT IT DOES NOT COVER
 *
 * It does not assert the tax-type LABEL on a rendered PDF under §10(1)(b). Nothing
 * does — that is F.131, stated rather than left implicit. This covers the screen.
 *
 * `critical-path.spec.ts` is protected (`docs/STAGE_F_BUILD_v3.md` §9) and is not
 * touched.
 */
import path from 'node:path';

import { adminDb } from '@dealerlink/db';
import { expect, test, type Page } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';

import { loginAs } from './helpers';

// Playwright transpiles specs to CJS, so `import.meta` is unavailable. The
// runner's cwd is `apps/web` (playwright.config.ts `testDir`).
const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

/**
 * An accepted `demo` quotation whose dealer has a state, plus the id and state of
 * a DIFFERENT active dealer in a DIFFERENT state to redirect Ship-To to.
 *
 * The other dealer must be in another state, or switching Ship-To would not change
 * the place of supply and the assertion about the classification would be vacuous.
 */
async function findConvertibleQuotation(): Promise<{
  quotationId: string;
  billToDealerId: string;
  billToState: string;
  otherDealerId: string;
  otherState: string;
} | null> {
  const rows = (await adminDb.execute(sql`
    SELECT q.id::text AS quotation_id,
           bd.id::text     AS bill_to_dealer_id,
           upper(bd.state) AS bill_to_state,
           od.id::text     AS other_dealer_id,
           upper(od.state)  AS other_state
    FROM quotations q
    JOIN tenants t  ON t.id = q.tenant_id
    JOIN dealers bd ON bd.id = q.dealer_id
    JOIN dealers od ON od.tenant_id = q.tenant_id
                   AND od.id <> q.dealer_id
                   AND od.status = 'active'
                   AND od.state IS NOT NULL
                   AND upper(od.state) <> upper(bd.state)
    WHERE t.slug = 'demo'
      AND q.status = 'accepted'
      AND bd.state IS NOT NULL
    ORDER BY q.quote_number, od.dealer_code
    LIMIT 1
  `)) as unknown as {
    quotation_id: string;
    bill_to_dealer_id: string;
    bill_to_state: string;
    other_dealer_id: string;
    other_state: string;
  }[];
  const r = rows[0];
  return r
    ? {
        quotationId: r.quotation_id,
        billToDealerId: r.bill_to_dealer_id,
        billToState: r.bill_to_state,
        otherDealerId: r.other_dealer_id,
        otherState: r.other_state,
      }
    : null;
}

test.describe('F.5a — the delivery arrangement is asked only when it can arise', () => {
  test('absent when Ship-To is the Bill-To dealer, present when it is not', async ({ page }) => {
    const fixture = await findConvertibleQuotation();
    // Fail rather than skip: an absent fixture is a corpus problem, and skipping
    // would turn it into silence (§11.1 ruling 1).
    expect(
      fixture,
      'demo has no accepted quotation with a differently-stated second dealer — run pnpm db:seed',
    ).not.toBeNull();
    const f = fixture!;

    await loginAs(page, 'demo', 'sales');
    await skipIfPasswordRotation(page);
    await page.goto(`/quotations/${f.quotationId}/convert-to-pi`);

    const control = page.locator('[data-testid="delivery-arrangement"]');
    const shipToSelect = page.locator('select').first();
    await expect(shipToSelect).toBeVisible();

    // ── THE NEGATIVE CASE, asserted before anything is touched. Ship-To defaults
    //    to the Bill-To dealer, so the parties match and there is nothing to ask.
    await expect(control, 'the control must NOT appear while the parties match').toHaveCount(0);

    // ── Redirect Ship-To to a dealer in a different state.
    await shipToSelect.selectOption(f.otherDealerId);
    await expect(control, 'the control must appear once the parties differ').toHaveCount(1);

    // Both clauses are offered, and (a) is preselected — the default that keeps
    // every existing document's classification valid.
    const a = control.locator('input[value="s10_1_a"]');
    const b = control.locator('input[value="s10_1_b"]');
    await expect(a).toBeChecked();
    await expect(b).not.toBeChecked();

    // ── And it goes away again. Without this, "appears when they differ" is
    //    consistent with "appears once and never leaves".
    //
    // SELECTS THE BILL-TO DEALER BY ID, AND THE ASSERTION IS UNCONDITIONAL. Both
    // halves of that are a correction. The first version did
    // `selectOption({ index: 0 })` and guarded the assertion with
    // `if (firstIsBillTo !== f.otherDealerId)` — but option 0 is merely the first
    // dealer in the list, which need not be the Bill-To dealer, and the guard only
    // checked it was not the OTHER dealer. So when option 0 was a third dealer the
    // parties still differed, the control correctly stayed, and the assertion
    // failed on CI while passing locally.
    //
    // The guard was the worse half. **A conditional assertion can pass without
    // running**, so the test reported success under exactly the orderings its
    // author had not anticipated. Asserting on an explicit id removes the reason
    // the guard existed.
    await shipToSelect.selectOption(f.billToDealerId);
    await expect(
      control,
      'the control must disappear when Ship-To returns to the Bill-To dealer',
    ).toHaveCount(0);
  });

  test('switching the arrangement moves the place of supply, server-derived', async ({ page }) => {
    const fixture = await findConvertibleQuotation();
    expect(fixture, 'fixture missing — run pnpm db:seed').not.toBeNull();
    const f = fixture!;

    await loginAs(page, 'demo', 'sales');
    await skipIfPasswordRotation(page);
    await page.goto(`/quotations/${f.quotationId}/convert-to-pi`);

    const shipToSelect = page.locator('select').first();
    await shipToSelect.selectOption(f.otherDealerId);
    const control = page.locator('[data-testid="delivery-arrangement"]');
    await expect(control).toHaveCount(1);

    // TARGETED AT THE PLACE-OF-SUPPLY ELEMENT, NOT THE PAGE BODY — and that is a
    // correction, not a style preference. The first version of this asserted
    // `expect(page.locator('body')).toContainText(billToState)`, which is VACUOUS:
    // the Bill-To dealer's state is rendered unconditionally in the Parties block,
    // so the assertion passed whatever the arrangement was. A whole-page
    // `toContainText` on a two-letter code is almost always vacuous.
    const pos = page.locator('[data-testid="place-of-supply"]');

    // Under §10(1)(a) the place of supply is the SHIP-TO state.
    await expect(pos, '(a) must resolve to the ship-to state').toHaveText(f.otherState);

    // Under §10(1)(b) it becomes the BILL-TO state. This is the assertion that
    // could not pass if the forms had kept their own client-side copy of the rule:
    // that copy derived place of supply from `shipTo.state` unconditionally, so
    // this element could not move at all.
    await control.locator('input[value="s10_1_b"]').check();
    await expect(pos, '(b) must resolve to the bill-to state').toHaveText(f.billToState);

    // And back, so the assertion above cannot pass by the element simply having
    // changed once to something that happens to match.
    await control.locator('input[value="s10_1_a"]').check();
    await expect(pos, 'switching back to (a) must restore the ship-to state').toHaveText(
      f.otherState,
    );
  });
});
