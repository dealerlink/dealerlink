/**
 * Day 8 — quotation schema + RLS tests.
 *
 * Smoke-tests the constraints and isolation that Day 9's tax engine
 * relies on. Runs against the demo seed via the app role.
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import {
  dealers,
  documentCounters,
  products,
  quotationLines,
  quotations,
  tenants,
  users,
} from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId: string;
let sampleId: string;
let demoAdminId: string;
let demoDealerId: string;
let demoProductId: string;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });

  const [d] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
  if (!d) throw new Error('seed tenant "demo" missing — run pnpm db:seed');
  demoId = d.id;
  const [s] = await db.select().from(tenants).where(eq(tenants.slug, 'sample'));
  if (!s) throw new Error('seed tenant "sample" missing');
  sampleId = s.id;

  await asTenant(demoId, async (tx) => {
    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${demoId} AND role = 'admin'`)
      .limit(1);
    if (!admin) throw new Error('demo admin missing');
    demoAdminId = admin.id;

    const [dealer] = await tx.select({ id: dealers.id }).from(dealers).limit(1);
    if (!dealer) throw new Error('no dealers in demo seed');
    demoDealerId = dealer.id;

    const [prod] = await tx.select({ id: products.id }).from(products).limit(1);
    if (!prod) throw new Error('no products in demo seed');
    demoProductId = prod.id;
  });
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${demoAdminId ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

async function insertTestQuote(args: {
  tenantId: string;
  quoteNumber: string;
  revision?: number;
  status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'superseded';
  parentId?: string | null;
  totals?: { subtotal: string; taxableAmount: string; totalAmount: string };
  placeOfSupply?: string;
}): Promise<string> {
  return asTenant(args.tenantId, async (tx) => {
    const t = args.totals ?? {
      subtotal: '100.00',
      taxableAmount: '100.00',
      totalAmount: '118.00',
    };
    const [created] = await tx
      .insert(quotations)
      .values({
        tenantId: args.tenantId,
        quoteNumber: args.quoteNumber,
        revision: args.revision ?? 1,
        parentQuotationId: args.parentId ?? null,
        dealerId: demoDealerId,
        preparedBy: demoAdminId,
        tenantStateAtIssue: 'MH',
        placeOfSupply: args.placeOfSupply ?? 'MH',
        quoteDate: new Date().toISOString().slice(0, 10),
        validUntil: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
        currency: 'INR',
        subtotal: t.subtotal,
        taxableAmount: t.taxableAmount,
        cgstAmount: '9.00',
        sgstAmount: '9.00',
        igstAmount: '0.00',
        totalAmount: t.totalAmount,
        status: args.status ?? 'draft',
        createdBy: demoAdminId,
        updatedBy: demoAdminId,
      })
      .returning({ id: quotations.id });
    return created!.id;
  });
}

describe('quotation schema', () => {
  it('inserts a minimal valid quotation', async () => {
    const id = await insertTestQuote({
      tenantId: demoId,
      quoteNumber: `TEST-${Date.now()}`,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('CHECK rejects gst_rate outside the allowed set', async () => {
    const id = await insertTestQuote({
      tenantId: demoId,
      quoteNumber: `TEST-${Date.now()}-rate`,
    });
    await expect(
      asTenant(demoId, async (tx) => {
        await tx.insert(quotationLines).values({
          tenantId: demoId,
          quotationId: id,
          lineNumber: 1,
          productId: demoProductId,
          productSku: 'X',
          productName: 'X',
          hsnCode: '85414011',
          quantity: '1.000',
          unitOfMeasure: 'Nos',
          unitPrice: '100.00',
          gstRate: '9.00', // not in (0, 5, 12, 18, 28)
          lineTotal: '100.00',
        });
      }),
    ).rejects.toThrow(/gst_rate_chk/);
  });

  it('CHECK rejects negative quantity', async () => {
    const id = await insertTestQuote({
      tenantId: demoId,
      quoteNumber: `TEST-${Date.now()}-qty`,
    });
    await expect(
      asTenant(demoId, async (tx) => {
        await tx.insert(quotationLines).values({
          tenantId: demoId,
          quotationId: id,
          lineNumber: 1,
          productId: demoProductId,
          productSku: 'X',
          productName: 'X',
          hsnCode: '85414011',
          quantity: '-1.000',
          unitOfMeasure: 'Nos',
          unitPrice: '100.00',
          gstRate: '18.00',
          lineTotal: '100.00',
        });
      }),
    ).rejects.toThrow(/qty_chk/);
  });

  it('UNIQUE (tenant, quote_number, revision)', async () => {
    const num = `UQ-${Date.now()}`;
    await insertTestQuote({ tenantId: demoId, quoteNumber: num, revision: 1 });
    await expect(
      insertTestQuote({ tenantId: demoId, quoteNumber: num, revision: 1 }),
    ).rejects.toThrow();
  });

  it('allows revision bump for the same quote_number', async () => {
    const num = `UQ2-${Date.now()}`;
    const parentId = await insertTestQuote({ tenantId: demoId, quoteNumber: num, revision: 1 });
    const childId = await insertTestQuote({
      tenantId: demoId,
      quoteNumber: num,
      revision: 2,
      parentId,
    });
    expect(childId).not.toEqual(parentId);
  });

  it('CHECK rejects revision < 1', async () => {
    await expect(
      insertTestQuote({
        tenantId: demoId,
        quoteNumber: `BADREV-${Date.now()}`,
        revision: 0,
      }),
    ).rejects.toThrow(/revision_chk/);
  });

  it('CHECK rejects valid_until < quote_date', async () => {
    await expect(
      asTenant(demoId, async (tx) => {
        await tx.insert(quotations).values({
          tenantId: demoId,
          quoteNumber: `VAL-${Date.now()}`,
          revision: 1,
          dealerId: demoDealerId,
          preparedBy: demoAdminId,
          tenantStateAtIssue: 'MH',
          placeOfSupply: 'MH',
          quoteDate: '2030-01-10',
          validUntil: '2030-01-05',
          currency: 'INR',
          subtotal: '0.00',
          taxableAmount: '0.00',
          totalAmount: '0.00',
          status: 'draft',
          createdBy: demoAdminId,
          updatedBy: demoAdminId,
        });
      }),
    ).rejects.toThrow(/validity_chk/);
  });

  it('CHECK rejects discount value without type', async () => {
    await expect(
      asTenant(demoId, async (tx) => {
        await tx.insert(quotations).values({
          tenantId: demoId,
          quoteNumber: `DISC-${Date.now()}`,
          revision: 1,
          dealerId: demoDealerId,
          preparedBy: demoAdminId,
          tenantStateAtIssue: 'MH',
          placeOfSupply: 'MH',
          quoteDate: '2030-01-01',
          validUntil: '2030-01-30',
          currency: 'INR',
          discountValue: '100.00', // no type
          subtotal: '1000.00',
          taxableAmount: '900.00',
          totalAmount: '1062.00',
          status: 'draft',
          createdBy: demoAdminId,
          updatedBy: demoAdminId,
        });
      }),
    ).rejects.toThrow(/discount_value_chk/);
  });

  it('CHECK rejects percent discount > 100', async () => {
    await expect(
      asTenant(demoId, async (tx) => {
        await tx.insert(quotations).values({
          tenantId: demoId,
          quoteNumber: `DISC2-${Date.now()}`,
          revision: 1,
          dealerId: demoDealerId,
          preparedBy: demoAdminId,
          tenantStateAtIssue: 'MH',
          placeOfSupply: 'MH',
          quoteDate: '2030-01-01',
          validUntil: '2030-01-30',
          currency: 'INR',
          discountType: 'percent',
          discountValue: '150.00',
          subtotal: '1000.00',
          taxableAmount: '900.00',
          totalAmount: '1062.00',
          status: 'draft',
          createdBy: demoAdminId,
          updatedBy: demoAdminId,
        });
      }),
    ).rejects.toThrow(/discount_percent_chk/);
  });
});

describe('quotation RLS isolation', () => {
  it('tenant A cannot see tenant B quotations', async () => {
    const aNum = `RLS-A-${Date.now()}`;
    await insertTestQuote({ tenantId: demoId, quoteNumber: aNum });

    const visibleToSample = await asTenant(sampleId, async (tx) =>
      tx.select({ id: quotations.id }).from(quotations).where(eq(quotations.quoteNumber, aNum)),
    );
    expect(visibleToSample).toEqual([]);
  });

  it('tenant lines isolated even on join', async () => {
    const num = `RLS-B-${Date.now()}`;
    const id = await insertTestQuote({ tenantId: demoId, quoteNumber: num });
    await asTenant(demoId, async (tx) => {
      await tx.insert(quotationLines).values({
        tenantId: demoId,
        quotationId: id,
        lineNumber: 1,
        productId: demoProductId,
        productSku: 'X',
        productName: 'X',
        hsnCode: '85414011',
        quantity: '1.000',
        unitOfMeasure: 'Nos',
        unitPrice: '100.00',
        gstRate: '18.00',
        lineTotal: '100.00',
      });
    });
    const sampleLines = await asTenant(sampleId, async (tx) =>
      tx
        .select({ id: quotationLines.id })
        .from(quotationLines)
        .where(eq(quotationLines.quotationId, id)),
    );
    expect(sampleLines).toEqual([]);
  });
});

describe('document counter for quotations', () => {
  it('atomically increments per (tenant, fiscalYear)', async () => {
    const fy = 9999; // unique sentinel
    const before = await asTenant(demoId, async (tx) =>
      tx
        .select({ v: documentCounters.lastValue })
        .from(documentCounters)
        .where(sql`tenant_id = ${demoId} AND doc_type = 'quotation' AND fiscal_year = ${fy}`),
    );
    const baseline = before[0]?.v != null ? Number(before[0].v) : 0;

    // Use the helper indirectly via the same upsert.
    for (let i = 0; i < 3; i++) {
      await asTenant(demoId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
          VALUES (${demoId}, 'quotation', ${fy}, 1)
          ON CONFLICT (tenant_id, doc_type, fiscal_year)
          DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
        `);
      });
    }
    const after = await asTenant(demoId, async (tx) =>
      tx
        .select({ v: documentCounters.lastValue })
        .from(documentCounters)
        .where(sql`tenant_id = ${demoId} AND doc_type = 'quotation' AND fiscal_year = ${fy}`),
    );
    const ended = Number(after[0]!.v);
    expect(ended - baseline).toBeGreaterThanOrEqual(3);
  });
});

describe('seed integrity — quotation line drift', () => {
  // Regression guard: catches any future seed or Server Action bug that
  // inserts quotation_lines more than once (or drops them), which would
  // make SUM(line_total) diverge from the stored header subtotal and
  // break the Day 9 tax engine, the Builder edit view, and downstream
  // order/invoice modules. Scoped to seeded `QT-` quotations so test
  // residue (TEST-/CHAIN-/UQ- header-only fixtures) is excluded.
  for (const slug of ['demo', 'sample'] as const) {
    it(`every seeded QT- quotation in "${slug}" has SUM(line_total) === subtotal`, async () => {
      const tenantId = slug === 'demo' ? demoId : sampleId;
      const rows = (await asTenant(tenantId, async (tx) =>
        tx.execute(sql`
          SELECT q.quote_number,
                 q.revision,
                 q.subtotal::text                    AS subtotal,
                 COALESCE(SUM(ql.line_total), 0)::text AS lines_sum,
                 COUNT(ql.id)::text                    AS line_count
          FROM quotations q
          LEFT JOIN quotation_lines ql ON ql.quotation_id = q.id
          WHERE q.quote_number LIKE 'QT-%'
          GROUP BY q.id, q.quote_number, q.revision, q.subtotal
        `),
      )) as unknown as {
        quote_number: string;
        revision: number;
        subtotal: string;
        lines_sum: string;
        line_count: string;
      }[];

      expect(
        rows.length,
        `no seeded QT- quotations for "${slug}" — run pnpm db:seed`,
      ).toBeGreaterThan(0);
      for (const r of rows) {
        const label = `${r.quote_number} rev${r.revision}`;
        expect(Number(r.line_count), `${label} has no lines`).toBeGreaterThan(0);
        expect(Number(r.lines_sum), `${label}: SUM(line_total) !== subtotal`).toBeCloseTo(
          Number(r.subtotal),
          2,
        );
      }
    });
  }
});

describe('revision chain', () => {
  it('parent_quotation_id self-FK enforces in-tenant chain', async () => {
    const num = `CHAIN-${Date.now()}`;
    const parent = await insertTestQuote({ tenantId: demoId, quoteNumber: num, revision: 1 });
    const rev2 = await insertTestQuote({
      tenantId: demoId,
      quoteNumber: num,
      revision: 2,
      parentId: parent,
    });
    const rev3 = await insertTestQuote({
      tenantId: demoId,
      quoteNumber: num,
      revision: 3,
      parentId: rev2,
    });

    const chain = await asTenant(demoId, async (tx) =>
      tx
        .select({ id: quotations.id, revision: quotations.revision })
        .from(quotations)
        .where(eq(quotations.quoteNumber, num))
        .orderBy(quotations.revision),
    );
    expect(chain).toHaveLength(3);
    expect(chain.map((c) => c.revision)).toEqual([1, 2, 3]);
    expect([parent, rev2, rev3]).toContain(chain[0]!.id);
  });
});
