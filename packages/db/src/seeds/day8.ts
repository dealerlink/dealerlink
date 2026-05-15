/**
 * Day 8 seed extension: 15 quotations per tenant across all statuses, with
 * realistic Indian solar pricing, mixed GST rates, both discount kinds, an
 * inter-state quote or two for IGST coverage, and one revision chain
 * (Rev 1 → Rev 2 → Rev 3).
 *
 * Run AFTER day5.ts (dealers + products) and ideally after day7.ts (so a
 * couple of quotes link to existing deals). Re-runnable: truncates
 * quotation_lines + quotation_status_history + quotations first.
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
  deals,
  products,
  quotationLines,
  quotationStatusHistory,
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

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  hsnCode: string;
  gstRate: string;
  defaultSellingPrice: string | null;
}

interface DealerRow {
  id: string;
  displayName: string;
  state: string | null;
}

interface DealRow {
  id: string;
  dealerId: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

function fiscalYearOf(d: Date): number {
  const m = d.getUTCMonth();
  return m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

interface QuotePlan {
  lineIdx: number[];
  qty: number[];
  unitPriceDelta: number[];
  discount: null | { type: 'percent' | 'amount'; value: number };
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  daysAgo: number;
  validityDays: number;
  /** When set, override the dealer's state — used to force a few inter-state quotes. */
  forcePlaceOfSupply?: string;
  /** True if a deal link should be attempted. */
  linkDeal?: boolean;
}

const PLANS: QuotePlan[] = [
  // 4 drafts
  {
    lineIdx: [0],
    qty: [100],
    unitPriceDelta: [0],
    discount: null,
    status: 'draft',
    daysAgo: 1,
    validityDays: 15,
  },
  {
    lineIdx: [0, 1],
    qty: [80, 10],
    unitPriceDelta: [-200, 0],
    discount: null,
    status: 'draft',
    daysAgo: 2,
    validityDays: 15,
  },
  {
    lineIdx: [1],
    qty: [12],
    unitPriceDelta: [500],
    discount: { type: 'percent', value: 5 },
    status: 'draft',
    daysAgo: 0,
    validityDays: 21,
  },
  {
    lineIdx: [0, 2],
    qty: [50, 50],
    unitPriceDelta: [0, 0],
    discount: null,
    status: 'draft',
    daysAgo: 3,
    validityDays: 15,
  },
  // 5 sent
  {
    lineIdx: [0],
    qty: [120],
    unitPriceDelta: [-100],
    discount: null,
    status: 'sent',
    daysAgo: 5,
    validityDays: 30,
    linkDeal: true,
  },
  {
    lineIdx: [0, 1, 2],
    qty: [200, 20, 100],
    unitPriceDelta: [0, 0, 0],
    discount: { type: 'percent', value: 7.5 },
    status: 'sent',
    daysAgo: 7,
    validityDays: 30,
  },
  {
    lineIdx: [1],
    qty: [8],
    unitPriceDelta: [800],
    discount: { type: 'amount', value: 5000 },
    status: 'sent',
    daysAgo: 10,
    validityDays: 30,
  },
  {
    lineIdx: [0],
    qty: [60],
    unitPriceDelta: [0],
    discount: null,
    status: 'sent',
    daysAgo: 14,
    validityDays: 30,
    forcePlaceOfSupply: 'Tamil Nadu',
  },
  {
    lineIdx: [0, 1],
    qty: [40, 4],
    unitPriceDelta: [0, 0],
    discount: null,
    status: 'sent',
    daysAgo: 18,
    validityDays: 30,
    forcePlaceOfSupply: 'Karnataka',
  },
  // 3 accepted
  {
    lineIdx: [0, 2],
    qty: [150, 20],
    unitPriceDelta: [-300, -50],
    discount: { type: 'percent', value: 10 },
    status: 'accepted',
    daysAgo: 25,
    validityDays: 30,
    linkDeal: true,
  },
  {
    lineIdx: [0],
    qty: [80],
    unitPriceDelta: [0],
    discount: null,
    status: 'accepted',
    daysAgo: 30,
    validityDays: 30,
  },
  {
    lineIdx: [1],
    qty: [6],
    unitPriceDelta: [1000],
    discount: { type: 'amount', value: 10_000 },
    status: 'accepted',
    daysAgo: 35,
    validityDays: 30,
  },
  // 2 rejected
  {
    lineIdx: [0],
    qty: [110],
    unitPriceDelta: [500],
    discount: null,
    status: 'rejected',
    daysAgo: 22,
    validityDays: 30,
  },
  {
    lineIdx: [0, 1],
    qty: [30, 3],
    unitPriceDelta: [0, 0],
    discount: null,
    status: 'rejected',
    daysAgo: 28,
    validityDays: 30,
  },
  // 1 expired
  {
    lineIdx: [0],
    qty: [50],
    unitPriceDelta: [0],
    discount: null,
    status: 'expired',
    daysAgo: 45,
    validityDays: 15,
  },
];

