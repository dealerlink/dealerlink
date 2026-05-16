/**
 * Day 12 seed: payments, allocations, receipts.
 *
 * Per tenant it creates a fresh set of backing orders (each with a backing
 * confirmed PI) and 15 payments covering every lifecycle state:
 *
 *   6 cleared   — each fully allocated to a confirmed order  → order `paid`
 *   3 verified  — partially allocated (advance remainder)    → order `partially_paid`
 *   2 pending_verification — unverified, no allocations
 *   2 bounced   — allocations reversed (none remain)
 *   1 refunded  — allocations reversed (none remain)
 *   1 verified  — advance allocated against an existing draft/sent PI
 *
 * It also leaves 2 orders unpaid with an old order date so they sit past the
 * dealer credit period — the dashboard "overdue payments" widget.
 *
 * Run AFTER day11 (orders + PIs). Re-runnable: wipes payments and the orders
 * it previously created (tagged via `notes`), then rebuilds.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import {
  dealers,
  orderLines,
  orderStatusHistory,
  orders,
  paymentAllocations,
  payments,
  performaInvoices,
  products,
  quotations,
  tenants,
  users,
} from '../schema';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const ORDER_TAG = 'day12-seed-order';
const PI_TAG = 'day12-seed-pi';

function fiscalYearOf(d: Date): number {
  const m = d.getUTCMonth();
  return m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

type Tx = Parameters<Parameters<ReturnType<typeof drizzle>['transaction']>[0]>[0];

async function nextCounter(tx: Tx, tenantId: string, docType: string, fy: number): Promise<number> {
  const res = await tx.execute<{ last_value: string | number }>(sql`
    INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
    VALUES (${tenantId}, ${docType}, ${fy}, 1)
    ON CONFLICT (tenant_id, doc_type, fiscal_year)
    DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
    RETURNING last_value
  `);
  return Number((res as unknown as { last_value: string | number }[])[0]!.last_value);
}

/** order plan: total, days-ago order date, target payment outcome. */
interface OrderPlan {
  total: number;
  daysAgo: number;
  kind: 'full' | 'partial' | 'overdue';
}

const ORDER_PLANS: OrderPlan[] = [
  { total: 50_000, daysAgo: 14, kind: 'full' },
  { total: 80_000, daysAgo: 16, kind: 'full' },
  { total: 120_000, daysAgo: 18, kind: 'full' },
  { total: 65_000, daysAgo: 20, kind: 'full' },
  { total: 95_000, daysAgo: 22, kind: 'full' },
  { total: 40_000, daysAgo: 24, kind: 'full' },
  { total: 100_000, daysAgo: 10, kind: 'partial' },
  { total: 150_000, daysAgo: 12, kind: 'partial' },
  { total: 70_000, daysAgo: 9, kind: 'partial' },
  { total: 90_000, daysAgo: 95, kind: 'overdue' },
  { total: 55_000, daysAgo: 120, kind: 'overdue' },
];

