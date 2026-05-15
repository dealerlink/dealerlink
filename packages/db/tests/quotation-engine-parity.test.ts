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
import { computeTax, type GstRate } from '@dealerlink/tax';
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
});
