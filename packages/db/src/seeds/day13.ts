/**
 * Day 13 seed: dispatches, serial picks, fulfilment tracking.
 *
 * Per tenant it creates a dedicated dispatch product with stock, a set of
 * confirmed backing orders (each with reserved serials), and 8 dispatches
 * covering every lifecycle state:
 *
 *   3 delivered  — full confirmed → fully_dispatched → delivered cycle
 *   1 returned   — dispatched then returned (serials back to stock)
 *   2 in_transit — full single-shot dispatches
 *   2 in_transit — PARTIAL dispatches (order has units still to ship)
 *
 * DEV.43: Day 13 creates its own backing orders rather than confirming the
 * Day 12 `pending` orders (DEV.41) — the Day 12 orders carry no inventory to
 * reserve against, so confirming them would mean fabricating stock and would
 * shadow Day 11's reservations. A self-contained seed is cleaner + re-runnable.
 *
 * Run AFTER day12. Re-runnable: wipes dispatches + the day13 orders / PIs /
 * product / inventory it tagged, then rebuilds.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { createDispatchDb } from '../dispatch/create';
import { markDispatchDeliveredDb, returnDispatchDb } from '../dispatch/lifecycle';
import { reserveInventoryForOrder } from '../orders/reserve';
import { transitionOrder } from '../orders/transitions';
import * as schema from '../schema';
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
} from '../schema';
import type { DrizzleTx } from '../with-tenant';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const ORDER_TAG = 'day13-seed-order';
const PI_TAG = 'day13-seed-pi';
const PRODUCT_SKU = 'DSP13-PANEL';
const SERIAL_PREFIX = 'DSP13';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function fiscalYearOf(d: Date): number {
  const m = d.getUTCMonth();
  return m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** Atomically allocate the next per-tenant per-FY document counter value. */
async function nextCounter(
  tx: DrizzleTx,
  tenantId: string,
  docType: string,
  fy: number,
): Promise<number> {
  const res = await tx.execute<{ last_value: string | number }>(sql`
    INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
    VALUES (${tenantId}, ${docType}, ${fy}, 1)
    ON CONFLICT (tenant_id, doc_type, fiscal_year)
    DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
    RETURNING last_value
  `);
  return Number((res as unknown as { last_value: string | number }[])[0]!.last_value);
}

/** Realistic-looking Indian commercial vehicle numbers. */
const VEHICLES = [
  'MH-12-AB-1234',
  'KA-05-MJ-7788',
  'MH-04-CK-9021',
  'TN-09-BX-4456',
  'GJ-01-HT-3390',
  'MH-14-EG-6512',
  'KA-03-NP-1180',
  'DL-01-CA-7734',
];
const TRANSPORTERS = [
  { name: 'BlueDart Surface Logistics', docket: 'BD' },
  { name: 'VRL Logistics', docket: 'VRL' },
  { name: 'Gati Express', docket: 'GATI' },
  { name: 'TCI Freight', docket: 'TCI' },
  { name: 'Safexpress', docket: 'SFX' },
];
const DRIVERS = [
  { name: 'Ramesh Yadav', phone: '+91 98200 11223' },
  { name: 'Suresh Patil', phone: '+91 99300 44556' },
  { name: 'Imran Shaikh', phone: '+91 90040 77889' },
  { name: 'Manjunath Gowda', phone: '+91 97400 22110' },
];

/** dispatch plan: order qty, units to dispatch, outcome. */
interface DispatchPlan {
  orderQty: number;
  dispatchQty: number;
  outcome: 'delivered' | 'returned' | 'in_transit';
  dispatchDaysAgo: number;
}

const PLANS: DispatchPlan[] = [
  { orderQty: 4, dispatchQty: 4, outcome: 'delivered', dispatchDaysAgo: 18 },
  { orderQty: 6, dispatchQty: 6, outcome: 'delivered', dispatchDaysAgo: 14 },
  { orderQty: 3, dispatchQty: 3, outcome: 'delivered', dispatchDaysAgo: 10 },
  // Returned dispatch is old-dated: a return regresses its order back to
  // `confirmed` with its serials released, so keeping it well in the past
  // means it never sorts ahead of Day 11's reserved confirmed orders.
  { orderQty: 5, dispatchQty: 5, outcome: 'returned', dispatchDaysAgo: 55 },
  { orderQty: 8, dispatchQty: 8, outcome: 'in_transit', dispatchDaysAgo: 1 },
  { orderQty: 2, dispatchQty: 2, outcome: 'in_transit', dispatchDaysAgo: 2 },
  { orderQty: 10, dispatchQty: 6, outcome: 'in_transit', dispatchDaysAgo: 3 },
  { orderQty: 12, dispatchQty: 7, outcome: 'in_transit', dispatchDaysAgo: 4 },
];

