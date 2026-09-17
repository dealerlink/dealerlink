/**
 * F.81 — corpus-shape assertions for the multi-rate seed.
 *
 * These do not test a feature. They assert that the SEED CORPUS contains the
 * documents F.3 and F.4 need in order to be testable at all: a quotation with
 * more than one GST rate and more than one HSN code on its lines, a PI that
 * carries the same rates, and an order the GST summary report can actually
 * see.
 *
 * Why that is worth a test of its own: before F.81 every product in the
 * catalogue was 18%, so any rate-wise or HSN-wise assertion F.3/F.4 added
 * would have passed against a single-rate fixture whether or not the feature
 * worked. If a future change flattens the corpus back to one rate, the tasks
 * that depend on it should fail HERE — loudly, in a file whose name says what
 * it is about — rather than silently going green everywhere else.
 *
 * Runs per tenant because RLS scopes every query to `app.tenant_id`.
 */
import { and, asc, eq, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import {
  orderLines,
  orders,
  performaInvoiceLines,
  performaInvoices,
  products,
  quotationLines,
  quotations,
  tenants,
} from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

/** Statuses the GST summary report counts as an actual supply. */
const GST_SUPPLY_STATUSES = ['confirmed', 'partially_dispatched', 'fully_dispatched', 'delivered'];

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
const tenantIds: { id: string; slug: string }[] = [];

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const rows = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants);
  for (const r of rows) tenantIds.push(r);
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

/** Distinct values of `key` in `rows`, as a sorted array — not a count. */
function distinct<T extends Record<string, unknown>>(rows: T[], key: keyof T): string[] {
  return [...new Set(rows.map((r) => String(r[key])))].sort();
}

