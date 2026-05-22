/**
 * Day 11 seed: performa invoices + orders + inventory reservations.
 *
 * Per tenant: 10 PIs (3 draft, 4 sent, 2 confirmed, 1 cancelled). The 2
 * confirmed PIs each spawn an Order; their orders are confirmed and reserve
 * serialised inventory FIFO. Includes ≥2 three-party PIs (Ship-To ≠ Bill-To)
 * and ≥1 where Ship-To sits in a different state from Bill-To — exercising
 * the ADR-012 rule that place of supply follows Ship-To.
 *
 * Run AFTER day8 (quotations — the PI source) and day6 (inventory).
 * Re-runnable: truncates PI/order tables and releases any reservations it
 * previously made.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import {
  dealStageHistory,
  dealers,
  deals,
  inventoryItems,
  orderLines,
  orderStatusHistory,
  orders,
  performaInvoiceLines,
  performaInvoiceStatusHistory,
  performaInvoices,
  quotationLines,
  quotations,
  tenantSettings,
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

const round2 = (n: number): number => Math.round(n * 100) / 100;

function fiscalYearOf(d: Date): number {
  const m = d.getUTCMonth();
  return m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

type PiStatus = 'draft' | 'sent' | 'confirmed' | 'cancelled';

interface PiPlan {
  status: PiStatus;
  daysAgo: number;
  validityDays: number;
  /** Redirect Ship-To to a different dealer (three-party). */
  threeParty?: boolean;
  /** Prefer a Ship-To dealer in a different state (forces IGST↔CGST flip). */
  diffState?: boolean;
}

const PLANS: PiPlan[] = [
  { status: 'draft', daysAgo: 1, validityDays: 15 },
  { status: 'draft', daysAgo: 3, validityDays: 15 },
  { status: 'draft', daysAgo: 2, validityDays: 21, threeParty: true },
  { status: 'sent', daysAgo: 6, validityDays: 30 },
  { status: 'sent', daysAgo: 9, validityDays: 30 },
  { status: 'sent', daysAgo: 12, validityDays: 30 },
  { status: 'sent', daysAgo: 15, validityDays: 30, threeParty: true, diffState: true },
  { status: 'confirmed', daysAgo: 20, validityDays: 30 },
  { status: 'confirmed', daysAgo: 26, validityDays: 30, threeParty: true },
  { status: 'cancelled', daysAgo: 30, validityDays: 30 },
];

function computeTotals(args: {
  lines: { quantity: number; unitPrice: number; gstRate: number }[];
  discount: { type: 'percent' | 'amount'; value: number } | null;
  tenantState: string;
  placeOfSupply: string;
}) {
  const isInterState = args.tenantState.toUpperCase() !== args.placeOfSupply.toUpperCase();
  let subtotal = 0;
  for (const l of args.lines) subtotal += l.quantity * l.unitPrice;
  subtotal = round2(subtotal);

  let discountAmount = 0;
  if (args.discount) {
    discountAmount =
      args.discount.type === 'percent'
        ? round2((subtotal * args.discount.value) / 100)
        : round2(Math.min(args.discount.value, subtotal));
  }
  const taxableAmount = round2(subtotal - discountAmount);
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const l of args.lines) {
    const lineAfter = l.quantity * l.unitPrice * (1 - discountRatio);
    const rate = l.gstRate / 100;
    if (isInterState) igst += lineAfter * rate;
    else {
      cgst += lineAfter * (rate / 2);
      sgst += lineAfter * (rate / 2);
    }
  }
  cgst = round2(cgst);
  sgst = round2(sgst);
  igst = round2(igst);
  return {
    subtotal,
    discountAmount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    total: round2(taxableAmount + cgst + sgst + igst),
  };
}

interface QuotationSource {
  id: string;
  quoteNumber: string;
  dealId: string | null;
  dealerId: string;
  discountType: 'percent' | 'amount' | null;
  discountValue: string | null;
  termsAndConditions: string | null;
  lines: Array<{
    productId: string;
    productSku: string;
    productName: string;
    hsnCode: string;
    quantity: number;
    unitOfMeasure: string;
    unitPrice: number;
    gstRate: number;
    description: string | null;
  }>;
}

