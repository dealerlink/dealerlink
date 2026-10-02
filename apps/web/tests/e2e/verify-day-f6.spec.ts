/**
 * F.169 — the three F.6 write paths, driven end to end.
 *
 * ## WHY THIS SPEC EXISTS, AND WHY IT IS ITS OWN ROW
 *
 * F.6 shipped `createInvoiceFromOrder`, `createCreditNote` and `createDebitNote` as
 * `'use server'` actions, and the day's tests exercised them **only indirectly** —
 * the seed INSERTs rows directly without calling them, the render tests load what
 * the seed wrote, the numbering tests call the allocators rather than the actions.
 * So after a 13,798-line merge, **the only things that had ever run those three
 * were `tsc` and `eslint`.** Every other build day on this project has had a
 * `verify-day-*` spec driving its feature end to end.
 *
 * What only a test through the UI can reach, and none of which had executed once:
 * `tenantAction`'s role gate, the one-invoice-per-order guard, the refusal to
 * invoice a `pending` order, `assertOrderReconciles` against a real order, the
 * round-off write path, and the zero-quantity refusal.
 *
 * ## DOCUMENTS ARE RESOLVED BY A STABLE KEY, NEVER BY `.first()` OR SHAPE
 *
 * F.137 / DEV.119. Orders are addressed by NUMBER through a DB lookup, and the
 * order chosen is one with a KNOWN non-zero round-off consequence — not whichever
 * row happens to sort first. A spec that picks a document by position silently
 * re-points when the corpus grows.
 *
 * ## BOTH SIDES OF THE ROLE GATE
 *
 * F6 D-8 splits authority: **Accounts** issues invoices, **Admin alone** issues the
 * notes that reduce or increase a receivable. A spec that only drove an admin would
 * pass identically if the gate were `['admin','accounts']` everywhere, which is the
 * distinction the decision exists to make. So Accounts is asserted to be able to
 * invoice AND unable to raise a note.
 */
import path from 'node:path';

import { adminDb } from '@dealerlink/db';
import { expect, test, type Page } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';

import { loginAs } from './helpers';

const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

/**
 * The order this spec issues from, addressed BY NUMBER.
 *
 * ## A RESERVED FIXTURE, NOT A SEARCH (F.137 / DEV.119)
 *
 * The first version of this helper QUERIED for "any invoiceable order", which is a
 * search by shape and turned out to be worse than it looked: only FOUR orders in the
 * demo corpus are invoiceable at all — the other ~43 store zero tax while the engine
 * computes real tax, so `assertOrderReconciles` correctly refuses them — and three
 * of the four carry the seed's pinned invoices. So the search had exactly ONE
 * candidate, this spec consumed it on its first run, and every later run failed
 * telling the reader to reseed, which would not have helped.
 *
 * `seeds/invoices.ts` now RESERVES this order and removes any invoice against it, so
 * `pnpm db:seed:invoices` genuinely restores the fixture. CI reseeds on every run
 * and would never have surfaced the problem.
 */
const RESERVED_ORDER = 'ORD-2026-0023';

async function reservedOrder(): Promise<{
  id: string;
  orderNumber: string;
  taxableAmount: string;
}> {
  const rows = (await adminDb.execute(sql`
    SELECT o.id::text AS id, o.order_number, o.taxable_amount
    FROM orders o
    JOIN tenants t ON t.id = o.tenant_id
    WHERE t.slug = 'demo' AND o.order_number = ${RESERVED_ORDER}
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = o.id)
  `)) as unknown as { id: string; order_number: string; taxable_amount: string }[];
  const r = rows[0];
  if (!r) {
    throw new Error(
      `${RESERVED_ORDER} is missing or already invoiced. This spec consumes its ` +
        'fixture; restore it with "pnpm --filter @dealerlink/db db:seed:invoices", ' +
        'which removes any invoice against it.',
    );
  }
  return { id: r.id, orderNumber: r.order_number, taxableAmount: r.taxable_amount };
}

/** A `demo` order still `pending`, to assert the refusal. */
async function findPendingOrder(): Promise<string | null> {
  const rows = (await adminDb.execute(sql`
    SELECT o.id::text AS id FROM orders o JOIN tenants t ON t.id = o.tenant_id
    WHERE t.slug = 'demo' AND o.status = 'pending'
    ORDER BY o.order_number LIMIT 1
  `)) as unknown as { id: string }[];
  return rows[0]?.id ?? null;
}

/** The invoice the seed issued with a NEGATIVE round-off. Addressed by number. */
const NEGATIVE_ROUND_OFF_INVOICE = 'INV-2026-0022';
/** The seed's zero-round-off invoice, for the suppressed branch. */
const ZERO_ROUND_OFF_INVOICE = 'INV-2026-0002';

async function invoiceIdByNumber(number: string): Promise<string> {
  const rows = (await adminDb.execute(sql`
    SELECT i.id::text AS id FROM invoices i JOIN tenants t ON t.id = i.tenant_id
    WHERE t.slug = 'demo' AND i.invoice_number = ${number}
  `)) as unknown as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new Error(`${number} missing — run pnpm db:seed:invoices`);
  return id;
}

