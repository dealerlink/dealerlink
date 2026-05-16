/**
 * Day 11 — performa invoice + order state machines and inventory reservation.
 *
 * Requires migrations + full seed (through day11). Tests run against the
 * RLS-enforcing `dealerlink_app` role.
 */
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  InsufficientInventoryError,
  releaseInventoryForOrder,
  reserveInventoryForOrder,
} from '../src/orders/reserve';
import {
  isOrderTransitionAllowed,
  transitionOrder,
  OrderInvalidTransitionError,
} from '../src/orders/transitions';
import {
  isPiTransitionAllowed,
  transitionPi,
  PiInvalidTransitionError,
} from '../src/pi/transitions';
import * as schema from '../src/schema';
import {
  dealers,
  inventoryItems,
  orderLines,
  orders,
  performaInvoices,
  products,
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
let userId: string;
let dealerA: string;
let quotationId: string;
let testProductId: string;

const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId || ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

/** Insert a draft PI for the demo tenant; returns its id. */
async function makePi(tx: DrizzleTx, placeOfSupply = 'MAHARASHTRA'): Promise<string> {
  const [pi] = await tx
    .insert(performaInvoices)
    .values({
      tenantId: demoId,
      piNumber: `PI-TEST-${uniq()}`,
      quotationId,
      billToDealerId: dealerA,
      shipToDealerId: dealerA,
      tenantStateAtIssue: 'MAHARASHTRA',
      placeOfSupply,
      preparedBy: userId,
      validUntil: '2027-01-01',
      subtotal: '1000.00',
      taxableAmount: '1000.00',
      totalAmount: '1180.00',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: performaInvoices.id });
  return pi!.id;
}

/** Insert a pending order with one line for `qty` of the test product. */
async function makeOrder(tx: DrizzleTx, piId: string, qty: number): Promise<string> {
  const [order] = await tx
    .insert(orders)
    .values({
      tenantId: demoId,
      orderNumber: `ORD-TEST-${uniq()}`,
      performaInvoiceId: piId,
      quotationId,
      billToDealerId: dealerA,
      shipToDealerId: dealerA,
      tenantStateAtIssue: 'MAHARASHTRA',
      placeOfSupply: 'MAHARASHTRA',
      subtotal: '1000.00',
      taxableAmount: '1000.00',
      totalAmount: '1180.00',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: orders.id });
  const orderId = order!.id;
  await tx.insert(orderLines).values({
    tenantId: demoId,
    orderId,
    lineNumber: 1,
    productId: testProductId,
    productSku: 'TEST-SKU',
    productName: 'Test Panel',
    hsnCode: '85414011',
    quantity: qty.toFixed(3),
    unitPrice: '1000.00',
    gstRate: '18.00',
    lineTotal: (qty * 1000).toFixed(2),
  });
  return orderId;
}

/** Add `n` fresh in_stock inventory items for the test product. */
async function stockUp(tx: DrizzleTx, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await tx.insert(inventoryItems).values({
      tenantId: demoId,
      productId: testProductId,
      serialNumber: `TEST-INV-${uniq()}-${i}`,
      status: 'in_stock',
    });
  }
}

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 6, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const [d] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
  const [s] = await db.select().from(tenants).where(eq(tenants.slug, 'sample'));
  if (!d || !s) throw new Error('seed tenants missing — run pnpm db:seed');
  demoId = d.id;
  sampleId = s.id;

  await asTenant(demoId, async (tx) => {
    const [u] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, demoId))
      .limit(1);
    if (!u) throw new Error('no users seeded for demo');
    userId = u.id;
    const dl = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(eq(dealers.tenantId, demoId))
      .limit(1);
    dealerA = dl[0]!.id;
    const [q] = await tx
      .select({ id: quotations.id })
      .from(quotations)
      .where(eq(quotations.tenantId, demoId))
      .limit(1);
    quotationId = q!.id;
    // A dedicated product so the reservation tests own their stock counts.
    const [p] = await tx
      .insert(products)
      .values({
        tenantId: demoId,
        sku: `TEST-PROD-${uniq()}`,
        name: 'Day11 Test Panel',
        hsnCode: '85414011',
        gstRate: '18.00',
      })
      .returning({ id: products.id });
    testProductId = p!.id;
  });
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

