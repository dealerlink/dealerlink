import {
  dealers,
  nextCounter,
  products,
  quotationLines,
  quotationStatusHistory,
  quotations,
  tenantSettings,
  tenants,
  type DrizzleTx,
  type NewQuotationLine,
  type QuotationStatus,
} from '@dealerlink/db';
import { type CreateQuotationInput, type QuotationLineInput } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { AppError } from '@/lib/errors';
import { computeQuotationTotals, lineTotalOf } from '@/lib/quotation/preview';

import { fiscalYear } from './fiscal-year';

interface ResolvedDealerCtx {
  dealerId: string;
  dealerState: string;
}

export async function loadDealerForQuotation(
  tx: DrizzleTx,
  dealerId: string,
): Promise<ResolvedDealerCtx> {
  const [d] = await tx
    .select({
      id: dealers.id,
      state: dealers.state,
      status: dealers.status,
      deletedAt: dealers.deletedAt,
    })
    .from(dealers)
    .where(eq(dealers.id, dealerId))
    .limit(1);
  if (!d || d.deletedAt) throw new AppError('NOT_FOUND', 'Dealer not found');
  if (d.status !== 'active') {
    throw new AppError('VALIDATION', 'Cannot create a quotation for an inactive dealer');
  }
  if (!d.state) {
    throw new AppError(
      'VALIDATION',
      'Dealer is missing a state — set it on the dealer before quoting',
    );
  }
  return { dealerId: d.id, dealerState: d.state.toUpperCase() };
}

export interface TenantQuotationContext {
  tenantState: string;
  defaultTerms: string | null;
  defaultQuoteValidity: number;
  docPrefix: string;
}

export async function loadTenantQuotationContext(
  tx: DrizzleTx,
  tenantId: string,
): Promise<TenantQuotationContext> {
  const [t] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t) throw new AppError('NOT_FOUND', 'Tenant not found');

  const [s] = await tx
    .select({
      state: tenantSettings.state,
      defaultTerms: tenantSettings.defaultTerms,
      defaultQuoteValidity: tenantSettings.defaultQuoteValidity,
      docPrefixes: tenantSettings.docPrefixes,
    })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  if (!s || !s.state) {
    throw new AppError(
      'VALIDATION',
      'Tenant settings are missing a state — set it before creating quotations',
    );
  }
  const prefixes = (s.docPrefixes ?? {}) as Record<string, string>;
  return {
    tenantState: s.state.toUpperCase(),
    defaultTerms: s.defaultTerms ?? null,
    defaultQuoteValidity: s.defaultQuoteValidity,
    docPrefix: prefixes['quotation'] ?? 'QT',
  };
}

export interface ResolvedProduct {
  id: string;
  sku: string;
  name: string;
  hsnCode: string;
  gstRate: number;
}

export async function loadProductsForLines(
  tx: DrizzleTx,
  tenantId: string,
  lines: ReadonlyArray<{ productId: string }>,
): Promise<Map<string, ResolvedProduct>> {
  const ids = Array.from(new Set(lines.map((l) => l.productId)));
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
      status: products.status,
      deletedAt: products.deletedAt,
    })
    .from(products)
    .where(eq(products.tenantId, tenantId));
  const map = new Map<string, ResolvedProduct>();
  for (const r of rows) {
    if (r.deletedAt || r.status !== 'active') continue;
    map.set(r.id, {
      id: r.id,
      sku: r.sku,
      name: r.name,
      hsnCode: r.hsnCode,
      gstRate: Number(r.gstRate),
    });
  }
  for (const id of ids) {
    if (!map.has(id)) {
      throw new AppError('NOT_FOUND', `Product not found or inactive: ${id}`);
    }
  }
  return map;
}

export interface ComputedTotals {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
}

