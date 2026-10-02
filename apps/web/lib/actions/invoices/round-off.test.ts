/**
 * A.6 — the round-off bound, asserted at BOTH layers and at the boundary.
 *
 * ## WHY THE BOUNDARY IS TESTED AND NOT ASSUMED
 *
 * Two independent things enforce the same rule: the database CHECK
 * `abs(round_off) < 1.00`, and the application's
 * `roundOff.abs().greaterThanOrEqualTo(1)` throw. **`< 1.00` excludes exactly 1.00,
 * and `>= 1` rejects exactly 1.00, so they agree — but that agreement is a
 * coincidence of two separately written expressions and is exactly the kind of
 * thing that is true until someone edits one of them.** So it is asserted: 0.99
 * accepted by both, 1.00 rejected by both.
 *
 * ## AND THE CHECK IS OTHERWISE UNREACHABLE
 *
 * Because the application throws on the same bound, the database CHECK can never
 * fire through `createInvoiceFromOrder`. That is deliberate — defence in depth
 * against a second write path, a seed, or a manual repair — but it means normal
 * operation never exercises it, so a CHECK that had been written wrongly (or
 * dropped) would look identical to one that works. This writes to the column
 * DIRECTLY to find out.
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

import { adminDb } from '@dealerlink/db';
import { Decimal } from '@dealerlink/tax';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { computeRoundOff, ROUND_OFF_BOUND, ROUND_OFF_MODE } from './round-off';

/**
 * Insert a row with the given `round_off` and report whether the CHECK accepted it.
 *
 * ## NO SENTINEL, AND THAT IS A CORRECTION
 *
 * The first version of this probe wrapped the INSERT in a `DO $$ … $$` block that
 * ended with `RAISE EXCEPTION '__probe_rollback__'`, and classified the outcome by
 * testing whether the error message contained that sentinel. **It reported every
 * rejection as an acceptance**, because drizzle echoes the QUERY TEXT in
 * `error.message` — and the query text contains the sentinel. So the detector
 * matched a string the query itself carried, and the 0.99 case passed for the wrong
 * reason while the 1.00 case silently inverted.
 *
 * This version succeeds or fails on the INSERT alone and classifies on
 * `error.cause.message`, which is where the Postgres error actually lives
 * (`error.message` is only "Failed query: …"). The row is deleted on success.
 */
async function checkAccepts(value: string): Promise<{ accepted: boolean; error: string }> {
  const marker = `__ROUNDOFF_PROBE_${value}__`;
  try {
    await adminDb.execute(sql`
      INSERT INTO invoices (
        tenant_id, invoice_number, order_id, bill_to_dealer_id, ship_to_dealer_id,
        tenant_state_at_issue, place_of_supply, subtotal, taxable_amount,
        total_amount, round_off
      )
      SELECT t.id, ${marker}, o.id, d.id, d.id, 'MH', 'MH', 100, 100, 100,
             ${value}::numeric(12, 2)
      FROM tenants t
      JOIN dealers d ON d.tenant_id = t.id
      JOIN orders o ON o.tenant_id = t.id
      WHERE t.slug = 'demo'
      LIMIT 1`);
    // Accepted. Remove it — this test must leave nothing behind.
    await adminDb.execute(sql`DELETE FROM invoices WHERE invoice_number = ${marker}`);
    return { accepted: true, error: '' };
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return { accepted: false, error: err.cause?.message ?? err.message ?? String(e) };
  }
}

