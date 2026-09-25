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
 *
 * ## THE PER-TENANT LOOP IS AN RLS MECHANIC. "EVERY TENANT" WAS NEVER THE POINT.
 *
 * These assertions originally ran over EVERY row in `tenants`, and that was correct
 * only by coincidence: at the time, every tenant was one `index.ts` created and
 * `multi-rate.ts` therefore seeded. It was a proxy for "every tenant the multi-rate
 * seed ran for", and the two stopped being the same thing when F.106 added the
 * client demo tenant — created AFTER `multi-rate.ts` runs, so the seed never sees
 * it, so it has none of this corpus by construction.
 *
 * The scope is now DERIVED from what the seed actually wrote: a tenant is in scope
 * if it carries products with the multi-rate seed's own SKU prefix. Not a slug
 * list, and not an exclusion by name — either would silently drop the next tenant
 * added for the same reason, and would need editing every time one appears.
 *
 * **Do not "restore" the all-tenants loop.** It would not be a stricter test; it
 * would assert that a tenant seeded from a client's real catalogue must also carry
 * fixture products the client does not sell, and the only way to satisfy it would
 * be to put those products in front of the prospect. The operator's ruling on F.106
 * was that (b) and (c) — reordering the seed, or padding the client's catalogue —
 * both change the demo to fit the test.
 *
 * `BASE_TENANTS_EXPECTED` below is what stops the derivation from hiding a
 * regression: if a BASE tenant ever drops out of the multi-rate seed, the derived
 * scope would quietly shrink and everything here would still pass. That count is
 * the guard, and it is asserted before anything else.
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
/**
 * The tenants the multi-rate seed ACTUALLY RAN FOR — the scope of every assertion
 * below. See "the per-tenant loop is an RLS mechanic" in the file docblock.
 */
const corpusTenants: { id: string; slug: string }[] = [];

/**
 * How many tenants must carry the corpus.
 *
 * `index.ts` seeds two base tenants, and `multi-rate.ts` enumerates every ACTIVE
 * tenant at its turn, so both must appear. This is the assertion that catches a
 * BASE tenant silently dropping out of the multi-rate seed — without it, deriving
 * the scope would quietly shrink to one tenant and still pass. Raise it if
 * `TENANT_SEEDS` grows.
 */