const TOTAL_STOCK = PLANS.reduce((n, p) => n + p.orderQty, 0) + 10;

interface SeedResult {
  dispatches: number;
  delivered: number;
  returned: number;
  inTransit: number;
  partial: number;
}

async function seedTenant(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  actorId: string,
  fy: number,
): Promise<SeedResult> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as DrizzleTx;
    await rawTx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await rawTx.execute(sql`SELECT set_config('app.user_id', ${actorId}, true)`);
    await rawTx.execute(sql`SELECT set_config('app.read_only', '', true)`);

    const dealerRows = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(sql`tenant_id = ${tenantId} AND deleted_at IS NULL AND status = 'active'`);
    const [quote] = await tx
      .select({ id: quotations.id })
      .from(quotations)
      .where(sql`tenant_id = ${tenantId}`)
      .limit(1);
    if (dealerRows.length === 0 || !quote) {
      console.log('  · (missing dealers/quotations — skipping)');
      return { dispatches: 0, delivered: 0, returned: 0, inTransit: 0, partial: 0 };
    }
    const dealer = (i: number) => dealerRows[i % dealerRows.length]!;

    // Dedicated dispatch product + stock.
    const [product] = await tx
      .insert(products)
      .values({
        tenantId,
        sku: PRODUCT_SKU,
        name: 'Day13 Dispatch Panel 540W',
        hsnCode: '85414011',
        gstRate: '18.00',
      })
      .returning({ id: products.id });
    for (let i = 0; i < TOTAL_STOCK; i++) {
      await tx.insert(inventoryItems).values({
        tenantId,
        productId: product!.id,
        serialNumber: `${SERIAL_PREFIX}-${tenantId.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`,
        status: 'in_stock',
        warehouseCode: 'WH-MAIN',
      });
    }

    const unitPrice = 18_000;
    let dispatchesCreated = 0;
    let delivered = 0;
    let returned = 0;
    let inTransit = 0;
    let partial = 0;

    for (let i = 0; i < PLANS.length; i++) {
      const plan = PLANS[i]!;
      const d = dealer(i);
      const lineTotal = (unitPrice * plan.orderQty).toFixed(2);

      // Backing PI (confirmed) + order (confirmed, inventory reserved).
      const piSeq = await nextCounter(tx, tenantId, 'performa_invoice', fy);
      const [pi] = await tx
        .insert(performaInvoices)
        .values({
          tenantId,
          piNumber: `PI-${fy}-${String(piSeq).padStart(4, '0')}`,
          quotationId: quote.id,
          billToDealerId: d.id,
          shipToDealerId: d.id,
          tenantStateAtIssue: 'MH',
          placeOfSupply: 'MH',
          preparedBy: actorId,
          validUntil: isoDaysAgo(-30),
          subtotal: lineTotal,
          taxableAmount: lineTotal,
          totalAmount: lineTotal,
          status: 'confirmed',
          notes: PI_TAG,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: performaInvoices.id });

      const orderSeq = await nextCounter(tx, tenantId, 'order', fy);
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId,
          orderNumber: `ORD-${fy}-${String(orderSeq).padStart(4, '0')}`,
          performaInvoiceId: pi!.id,
          quotationId: quote.id,
          billToDealerId: d.id,
          shipToDealerId: d.id,
          tenantStateAtIssue: 'MH',
          placeOfSupply: 'MH',
          orderDate: isoDaysAgo(plan.dispatchDaysAgo + 4),
          subtotal: lineTotal,
          taxableAmount: lineTotal,
          totalAmount: lineTotal,
          status: 'pending',
          notes: ORDER_TAG,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: orders.id });

      const [line] = await tx
        .insert(orderLines)
        .values({
          tenantId,
          orderId: order!.id,
          lineNumber: 1,
          productId: product!.id,
          productSku: PRODUCT_SKU,
          productName: 'Day13 Dispatch Panel 540W',
          hsnCode: '85414011',
          quantity: plan.orderQty.toFixed(3),
          unitPrice: unitPrice.toFixed(2),
          gstRate: '18.00',
          lineTotal,
        })
        .returning({ id: orderLines.id });

      const reservation = await reserveInventoryForOrder(tx, order!.id, {
        dealerId: d.id,
        userId: actorId,
      });
      await transitionOrder(tx, order!.id, 'confirmed', {
        userId: actorId,
        reason: 'day13 seed',
      });

      // Create the dispatch for `dispatchQty` of the reserved serials.
      const transporter = TRANSPORTERS[i % TRANSPORTERS.length]!;
      const driver = DRIVERS[i % DRIVERS.length]!;
      const created = await createDispatchDb(
        tx,
        {
          orderId: order!.id,
          lines: [
            {
              orderLineId: line!.id,
              serialIds: reservation.reservedItemIds.slice(0, plan.dispatchQty),
            },
          ],
          dispatchDate: isoDaysAgo(plan.dispatchDaysAgo),
          expectedDeliveryDate: plan.outcome === 'in_transit' ? isoDaysAgo(-(2 + (i % 6))) : null,
          vehicleNumber: VEHICLES[i % VEHICLES.length]!,
          transporterName: transporter.name,
          transporterDocketNumber: `${transporter.docket}-${100000 + i * 7}`,
          driverName: driver.name,
          driverPhone: driver.phone,
          ewayBillNumber: `EWB${201000000000 + i * 137}`,
          ewayBillDate: isoDaysAgo(plan.dispatchDaysAgo),
          notes: plan.dispatchQty < plan.orderQty ? 'Partial dispatch — balance to follow.' : null,
        },
        { userId: actorId },
      );
      dispatchesCreated++;
      if (plan.dispatchQty < plan.orderQty) partial++;

      if (plan.outcome === 'delivered') {
        await markDispatchDeliveredDb(tx, created.id, {
          userId: actorId,
          acknowledgedBy: ['R. Kapoor', 'S. Mehta', 'A. Nair'][i % 3]!,
        });
        delivered++;
      } else if (plan.outcome === 'returned') {
        await returnDispatchDb(tx, created.id, {
          userId: actorId,
          reason: 'Consignee rejected — panels damaged in transit (seed).',
        });
        returned++;
      } else {
        inTransit++;
      }
    }

    return { dispatches: dispatchesCreated, delivered, returned, inTransit, partial };
  });
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Day 13 seed: dispatches + serial picks + fulfilment');

  // Re-runnable cleanup, FK-safe order.
  await client.unsafe(
    `TRUNCATE TABLE dispatch_serials, dispatch_lines, dispatches RESTART IDENTITY CASCADE;`,
  );
  await client.unsafe(`DELETE FROM orders WHERE notes = '${ORDER_TAG}';`);
  await client.unsafe(`DELETE FROM performa_invoices WHERE notes = '${PI_TAG}';`);
  await client.unsafe(`DELETE FROM inventory_items WHERE serial_number LIKE '${SERIAL_PREFIX}-%';`);
  await client.unsafe(`DELETE FROM products WHERE sku = '${PRODUCT_SKU}';`);
  await client.unsafe(`DELETE FROM document_counters WHERE doc_type = 'dispatch';`);

  const fy = fiscalYearOf(new Date());
  const tenantRows = await db.select().from(tenants);
  for (const t of tenantRows) {
    if (t.status !== 'active') continue;
    console.log(`  · Tenant ${t.slug}`);
    const [dispatchUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'dispatch'`)
      .limit(1);
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'admin'`)
      .limit(1);
    const actorId = dispatchUser?.id ?? admin?.id;
    if (!actorId) {
      console.log('  · (no dispatch/admin user — skipping)');
      continue;
    }
    const r = await seedTenant(db, t.id, actorId, fy);
    console.log(
      `  · ${r.dispatches} dispatches (${r.delivered} delivered, ${r.returned} returned, ` +
        `${r.inTransit} in-transit, ${r.partial} partial)`,
    );
  }

  await client.end({ timeout: 5 });
  console.log('✓ Day 13 seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Day 13 seed failed:', err);
  process.exit(1);
});