describe('PI state machine — pure isPiTransitionAllowed()', () => {
  it('allows draft → sent → confirmed', () => {
    expect(isPiTransitionAllowed('draft', 'sent')).toBe(true);
    expect(isPiTransitionAllowed('sent', 'confirmed')).toBe(true);
  });
  it('allows cancellation from draft and sent', () => {
    expect(isPiTransitionAllowed('draft', 'cancelled')).toBe(true);
    expect(isPiTransitionAllowed('sent', 'cancelled')).toBe(true);
  });
  it('forbids confirmed → anything (terminal)', () => {
    for (const t of ['draft', 'sent', 'cancelled'] as const) {
      expect(isPiTransitionAllowed('confirmed', t)).toBe(false);
    }
  });
  it('forbids draft → confirmed (must send first)', () => {
    expect(isPiTransitionAllowed('draft', 'confirmed')).toBe(false);
  });
});

describe('Order state machine — pure isOrderTransitionAllowed()', () => {
  it('allows pending → confirmed', () => {
    expect(isOrderTransitionAllowed('pending', 'confirmed')).toBe(true);
  });
  it('allows cancellation from pending and confirmed', () => {
    expect(isOrderTransitionAllowed('pending', 'cancelled')).toBe(true);
    expect(isOrderTransitionAllowed('confirmed', 'cancelled')).toBe(true);
  });
  it('forbids cancelled → anything and closed → anything', () => {
    for (const t of ['pending', 'confirmed', 'delivered'] as const) {
      expect(isOrderTransitionAllowed('cancelled', t)).toBe(false);
      expect(isOrderTransitionAllowed('closed', t)).toBe(false);
    }
  });
  it('forbids pending → delivered (skipping confirmation)', () => {
    expect(isOrderTransitionAllowed('pending', 'delivered')).toBe(false);
  });
});

describe('transitionPi() — DB-backed', () => {
  it('moves draft → sent → confirmed and stamps timestamps', async () => {
    await asTenant(demoId, async (tx) => {
      const piId = await makePi(tx);
      const sent = await transitionPi(tx, piId, 'sent', { userId });
      expect(sent.status).toBe('sent');
      expect(sent.sentAt).not.toBeNull();
      const confirmed = await transitionPi(tx, piId, 'confirmed', { userId });
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.confirmedAt).not.toBeNull();
    });
  });

  it('throws PiInvalidTransitionError on draft → confirmed', async () => {
    await expect(
      asTenant(demoId, async (tx) => {
        const piId = await makePi(tx);
        return transitionPi(tx, piId, 'confirmed', { userId });
      }),
    ).rejects.toBeInstanceOf(PiInvalidTransitionError);
  });
});

describe('transitionOrder() — DB-backed', () => {
  it('moves pending → confirmed', async () => {
    await asTenant(demoId, async (tx) => {
      const piId = await makePi(tx);
      const orderId = await makeOrder(tx, piId, 1);
      const confirmed = await transitionOrder(tx, orderId, 'confirmed', { userId });
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.confirmedAt).not.toBeNull();
    });
  });

  it('throws OrderInvalidTransitionError on confirmed → pending', async () => {
    await expect(
      asTenant(demoId, async (tx) => {
        const piId = await makePi(tx);
        const orderId = await makeOrder(tx, piId, 1);
        await transitionOrder(tx, orderId, 'confirmed', { userId });
        return transitionOrder(tx, orderId, 'pending', { userId });
      }),
    ).rejects.toBeInstanceOf(OrderInvalidTransitionError);
  });
});

