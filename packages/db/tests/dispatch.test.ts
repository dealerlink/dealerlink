/**
 * Day 13 — dispatch creation, serial pick, and fulfilment tracking.
 *
 * Requires migrations + full seed (through day13). Tests run against the
 * RLS-enforcing `dealerlink_app` role. The concurrent-dispatch test is
 * mandatory (Day 13 A2.5): it proves the `FOR UPDATE` locks + the
 * `dispatch_serials` UNIQUE constraint make a double-dispatch impossible.
 */
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDispatchDb, DispatchError } from '../src/dispatch/create';
import { markDispatchDeliveredDb, returnDispatchDb } from '../src/dispatch/lifecycle';
import { transitionInventoryItem } from '../src/inventory/transitions';
import { reserveInventoryForOrder } from '../src/orders/reserve';
import { deriveOrderFulfillmentStatus, transitionOrder } from '../src/orders/transitions';
import * as schema from '../src/schema';
import {
  dealers,
  dispatchLines,
  dispatchSerials,
  dispatches,
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

const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId || ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

async function makePi(tx: DrizzleTx): Promise<string> {
  const [pi] = await tx
    .insert(performaInvoices)
    .values({
      tenantId: demoId,
      piNumber: `PI-DSP-${uniq()}`,
      quotationId,
      billToDealerId: dealerA,
      shipToDealerId: dealerA,
      tenantStateAtIssue: 'MAHARASHTRA',
      placeOfSupply: 'MAHARASHTRA',
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

/** A fresh product so each test owns its stock counts. */
async function makeProduct(tx: DrizzleTx): Promise<string> {
  const [p] = await tx
    .insert(products)
    .values({
      tenantId: demoId,
      sku: `DSP-PROD-${uniq()}`,
      name: 'Dispatch Test Panel',
      hsnCode: '85414011',
      gstRate: '18.00',
    })
    .returning({ id: products.id });
  return p!.id;
}

interface ConfirmedOrder {
  orderId: string;
  orderLineId: string;
  productId: string;
  serialIds: string[];
}

/**
 * Create a confirmed order with `qty` units of a brand-new product, with all
 * `qty` serials reserved against it. Commits in its own transaction.
 */
async function makeConfirmedOrder(qty: number): Promise<ConfirmedOrder> {
  return asTenant(demoId, async (tx) => {
    const productId = await makeProduct(tx);
    for (let i = 0; i < qty; i++) {
      await tx.insert(inventoryItems).values({
        tenantId: demoId,
        productId,
        serialNumber: `DSP-INV-${uniq()}-${i}`,
        status: 'in_stock',
      });
    }
    const piId = await makePi(tx);
    const [order] = await tx
      .insert(orders)
      .values({
        tenantId: demoId,
        orderNumber: `ORD-DSP-${uniq()}`,
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
    const [line] = await tx
      .insert(orderLines)
      .values({
        tenantId: demoId,
        orderId,
        lineNumber: 1,
        productId,
        productSku: 'DSP-SKU',
        productName: 'Dispatch Test Panel',
        hsnCode: '85414011',
        quantity: qty.toFixed(3),
        unitPrice: '1000.00',
        gstRate: '18.00',
        lineTotal: (qty * 1000).toFixed(2),
      })
      .returning({ id: orderLines.id });
    const result = await reserveInventoryForOrder(tx, orderId, { dealerId: dealerA, userId });
    await transitionOrder(tx, orderId, 'confirmed', { userId, reason: 'test' });
    return { orderId, orderLineId: line!.id, productId, serialIds: result.reservedItemIds };
  });
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
    userId = u!.id;
    const [dl] = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(eq(dealers.tenantId, demoId))
      .limit(1);
    dealerA = dl!.id;
    const [q] = await tx
      .select({ id: quotations.id })
      .from(quotations)
      .where(eq(quotations.tenantId, demoId))
      .limit(1);
    quotationId = q!.id;
  });
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

describe('schema + RLS', () => {
  it('dispatch tables have RLS enabled + forced', async () => {
    for (const table of ['dispatches', 'dispatch_lines', 'dispatch_serials']) {
      const [row] = await db.execute(
        sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ${table}`,
      );
      const r = row as { relrowsecurity: boolean; relforcerowsecurity: boolean };
      expect(r.relrowsecurity, table).toBe(true);
      expect(r.relforcerowsecurity, table).toBe(true);
    }
  });
});

describe('createDispatchDb — full dispatch', () => {
  it('dispatches every unit → order fully_dispatched, serials dispatched', async () => {
    const o = await makeConfirmedOrder(4);
    const result = await asTenant(demoId, (tx) =>
      createDispatchDb(
        tx,
        {
          orderId: o.orderId,
          lines: [{ orderLineId: o.orderLineId, serialIds: o.serialIds }],
          vehicleNumber: 'MH-12-AB-1234',
          transporterName: 'BlueDart Surface',
        },
        { userId },
      ),
    );
    expect(result.dispatchNumber).toMatch(/^DSP-\d{4}-\d{4}$/);
    expect(result.serialCount).toBe(4);
    expect(result.orderStatus).toBe('fully_dispatched');

    await asTenant(demoId, async (tx) => {
      const items = await tx
        .select({ status: inventoryItems.status })
        .from(inventoryItems)
        .where(eq(inventoryItems.dispatchId, result.id));
      expect(items).toHaveLength(4);
      expect(items.every((i) => i.status === 'dispatched')).toBe(true);
    });
  });
});

describe('createDispatchDb — partial dispatch', () => {
  it('dispatching some units leaves the order partially_dispatched with correct remaining', async () => {
    const o = await makeConfirmedOrder(10);
    const result = await asTenant(demoId, (tx) =>
      createDispatchDb(
        tx,
        {
          orderId: o.orderId,
          lines: [{ orderLineId: o.orderLineId, serialIds: o.serialIds.slice(0, 6) }],
        },
        { userId },
      ),
    );
    expect(result.serialCount).toBe(6);
    expect(result.orderStatus).toBe('partially_dispatched');

    await asTenant(demoId, async (tx) => {
      const [line] = await tx
        .select({ dispatched: orderLines.dispatchedQuantity })
        .from(orderLines)
        .where(eq(orderLines.id, o.orderLineId));
      expect(Number(line!.dispatched)).toBe(6);
      const derived = await deriveOrderFulfillmentStatus(tx, o.orderId);
      expect(derived).toBe('partially_dispatched');
    });

    // A second dispatch of the remaining 4 completes the order.
    const second = await asTenant(demoId, (tx) =>
      createDispatchDb(
        tx,
        {
          orderId: o.orderId,
          lines: [{ orderLineId: o.orderLineId, serialIds: o.serialIds.slice(6) }],
        },
        { userId },
      ),
    );
    expect(second.orderStatus).toBe('fully_dispatched');
  });
});

describe('concurrent dispatch of the same serials — second fails cleanly', () => {
  it('exactly one dispatch succeeds; the other is SERIAL_ALREADY_DISPATCHED', async () => {
    const o = await makeConfirmedOrder(5);
    const sameSerials = o.serialIds.slice(0, 3);

    const attempt = () =>
      asTenant(demoId, (tx) =>
        createDispatchDb(
          tx,
          { orderId: o.orderId, lines: [{ orderLineId: o.orderLineId, serialIds: sameSerials }] },
          { userId },
        ),
      );

    const [r1, r2] = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(DispatchError);
    expect(reason).toMatchObject({ code: 'SERIAL_ALREADY_DISPATCHED' });
  });
});

describe('createDispatchDb — guard rails', () => {
  it('cannot dispatch unreserved (in_stock) serials', async () => {
    const o = await makeConfirmedOrder(2);
    // Put one serial back to in_stock.
    await asTenant(demoId, (tx) =>
      transitionInventoryItem(tx, o.serialIds[0]!, 'in_stock', { updatedBy: userId }),
    );
    await expect(
      asTenant(demoId, (tx) =>
        createDispatchDb(
          tx,
          { orderId: o.orderId, lines: [{ orderLineId: o.orderLineId, serialIds: o.serialIds }] },
          { userId },
        ),
      ),
    ).rejects.toMatchObject({ code: 'SERIAL_NOT_RESERVED' });
  });

  it("cannot dispatch another order's serials", async () => {
    const a = await makeConfirmedOrder(2);
    const b = await makeConfirmedOrder(2);
    await expect(
      asTenant(demoId, (tx) =>
        createDispatchDb(
          tx,
          { orderId: a.orderId, lines: [{ orderLineId: a.orderLineId, serialIds: b.serialIds }] },
          { userId },
        ),
      ),
    ).rejects.toMatchObject({ code: 'SERIAL_WRONG_ORDER' });
  });

  it('cannot dispatch more units than remain on the line', async () => {
    const o = await makeConfirmedOrder(3);
    // Reserve 2 extra serials against the same order so we have 5 reserved
    // for a line that only ordered 3.
    const extra: string[] = [];
    await asTenant(demoId, async (tx) => {
      for (let i = 0; i < 2; i++) {
        const [item] = await tx
          .insert(inventoryItems)
          .values({
            tenantId: demoId,
            productId: o.productId,
            serialNumber: `DSP-EXTRA-${uniq()}-${i}`,
            status: 'in_stock',
          })
          .returning({ id: inventoryItems.id });
        await transitionInventoryItem(tx, item!.id, 'reserved', {
          reservedForOrderId: o.orderId,
          reservedForDealerId: dealerA,
          updatedBy: userId,
        });
        extra.push(item!.id);
      }
    });
    await expect(
      asTenant(demoId, (tx) =>
        createDispatchDb(
          tx,
          {
            orderId: o.orderId,
            lines: [{ orderLineId: o.orderLineId, serialIds: [...o.serialIds, ...extra] }],
          },
          { userId },
        ),
      ),
    ).rejects.toMatchObject({ code: 'EXCEEDS_REMAINING' });
  });

  it('rejects a dispatch against a pending (unconfirmed) order', async () => {
    const orderId = await asTenant(demoId, async (tx) => {
      const piId = await makePi(tx);
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId: demoId,
          orderNumber: `ORD-PEND-${uniq()}`,
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
      return order!.id;
    });
    await expect(
      asTenant(demoId, (tx) =>
        createDispatchDb(
          tx,
          { orderId, lines: [{ orderLineId: orderId, serialIds: [orderId] }] },
          {
            userId,
          },
        ),
      ),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_DISPATCHABLE' });
  });
});

describe('markDispatchDeliveredDb', () => {
  it('moves serials to delivered and the order to delivered', async () => {
    const o = await makeConfirmedOrder(2);
    const created = await asTenant(demoId, (tx) =>
      createDispatchDb(
        tx,
        { orderId: o.orderId, lines: [{ orderLineId: o.orderLineId, serialIds: o.serialIds }] },
        { userId },
      ),
    );
    const delivered = await asTenant(demoId, (tx) =>
      markDispatchDeliveredDb(tx, created.id, { userId, acknowledgedBy: 'R. Kapoor' }),
    );
    expect(delivered.orderStatus).toBe('delivered');
    expect(delivered.deliveredSerials).toBe(2);

    await asTenant(demoId, async (tx) => {
      const items = await tx
        .select({ status: inventoryItems.status })
        .from(inventoryItems)
        .where(eq(inventoryItems.dispatchId, created.id));
      expect(items.every((i) => i.status === 'delivered')).toBe(true);
    });
  });
});

describe('returnDispatchDb', () => {
  it('returns serials to stock and regresses the order status', async () => {
    const o = await makeConfirmedOrder(4);
    const created = await asTenant(demoId, (tx) =>
      createDispatchDb(
        tx,
        { orderId: o.orderId, lines: [{ orderLineId: o.orderLineId, serialIds: o.serialIds }] },
        { userId },
      ),
    );
    expect(created.orderStatus).toBe('fully_dispatched');

    const returned = await asTenant(demoId, (tx) =>
      returnDispatchDb(tx, created.id, { userId, reason: 'damaged in transit' }),
    );
    expect(returned.returnedSerials).toBe(4);
    expect(returned.orderStatus).toBe('confirmed');

    await asTenant(demoId, async (tx) => {
      const items = await tx
        .select({ status: inventoryItems.status, reserved: inventoryItems.reservedForOrderId })
        .from(inventoryItems)
        .where(
          and(eq(inventoryItems.productId, o.productId), eq(inventoryItems.status, 'in_stock')),
        );
      expect(items).toHaveLength(4);
      expect(items.every((i) => i.reserved === null)).toBe(true);
      const [line] = await tx
        .select({ dispatched: orderLines.dispatchedQuantity })
        .from(orderLines)
        .where(eq(orderLines.id, o.orderLineId));
      expect(Number(line!.dispatched)).toBe(0);
    });
  });
});

describe('cross-tenant isolation', () => {
  it('demo cannot see sample-tenant dispatches', async () => {
    const visible = await asTenant(demoId, (tx) =>
      tx.select({ id: dispatches.id }).from(dispatches).where(eq(dispatches.tenantId, sampleId)),
    );
    expect(visible).toHaveLength(0);
  });

  it('a dispatch creation writes audit_log rows for the dispatch + serials', async () => {
    const o = await makeConfirmedOrder(3);
    const created = await asTenant(demoId, (tx) =>
      createDispatchDb(
        tx,
        { orderId: o.orderId, lines: [{ orderLineId: o.orderLineId, serialIds: o.serialIds }] },
        { userId },
      ),
    );
    // audit_log is RLS-scoped — read it inside the tenant context.
    const counts = await asTenant(demoId, async (tx) => {
      const dispatchRows = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM audit_log
              WHERE entity_type = 'dispatches' AND entity_id = ${created.id}`,
      );
      const serialRows = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM audit_log a
              JOIN dispatch_serials ds ON ds.inventory_item_id = a.entity_id
             WHERE a.entity_type = 'inventory_items' AND a.action = 'update'
               AND ds.dispatch_id = ${created.id}`,
      );
      return {
        dispatch: (dispatchRows as unknown as { n: number }[])[0]!.n,
        serial: (serialRows as unknown as { n: number }[])[0]!.n,
      };
    });
    expect(counts.dispatch).toBeGreaterThanOrEqual(1);
    // Each dispatched serial is an inventory_items UPDATE → audit row.
    expect(counts.serial).toBeGreaterThanOrEqual(3);
  });

  it('a serial appears in dispatch_serials at most once (UNIQUE backstop)', async () => {
    const o = await makeConfirmedOrder(2);
    const created = await asTenant(demoId, (tx) =>
      createDispatchDb(
        tx,
        { orderId: o.orderId, lines: [{ orderLineId: o.orderLineId, serialIds: o.serialIds }] },
        { userId },
      ),
    );
    await expect(
      asTenant(demoId, async (tx) => {
        const [line] = await tx
          .select({ id: dispatchLines.id })
          .from(dispatchLines)
          .where(eq(dispatchLines.dispatchId, created.id))
          .limit(1);
        return tx.insert(dispatchSerials).values({
          tenantId: demoId,
          dispatchId: created.id,
          dispatchLineId: line!.id,
          inventoryItemId: o.serialIds[0]!,
        });
      }),
    ).rejects.toThrow();
  });
});