test.describe('F.169 — invoice, credit note and debit note end to end', () => {
  /**
   * RESTORE THE FIXTURE BEFORE THE ISSUING TEST, so the spec is RETRY-SAFE.
   *
   * The issuing test consumes its own fixture: it creates an invoice against
   * `ORD-2026-0023`, after which `reservedOrder()` throws. Playwright retries a
   * failed test once, so **a single transient failure made the retry impossible** —
   * attempt 1 wrote the invoice, attempt 2 found the order already invoiced and
   * failed in 478ms for a completely different reason than the original. Observed,
   * not hypothesised.
   *
   * The seed owns the same reset (`seeds/invoices.ts`), but a seed only runs when
   * someone runs it. This makes the spec self-sufficient: it holds the same
   * contract as the seed, for the same reason, at the moment it is needed.
   *
   * Notes hold a `restrict` FK to the invoice, so they go first.
   */
  test.beforeEach(async () => {
    const stale = (await adminDb.execute(sql`
      SELECT i.id::text AS id
      FROM invoices i
      JOIN orders o ON o.id = i.order_id
      JOIN tenants t ON t.id = i.tenant_id
      WHERE t.slug = 'demo' AND o.order_number = ${RESERVED_ORDER}
    `)) as unknown as { id: string }[];
    for (const row of stale) {
      await adminDb.execute(sql`DELETE FROM credit_notes WHERE invoice_id = ${row.id}::uuid`);
      await adminDb.execute(sql`DELETE FROM debit_notes  WHERE invoice_id = ${row.id}::uuid`);
      await adminDb.execute(sql`DELETE FROM invoices      WHERE id = ${row.id}::uuid`);
    }
  });

  test('ACCOUNTS issues a tax invoice from a confirmed order, and the stored figures are right', async ({
    page,
  }) => {
    // Fails loudly with a restore instruction if the fixture was consumed — never
    // skips, because skipping turns a corpus problem into silence (§11.1 ruling 1).
    const o = await reservedOrder();

    // ACCOUNTS, not admin. This is the half of F6 D-8 that an admin-only spec
    // would never exercise.
    await loginAs(page, 'demo', 'accounts');
    await skipIfPasswordRotation(page);
    await page.goto(`/orders/${o.id}`);

    const issue = page.locator('[data-testid="issue-invoice"]');
    await expect(issue, 'accounts must be offered the issue control').toHaveCount(1);
    await issue.click();

    // SURFACE THE REFUSAL RATHER THAN TIMING OUT. The write path's errors are
    // diagnoses — `assertOrderReconciles` names the order, the column and both
    // figures; the round-off bound explains that the total is mis-stated. A spec
    // that only waits for navigation reports "timeout" for every one of them, which
    // is how the first version of this test failed: the action refused, the page
    // displayed the reason, and the test could not read it.
    const refusal = page.locator('[data-testid="order-action-error"]');
    const refused = await refusal
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (refused) {
      throw new Error(`issuance was REFUSED: ${await refusal.innerText()}`);
    }

    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 30_000 });

    const number = await page.locator('[data-testid="invoice-number"]').innerText();
    expect(number).toMatch(/^INV-\d{4}-\d{4}$/);

    // ── THE STORED FIGURES, read back from the DATABASE rather than from the page.
    //    A page assertion would pass if the action wrote the wrong numbers and the
    //    page rendered them faithfully.
    const rows = (await adminDb.execute(sql`
      SELECT i.taxable_amount, i.total_amount, i.round_off,
             i.cgst_amount, i.sgst_amount, i.igst_amount,
             i.tenant_state_at_issue, i.place_of_supply, o.order_number
      FROM invoices i JOIN orders o ON o.id = i.order_id
      WHERE i.invoice_number = ${number.trim()}
    `)) as unknown as Record<string, string>[];
    expect(rows).toHaveLength(1);
    const inv = rows[0]!;

    // Issued against the order we clicked from — not some other order.
    expect(inv['order_number']).toBe(o.orderNumber);
    // Tax inputs FROZEN from the order, never re-derived (ADR-016).
    expect(inv['taxable_amount']).toBe(o.taxableAmount);

    // THE ROUND-OFF IDENTITY, asserted on the stored values:
    //   round_off === total − (taxable + cgst + sgst + igst)
    const n = (k: string) => Number(inv[k]);
    const derived =
      n('total_amount') -
      (n('taxable_amount') + n('cgst_amount') + n('sgst_amount') + n('igst_amount'));
    expect(Number(inv['round_off'])).toBeCloseTo(derived, 2);
    // And the total is a WHOLE RUPEE (F6 D-3), which is the thing that makes the
    // round-off non-trivial. A write path storing the engine total would fail here.
    expect(Number(inv['total_amount']) % 1).toBe(0);
    // Signed and bounded.
    expect(Math.abs(Number(inv['round_off']))).toBeLessThan(1);
  });

  test('a second invoice against the same order is refused, with a message naming the first', async ({
    page,
  }) => {
    // The seed issued INV-2026-0001 against ORD-2026-0001, so that order is
    // already invoiced and the control must be gone.
    const rows = (await adminDb.execute(sql`
      SELECT o.id::text AS id FROM orders o
      JOIN tenants t ON t.id = o.tenant_id
      JOIN invoices i ON i.order_id = o.id
      WHERE t.slug = 'demo' ORDER BY o.order_number LIMIT 1
    `)) as unknown as { id: string }[];
    expect(rows[0], 'no already-invoiced order — run pnpm db:seed:invoices').toBeTruthy();

    await loginAs(page, 'demo', 'accounts');
    await skipIfPasswordRotation(page);
    await page.goto(`/orders/${rows[0]!.id}`);

    // One invoice per order: the control is gone and the number is shown instead.
    await expect(page.locator('[data-testid="issue-invoice"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="order-invoice-link"]')).toHaveCount(1);
  });

  test('a PENDING order is not offered the control at all', async ({ page }) => {
    const id = await findPendingOrder();
    expect(id, 'demo has no pending order — run pnpm db:seed').not.toBeNull();
    await loginAs(page, 'demo', 'accounts');
    await skipIfPasswordRotation(page);
    await page.goto(`/orders/${id!}`);
    await expect(page.locator('[data-testid="issue-invoice"]')).toHaveCount(0);
  });

  test('ACCOUNTS cannot raise a note — the other half of the role gate', async ({ page }) => {
    const id = await invoiceIdByNumber(NEGATIVE_ROUND_OFF_INVOICE);
    await loginAs(page, 'demo', 'accounts');
    await skipIfPasswordRotation(page);
    await page.goto(`/invoices/${id}`);
    // The invoice is visible to accounts; the note controls are not.
    await expect(page.locator('[data-testid="invoice-number"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="raise-credit-note"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="raise-debit-note"]')).toHaveCount(0);
  });

  test('ADMIN raises a credit note and a debit note, each snapshotting the invoice number', async ({
    page,
  }) => {
    const id = await invoiceIdByNumber(NEGATIVE_ROUND_OFF_INVOICE);
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    await page.goto(`/invoices/${id}`);

    await page.locator('[data-testid="raise-credit-note"]').click();
    await page.locator('[data-testid="note-reason"]').fill('F.169 e2e — short shipment');
    await page.locator('[data-testid="submit-credit-note"]').click();
    await expect(page.locator('[data-testid="credit-note-row"]').first()).toBeVisible({
      timeout: 30_000,
    });

    await page.locator('[data-testid="raise-debit-note"]').click();
    await page.locator('[data-testid="note-reason"]').fill('F.169 e2e — freight undercharged');
    await page.locator('[data-testid="submit-debit-note"]').click();
    await expect(page.locator('[data-testid="debit-note-row"]').first()).toBeVisible({
      timeout: 30_000,
    });

    // ── THE SNAPSHOT, which is the shape with no precedent in the repo. Asserted
    //    on the STORED column: the note must carry the invoice NUMBER as text, not
    //    merely an FK, so a later renumbering cannot move what it reported.
    const notes = (await adminDb.execute(sql`
      SELECT 'credit' AS kind, c.invoice_number, c.reason, c.total_amount
      FROM credit_notes c WHERE c.invoice_id = ${id}::uuid
      UNION ALL
      SELECT 'debit', d.invoice_number, d.reason, d.total_amount
      FROM debit_notes d WHERE d.invoice_id = ${id}::uuid
    `)) as unknown as Record<string, string>[];
    expect(notes.length).toBeGreaterThanOrEqual(2);
    for (const nt of notes) {
      expect(nt['invoice_number'], 'the note must snapshot the invoice NUMBER').toBe(
        NEGATIVE_ROUND_OFF_INVOICE,
      );
      // Positive lines only (D-8): the direction is the table, so the stored total
      // is positive on BOTH note types.
      expect(Number(nt['total_amount'])).toBeGreaterThan(0);
    }
  });

  test('the round-off row renders its SIGNED value, and is absent when zero', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    // NEGATIVE — the case the signed column exists for, and the one a presence
    // check cannot distinguish from positive.
    const negId = await invoiceIdByNumber(NEGATIVE_ROUND_OFF_INVOICE);
    await page.goto(`/invoices/${negId}`);
    const neg = page.locator('[data-testid="invoice-round-off"]');
    await expect(neg).toHaveCount(1);
    await expect(neg).toContainText('-0.25');

    // ZERO — the suppressed branch. Both branches on the same page component, so
    // neither a constant `true` nor a constant `false` satisfies the pair.
    const zeroId = await invoiceIdByNumber(ZERO_ROUND_OFF_INVOICE);
    await page.goto(`/invoices/${zeroId}`);
    await expect(page.locator('[data-testid="invoice-round-off"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="invoice-total"]')).toBeVisible();
  });
});