describe('F.81 multi-rate seed corpus', () => {
  it('gives every tenant a catalogue with at least three distinct GST rates', async () => {
    for (const t of tenantIds) {
      await asTenant(t.id, async (tx) => {
        const rows = await tx
          .select({ sku: products.sku, hsn: products.hsnCode, rate: products.gstRate })
          .from(products)
          .where(eq(products.tenantId, t.id));

        const rates = distinct(rows, 'rate');
        // Asserted as a SET, not a count: a count of 3 is satisfied by any
        // three rates, and the two this corpus specifically needs are 5 (the
        // only rounding-sensitive rate here) and 18 (the pre-existing one).
        expect(rates, `${t.slug} catalogue rates`).toContain('5.00');
        expect(rates, `${t.slug} catalogue rates`).toContain('12.00');
        expect(rates, `${t.slug} catalogue rates`).toContain('18.00');

        const multiRate = rows.filter((r) => r.sku.startsWith('MR-'));
        expect(distinct(multiRate, 'hsn').length, `${t.slug} multi-rate HSN codes`).toBeGreaterThan(
          1,
        );
      });
    }
  });

  it('has a quotation with two distinct rates AND two distinct HSN codes on its lines', async () => {
    for (const t of tenantIds) {
      await asTenant(t.id, async (tx) => {
        const quotes = await tx
          .select({ id: quotations.id, number: quotations.quoteNumber })
          .from(quotations)
          .where(and(eq(quotations.tenantId, t.id), like(quotations.quoteNumber, 'QT-%')));

        let found = 0;
        for (const q of quotes) {
          const lines = await tx
            .select({ rate: quotationLines.gstRate, hsn: quotationLines.hsnCode })
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, q.id));
          if (distinct(lines, 'rate').length > 1 && distinct(lines, 'hsn').length > 1) found += 1;
        }
        expect(found, `${t.slug}: quotations with 2+ rates and 2+ HSNs`).toBeGreaterThan(0);
      });
    }
  });

  it('carries a THREE-rate quotation whose lines are not already ascending by rate', async () => {
    for (const t of tenantIds) {
      await asTenant(t.id, async (tx) => {
        const quotes = await tx
          .select({ id: quotations.id, number: quotations.quoteNumber })
          .from(quotations)
          .where(and(eq(quotations.tenantId, t.id), like(quotations.quoteNumber, 'QT-%')));

        const shapes: string[] = [];
        for (const q of quotes) {
          const lines = await tx
            .select({ rate: quotationLines.gstRate })
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, q.id))
            .orderBy(asc(quotationLines.lineNumber));
          if (distinct(lines, 'rate').length < 3) continue;
          const seq = lines.map((l) => Number(l.rate));
          const ascending = seq.every((v, i) => i === 0 || v >= seq[i - 1]!);
          // A three-rate document whose lines ALREADY ascend would let a
          // missing sort pass F3_F4_SPEC §3's ordering requirement.
          if (!ascending) shapes.push(`${q.number}:${seq.join('/')}`);
        }
        expect(shapes.length, `${t.slug}: 3-rate non-ascending quotations`).toBeGreaterThan(0);
      });
    }
  });

  it('puts TWO lines at 5% on one intra-state quotation — the rounding-sensitive case', async () => {
    for (const t of tenantIds) {
      await asTenant(t.id, async (tx) => {
        const quotes = await tx
          .select({
            id: quotations.id,
            number: quotations.quoteNumber,
            tenantState: quotations.tenantStateAtIssue,
            pos: quotations.placeOfSupply,
          })
          .from(quotations)
          .where(and(eq(quotations.tenantId, t.id), like(quotations.quoteNumber, 'QT-%')));

        let found = 0;
        for (const q of quotes) {
          if (q.tenantState !== q.pos) continue; // intra-state only: CGST/SGST split
          const lines = await tx
            .select({ rate: quotationLines.gstRate })
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, q.id));
          // With ONE 5% line, per-line and document-level rounding agree
          // trivially and a regression of e32c350 would pass unnoticed.
          if (lines.filter((l) => l.rate === '5.00').length >= 2) found += 1;
        }
        expect(found, `${t.slug}: intra-state quotations with 2+ lines at 5%`).toBeGreaterThan(0);
      });
    }
  });

  it('carries a PI with the same two rates as its quotation', async () => {
    for (const t of tenantIds) {
      await asTenant(t.id, async (tx) => {
        const pis = await tx
          .select({
            id: performaInvoices.id,
            number: performaInvoices.piNumber,
            q: performaInvoices.quotationId,
          })
          .from(performaInvoices)
          .where(eq(performaInvoices.tenantId, t.id));

        let matched = 0;
        for (const pi of pis) {
          const piLines = await tx
            .select({ rate: performaInvoiceLines.gstRate })
            .from(performaInvoiceLines)
            .where(eq(performaInvoiceLines.performaInvoiceId, pi.id));
          const piRates = distinct(piLines, 'rate');
          if (piRates.length < 2) continue;
          const qLines = await tx
            .select({ rate: quotationLines.gstRate })
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, pi.q));
          expect(piRates, `${pi.number} rates vs its quotation`).toEqual(distinct(qLines, 'rate'));
          matched += 1;
        }
        expect(matched, `${t.slug}: multi-rate PIs`).toBeGreaterThan(0);
      });
    }
  });

  it('has a mixed-rate order the GST summary report can see', async () => {
    for (const t of tenantIds) {
      await asTenant(t.id, async (tx) => {
        const rows = await tx
          .select({ id: orders.id, number: orders.orderNumber, status: orders.status })
          .from(orders)
          .where(eq(orders.tenantId, t.id));

        let found = 0;
        for (const o of rows) {
          // A `pending` order is invisible to gstSummaryReport, so a
          // mixed-rate order in that status would not exercise F.3 at all.
          if (!GST_SUPPLY_STATUSES.includes(o.status)) continue;
          const lines = await tx
            .select({ rate: orderLines.gstRate, hsn: orderLines.hsnCode })
            .from(orderLines)
            .where(eq(orderLines.orderId, o.id));
          if (distinct(lines, 'rate').length > 1) found += 1;
        }
        expect(found, `${t.slug}: mixed-rate orders in a supply status`).toBeGreaterThan(0);
      });
    }
  });

  it('has one HSN code carrying TWO different rates on a single document', async () => {
    for (const t of tenantIds) {
      await asTenant(t.id, async (tx) => {
        const rows = await tx
          .select({ id: orders.id, number: orders.orderNumber })
          .from(orders)
          .where(eq(orders.tenantId, t.id));

        const offenders: string[] = [];
        for (const o of rows) {
          const lines = await tx
            .select({ rate: orderLines.gstRate, hsn: orderLines.hsnCode })
            .from(orderLines)
            .where(eq(orderLines.orderId, o.id));
          const byHsn = new Map<string, Set<string>>();
          for (const l of lines) {
            if (!byHsn.has(l.hsn)) byHsn.set(l.hsn, new Set());
            byHsn.get(l.hsn)!.add(l.rate);
          }
          for (const [hsn, rates] of byHsn) {
            if (rates.size > 1) offenders.push(`${o.number}:${hsn}=${[...rates].sort().join('+')}`);
          }
        }
        // This is the case an HSN grouping implemented by grouping on RATE
        // cannot get right: it would emit one row per (hsn, rate) pair rather
        // than one per HSN. Without such a document in the corpus, that bug
        // is undetectable.
        expect(
          offenders.length,
          `${t.slug}: documents where one HSN spans two rates`,
        ).toBeGreaterThan(0);
      });
    }
  });
});
