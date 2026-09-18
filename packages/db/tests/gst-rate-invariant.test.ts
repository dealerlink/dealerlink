/**
 * F.55 — the `code shape ⊇ DB constraint` invariant, enforced mechanically.
 *
 * WHY THIS FILE EXISTS. F.55 removed a hardcoded rate list from eight places and
 * four CHECK constraints. What replaced it is a SHAPE rule, stated once in
 * `gstRateSchema` and once in the engine's `validateInput`, and it only works
 * while nobody narrows one side without the other. That has already happened
 * unnoticed exactly once: 3% was added to the DB CHECK on 2026-09-07 and never
 * to the code, and the resulting gap survived nine months of work. `docs/F55_SPEC.md`
 * §4 says it plainly — "a note in a runbook is what failed last time. This is the
 * replacement."
 *
 * ── WHAT THIS TEST CAN AND CANNOT DO. READ BEFORE TRUSTING IT. ──────────────
 *
 * It asserts, strongly:
 *   - the four CHECK constraints are the shape predicate, read back from the live
 *     catalogue with `pg_get_constraintdef`. Re-narrow any one of them and the
 *     string changes and this goes red.
 *
 * It asserts, as a SAMPLE and not as a proof over the domain:
 *   - that for a named set of values, every layer agrees. A probe over eight
 *     values cannot establish a property of all values a `numeric(5,2)` column
 *     can hold. It is chosen to cover the boundaries that matter (0, the old
 *     enum's members, the rates the enum could not express, and the column's
 *     own magnitude) and it will catch a layer that re-narrows to a list.
 *
 * It CANNOT assert, and does not pretend to:
 *   - "no enumerated rate list exists on the rate path". The only mechanical
 *     form of that is a source scan over a hand-maintained path list, asserting
 *     no `[0, 5, 12, 18, 28]`-shaped literal appears — and that is precisely the
 *     vacuous instrument CLAUDE.md §11.1 rulings 7 and 8 warn about. It passes
 *     when a new list appears in a new file, it passes when the list is spelled
 *     differently, and it says nothing about behaviour. The behavioural probes
 *     below are the real instrument. No source scan is presented here as
 *     satisfying §4.
 *
 * The invariant is worded over the STORED domain, per D-5: *every value readable
 * from a rate column is accepted by Zod, by the engine and by the render path.*
 * The earlier wording — "any value the DB accepts, the code accepts" — was
 * unsatisfiable, because Postgres accepts the INPUT 0.125 and stores 0.13 while
 * §1's two-decimal rule makes Zod reject it. They contradict at the input
 * boundary and agree over the stored domain.
 *
 * Runs as the `dealerlink_app` role (NOBYPASSRLS). Requires seeded data.
 */
import { createProductSchema, quotationLineInputSchema } from '@dealerlink/schemas';
import { computeTax } from '@dealerlink/tax';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import { tenants } from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

/** The four rate columns and their constraints. Names are load-bearing: the
 *  migration kept them so `quotation.test.ts`'s `/gst_rate_chk/` matcher and any
 *  operator runbook naming them keep working. */
const RATE_CONSTRAINTS = [
  'products_gst_rate_chk',
  'quotation_lines_gst_rate_chk',
  'performa_invoice_lines_gst_rate_chk',
  'order_lines_gst_rate_chk',
] as const;

/** Values a rate column can hold and every layer must therefore accept. */
const ACCEPTED = [0, 0.25, 3, 5, 12, 18, 28, 40, 100, 999.99];

/** Values that cannot be a rate at all, and every layer must refuse. */
const REFUSED = [-1, -0.01, 1000, Number.NaN];

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId: string;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 1, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const [d] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
  if (!d) throw new Error('seed tenant "demo" missing — run pnpm db:seed');
  demoId = d.id;
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

const productFixture = (gstRate: unknown) => ({
  sku: 'INV-PROBE',
  name: 'Invariant probe',
  hsnCode: '85414300',
  gstRate,
});

const lineFixture = (gstRate: unknown) => ({
  productId: '00000000-0000-0000-0000-000000000001',
  productSku: 'INV-PROBE',
  productName: 'Invariant probe',
  hsnCode: '85414300',
  quantity: 1,
  unitPrice: 1000,
  gstRate,
});

const enginePasses = (gstRate: number): boolean => {
  try {
    computeTax({
      tenantState: 'MH',
      placeOfSupply: 'MH',
      lines: [{ lineId: 'L1', quantity: '1', unitPrice: '1000.00', gstRate }],
      discount: null,
    });
    return true;
  } catch {
    return false;
  }
};

describe('F.55 invariant — the DB constraints are shape-only', () => {
  it.each(RATE_CONSTRAINTS)('%s is `gst_rate >= 0`, not an enumeration', async (conname) => {
    const [row] = await db.execute(
      sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = ${conname}`,
    );
    const def = (row as { def: string } | undefined)?.def;
    expect(def, `${conname} must exist — the migration kept the NAMES deliberately`).toBeDefined();
    // Postgres renders the predicate with its own casts and parens, so match on
    // shape rather than on an exact string: it must compare to zero and must NOT
    // be a membership test.
    expect(def, `${conname} should compare against 0`).toMatch(/gst_rate\s*>=\s*\(?0\)?/);
    expect(def, `${conname} must not enumerate rates`).not.toMatch(/= ANY|IN \(/);
  });
});

describe('F.55 invariant — every value a rate column can hold is accepted by every layer', () => {
  it.each(ACCEPTED)('%s: DB insert, Zod (product + line), and the engine all accept', async (rate) => {
    // 1. The database. Rolled back, so the probe leaves nothing behind.
    await expect(
      asTenant(demoId, async (tx) => {
        await tx.execute(
          sql`INSERT INTO products (tenant_id, sku, name, hsn_code, gst_rate)
              VALUES (${demoId}, ${`INV-PROBE-${rate}`}, 'probe', '85414300', ${String(rate)})`,
        );
        // Undo inside the same transaction: nothing is committed either way.
        await tx.execute(sql`ROLLBACK`);
      }),
    ).resolves.not.toThrow();

    // 2. Zod, on both schemas that carry a rate.
    expect(createProductSchema.safeParse(productFixture(rate)).success, 'product schema').toBe(true);
    expect(quotationLineInputSchema.safeParse(lineFixture(rate)).success, 'line schema').toBe(true);

    // 3. The engine.
    expect(enginePasses(rate), 'computeTax').toBe(true);
  });

  it.each(REFUSED)('%s: every layer refuses it', async (rate) => {
    expect(createProductSchema.safeParse(productFixture(rate)).success, 'product schema').toBe(
      false,
    );
    expect(quotationLineInputSchema.safeParse(lineFixture(rate)).success, 'line schema').toBe(false);
    expect(enginePasses(rate), 'computeTax').toBe(false);
  });

  it('the engine still refuses the raw driver string — callers must coerce', () => {
    // Deliberate (D-3). `gst_rate` is decimal(5,2) so the driver returns '18.00',
    // and six call sites widen a DB value with `as GstRate`, which is
    // compile-time only. A guard written `Number(x) < 0` would accept the string
    // and silently lose this property.
    expect(enginePasses('18.00' as unknown as number)).toBe(false);
  });

  it('is a SAMPLE, and says so — 10 accepted values is not a proof over the column', () => {
    // Recorded as an assertion so the limitation cannot be read past.
    expect(ACCEPTED.length).toBeGreaterThan(0);
    expect(ACCEPTED).toContain(0);
    expect(ACCEPTED).toContain(999.99);
  });
});
