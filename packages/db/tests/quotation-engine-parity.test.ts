/**
 * Day 9 — tax-engine parity test.
 *
 * Re-runs the authoritative `@dealerlink/tax` engine against every seeded
 * `QT-` quotation and asserts the recomputed totals match the header totals
 * that Day 8 persisted. This is the proof that swapping the preview helper
 * for the canonical engine did not move any number on existing data.
 *
 * Runs per-tenant because RLS scopes every query to `app.tenant_id`.
 */
import { computeTax, computeTaxSummary, type GstRate } from '@dealerlink/tax';
import { and, asc, eq, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import { quotationLines, quotations, tenants } from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
const tenantIds: string[] = [];

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const rows = await db.select({ id: tenants.id }).from(tenants);
  for (const r of rows) tenantIds.push(r.id);
  if (tenantIds.length === 0) throw new Error('no seeded tenants — run pnpm db:seed');
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

describe('Day 9 tax engine — parity with Day 8 stored quotation totals', () => {
  it('recomputes every seeded QT- quotation to identical header totals', async () => {
    let checked = 0;

    for (const tenantId of tenantIds) {
      await asTenant(tenantId, async (tx) => {
        const quotes = await tx
          .select()
          .from(quotations)
          .where(and(eq(quotations.tenantId, tenantId), like(quotations.quoteNumber, 'QT-%')));

        for (const q of quotes) {
          const lines = await tx
            .select()
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, q.id))
            .orderBy(asc(quotationLines.lineNumber));

          expect(lines.length, `${q.quoteNumber} should have lines`).toBeGreaterThan(0);

          const result = computeTax({
            tenantState: q.tenantStateAtIssue,
            placeOfSupply: q.placeOfSupply,
            lines: lines.map((l) => ({
              lineId: l.id,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              gstRate: Number(l.gstRate) as GstRate,
            })),
            discount:
              q.discountType && q.discountValue != null
                ? { type: q.discountType, value: q.discountValue }
                : null,
          });

          const where = `${q.quoteNumber} (tenant ${tenantId.slice(0, 8)})`;
          expect(result.subtotal.toFixed(2), `${where} subtotal`).toBe(q.subtotal);
          expect(result.discountAmount.toFixed(2), `${where} discountAmount`).toBe(
            q.discountAmount,
          );
          expect(result.taxableAmount.toFixed(2), `${where} taxableAmount`).toBe(q.taxableAmount);
          expect(result.cgstAmount.toFixed(2), `${where} cgstAmount`).toBe(q.cgstAmount);
          expect(result.sgstAmount.toFixed(2), `${where} sgstAmount`).toBe(q.sgstAmount);
          expect(result.igstAmount.toFixed(2), `${where} igstAmount`).toBe(q.igstAmount);
          expect(result.totalAmount.toFixed(2), `${where} totalAmount`).toBe(q.totalAmount);
          checked += 1;
        }
      });
    }

    expect(checked, 'expected seeded QT- quotations to exist').toBeGreaterThan(0);
  });

  /**
   * F.3 — the same parity invariant, EXTENDED to the two new groupings rather
   * than duplicated into a parallel suite (`docs/F3_F4_SPEC.md` §4 item 5).
   *
   * **What this can and cannot catch.** Both sides come from `computeTax`: the
   * grouped figures, and the stored headers the seed wrote with the same engine
   * (`packages/db/src/seeds/multi-rate.ts:28-56`). So it catches a GROUPING error
   * — a dropped line, a duplicated line, a mis-keyed group, a group-level
   * rounding — and it CANNOT catch an engine error. Stated because "reconciles
   * exactly to the stored totals" otherwise reads as though the engine were
   * verified by it.
   *
   * The TAXABLE identity is asserted against the STORED `taxable_amount`, which is
   * the stronger check: it compares the grouping against persisted data rather
   * than against a second call to the same function.
   *
   * **It used to be asserted against a re-computed sum of per-line taxables, and
   * that workaround expired with F.101.** Before F.101 the engine allocated the
   * document discount per line by independent proportional rounding, so on a
   * discounted document `sum(lineTaxable)` could fall a paisa under the stored
   * `taxable_amount` — measured at 210325.49 against 210325.50 on a 4-rate 12.5%
   * document, with `sum(lineDiscount)` 30046.51 against `discountAmount` 30046.50.
   * Asserting the stored column then would have failed for a reason that had
   * nothing to do with grouping, so it deliberately did not.
   *
   * F.101 replaced that allocation with a largest-remainder one, so the per-line
   * sum now equals the document figure exactly and the stored column is assertable.
   * `taxable_amount` is one of the three columns F.101 could not move by
   * construction, so this is a comparison against a number no engine change
   * touched.
   *
   * The history is kept rather than deleted because a reader who finds a one-paisa
   * taxable mismatch should know this shape existed and what closed it — but it is
   * written as history, not as current behaviour. A comment saying "that is F.101"
   * outliving F.101 is how a closed task keeps being cited as live.
   */
  it('groups every seeded QT- quotation to sums that reconcile exactly', async () => {
    let checked = 0;
    let multiRate = 0;
    let oneHsnTwoRates = 0;

    for (const tenantId of tenantIds) {
      await asTenant(tenantId, async (tx) => {
        const quotes = await tx
          .select()
          .from(quotations)
          .where(and(eq(quotations.tenantId, tenantId), like(quotations.quoteNumber, 'QT-%')));

        for (const q of quotes) {
          const lines = await tx
            .select()
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, q.id))
            .orderBy(asc(quotationLines.lineNumber));

          const discount =
            q.discountType && q.discountValue != null
              ? { type: q.discountType, value: q.discountValue }
              : null;
          const engineLines = lines.map((l) => ({
            lineId: l.id,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            gstRate: Number(l.gstRate) as GstRate,
          }));

          const summary = computeTaxSummary({
            tenantState: q.tenantStateAtIssue,
            placeOfSupply: q.placeOfSupply,
            discount,
            lines: engineLines.map((l, i) => ({ ...l, hsnCode: lines[i]!.hsnCode ?? '' })),
          });

          const where = `${q.quoteNumber} (tenant ${tenantId.slice(0, 8)})`;
          const add = (xs: { toFixed: (n: number) => string }[]) =>
            xs.reduce((a, x) => a + Number(x.toFixed(2)), 0).toFixed(2);

          // 1 + 2 — both partitions reconcile to the STORED taxable_amount. Since
          // F.101 this is assertable directly; see the docblock for what it
          // replaced and why the weaker form existed.
          const storedTaxable = Number(q.taxableAmount).toFixed(2);
          expect(add(summary.byRate.map((g) => g.taxableValue)), `${where} byRate taxable`).toBe(
            storedTaxable,
          );
          expect(add(summary.byHsn.map((g) => g.taxableValue)), `${where} byHsn taxable`).toBe(
            storedTaxable,
          );

          // 3 + 4 — and both reconcile to the STORED tax columns exactly. Taxes
          // are summed per line on both sides, so the F.101 delta cannot arise.
          const storedTax = (
            Number(q.cgstAmount) +
            Number(q.sgstAmount) +
            Number(q.igstAmount)
          ).toFixed(2);
          expect(
            add(summary.byRate.map((g) => g.cgstAmount.plus(g.sgstAmount).plus(g.igstAmount))),
            `${where} byRate tax vs stored`,
          ).toBe(storedTax);
          expect(add(summary.byHsn.map((g) => g.totalTax)), `${where} byHsn tax vs stored`).toBe(
            storedTax,
          );

          // Shape facts, so a corpus that stopped exercising grouping is visible.
          const rates = new Set(lines.map((l) => Number(l.gstRate)));
          const hsns = new Set(lines.map((l) => l.hsnCode));
          const pairs = new Set(lines.map((l) => `${l.hsnCode}|${Number(l.gstRate)}`));
          expect(summary.byRate.length, `${where} rate group count`).toBe(rates.size);
          expect(summary.byHsn.length, `${where} hsn row count`).toBe(pairs.size);
          if (rates.size > 1) multiRate += 1;
          if (pairs.size > hsns.size) oneHsnTwoRates += 1;
          checked += 1;
        }
      });
    }

    expect(checked, 'expected seeded QT- quotations to exist').toBeGreaterThan(0);

    // NON-VACUITY, asserted rather than assumed. Without a multi-rate document
    // every grouping assertion above holds trivially with one group; without one
    // HSN carrying two rates the two partitions are indistinguishable. F.81
    // Chain A supplies the first, Chain B the second.
    expect(multiRate, 'corpus must contain multi-rate quotations').toBeGreaterThan(0);
    expect(
      oneHsnTwoRates,
      'corpus must contain a quotation where one HSN carries two rates',
    ).toBeGreaterThan(0);
  });
});