const BASE_TENANTS_EXPECTED = 2;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const rows = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants);
  for (const r of rows) tenantIds.push(r);
  if (tenantIds.length === 0) throw new Error('no seeded tenants — run pnpm db:seed');

  // DERIVED FROM WHAT THE SEED ACTUALLY WROTE, never from a slug list. A tenant
  // is in scope if it carries products from the multi-rate seed, identified by
  // that seed's own SKU prefix — the same marker this file already uses to pick
  // multi-rate products out of a catalogue.
  //
  // A slug list, or an exclusion by name, would silently drop the NEXT tenant
  // added for the same reason as this one, and would need editing every time.
  for (const t of tenantIds) {
    const hit = await asTenant(t.id, (tx) =>
      tx
        .select({ sku: products.sku })
        .from(products)
        .where(and(eq(products.tenantId, t.id), like(products.sku, 'MR-%')))
        .limit(1),
    );
    if (hit.length > 0) corpusTenants.push(t);
  }
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
  it('NON-VACUITY: the multi-rate seed covered every base tenant', () => {
    // Asserted FIRST, because every other assertion in this file is a `for` loop
    // over `corpusTenants` — and a loop over an empty or short array passes
    // silently. This is what makes the rest of the file mean something.
    expect(
      corpusTenants.length,
      `tenants carrying the multi-rate corpus: ${corpusTenants.map((t) => t.slug).join(', ') || '(none)'}`,
    ).toBeGreaterThanOrEqual(BASE_TENANTS_EXPECTED);
  });

  it('gives every tenant a catalogue with at least three distinct GST rates', async () => {
    for (const t of corpusTenants) {
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
    for (const t of corpusTenants) {
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
    for (const t of corpusTenants) {
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
    for (const t of corpusTenants) {
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
    for (const t of corpusTenants) {
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
    for (const t of corpusTenants) {
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
    for (const t of corpusTenants) {
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

/**
 * F.84 — the 3% fixture's shape.
 *
 * Appended to F.81's file rather than given its own (D-5), because the seed that
 * produces these rows is F.81's module extended rather than a new one (D-1) and
 * the test's provenance should match the seed's.
 *
 * WHAT EACH ASSERTION IS FOR. Two of them exist because F.84's acceptance
 * criterion 5 — the render check — is only satisfiable on a document that is
 * BOTH single-rate AND intra-state. `quotation.tsx` sets `gstRateLabel` to null
 * when a document carries more than one rate, `view-model.ts` then renders the
 * half-rate label as an empty string, and only the intra-state branch of
 * `quotation.typ` emits a half at all. So "there is a 3% document somewhere" is
 * not enough: if the corpus ever flattens to a mixed-only 3% document, the render
 * test starts failing on a fixture problem that looks like a renderer problem.
 * These assertions make that fail HERE, where the name says what it is about.
 */
describe('F.84 3% fixture corpus', () => {
  it('gives every tenant a 3% product on its own HSN code', async () => {
    for (const t of corpusTenants) {
      await asTenant(t.id, async (tx) => {
        const rows = await tx
          .select({ sku: products.sku, hsn: products.hsnCode, rate: products.gstRate })
          .from(products)
          .where(eq(products.tenantId, t.id));

        // Set membership, never a count: a count of N is satisfied by any N rates
        // and would not notice 3 being swapped for something else.
        expect(distinct(rows, 'rate'), `${t.slug} catalogue rates`).toContain('3.00');

        const threePct = rows.filter((r) => r.rate === '3.00');
        expect(threePct.length, `${t.slug} 3% products`).toBeGreaterThan(0);
        // Its HSN must not collide with the four already in the catalogue, or the
        // 3% group stops being a distinct HSN group for F.3/F.4 to exercise.
        for (const r of threePct) {
          expect(
            ['85414300', '85414011', '85044090', '85359090'],
            `${t.slug}: 3% product ${r.sku} should carry a NEW hsn, not a reused one`,
          ).not.toContain(r.hsn);
        }
      });
    }
  });

  it('has an INTRA-STATE quotation whose every line is 3% — criterion 5 needs both', async () => {
    for (const t of corpusTenants) {
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

        const qualifying: string[] = [];
        for (const q of quotes) {
          if (q.tenantState !== q.pos) continue; // intra-state only: CGST/SGST split
          const lines = await tx
            .select({ rate: quotationLines.gstRate })
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, q.id));
          if (lines.length === 0) continue;
          const rates = distinct(lines, 'rate');
          // SINGLE-rate: exactly one distinct rate, and it is 3.00.
          if (rates.length === 1 && rates[0] === '3.00') qualifying.push(q.number);
        }
        expect(
          qualifying.length,
          `${t.slug}: intra-state quotations whose every line is 3.00`,
        ).toBeGreaterThan(0);
      });
    }
  });

  it('carries a PI at 3% whose rate set matches its quotation', async () => {
    for (const t of corpusTenants) {
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
          if (!(piRates.length === 1 && piRates[0] === '3.00')) continue;
          const qLines = await tx
            .select({ rate: quotationLines.gstRate })
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, pi.q));
          expect(piRates, `${pi.number} rates vs its quotation`).toEqual(distinct(qLines, 'rate'));
          matched += 1;
        }
        expect(matched, `${t.slug}: single-rate 3% PIs`).toBeGreaterThan(0);
      });
    }
  });

  it('leaves an accepted 3% quotation with NO PI, for the request-layer spec', async () => {
    // D-7. The e2e converts this one. Without it the spec would have to re-convert
    // an already-converted quotation, which works only because
    // convert-quotation-to-pi.ts happens not to forbid a second PI — a guard
    // nobody has decided should be absent.
    for (const t of corpusTenants) {
      await asTenant(t.id, async (tx) => {
        const quotes = await tx
          .select({ id: quotations.id, number: quotations.quoteNumber, status: quotations.status })
          .from(quotations)
          .where(and(eq(quotations.tenantId, t.id), like(quotations.quoteNumber, 'QT-%')));

        const unconverted: string[] = [];
        for (const q of quotes) {
          if (q.status !== 'accepted') continue;
          const lines = await tx
            .select({ rate: quotationLines.gstRate })
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, q.id));
          const rates = distinct(lines, 'rate');
          if (!(rates.length === 1 && rates[0] === '3.00')) continue;
          const [pi] = await tx
            .select({ id: performaInvoices.id })
            .from(performaInvoices)
            .where(eq(performaInvoices.quotationId, q.id))
            .limit(1);
          if (!pi) unconverted.push(q.number);
        }
        expect(
          unconverted.length,
          `${t.slug}: accepted single-rate 3% quotations with no PI`,
        ).toBeGreaterThan(0);
      });
    }
  });

  it('puts TWO 3% lines with ODD rupee subtotals on one document — the rounding case', async () => {
    // 3% halves to 1.5%, and 1.5% of an odd integer lands on a half-paisa, so
    // per-line and document-level rounding diverge. With one line, or with even
    // subtotals, the two models agree and a regression of the per-line model would
    // pass unnoticed. Measured when the prices were chosen: odd subtotals give
    // CGST 562.39 per-line against 562.38 document-level, an even-subtotal control
    // gives 339.18 either way.
    for (const t of corpusTenants) {
      await asTenant(t.id, async (tx) => {
        const quotes = await tx
          .select({ id: quotations.id, number: quotations.quoteNumber })
          .from(quotations)
          .where(and(eq(quotations.tenantId, t.id), like(quotations.quoteNumber, 'QT-%')));

        let found = 0;
        for (const q of quotes) {
          const lines = await tx
            .select({ rate: quotationLines.gstRate, lineTotal: quotationLines.lineTotal })
            .from(quotationLines)
            .where(eq(quotationLines.quotationId, q.id));
          const threes = lines.filter((l) => l.rate === '3.00');
          if (threes.length < 2) continue;
          const allOdd = threes.every((l) => {
            const n = Number(l.lineTotal);
            return Number.isInteger(n) && n % 2 !== 0;
          });
          if (allOdd) found += 1;
        }
        expect(
          found,
          `${t.slug}: documents with 2+ 3% lines at odd integer subtotals`,
        ).toBeGreaterThan(0);
      });
    }
  });
});
