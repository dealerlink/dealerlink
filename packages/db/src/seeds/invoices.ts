/**
 * F.6 — tax invoices, one per sign of `round_off`.
 *
 * ## WHY THREE, AND WHY THESE THREE
 *
 * `round_off` is SIGNED, and a render test that only ever sees a positive term
 * cannot tell a correct document from one that drops the minus. So the fixture
 * covers all three cases, and the arithmetic is written out below so a reader can
 * check it without running anything:
 *
 * | order           | taxable    | tax       | engine total | whole rupee | round_off |
 * |-----------------|------------|-----------|--------------|-------------|-----------|
 * | ORD-2026-0001   |  39 520.00 |  7 113.60 |    46 633.60 |   46 634.00 |   **+0.40** |
 * | ORD-2026-0002   |  35 100.00 |  6 318.00 |    41 418.00 |   41 418.00 |    **0.00** |
 * | ORD-2026-0022   | 189 325.00 | 18 488.25 |   207 813.25 |  207 813.00 |   **−0.25** |
 *
 * The zero case matters as much as the other two: F6 D-4 applies round-off to every
 * invoice, and the row is SUPPRESSED when the term is zero (F6_SPEC §2), so a
 * document must exist that exercises the absent branch. A conditional row is
 * exactly the kind of thing that passes without running.
 *
 * ## THE VALUES ARE PINNED, NOT COMPUTED HERE
 *
 * The write path lives in `apps/web/lib/actions/invoices`, which `packages/db`
 * cannot import. Rather than keep a second copy of the rounding rule in a seed —
 * which would then be able to drift from the one the application uses — the figures
 * are stated literally, with the arithmetic above. If the application's rounding
 * mode changes (the alternatives are named at `ROUNDING_MODE`), these three numbers
 * change with it and the render tests fail, which is the correct coupling.
 *
 * Deterministic by construction: no clock, no random, no positional selection over
 * a query result. Orders are addressed BY NUMBER (F.134's third site).
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { and, eq } from 'drizzle-orm';

// Seeds are run directly with tsx, so they load the env themselves — the same two
// lines every other seed in this directory carries.
loadEnv({ path: path.resolve(__dirname, '../../../../.env.local') });
loadEnv({ path: path.resolve(__dirname, '../../../../.env') });

import { adminDb } from '../client';
import { invoiceLines, invoices } from '../schema/invoice';
import { orderLines, orders } from '../schema/order';
import { tenants } from '../schema/tenant';

/** Order number → the invoice to issue from it, with its pinned round-off. */
const PLAN = [
  {
    orderNumber: 'ORD-2026-0001',
    invoiceNumber: 'INV-2026-0001',
    totalAmount: '46634.00',
    roundOff: '0.40',
  },
  {
    orderNumber: 'ORD-2026-0002',
    invoiceNumber: 'INV-2026-0002',
    totalAmount: '41418.00',
    roundOff: '0.00',
  },
  {
    orderNumber: 'ORD-2026-0022',
    invoiceNumber: 'INV-2026-0022',
    totalAmount: '207813.00',
    roundOff: '-0.25',
  },
] as const;

const TENANT_SLUGS = ['demo'] as const;

export async function seedInvoices(): Promise<void> {
  for (const slug of TENANT_SLUGS) {
    const [tenant] = await adminDb.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!tenant) {
      console.log(`  · ${slug}: tenant absent, skipping invoices`);
      continue;
    }

    for (const plan of PLAN) {
      const [order] = await adminDb
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, tenant.id), eq(orders.orderNumber, plan.orderNumber)))
        .limit(1);
      if (!order) {
        throw new Error(
          `seedInvoices: ${slug} has no order ${plan.orderNumber}. The fixture addresses ` +
            'orders by NUMBER on purpose; if the order seed changed, update PLAN rather ' +
            'than selecting positionally.',
        );
      }

      const existing = await adminDb
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(eq(invoices.tenantId, tenant.id), eq(invoices.invoiceNumber, plan.invoiceNumber)),
        )
        .limit(1);
      if (existing[0]) {
        console.log(`  · ${slug}/${plan.invoiceNumber} already present`);
        continue;
      }

      const lineRows = await adminDb
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, order.id));

      const [row] = await adminDb
        .insert(invoices)
        .values({
          tenantId: tenant.id,
          invoiceNumber: plan.invoiceNumber,
          orderId: order.id,
          billToDealerId: order.billToDealerId,
          shipToDealerId: order.shipToDealerId,
          tenantStateAtIssue: order.tenantStateAtIssue,
          placeOfSupply: order.placeOfSupply,
          deliveryArrangement: order.deliveryArrangement,
          invoiceDate: order.orderDate,
          subtotal: order.subtotal,
          // THE DISCOUNT TYPE AND VALUE, not just the amount — and this was a REAL
          // DEFECT the loader's reconciliation assertion caught before anything
          // rendered. `orders` has no discount_type/discount_value (F.114) but
          // `invoices` does, so the seed must set them or the loader's grouping is
          // computed with NO discount: on INV-2026-0001 that put the taxable base at
          // 44,520.00 instead of 39,520.00 and the IGST at 8,013.60 instead of
          // 7,113.60, and the assertion refused to render it. An amount-type discount
          // reproduces a stored amount exactly, which is how the write path does it.
          ...(Number(order.discountAmount) === 0
            ? {}
            : { discountType: 'amount' as const, discountValue: order.discountAmount }),
          discountAmount: order.discountAmount,
          taxableAmount: order.taxableAmount,
          cgstAmount: order.cgstAmount,
          sgstAmount: order.sgstAmount,
          igstAmount: order.igstAmount,
          // THE WHOLE-RUPEE TOTAL, with the signed round-off that reconciles it.
          totalAmount: plan.totalAmount,
          roundOff: plan.roundOff,
        })
        .returning({ id: invoices.id });

      await adminDb.insert(invoiceLines).values(
        lineRows.map((l, i) => ({
          tenantId: tenant.id,
          invoiceId: row!.id,
          lineNumber: i + 1,
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          unitOfMeasure: l.unitOfMeasure,
          unitPrice: l.unitPrice,
          gstRate: l.gstRate,
          lineTotal: l.lineTotal,
          description: l.description,
        })),
      );
      console.log(`  · ${slug}/${plan.invoiceNumber} round_off ${plan.roundOff}`);
    }
  }
}

if (process.argv[1]?.endsWith('invoices.ts')) {
  seedInvoices()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
