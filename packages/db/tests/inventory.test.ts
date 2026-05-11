/**
 * Day 6 — inventory state machine + procurement workflow tests.
 *
 * Requires migrations + base seed + day5 seed already applied. The day6
 * seed extension creates ~500 inventory items per tenant; these tests
 * exercise the transitions module and the procurement number counter.
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { nextCounter } from '../src/helpers/document-counter';
import {
  ALLOWED_TRANSITIONS,
  InvalidTransitionError,
  isAllowed,
  transitionInventoryItem,
  type InventoryStatus,
} from '../src/inventory/transitions';
import * as schema from '../src/schema';
import {
  dealers,
  inventoryItems,
  procurementItems,
  procurements,
  products,
  tenants,
} from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId: string;
let sampleId: string;
let demoProductId: string;
let demoDealerId: string;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const [d] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
  const [s] = await db.select().from(tenants).where(eq(tenants.slug, 'sample'));
  if (!d || !s) throw new Error('seed tenants missing — run pnpm db:seed');
  demoId = d.id;
  sampleId = s.id;

  // Cache one product + dealer for the demo tenant. Use asTenant so RLS
  // lets us read.
  await asTenant(demoId, async (tx) => {
    const [p] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.tenantId, demoId))
      .limit(1);
    const [dl] = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(eq(dealers.tenantId, demoId))
      .limit(1);
    if (!p) throw new Error('no products seeded for demo');
    if (!dl) throw new Error('no dealers seeded for demo');
    demoProductId = p.id;
    demoDealerId = dl.id;
  });
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

describe('state machine — pure isAllowed()', () => {
  it('allows in_stock → reserved → dispatched → delivered (golden path)', () => {
    expect(isAllowed('in_stock', 'reserved')).toBe(true);
    expect(isAllowed('reserved', 'dispatched')).toBe(true);
    expect(isAllowed('dispatched', 'delivered')).toBe(true);
  });

  it('allows reserved → in_stock (release reservation)', () => {
    expect(isAllowed('reserved', 'in_stock')).toBe(true);
  });

  it('allows returned → in_stock', () => {
    expect(isAllowed('returned', 'in_stock')).toBe(true);
  });

  it('forbids in_stock → dispatched (must reserve first)', () => {
    expect(isAllowed('in_stock', 'dispatched')).toBe(false);
  });

  it('forbids delivered → anything (terminal state)', () => {
    for (const target of Object.keys(ALLOWED_TRANSITIONS) as InventoryStatus[]) {
      expect(isAllowed('delivered', target)).toBe(false);
    }
  });

  it('forbids damaged → in_stock (terminal write-off)', () => {
    expect(isAllowed('damaged', 'in_stock')).toBe(false);
  });

  it('forbids lost → reserved', () => {
    expect(isAllowed('lost', 'reserved')).toBe(false);
  });

  it('every status has a defined transitions array', () => {
    const statuses: InventoryStatus[] = [
      'in_stock',
      'reserved',
      'dispatched',
      'delivered',
      'returned',
      'damaged',
      'lost',
    ];
    for (const s of statuses) {
      expect(ALLOWED_TRANSITIONS[s]).toBeDefined();
    }
  });
});

describe('state machine — DB-backed transitionInventoryItem()', () => {
  let testItemId = '';

  beforeAll(async () => {
    await asTenant(demoId, async (tx) => {
      const [item] = await tx
        .insert(inventoryItems)
        .values({
          tenantId: demoId,
          productId: demoProductId,
          serialNumber: `TEST-D6-MAIN-${Date.now()}`,
          status: 'in_stock',
        })
        .returning();
      testItemId = item!.id;
    });
  });

  it('reserve → dispatch → deliver happy path', async () => {
    await asTenant(demoId, async (tx) => {
      const reserved = await transitionInventoryItem(tx, testItemId, 'reserved', {
        reservedForDealerId: demoDealerId,
      });
      expect(reserved.status).toBe('reserved');
      expect(reserved.reservedForDealerId).toBe(demoDealerId);
      expect(reserved.reservedAt).not.toBeNull();
    });
    await asTenant(demoId, async (tx) => {
      const dispatched = await transitionInventoryItem(tx, testItemId, 'dispatched');
      expect(dispatched.status).toBe('dispatched');
      expect(dispatched.dispatchedAt).not.toBeNull();
    });
    await asTenant(demoId, async (tx) => {
      const delivered = await transitionInventoryItem(tx, testItemId, 'delivered', {
        deliveredTo: 'Test Site',
      });
      expect(delivered.status).toBe('delivered');
      expect(delivered.deliveredTo).toBe('Test Site');
    });
  });

  it('throws InvalidTransitionError on a forbidden move', async () => {
    await expect(
      asTenant(demoId, async (tx) => transitionInventoryItem(tx, testItemId, 'in_stock')),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('rejects unknown item id', async () => {
    await expect(
      asTenant(demoId, async (tx) =>
        transitionInventoryItem(tx, '00000000-0000-0000-0000-000000000000', 'reserved'),
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('releases reservation: reserved → in_stock clears dealer + reservedAt', async () => {
    let id = '';
    await asTenant(demoId, async (tx) => {
      const [item] = await tx
        .insert(inventoryItems)
        .values({
          tenantId: demoId,
          productId: demoProductId,
          serialNumber: `TEST-D6-REL-${Date.now()}`,
          status: 'reserved',
          reservedAt: new Date(),
        })
        .returning();
      id = item!.id;
    });
    await asTenant(demoId, async (tx) => {
      const released = await transitionInventoryItem(tx, id, 'in_stock');
      expect(released.status).toBe('in_stock');
      expect(released.reservedAt).toBeNull();
      expect(released.reservedForDealerId).toBeNull();
    });
  });
});

describe('concurrent reservation — row lock serializes parallel attempts', () => {
  it('two parallel reserves on the same serial: one succeeds, one fails cleanly', async () => {
    let raceId = '';
    await asTenant(demoId, async (tx) => {
      const [item] = await tx
        .insert(inventoryItems)
        .values({
          tenantId: demoId,
          productId: demoProductId,
          serialNumber: `TEST-D6-RACE-${Date.now()}`,
          status: 'in_stock',
        })
        .returning();
      raceId = item!.id;
    });

    const a = asTenant(demoId, async (tx) => transitionInventoryItem(tx, raceId, 'reserved'));
    const b = asTenant(demoId, async (tx) => transitionInventoryItem(tx, raceId, 'reserved'));
    const results = await Promise.allSettled([a, b]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason as unknown;
    expect(err).toBeInstanceOf(InvalidTransitionError);
  });
});

describe('procurements — number counter + RLS', () => {
  it('procurement counter increments per tenant per fiscal year', async () => {
    const year = 2026;
    const n1 = await asTenant(demoId, (tx) => nextCounter(tx, demoId, 'procurement', year));
    const n2 = await asTenant(demoId, (tx) => nextCounter(tx, demoId, 'procurement', year));
    expect(n2).toBe(n1 + 1);
  });

  it('demo cannot INSERT a procurement_items row referencing a foreign tenant', async () => {
    await expect(
      asTenant(demoId, async (tx) =>
        tx.execute(sql`
          INSERT INTO procurement_items (tenant_id, procurement_id, product_id, quantity, unit_price, line_total)
          VALUES (${sampleId}, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 100, 100)
        `),
      ),
    ).rejects.toThrow();
  });

  it('procurement_items has RLS enabled + forced', async () => {
    const [row] = await db.execute(
      sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'procurement_items'`,
    );
    const r = row as { relrowsecurity: boolean; relforcerowsecurity: boolean };
    expect(r.relrowsecurity).toBe(true);
    expect(r.relforcerowsecurity).toBe(true);
  });
});

describe('procurement happy path — insert procurement + items + serials', () => {
  it('creates a procurement with two line items and links inventory items back', async () => {
    await asTenant(demoId, async (tx) => {
      const seq = await nextCounter(tx, demoId, 'procurement', 2026);
      const num = `PROC-2026-${String(seq).padStart(4, '0')}`;
      const [proc] = await tx
        .insert(procurements)
        .values({
          tenantId: demoId,
          procurementNumber: num,
          procurementDate: '2026-05-11',
          supplierName: 'Test Supplier Co',
          totalAmount: '20000.00',
        })
        .returning();
      expect(proc!.procurementNumber).toMatch(/^PROC-2026-\d{4}$/);

      const [line] = await tx
        .insert(procurementItems)
        .values({
          tenantId: demoId,
          procurementId: proc!.id,
          productId: demoProductId,
          quantity: 2,
          unitPrice: '10000.00',
          lineTotal: '20000.00',
        })
        .returning();
      expect(line!.quantity).toBe(2);

      const serials = [`S1-${Date.now()}`, `S2-${Date.now()}`];
      for (const sn of serials) {
        await tx.insert(inventoryItems).values({
          tenantId: demoId,
          productId: demoProductId,
          serialNumber: sn,
          status: 'in_stock',
          procurementId: proc!.id,
          procurementDate: '2026-05-11',
          purchasePrice: '10000.00',
        });
      }

      const [c] = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM inventory_items WHERE procurement_id = ${proc!.id}`,
      );
      expect((c as unknown as { n: number }).n).toBe(2);
    });
  });
});

describe('gstin CHECK constraint (R.18)', () => {
  it('inserting a dealer with gstin = "" is rejected by the CHECK', async () => {
    await expect(
      asTenant(demoId, async (tx) =>
        tx.execute(sql`
          INSERT INTO dealers (tenant_id, dealer_code, legal_name, display_name, gstin)
          VALUES (${demoId}, 'DL-TEST-EMPTY', 'X', 'X', '')
        `),
      ),
    ).rejects.toThrow(/dealers_gstin_not_empty_chk/);
  });

  it('inserting a dealer with gstin = NULL is allowed', async () => {
    await asTenant(demoId, async (tx) => {
      await tx.execute(sql`
        INSERT INTO dealers (tenant_id, dealer_code, legal_name, display_name, gstin)
        VALUES (${demoId}, 'DL-TEST-NULLGSTIN', 'Y', 'Y', NULL)
      `);
      await tx.execute(sql`DELETE FROM dealers WHERE dealer_code = 'DL-TEST-NULLGSTIN'`);
    });
  });
});