async function seedTenant(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  actorId: string,
  fy: number,
): Promise<{ payments: number; orders: number; paidOrders: number; overdue: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${actorId}, true)`);

    const dealerRows = await tx
      .select({ id: dealers.id, name: dealers.displayName })
      .from(dealers)
      .where(sql`tenant_id = ${tenantId} AND deleted_at IS NULL AND status = 'active'`);
    const [product] = await tx
      .select({ id: products.id, sku: products.sku, name: products.name, hsn: products.hsnCode })
      .from(products)
      .where(sql`tenant_id = ${tenantId}`)
      .limit(1);
    const [quote] = await tx
      .select({ id: quotations.id })
      .from(quotations)
      .where(sql`tenant_id = ${tenantId}`)
      .limit(1);
    if (dealerRows.length === 0 || !product || !quote) {
      console.log('  · (missing dealers/products/quotations — skipping)');
      return { payments: 0, orders: 0, paidOrders: 0, overdue: 0 };
    }
    const dealer = (i: number) => dealerRows[i % dealerRows.length]!;

    // ── Backing orders (each with a backing confirmed PI) ──────────────────
    interface BuiltOrder {
      id: string;
      number: string;
      total: number;
      dealerId: string;
      kind: OrderPlan['kind'];
    }
    const built: BuiltOrder[] = [];
    for (let i = 0; i < ORDER_PLANS.length; i++) {
      const plan = ORDER_PLANS[i]!;
      const d = dealer(i);
      const total = plan.total.toFixed(2);

      const piSeq = await nextCounter(tx, tenantId, 'performa_invoice', fy);
      const [pi] = await tx
        .insert(performaInvoices)
        .values({
          tenantId,
          piNumber: `PI-${fy}-${String(piSeq).padStart(4, '0')}`,
          quotationId: quote.id,
          billToDealerId: d.id,
          shipToDealerId: d.id,
          tenantStateAtIssue: 'MAHARASHTRA',
          placeOfSupply: 'MAHARASHTRA',
          preparedBy: actorId,
          validUntil: isoDaysAgo(-30),
          subtotal: total,
          taxableAmount: total,
          totalAmount: total,
          status: 'confirmed',
          notes: PI_TAG,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: performaInvoices.id });

      const orderSeq = await nextCounter(tx, tenantId, 'order', fy);
      const orderNumber = `ORD-${fy}-${String(orderSeq).padStart(4, '0')}`;
      // Day 12 orders stay `pending` — they exist to carry payment
      // allocations, and Day 11's confirmed-order reservations are seeded
      // separately. Keeping them pending avoids shadowing those.
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId,
          orderNumber,
          performaInvoiceId: pi!.id,
          quotationId: quote.id,
          billToDealerId: d.id,
          shipToDealerId: d.id,
          tenantStateAtIssue: 'MAHARASHTRA',
          placeOfSupply: 'MAHARASHTRA',
          orderDate: isoDaysAgo(plan.daysAgo),
          subtotal: total,
          taxableAmount: total,
          totalAmount: total,
          status: 'pending',
          paymentStatus: 'unpaid',
          notes: ORDER_TAG,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: orders.id });

      await tx.insert(orderLines).values({
        tenantId,
        orderId: order!.id,
        lineNumber: 1,
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        hsnCode: product.hsn,
        quantity: '1.000',
        unitPrice: total,
        gstRate: '18.00',
        lineTotal: total,
      });
      await tx.insert(orderStatusHistory).values({
        tenantId,
        orderId: order!.id,
        fromStatus: null,
        toStatus: 'pending',
        transitionedBy: actorId,
        reason: 'day12 seed',
      });

      built.push({
        id: order!.id,
        number: orderNumber,
        total: plan.total,
        dealerId: d.id,
        kind: plan.kind,
      });
    }

    const fullOrders = built.filter((o) => o.kind === 'full');
    const partialOrders = built.filter((o) => o.kind === 'partial');
    const overdueOrders = built.filter((o) => o.kind === 'overdue');

    // A day11 draft/sent PI for the advance-against-PI payment.
    const [advancePi] = await tx
      .select({ id: performaInvoices.id, billTo: performaInvoices.billToDealerId })
      .from(performaInvoices)
      .where(
        sql`tenant_id = ${tenantId} AND status IN ('draft', 'sent') AND notes IS DISTINCT FROM ${PI_TAG}`,
      )
      .limit(1);

    let paymentCount = 0;
    let paidOrders = 0;

    async function makePayment(args: {
      dealerId: string;
      amount: number;
      method: string;
      status: string;
      daysAgo: number;
      allocatedAmount: number;
      verified?: boolean;
      cleared?: boolean;
      bounced?: { reason: string };
      refunded?: { reason: string };
    }): Promise<string> {
      const seq = await nextCounter(tx, tenantId, 'payment', fy);
      const now = Date.now();
      const [p] = await tx
        .insert(payments)
        .values({
          tenantId,
          paymentNumber: `PAY-${fy}-${String(seq).padStart(4, '0')}`,
          dealerId: args.dealerId,
          amount: args.amount.toFixed(2),
          method: args.method,
          reference: `SEED-${seq}`,
          receivedDate: isoDaysAgo(args.daysAgo),
          status: args.status,
          allocatedAmount: args.allocatedAmount.toFixed(2),
          verifiedAt: args.verified ? new Date(now - args.daysAgo * 86_400_000) : null,
          verifiedBy: args.verified ? actorId : null,
          clearedAt: args.cleared ? new Date(now - args.daysAgo * 86_400_000 + 3_600_000) : null,
          bouncedAt: args.bounced ? new Date(now - args.daysAgo * 86_400_000 + 7_200_000) : null,
          bouncedReason: args.bounced?.reason ?? null,
          refundedAt: args.refunded ? new Date(now - args.daysAgo * 86_400_000 + 7_200_000) : null,
          refundedReason: args.refunded?.reason ?? null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: payments.id });
      paymentCount++;
      return p!.id;
    }

    async function allocateToOrder(paymentId: string, orderId: string, amount: number) {
      await tx.insert(paymentAllocations).values({
        tenantId,
        paymentId,
        orderId,
        amount: amount.toFixed(2),
        allocatedBy: actorId,
      });
    }

    const METHODS = ['bank_transfer', 'cheque', 'upi', 'cash', 'card'];

    // 6 cleared payments, each fully allocated to a full order → order paid.
    for (let i = 0; i < fullOrders.length; i++) {
      const o = fullOrders[i]!;
      const pid = await makePayment({
        dealerId: o.dealerId,
        amount: o.total,
        method: METHODS[i % METHODS.length]!,
        status: 'cleared',
        daysAgo: 8,
        allocatedAmount: o.total,
        verified: true,
        cleared: true,
      });
      await allocateToOrder(pid, o.id, o.total);
      await tx
        .update(orders)
        .set({ paymentStatus: 'paid', updatedBy: actorId })
        .where(sql`id = ${o.id}`);
      paidOrders++;
    }

    // 3 verified payments, partially allocated — remainder is a floating advance.
    for (let i = 0; i < partialOrders.length; i++) {
      const o = partialOrders[i]!;
      const part = Math.round(o.total * 0.4);
      const pid = await makePayment({
        dealerId: o.dealerId,
        amount: o.total, // pays more than the part allocated → advance remainder
        method: METHODS[i % METHODS.length]!,
        status: 'verified',
        daysAgo: 5,
        allocatedAmount: part,
        verified: true,
      });
      await allocateToOrder(pid, o.id, part);
      await tx
        .update(orders)
        .set({ paymentStatus: 'partially_paid', updatedBy: actorId })
        .where(sql`id = ${o.id}`);
    }

    // 2 pending_verification payments — unverified, no allocations.
    for (let i = 0; i < 2; i++) {
      await makePayment({
        dealerId: dealer(i).id,
        amount: 30_000 + i * 5_000,
        method: 'cheque',
        status: 'pending_verification',
        daysAgo: 2,
        allocatedAmount: 0,
      });
    }

    // 2 bounced payments — their allocations were reversed (none remain).
    for (let i = 0; i < 2; i++) {
      await makePayment({
        dealerId: dealer(i).id,
        amount: 45_000 + i * 10_000,
        method: 'cheque',
        status: 'bounced',
        daysAgo: 12,
        allocatedAmount: 0,
        verified: true,
        bounced: { reason: 'Cheque returned — insufficient funds (seed)' },
      });
    }

    // 1 refunded payment — allocations reversed.
    await makePayment({
      dealerId: dealer(0).id,
      amount: 60_000,
      method: 'bank_transfer',
      status: 'refunded',
      daysAgo: 18,
      allocatedAmount: 0,
      verified: true,
      cleared: true,
      refunded: { reason: 'Duplicate payment refunded to dealer (seed)' },
    });

    // 1 verified payment — advance allocated against an existing draft/sent PI.
    if (advancePi) {
      const advanceAmount = 25_000;
      const pid = await makePayment({
        dealerId: advancePi.billTo,
        amount: 50_000,
        method: 'upi',
        status: 'verified',
        daysAgo: 4,
        allocatedAmount: advanceAmount,
        verified: true,
      });
      await tx.insert(paymentAllocations).values({
        tenantId,
        paymentId: pid,
        performaInvoiceId: advancePi.id,
        amount: advanceAmount.toFixed(2),
        allocatedBy: actorId,
        notes: 'advance against PI (seed)',
      });
    } else {
      // No spare PI — record an extra unallocated verified payment instead.
      await makePayment({
        dealerId: dealer(1).id,
        amount: 35_000,
        method: 'upi',
        status: 'verified',
        daysAgo: 4,
        allocatedAmount: 0,
        verified: true,
      });
    }

    return {
      payments: paymentCount,
      orders: built.length,
      paidOrders,
      overdue: overdueOrders.length,
    };
  });
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Day 12 seed: payments + allocations + receipts');

  // Re-runnable cleanup: wipe payments + allocations, then the day12 orders
  // and their backing PIs (cascades lines + status history).
  await client.unsafe(`TRUNCATE TABLE payment_allocations, payments RESTART IDENTITY CASCADE;`);
  await client.unsafe(`DELETE FROM orders WHERE notes = '${ORDER_TAG}';`);
  await client.unsafe(`DELETE FROM performa_invoices WHERE notes = '${PI_TAG}';`);
  await client.unsafe(`DELETE FROM document_counters WHERE doc_type = 'payment';`);

  const fy = fiscalYearOf(new Date());
  const tenantRows = await db.select().from(tenants);
  for (const t of tenantRows) {
    if (t.status !== 'active') continue;
    console.log(`  · Tenant ${t.slug}`);
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'admin'`)
      .limit(1);
    const [accounts] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'accounts'`)
      .limit(1);
    const actorId = accounts?.id ?? admin?.id;
    if (!actorId) {
      console.log('  · (no admin/accounts user — skipping)');
      continue;
    }
    const r = await seedTenant(db, t.id, actorId, fy);
    console.log(
      `  · ${r.payments} payments, ${r.orders} orders ` +
        `(${r.paidOrders} paid, ${r.overdue} overdue)`,
    );
  }

  await client.end({ timeout: 5 });
  console.log('✓ Day 12 seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Day 12 seed failed:', err);
  process.exit(1);
});