describe('reserveInventoryForOrder() — FIFO inventory reservation', () => {
  it('reserves the requested serials and marks them reserved', async () => {
    await asTenant(demoId, async (tx) => {
      await stockUp(tx, 5);
      const piId = await makePi(tx);
      const orderId = await makeOrder(tx, piId, 3);
      const result = await reserveInventoryForOrder(tx, orderId, {
        dealerId: dealerA,
        userId,
      });
      expect(result.reservedItemIds).toHaveLength(3);

      const reserved = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.reservedForOrderId, orderId),
            eq(inventoryItems.status, 'reserved'),
          ),
        );
      expect(reserved[0]!.count).toBe(3);

      const [line] = await tx
        .select({ reserved: orderLines.reservedQuantity })
        .from(orderLines)
        .where(eq(orderLines.orderId, orderId));
      expect(Number(line!.reserved)).toBe(3);
    });
  });

  it('throws InsufficientInventoryError with a structured shortage list', async () => {
    let caught: unknown;
    await asTenant(demoId, async (tx) => {
      await stockUp(tx, 2);
      const piId = await makePi(tx);
      const orderId = await makeOrder(tx, piId, 9);
      try {
        await reserveInventoryForOrder(tx, orderId, { dealerId: dealerA, userId });
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeInstanceOf(InsufficientInventoryError);
    const e = caught as InsufficientInventoryError;
    expect(e.shortages).toHaveLength(1);
    expect(e.shortages[0]!.requested).toBe(9);
    expect(e.shortages[0]!.short).toBeGreaterThan(0);
    expect(e.shortages[0]!.productSku).toBe('TEST-SKU');
  });

  it('releaseInventoryForOrder returns reserved serials to in_stock', async () => {
    await asTenant(demoId, async (tx) => {
      await stockUp(tx, 4);
      const piId = await makePi(tx);
      const orderId = await makeOrder(tx, piId, 2);
      await reserveInventoryForOrder(tx, orderId, { dealerId: dealerA, userId });
      const released = await releaseInventoryForOrder(tx, orderId, userId);
      expect(released).toBe(2);
      const still = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(inventoryItems)
        .where(eq(inventoryItems.reservedForOrderId, orderId));
      expect(still[0]!.count).toBe(0);
    });
  });
});

describe('concurrent reservation — FOR UPDATE serialises competing orders', () => {
  it('two orders racing for limited stock: one reserves, one fails cleanly', async () => {
    // Stock exactly 3 of a brand-new product; two orders each want 2.
    let raceProduct = '';
    await asTenant(demoId, async (tx) => {
      const [p] = await tx
        .insert(products)
        .values({
          tenantId: demoId,
          sku: `RACE-PROD-${uniq()}`,
          name: 'Race Panel',
          hsnCode: '85414011',
          gstRate: '18.00',
        })
        .returning({ id: products.id });
      raceProduct = p!.id;
      for (let i = 0; i < 3; i++) {
        await tx.insert(inventoryItems).values({
          tenantId: demoId,
          productId: raceProduct,
          serialNumber: `RACE-INV-${uniq()}-${i}`,
          status: 'in_stock',
        });
      }
    });

    const makeRaceOrder = async (): Promise<string> => {
      let id = '';
      await asTenant(demoId, async (tx) => {
        const piId = await makePi(tx);
        const [order] = await tx
          .insert(orders)
          .values({
            tenantId: demoId,
            orderNumber: `ORD-RACE-${uniq()}`,
            performaInvoiceId: piId,
            quotationId,
            billToDealerId: dealerA,
            shipToDealerId: dealerA,
            tenantStateAtIssue: 'MAHARASHTRA',
            placeOfSupply: 'MAHARASHTRA',
            subtotal: '2000.00',
            taxableAmount: '2000.00',
            totalAmount: '2360.00',
            createdBy: userId,
            updatedBy: userId,
          })
          .returning({ id: orders.id });
        id = order!.id;
        await tx.insert(orderLines).values({
          tenantId: demoId,
          orderId: id,
          lineNumber: 1,
          productId: raceProduct,
          productSku: 'RACE-SKU',
          productName: 'Race Panel',
          hsnCode: '85414011',
          quantity: '2.000',
          unitPrice: '1000.00',
          gstRate: '18.00',
          lineTotal: '2000.00',
        });
      });
      return id;
    };

    const orderA = await makeRaceOrder();
    const orderB = await makeRaceOrder();

    const reserve = (orderId: string) =>
      asTenant(demoId, (tx) =>
        reserveInventoryForOrder(tx, orderId, { dealerId: dealerA, userId }),
      );

    const results = await Promise.allSettled([reserve(orderA), reserve(orderB)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      InsufficientInventoryError,
    );
  });
});

describe('RLS — performa_invoices + orders', () => {
  it('both tables have RLS enabled + forced', async () => {
    for (const table of ['performa_invoices', 'orders', 'order_lines', 'performa_invoice_lines']) {
      const [row] = await db.execute(
        sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ${table}`,
      );
      const r = row as { relrowsecurity: boolean; relforcerowsecurity: boolean };
      expect(r.relrowsecurity, table).toBe(true);
      expect(r.relforcerowsecurity, table).toBe(true);
    }
  });

  it('demo cannot read sample-tenant performa invoices', async () => {
    const visible = await asTenant(demoId, (tx) =>
      tx
        .select({ id: performaInvoices.id })
        .from(performaInvoices)
        .where(eq(performaInvoices.tenantId, sampleId)),
    );
    expect(visible).toHaveLength(0);
  });

  it('demo cannot INSERT an order for a foreign tenant', async () => {
    await expect(
      asTenant(demoId, async (tx) =>
        tx.execute(sql`
          INSERT INTO orders (tenant_id, order_number, performa_invoice_id, quotation_id,
            bill_to_dealer_id, ship_to_dealer_id, tenant_state_at_issue, place_of_supply,
            subtotal, taxable_amount, total_amount, created_by, updated_by)
          VALUES (${sampleId}, 'ORD-X', ${quotationId}, ${quotationId}, ${dealerA}, ${dealerA},
            'MH', 'MH', 0, 0, 0, ${userId}, ${userId})
        `),
      ),
    ).rejects.toThrow();
  });
});