async function nextCounter(
  tx: Parameters<Parameters<ReturnType<typeof drizzle>['transaction']>[0]>[0],
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

async function seedTenant(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  actorId: string,
  fy: number,
) {
  const stateRow = await db
    .select({ state: tenantSettings.state })
    .from(tenantSettings)
    .where(sql`tenant_id = ${tenantId}`)
    .limit(1);
  const tenantState = (stateRow[0]?.state ?? 'MH').toUpperCase();

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${actorId}, true)`);

    const dealerRows = await tx
      .select({ id: dealers.id, name: dealers.displayName, state: dealers.state })
      .from(dealers)
      .where(sql`tenant_id = ${tenantId} AND deleted_at IS NULL AND status = 'active'`);

    // Source quotations — non-superseded, with their lines.
    const quoteRows = await tx
      .select({
        id: quotations.id,
        quoteNumber: quotations.quoteNumber,
        dealId: quotations.dealId,
        dealerId: quotations.dealerId,
        discountType: quotations.discountType,
        discountValue: quotations.discountValue,
        termsAndConditions: quotations.termsAndConditions,
      })
      .from(quotations)
      .where(sql`tenant_id = ${tenantId} AND status <> 'superseded'`)
      .orderBy(sql`created_at ASC`);

    if (dealerRows.length === 0 || quoteRows.length === 0) {
      console.log('  · (no dealers/quotations — skipping)');
      return;
    }

    const sources: QuotationSource[] = [];
    for (const q of quoteRows) {
      const lr = await tx
        .select()
        .from(quotationLines)
        .where(sql`quotation_id = ${q.id}`)
        .orderBy(sql`line_number ASC`);
      if (lr.length === 0) continue;
      sources.push({
        id: q.id,
        quoteNumber: q.quoteNumber,
        dealId: q.dealId,
        dealerId: q.dealerId,
        discountType: q.discountType,
        discountValue: q.discountValue,
        termsAndConditions: q.termsAndConditions,
        lines: lr.map((l) => ({
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          hsnCode: l.hsnCode,
          quantity: Number(l.quantity),
          unitOfMeasure: l.unitOfMeasure,
          unitPrice: Number(l.unitPrice),
          gstRate: Number(l.gstRate),
          description: l.description,
        })),
      });
    }
    if (sources.length === 0) {
      console.log('  · (no quotations with lines — skipping)');
      return;
    }
    // Confirmed plans want a linked deal so the deal advances — float those first.
    sources.sort((a, b) => (a.dealId ? 0 : 1) - (b.dealId ? 0 : 1));

    // in_stock inventory pool per product, for confirmed-order reservations.
    const invRows = await tx
      .select({ id: inventoryItems.id, productId: inventoryItems.productId })
      .from(inventoryItems)
      .where(sql`tenant_id = ${tenantId} AND status = 'in_stock'`);
    const pool = new Map<string, string[]>();
    for (const r of invRows) {
      const list = pool.get(r.productId) ?? [];
      list.push(r.id);
      pool.set(r.productId, list);
    }

    let piCount = 0;
    let orderCount = 0;
    let reservedCount = 0;

    for (let i = 0; i < PLANS.length; i++) {
      const plan = PLANS[i]!;
      const src = sources[i % sources.length]!;

      const billTo = dealerRows.find((d) => d.id === src.dealerId) ?? dealerRows[0]!;
      let shipTo = billTo;
      if (plan.threeParty) {
        const candidates = dealerRows.filter((d) => d.id !== billTo.id);
        const diff = plan.diffState
          ? candidates.find((d) => (d.state ?? '') !== (billTo.state ?? ''))
          : undefined;
        shipTo = diff ?? candidates[0] ?? billTo;
      }
      const placeOfSupply = (shipTo.state ?? tenantState).toUpperCase();

      // Confirmed PIs get small quantities so reservations fit available stock.
      const scale = plan.status === 'confirmed';
      const lines = src.lines.map((l) => ({
        ...l,
        quantity: scale ? Math.min(l.quantity, 3) : l.quantity,
      }));

      const discount =
        src.discountType && src.discountValue
          ? { type: src.discountType, value: Number(src.discountValue) }
          : null;
      const totals = computeTotals({ lines, discount, tenantState, placeOfSupply });

      const piDate = new Date(Date.now() - plan.daysAgo * 86_400_000);
      const validUntil = new Date(piDate.getTime() + plan.validityDays * 86_400_000);
      const seq = await nextCounter(tx, tenantId, 'performa_invoice', fy);
      const piNumber = `PI-${fy}-${String(seq).padStart(4, '0')}`;

      const sentAt =
        plan.status === 'sent' || plan.status === 'confirmed'
          ? new Date(piDate.getTime() + 60_000)
          : null;
      const confirmedAt =
        plan.status === 'confirmed' ? new Date(piDate.getTime() + 2 * 86_400_000) : null;
      const cancelledAt =
        plan.status === 'cancelled' ? new Date(piDate.getTime() + 86_400_000) : null;

      const [pi] = await tx
        .insert(performaInvoices)
        .values({
          tenantId,
          piNumber,
          quotationId: src.id,
          dealId: src.dealId,
          billToDealerId: billTo.id,
          shipToDealerId: shipTo.id,
          tenantStateAtIssue: tenantState,
          placeOfSupply,
          preparedBy: actorId,
          piDate: piDate.toISOString().slice(0, 10),
          validUntil: validUntil.toISOString().slice(0, 10),
          currency: 'INR',
          discountType: discount?.type ?? null,
          discountValue: discount ? discount.value.toFixed(2) : null,
          subtotal: totals.subtotal.toFixed(2),
          discountAmount: totals.discountAmount.toFixed(2),
          taxableAmount: totals.taxableAmount.toFixed(2),
          cgstAmount: totals.cgst.toFixed(2),
          sgstAmount: totals.sgst.toFixed(2),
          igstAmount: totals.igst.toFixed(2),
          totalAmount: totals.total.toFixed(2),
          termsAndConditions: src.termsAndConditions,
          status: plan.status,
          sentAt,
          confirmedAt,
          cancelledAt,
          cancelledReason: plan.status === 'cancelled' ? 'Buyer withdrew the order (seed)' : null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: performaInvoices.id });
      const piId = pi!.id;
      piCount++;

      await tx.insert(performaInvoiceLines).values(
        lines.map((l, idx) => ({
          tenantId,
          performaInvoiceId: piId,
          lineNumber: idx + 1,
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          hsnCode: l.hsnCode,
          quantity: l.quantity.toFixed(3),
          unitOfMeasure: l.unitOfMeasure,
          unitPrice: l.unitPrice.toFixed(2),
          gstRate: l.gstRate.toFixed(2),
          lineTotal: round2(l.quantity * l.unitPrice).toFixed(2),
          description: l.description,
        })),
      );

      // PI status history chain.
      await tx.insert(performaInvoiceStatusHistory).values({
        tenantId,
        performaInvoiceId: piId,
        fromStatus: null,
        toStatus: 'draft',
        transitionedBy: actorId,
        transitionedAt: piDate,
        reason: `converted_from_${src.quoteNumber}`,
      });
      if (sentAt) {
        await tx.insert(performaInvoiceStatusHistory).values({
          tenantId,
          performaInvoiceId: piId,
          fromStatus: 'draft',
          toStatus: 'sent',
          transitionedBy: actorId,
          transitionedAt: sentAt,
          reason: 'sent_to_buyer',
        });
      }
      if (plan.status === 'cancelled') {
        await tx.insert(performaInvoiceStatusHistory).values({
          tenantId,
          performaInvoiceId: piId,
          fromStatus: 'draft',
          toStatus: 'cancelled',
          transitionedBy: actorId,
          transitionedAt: cancelledAt!,
          reason: 'Buyer withdrew the order (seed)',
        });
      }
      if (plan.status === 'confirmed') {
        await tx.insert(performaInvoiceStatusHistory).values({
          tenantId,
          performaInvoiceId: piId,
          fromStatus: 'sent',
          toStatus: 'confirmed',
          transitionedBy: actorId,
          transitionedAt: confirmedAt!,
          reason: 'confirmed_buyer_agreed',
        });

        // ── Spawn the Order ───────────────────────────────────────────────
        const orderSeq = await nextCounter(tx, tenantId, 'order', fy);
        const orderNumber = `ORD-${fy}-${String(orderSeq).padStart(4, '0')}`;
        const orderConfirmedAt = new Date(confirmedAt!.getTime() + 3_600_000);
        const [order] = await tx
          .insert(orders)
          .values({
            tenantId,
            orderNumber,
            performaInvoiceId: piId,
            quotationId: src.id,
            dealId: src.dealId,
            billToDealerId: billTo.id,
            shipToDealerId: shipTo.id,
            tenantStateAtIssue: tenantState,
            placeOfSupply,
            orderDate: confirmedAt!.toISOString().slice(0, 10),
            currency: 'INR',
            subtotal: totals.subtotal.toFixed(2),
            discountAmount: totals.discountAmount.toFixed(2),
            taxableAmount: totals.taxableAmount.toFixed(2),
            cgstAmount: totals.cgst.toFixed(2),
            sgstAmount: totals.sgst.toFixed(2),
            igstAmount: totals.igst.toFixed(2),
            totalAmount: totals.total.toFixed(2),
            status: 'confirmed',
            confirmedAt: orderConfirmedAt,
            paymentStatus: 'unpaid',
            createdBy: actorId,
            updatedBy: actorId,
          })
          .returning({ id: orders.id });
        const orderId = order!.id;
        orderCount++;

        for (let li = 0; li < lines.length; li++) {
          const l = lines[li]!;
          const want = Math.round(l.quantity);
          const available = pool.get(l.productId) ?? [];
          const picked = available.splice(0, want);
          pool.set(l.productId, available);
          if (picked.length > 0) {
            await tx
              .update(inventoryItems)
              .set({
                status: 'reserved',
                reservedForOrderId: orderId,
                reservedForDealerId: shipTo.id,
                reservedAt: orderConfirmedAt,
                updatedBy: actorId,
              })
              .where(inArray(inventoryItems.id, picked));
            reservedCount += picked.length;
          }
          await tx.insert(orderLines).values({
            tenantId,
            orderId,
            lineNumber: li + 1,
            productId: l.productId,
            productSku: l.productSku,
            productName: l.productName,
            hsnCode: l.hsnCode,
            quantity: l.quantity.toFixed(3),
            unitOfMeasure: l.unitOfMeasure,
            unitPrice: l.unitPrice.toFixed(2),
            gstRate: l.gstRate.toFixed(2),
            lineTotal: round2(l.quantity * l.unitPrice).toFixed(2),
            reservedQuantity: picked.length.toFixed(3),
            dispatchedQuantity: '0',
            description: l.description,
          });
        }

        await tx.insert(orderStatusHistory).values([
          {
            tenantId,
            orderId,
            fromStatus: null,
            toStatus: 'pending',
            transitionedBy: actorId,
            transitionedAt: confirmedAt!,
            reason: `created_from_${piNumber}`,
          },
          {
            tenantId,
            orderId,
            fromStatus: 'pending',
            toStatus: 'confirmed',
            transitionedBy: actorId,
            transitionedAt: orderConfirmedAt,
            reason: 'inventory_reserved',
          },
        ]);

        // Advance the linked deal to payment_pending so the pipeline reflects
        // the order. Only nudge open deals that have not already passed it.
        if (src.dealId) {
          const dealRow = await tx
            .select({ stage: deals.stage, status: deals.status })
            .from(deals)
            .where(sql`id = ${src.dealId}`)
            .limit(1);
          const d = dealRow[0];
          if (d && d.status === 'open' && d.stage !== 'payment_pending') {
            await tx
              .update(deals)
              .set({ stage: 'payment_pending', updatedAt: orderConfirmedAt })
              .where(sql`id = ${src.dealId}`);
            await tx.insert(dealStageHistory).values({
              tenantId,
              dealId: src.dealId,
              fromStage: d.stage,
              toStage: 'payment_pending',
              fromStatus: d.status,
              toStatus: 'open',
              transitionedBy: actorId,
              automatic: true,
              overridden: false,
              reason: `order ${orderNumber} created (seed)`,
            });
          }
        }
      }
    }

    console.log(
      `  · ${piCount} PIs, ${orderCount} orders, ${reservedCount} inventory items reserved`,
    );
  });
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Day 11 seed: performa invoices + orders + reservations');

  // Release any reservations a prior day11 run made, then wipe PI/order data.
  await client.unsafe(`
    UPDATE inventory_items
       SET status = 'in_stock', reserved_for_order_id = NULL,
           reserved_for_dealer_id = NULL, reserved_at = NULL
     WHERE reserved_for_order_id IS NOT NULL;
  `);
  await client.unsafe(`
    TRUNCATE TABLE
      order_status_history, order_lines, orders,
      performa_invoice_status_history, performa_invoice_lines, performa_invoices
    RESTART IDENTITY CASCADE;
  `);
  await client.unsafe(
    `DELETE FROM document_counters WHERE doc_type IN ('performa_invoice', 'order');`,
  );

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
    const [sales] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'sales'`)
      .limit(1);
    const actorId = sales?.id ?? admin?.id;
    if (!actorId) {
      console.log('  · (no admin/sales user — skipping)');
      continue;
    }
    await seedTenant(db, t.id, actorId, fy);
  }

  await client.end({ timeout: 5 });
  console.log('✓ Day 11 seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Day 11 seed failed:', err);
  process.exit(1);
});
