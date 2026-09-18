/**
 * Day 5 integration: RLS isolation + dealer code generation + product
 * checks on the new dealers/products/inventory tables.
 *
 * Runs as the dealerlink_app role (NOBYPASSRLS). Requires seeded data —
 * run `pnpm db:migrate && pnpm db:seed` first.
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formatDealerCode, nextDealerCode } from '../src/helpers/document-counter';
import * as schema from '../src/schema';
import { dealers, products, tenants } from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId: string;
let sampleId: string;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 1, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const [d] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
  const [s] = await db.select().from(tenants).where(eq(tenants.slug, 'sample'));
  if (!d || !s) throw new Error('seed tenants missing — run pnpm db:seed');
  demoId = d.id;
  sampleId = s.id;
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

describe('RLS — dealers, products, inventory_items, procurements have RLS enabled', () => {
  it.each(['dealers', 'products', 'inventory_items', 'procurements'])(
    '%s has RLS enabled + forced',
    async (table) => {
      const [row] = await db.execute(
        sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ${table}`,
      );
      const r = row as { relrowsecurity: boolean; relforcerowsecurity: boolean };
      expect(r.relrowsecurity).toBe(true);
      expect(r.relforcerowsecurity).toBe(true);
    },
  );
});

describe('RLS — dealer isolation', () => {
  it('demo sees exactly its own dealers', async () => {
    const rows = await asTenant(demoId, async (tx) =>
      tx.select({ id: dealers.id, tenantId: dealers.tenantId }).from(dealers),
    );
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.every((r) => r.tenantId === demoId)).toBe(true);
  });

  it('demo cannot see sample dealers', async () => {
    const leak = await asTenant(demoId, async (tx) => {
      const [r] = await tx.execute(
        sql`SELECT count(*)::int AS n FROM dealers WHERE tenant_id = ${sampleId}`,
      );
      return (r as { n: number }).n;
    });
    expect(leak).toBe(0);
  });

  it('demo cannot UPDATE a sample dealer (0 rows affected)', async () => {
    const result = await asTenant(demoId, async (tx) =>
      tx.execute(sql`UPDATE dealers SET legal_name = 'Hijacked' WHERE tenant_id = ${sampleId}`),
    );
    expect((result as unknown as { count: number }).count).toBe(0);
  });
});

describe('RLS — product isolation', () => {
  it('demo sees only its own products', async () => {
    const rows = await asTenant(demoId, async (tx) =>
      tx.select({ tenantId: products.tenantId }).from(products),
    );
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.every((r) => r.tenantId === demoId)).toBe(true);
  });

  it('sample sees only its own products', async () => {
    const rows = await asTenant(sampleId, async (tx) =>
      tx.select({ tenantId: products.tenantId }).from(products),
    );
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.every((r) => r.tenantId === sampleId)).toBe(true);
  });
});

describe('Dealer code generation', () => {
  it('nextDealerCode increments atomically and is tenant-scoped', async () => {
    const code1 = await asTenant(demoId, (tx) => nextDealerCode(tx, demoId));
    const code2 = await asTenant(demoId, (tx) => nextDealerCode(tx, demoId));
    expect(code1).toMatch(/^DL-\d{6}$/);
    expect(code2).toMatch(/^DL-\d{6}$/);
    const n1 = Number(code1.slice(3));
    const n2 = Number(code2.slice(3));
    expect(n2).toBe(n1 + 1);
  });

  it('formatDealerCode pads to 6 digits', () => {
    expect(formatDealerCode(1)).toBe('DL-000001');
    expect(formatDealerCode(42)).toBe('DL-000042');
    expect(formatDealerCode(999999)).toBe('DL-999999');
  });

  it('each tenant has its own counter', async () => {
    const before = await asTenant(sampleId, (tx) => nextDealerCode(tx, sampleId));
    await asTenant(demoId, (tx) => nextDealerCode(tx, demoId));
    const after = await asTenant(sampleId, (tx) => nextDealerCode(tx, sampleId));
    // demo's increment should NOT affect sample's counter
    expect(Number(after.slice(3))).toBe(Number(before.slice(3)) + 1);
  });
});

describe('Search via pg_trgm — fuzzy ILIKE works on dealers + products', () => {
  it('dealer search by partial legal name finds matches', async () => {
    const rows = await asTenant(demoId, async (tx) =>
      tx.execute(sql`SELECT count(*)::int AS n FROM dealers WHERE legal_name ILIKE '%Solar%'`),
    );
    const n = (rows as unknown as { n: number }[])[0]!.n;
    expect(n).toBeGreaterThan(0);
  });

  it('product search by subcategory finds TOPCon panels', async () => {
    const rows = await asTenant(demoId, async (tx) =>
      tx.execute(sql`SELECT count(*)::int AS n FROM products WHERE subcategory ILIKE '%TOPCon%'`),
    );
    const n = (rows as unknown as { n: number }[])[0]!.n;
    expect(n).toBeGreaterThan(0);
  });
});

describe('Constraint enforcement', () => {
  // ── F.55: this INVERTED, and is rewritten rather than deleted ─────────────
  //
  // It asserted a rate of 10 is rejected — not because 10 is implausible, but
  // because it was absent from the `IN (0, 3, 5, 12, 18, 28)` enum the CHECK
  // used to be. That enum encoded a statutory claim and went stale in both
  // directions. The constraint is now shape-only (`gst_rate >= 0`), so 10 is
  // accepted and the boundary worth testing moved rather than disappeared.
  it('product check accepts a rate merely absent from the old enum (10)', async () => {
    // Rolled back. This INSERT now SUCCEEDS, so unlike the enum-era version it
    // would otherwise leave a row in the SHARED dev database — which then blocks
    // any later attempt to re-narrow the constraint, including F.55's own
    // non-vacuity control. Measured: it did exactly that once.
    await expect(
      asTenant(demoId, async (tx) => {
        await tx.execute(
          sql`INSERT INTO products (tenant_id, sku, name, hsn_code, gst_rate)
              VALUES (${demoId}, 'RATE-10', 'Test', '85414300', 10)`,
        );
        await tx.execute(sql`ROLLBACK`);
      }),
    ).resolves.not.toThrow();
  });

  it('product check accepts 3, 40 and 0.25 — rates the enum could not express', async () => {
    for (const [sku, rate] of [
      ['RATE-3', '3'],
      ['RATE-40', '40'],
      ['RATE-025', '0.25'],
    ] as const) {
      await expect(
        asTenant(demoId, async (tx) => {
          await tx.execute(
            sql`INSERT INTO products (tenant_id, sku, name, hsn_code, gst_rate)
                VALUES (${demoId}, ${sku}, 'Test', '85414300', ${rate})`,
          );
          await tx.execute(sql`ROLLBACK`); // leave nothing in the shared dev DB
        }),
        `rate ${rate} should be accepted`,
      ).resolves.not.toThrow();
    }
  });

  it('product check still rejects a NEGATIVE rate — the shape bound that remains', async () => {
    await expect(
      asTenant(demoId, async (tx) =>
        tx.execute(
          sql`INSERT INTO products (tenant_id, sku, name, hsn_code, gst_rate)
              VALUES (${demoId}, 'RATE-NEG', 'Test', '85414300', -1)`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('the column, not the CHECK, supplies the upper bound (1000 overflows numeric(5,2))', async () => {
    // Deliberately no `<= 100` or `<= 40` in the constraint — those would be
    // statutory claims that go stale. 999.99 is the column's own magnitude.
    await expect(
      asTenant(demoId, async (tx) =>
        tx.execute(
          sql`INSERT INTO products (tenant_id, sku, name, hsn_code, gst_rate)
              VALUES (${demoId}, 'RATE-1000', 'Test', '85414300', 1000)`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('product check rejects malformed HSN code', async () => {
    await expect(
      asTenant(demoId, async (tx) =>
        tx.execute(
          sql`INSERT INTO products (tenant_id, sku, name, hsn_code, gst_rate)
              VALUES (${demoId}, 'BAD-HSN', 'Test', 'ABCDE', 18)`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('dealer check rejects discount_percent > 100', async () => {
    await expect(
      asTenant(demoId, async (tx) =>
        tx.execute(
          sql`INSERT INTO dealers (tenant_id, dealer_code, legal_name, display_name, discount_percent)
              VALUES (${demoId}, 'DL-TEST-BAD', 'Test', 'Test', 150)`,
        ),
      ),
    ).rejects.toThrow();
  });
});