export function computeTotalsForPersistence(
  input: Pick<CreateQuotationInput, 'lines' | 'discount'>,
  tenantState: string,
  placeOfSupply: string,
): ComputedTotals {
  const totals = computeQuotationTotals({
    tenantState,
    placeOfSupply,
    lines: input.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      gstRate: l.gstRate,
    })),
    discount: input.discount ?? null,
  });
  return {
    subtotal: totals.subtotal.toFixed(2),
    discountAmount: totals.discountAmount.toFixed(2),
    taxableAmount: totals.taxableAmount.toFixed(2),
    cgstAmount: totals.cgst.toFixed(2),
    sgstAmount: totals.sgst.toFixed(2),
    igstAmount: totals.igst.toFixed(2),
    totalAmount: totals.total.toFixed(2),
  };
}

export interface BuiltLine extends Omit<NewQuotationLine, 'id' | 'createdAt'> {
  lineNumber: number;
}

export function buildLineInserts(
  input: ReadonlyArray<
    Partial<QuotationLineInput> & Pick<QuotationLineInput, 'productId' | 'quantity' | 'unitPrice'>
  >,
  productMap: Map<string, ResolvedProduct>,
  ctx: { tenantId: string; quotationId: string },
): BuiltLine[] {
  return input.map((l, idx) => {
    const p = productMap.get(l.productId);
    if (!p) throw new AppError('NOT_FOUND', `Product not found: ${l.productId}`);
    // gst_rate + hsn captured from product master at line-creation time.
    const gstRate = p.gstRate;
    return {
      tenantId: ctx.tenantId,
      quotationId: ctx.quotationId,
      lineNumber: idx + 1,
      productId: p.id,
      productSku: p.sku,
      productName: p.name,
      hsnCode: p.hsnCode,
      quantity: Number(l.quantity).toFixed(3),
      unitOfMeasure: l.unitOfMeasure || 'Nos',
      unitPrice: Number(l.unitPrice).toFixed(2),
      gstRate: gstRate.toFixed(2),
      lineTotal: lineTotalOf({ quantity: l.quantity, unitPrice: l.unitPrice }).toFixed(2),
      description: l.description?.toString().trim() || null,
      notes: l.notes?.toString().trim() || null,
    };
  });
}

export async function allocateQuoteNumber(
  tx: DrizzleTx,
  tenantId: string,
  prefix: string,
  fy: number,
): Promise<string> {
  const seq = await nextCounter(tx, tenantId, 'quotation', fy);
  return `${prefix}-${fy}-${String(seq).padStart(4, '0')}`;
}

export async function writeStatusHistory(
  tx: DrizzleTx,
  args: {
    tenantId: string;
    quotationId: string;
    fromStatus: QuotationStatus | null;
    toStatus: QuotationStatus;
    actorId: string;
    reason?: string | null;
  },
): Promise<void> {
  await tx.insert(quotationStatusHistory).values({
    tenantId: args.tenantId,
    quotationId: args.quotationId,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    transitionedBy: args.actorId,
    reason: args.reason ?? null,
  });
}

export async function loadQuotationForGuard(tx: DrizzleTx, id: string) {
  const [q] = await tx
    .select({
      id: quotations.id,
      tenantId: quotations.tenantId,
      preparedBy: quotations.preparedBy,
      status: quotations.status,
      revision: quotations.revision,
      quoteNumber: quotations.quoteNumber,
      parentQuotationId: quotations.parentQuotationId,
    })
    .from(quotations)
    .where(eq(quotations.id, id))
    .limit(1);
  return q ?? null;
}

export async function replaceLines(
  tx: DrizzleTx,
  args: {
    tenantId: string;
    quotationId: string;
    lines: ReadonlyArray<
      Partial<QuotationLineInput> & Pick<QuotationLineInput, 'productId' | 'quantity' | 'unitPrice'>
    >;
    productMap: Map<string, ResolvedProduct>;
  },
): Promise<void> {
  await tx.delete(quotationLines).where(eq(quotationLines.quotationId, args.quotationId));
  const inserts = buildLineInserts(args.lines, args.productMap, {
    tenantId: args.tenantId,
    quotationId: args.quotationId,
  });
  if (inserts.length > 0) {
    await tx.insert(quotationLines).values(inserts);
  }
}

export { fiscalYear };