function computeTotals(args: {
  lines: { quantity: number; unitPrice: number; gstRate: number }[];
  discount: QuotePlan['discount'];
  tenantState: string;
  placeOfSupply: string;
}) {
  const isInterState = args.tenantState.toUpperCase() !== args.placeOfSupply.toUpperCase();
  let subtotal = 0;
  for (const l of args.lines) subtotal += l.quantity * l.unitPrice;
  subtotal = round2(subtotal);

  let discountAmount = 0;
  if (args.discount) {
    if (args.discount.type === 'percent') {
      discountAmount = round2((subtotal * args.discount.value) / 100);
    } else {
      discountAmount = round2(Math.min(args.discount.value, subtotal));
    }
  }
  const taxableAmount = round2(subtotal - discountAmount);
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const l of args.lines) {
    const lineGross = l.quantity * l.unitPrice;
    const lineAfter = lineGross * (1 - discountRatio);
    const rate = l.gstRate / 100;
    if (isInterState) {
      igst += lineAfter * rate;
    } else {
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
    isInterState,
  };
}

async function seedTenant(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  adminId: string | null,
  salesId: string | null,
  fiscalYear: number,
) {
  if (!adminId) return;
  const actorId = salesId ?? adminId;

  const tenantStateRow = await db
    .select({ state: tenantSettings.state })
    .from(tenantSettings)
    .where(sql`tenant_id = ${tenantId}`)
    .limit(1);
  const tenantState = tenantStateRow[0]?.state ?? 'Maharashtra';

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${actorId}, true)`);

    // Explicit tenant filter on every master-data read: the seed runs with
    // a role that bypasses RLS, so an unqualified select would return rows
    // from EVERY tenant and `pick()` could grab a cross-tenant dealer —
    // producing quotations whose dealer_id points outside their own tenant
    // (DEV.38). Scope every read to `tenantId`.
    const dealerRows = (await tx
      .select({ id: dealers.id, displayName: dealers.displayName, state: dealers.state })
      .from(dealers)
      .where(sql`tenant_id = ${tenantId}`)) as DealerRow[];
    const productRows = (await tx
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        hsnCode: products.hsnCode,
        gstRate: products.gstRate,
        defaultSellingPrice: products.defaultSellingPrice,
      })
      .from(products)
      .where(sql`tenant_id = ${tenantId}`)) as ProductRow[];
    const dealRows = (await tx
      .select({ id: deals.id, dealerId: deals.dealerId })
      .from(deals)
      .where(sql`tenant_id = ${tenantId}`)) as DealRow[];

    if (dealerRows.length === 0 || productRows.length < 3) {
      console.log('  · (not enough dealers/products — skipping)');
      return;
    }

    const usableProducts = productRows.filter((p) => p.defaultSellingPrice != null);
    if (usableProducts.length < 3) {
      console.log('  · (need at least 3 products with defaultSellingPrice — skipping)');
      return;
    }

    let createdCount = 0;
    const createdIdsInOrder: string[] = [];

    for (let i = 0; i < PLANS.length; i++) {
      const plan = PLANS[i]!;
      const seed = i + 1;
      const dealer = pick(dealerRows, seed * 11);

      const lines = plan.lineIdx.map((lineIdx, j) => {
        const p = usableProducts[lineIdx % usableProducts.length]!;
        const unitPrice = round2(Number(p.defaultSellingPrice) + (plan.unitPriceDelta[j] ?? 0));
        return {
          product: p,
          quantity: plan.qty[j] ?? 1,
          unitPrice: Math.max(0, unitPrice),
          gstRate: Number(p.gstRate),
        };
      });

      const placeOfSupply = plan.forcePlaceOfSupply ?? dealer.state ?? tenantState;
      const totals = computeTotals({
        lines: lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          gstRate: l.gstRate,
        })),
        discount: plan.discount,
        tenantState,
        placeOfSupply,
      });

      // Quote counter
      const counterRes = await tx.execute<{ last_value: string | number }>(sql`
        INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
        VALUES (${tenantId}, 'quotation', ${fiscalYear}, 1)
        ON CONFLICT (tenant_id, doc_type, fiscal_year)
        DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
        RETURNING last_value
      `);
      const seq = Number(
        (counterRes as unknown as { last_value: string | number }[])[0]!.last_value,
      );
      const quoteNumber = `QT-${fiscalYear}-${String(seq).padStart(4, '0')}`;

      const quoteDate = new Date(Date.now() - plan.daysAgo * 86_400_000);
      const validUntil = new Date(quoteDate.getTime() + plan.validityDays * 86_400_000);

      const dealId =
        plan.linkDeal && dealRows.length > 0
          ? (dealRows.find((d) => d.dealerId === dealer.id)?.id ?? null)
          : null;

      const sentAt =
        plan.status === 'sent' ||
        plan.status === 'accepted' ||
        plan.status === 'rejected' ||
        plan.status === 'expired'
          ? new Date(quoteDate.getTime() + 60_000)
          : null;
      const acceptedAt =
        plan.status === 'accepted' ? new Date(quoteDate.getTime() + 3 * 86_400_000) : null;
      const rejectedAt =
        plan.status === 'rejected' ? new Date(quoteDate.getTime() + 4 * 86_400_000) : null;

      const [created] = await tx
        .insert(quotations)
        .values({
          tenantId,
          quoteNumber,
          revision: 1,
          parentQuotationId: null,
          dealId,
          dealerId: dealer.id,
          preparedBy: actorId,
          tenantStateAtIssue: tenantState,
          placeOfSupply,
          quoteDate: quoteDate.toISOString().slice(0, 10),
          validUntil: validUntil.toISOString().slice(0, 10),
          currency: 'INR',
          discountType: plan.discount?.type ?? null,
          discountValue: plan.discount?.value != null ? plan.discount.value.toFixed(2) : null,
          subtotal: totals.subtotal.toFixed(2),
          discountAmount: totals.discountAmount.toFixed(2),
          taxableAmount: totals.taxableAmount.toFixed(2),
          cgstAmount: totals.cgst.toFixed(2),
          sgstAmount: totals.sgst.toFixed(2),
          igstAmount: totals.igst.toFixed(2),
          totalAmount: totals.total.toFixed(2),
          termsAndConditions:
            'Payment due within agreed credit terms. Goods once sold cannot be returned.',
          status: plan.status,
          sentAt,
          sentVia: sentAt ? 'email' : null,
          acceptedAt,
          rejectedAt,
          rejectedReason:
            plan.status === 'rejected' ? 'Dealer chose a competing offer (seed)' : null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: quotations.id });
      const quoteId = created!.id;
      createdIdsInOrder.push(quoteId);

      // Lines
      const lineRows = lines.map((l, idx) => ({
        tenantId,
        quotationId: quoteId,
        lineNumber: idx + 1,
        productId: l.product.id,
        productSku: l.product.sku,
        productName: l.product.name,
        hsnCode: l.product.hsnCode,
        quantity: l.quantity.toFixed(3),
        unitOfMeasure: 'Nos',
        unitPrice: l.unitPrice.toFixed(2),
        gstRate: l.gstRate.toFixed(2),
        lineTotal: round2(l.quantity * l.unitPrice).toFixed(2),
      }));
      await tx.insert(quotationLines).values(lineRows);

      // Status history: draft → (sent → accepted/rejected/expired)
      const at0 = quoteDate;
      await tx.insert(quotationStatusHistory).values({
        tenantId,
        quotationId: quoteId,
        fromStatus: null,
        toStatus: 'draft',
        transitionedBy: actorId,
        transitionedAt: at0,
        reason: 'quotation_created',
      });
      if (plan.status !== 'draft') {
        await tx.insert(quotationStatusHistory).values({
          tenantId,
          quotationId: quoteId,
          fromStatus: 'draft',
          toStatus: 'sent',
          transitionedBy: actorId,
          transitionedAt: new Date(at0.getTime() + 60_000),
          reason: 'sent_via_email',
        });
        if (plan.status === 'accepted' || plan.status === 'rejected' || plan.status === 'expired') {
          await tx.insert(quotationStatusHistory).values({
            tenantId,
            quotationId: quoteId,
            fromStatus: 'sent',
            toStatus: plan.status,
            transitionedBy: actorId,
            transitionedAt: new Date(at0.getTime() + 3 * 86_400_000),
            reason:
              plan.status === 'expired'
                ? 'validity_expired'
                : plan.status === 'rejected'
                  ? 'Dealer chose a competing offer (seed)'
                  : null,
          });
        }
      }

      createdCount++;
    }

    // Bonus: turn the first 'accepted' into a revision chain Rev1 → Rev2 → Rev3.
    // Find an accepted quotation and replicate it twice with revision bumps.
    const acceptedRows = await tx
      .select({
        id: quotations.id,
        quoteNumber: quotations.quoteNumber,
        revision: quotations.revision,
        dealId: quotations.dealId,
        dealerId: quotations.dealerId,
        preparedBy: quotations.preparedBy,
        tenantStateAtIssue: quotations.tenantStateAtIssue,
        placeOfSupply: quotations.placeOfSupply,
        validUntil: quotations.validUntil,
        currency: quotations.currency,
        // discountType/discountValue MUST be carried into the revision —
        // omitting them leaves a copied discount_amount with no type/value.
        discountType: quotations.discountType,
        discountValue: quotations.discountValue,
        subtotal: quotations.subtotal,
        discountAmount: quotations.discountAmount,
        taxableAmount: quotations.taxableAmount,
        cgstAmount: quotations.cgstAmount,
        sgstAmount: quotations.sgstAmount,
        igstAmount: quotations.igstAmount,
        totalAmount: quotations.totalAmount,
        termsAndConditions: quotations.termsAndConditions,
      })
      .from(quotations)
      // Tenant filter is required: the seed bypasses RLS, so an unqualified
      // status filter would pick an 'accepted' quotation from ANOTHER tenant
      // and build this tenant's revision chain on top of it — cross-tenant
      // dealer + parent references (DEV.38).
      .where(sql`status = 'accepted' AND tenant_id = ${tenantId}`)
      .limit(1);

    if (acceptedRows[0]) {
      const parent = acceptedRows[0];
      // Mark parent as superseded so the chain is non-trivial.
      await tx
        .update(quotations)
        .set({ status: 'superseded' })
        .where(sql`id = ${parent.id}`);
      await tx.insert(quotationStatusHistory).values({
        tenantId,
        quotationId: parent.id,
        fromStatus: 'accepted',
        toStatus: 'superseded',
        transitionedBy: actorId,
        reason: 'revised_to_rev_2',
      });

      // Create Rev 2 (sent) and Rev 3 (draft) sharing the same quote_number.
      for (const rev of [2, 3]) {
        const status = rev === 2 ? 'superseded' : 'draft';
        const [r] = await tx
          .insert(quotations)
          .values({
            tenantId,
            quoteNumber: parent.quoteNumber,
            revision: rev,
            parentQuotationId: parent.id,
            dealId: parent.dealId,
            dealerId: parent.dealerId,
            preparedBy: actorId,
            tenantStateAtIssue: parent.tenantStateAtIssue,
            placeOfSupply: parent.placeOfSupply,
            quoteDate: new Date().toISOString().slice(0, 10),
            validUntil: parent.validUntil,
            currency: parent.currency,
            discountType: parent.discountType,
            discountValue: parent.discountValue,
            subtotal: parent.subtotal,
            discountAmount: parent.discountAmount,
            taxableAmount: parent.taxableAmount,
            cgstAmount: parent.cgstAmount,
            sgstAmount: parent.sgstAmount,
            igstAmount: parent.igstAmount,
            totalAmount: parent.totalAmount,
            termsAndConditions: parent.termsAndConditions,
            status,
            createdBy: actorId,
            updatedBy: actorId,
          })
          .returning({ id: quotations.id });
        // Copy lines from parent.
        const parentLines = await tx
          .select()
          .from(quotationLines)
          .where(sql`quotation_id = ${parent.id}`);
        if (parentLines.length > 0 && r) {
          await tx.insert(quotationLines).values(
            parentLines.map((l) => ({
              tenantId,
              quotationId: r.id,
              lineNumber: l.lineNumber,
              productId: l.productId,
              productSku: l.productSku,
              productName: l.productName,
              hsnCode: l.hsnCode,
              quantity: l.quantity,
              unitOfMeasure: l.unitOfMeasure,
              unitPrice: l.unitPrice,
              gstRate: l.gstRate,
              lineTotal: l.lineTotal,
            })),
          );
          await tx.insert(quotationStatusHistory).values({
            tenantId,
            quotationId: r.id,
            fromStatus: null,
            toStatus: status,
            transitionedBy: actorId,
            reason: `revised_from_${parent.quoteNumber}_rev_${rev - 1}`,
          });
        }
        createdCount++;
      }
    }

    console.log(
      `  · ${createdCount} quotations seeded (${createdIdsInOrder.length} primaries + revisions)`,
    );
  });
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Day 8 seed: quotations + quotation_lines + quotation_status_history');

  await client.unsafe(`
    TRUNCATE TABLE
      quotation_status_history,
      quotation_lines,
      quotations
    RESTART IDENTITY CASCADE;
  `);
  await client.unsafe(`DELETE FROM document_counters WHERE doc_type = 'quotation';`);

  const fiscalYear = fiscalYearOf(new Date());
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
    await seedTenant(db, t.id, admin?.id ?? null, sales?.id ?? null, fiscalYear);
  }

  await client.end({ timeout: 5 });
  console.log('✓ Day 8 seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Day 8 seed failed:', err);
  process.exit(1);
});