describe('A.6 — the round-off bound at both layers', () => {
  it('the database CHECK accepts 0.99 and -0.99 and REJECTS 1.00 and -1.00', async () => {
    const plus099 = await checkAccepts('0.99');
    expect(plus099.accepted, `0.99 should be accepted: ${plus099.error}`).toBe(true);

    const minus099 = await checkAccepts('-0.99');
    expect(minus099.accepted, `-0.99 should be accepted: ${minus099.error}`).toBe(true);

    // SIGNED, with no >= 0 CHECK — rounding 13,744.40 down gives -0.40, so a
    // non-negative constraint would reject roughly half of all real documents.
    const plus100 = await checkAccepts('1.00');
    expect(plus100.accepted).toBe(false);
    expect(plus100.error).toContain('invoices_round_off_chk');

    const minus100 = await checkAccepts('-1.00');
    expect(minus100.accepted).toBe(false);
    expect(minus100.error).toContain('invoices_round_off_chk');
  });

  it('the application rejects at exactly the same boundary as the CHECK', () => {
    expect(ROUND_OFF_BOUND.toFixed(2)).toBe('1.00');

    // 0.99 — accepted. taxable + tax = 99.01, whole-rupee total = 100.
    const ok = computeRoundOff({
      engineTotal: '99.51',
      taxableAmount: '99.01',
      groupedTax: '0.00',
      documentLabel: 'probe',
      sourceLabel: 'probe source',
    });
    expect(ok.storedTotal.toFixed(2)).toBe('100.00');
    expect(ok.roundOff.toFixed(2)).toBe('0.99');

    // Exactly 1.00 — REJECTED. The DB would reject it too, which is the point.
    expect(() =>
      computeRoundOff({
        engineTotal: '99.50',
        taxableAmount: '99.00',
        groupedTax: '0.00',
        documentLabel: 'tax invoice INV-TEST-0001',
        sourceLabel: 'order ORD-TEST-0001',
      }),
    ).toThrow(/a rupee or more/);
  });

  it('the refusal DIAGNOSES rather than refuses — it names the upstream cause', () => {
    let message = '';
    try {
      computeRoundOff({
        engineTotal: '99.50',
        taxableAmount: '99.00',
        groupedTax: '0.00',
        documentLabel: 'tax invoice INV-TEST-0001',
        sourceLabel: 'order ORD-TEST-0001',
      });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    // An operator hitting this needs to know where to look, and would not otherwise
    // guess that the cause is in a different document.
    expect(message).toContain('MIS-STATED TOTAL, NOT A ROUNDING');
    expect(message).toContain('LOOK UPSTREAM');
    expect(message).toContain('order ORD-TEST-0001');
    expect(message).toContain('disagree');
    expect(message).toContain('Nothing is wrong with this invoice request');
  });

  it('rounds HALF_UP, and the alternatives are named where the decision is made', () => {
    expect(ROUND_OFF_MODE).toBe(Decimal.ROUND_HALF_UP);
    // .50 goes UP under HALF_UP. Under ROUND_HALF_EVEN it would go to 100 here but
    // to 100 from 100.50 as well, which is the distinction the comment names.
    const r = computeRoundOff({
      engineTotal: '99.50',
      taxableAmount: '99.50',
      groupedTax: '0.00',
      documentLabel: 'probe',
      sourceLabel: 'probe source',
    });
    expect(r.storedTotal.toFixed(2)).toBe('100.00');
    expect(r.roundOff.toFixed(2)).toBe('0.50');
  });

  it('round_off is SIGNED — a downward rounding produces a negative term', () => {
    const r = computeRoundOff({
      engineTotal: '13744.40',
      taxableAmount: '13744.40',
      groupedTax: '0.00',
      documentLabel: 'probe',
      sourceLabel: 'probe source',
    });
    expect(r.storedTotal.toFixed(2)).toBe('13744.00');
    expect(r.roundOff.toFixed(2)).toBe('-0.40');
  });

  it("reproduces the client's own voucher — 13,743.54 against a stated 13,744.00", () => {
    // 12,629.50 + 557.02 + 557.02 = 13,743.54, and their Tally voucher carries
    // ROUND OFFS 0.46 against a stated total of 13,744.00.
    const r = computeRoundOff({
      engineTotal: '13743.54',
      taxableAmount: '12629.50',
      groupedTax: new Decimal('557.02').plus('557.02').toFixed(2),
      documentLabel: 'probe',
      sourceLabel: 'probe source',
    });
    expect(r.storedTotal.toFixed(2)).toBe('13744.00');
    expect(r.roundOff.toFixed(2)).toBe('0.46');
  });
});
