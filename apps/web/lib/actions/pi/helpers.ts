import {
  dealers,
  nextCounter,
  orderStatusHistory,
  performaInvoiceLines,
  performaInvoiceStatusHistory,
  performaInvoices,
  quotationLines,
  quotations,
  tenantSettings,
  type DrizzleTx,
  type NewPerformaInvoiceLine,
  type OrderStatus,
  type PerformaInvoiceStatus,
} from '@dealerlink/db';
import { eq } from 'drizzle-orm';

import { computeTax, serializeOutput, TaxComputationError, type GstRate } from '@dealerlink/tax';

import { AppError } from '@/lib/errors';

import { fiscalYear } from '../quotations/fiscal-year';

export { fiscalYear };

export interface DocumentDiscount {
  type: 'percent' | 'amount';
  value: number;
}

export interface ComputedTotals {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
  isInterState: boolean;
}

/**
 * Authoritative server-side totals for a PI/Order. Delegates to the canonical
 * `@dealerlink/tax` engine. `placeOfSupply` is the SHIP-TO state (ADR-012),
 * so a Ship-To in a different state from the tenant flips IGST↔CGST/SGST.
 */
export function computeDocumentTotals(
  lines: ReadonlyArray<{ quantity: number; unitPrice: number; gstRate: number }>,
  discount: DocumentDiscount | null,
  tenantState: string,
  placeOfSupply: string,
): ComputedTotals {
  try {
    const out = serializeOutput(
      computeTax({
        tenantState,
        placeOfSupply,
        lines: lines.map((l, i) => ({
          lineId: String(i),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          gstRate: l.gstRate as GstRate,
        })),
        discount: discount ?? null,
      }),
    );
    return {
      subtotal: out.subtotal,
      discountAmount: out.discountAmount,
      taxableAmount: out.taxableAmount,
      cgstAmount: out.cgstAmount,
      sgstAmount: out.sgstAmount,
      igstAmount: out.igstAmount,
      totalAmount: out.totalAmount,
      isInterState: out.isInterState,
    };
  } catch (err) {
    if (err instanceof TaxComputationError) throw new AppError('VALIDATION', err.message);
    throw err;
  }
}

export interface TenantPiContext {
  tenantState: string;
  defaultTerms: string | null;
  defaultQuoteValidity: number;
  piPrefix: string;
  orderPrefix: string;
}

export async function loadTenantPiContext(
  tx: DrizzleTx,
  tenantId: string,
): Promise<TenantPiContext> {
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
      'Tenant settings are missing a state — set it before issuing performa invoices',
    );
  }
  const prefixes = (s.docPrefixes ?? {}) as Record<string, string>;
  return {
    tenantState: s.state.toUpperCase(),
    defaultTerms: s.defaultTerms ?? null,
    defaultQuoteValidity: s.defaultQuoteValidity,
    piPrefix: prefixes['proforma'] ?? 'PI',
    orderPrefix: prefixes['order'] ?? 'ORD',
  };
}

export interface ResolvedDealer {
  id: string;
  name: string;
  state: string;
}

/**
 * Load a dealer for use as Bill-To or Ship-To on a PI/Order. State is
 * upper-cased so the tax engine's case-sensitive compare (DEV.34) is fed
 * canonical values.
 */
export async function loadDealerForDocument(
  tx: DrizzleTx,
  dealerId: string,
  role: 'Bill-To' | 'Ship-To',
): Promise<ResolvedDealer> {
  const [d] = await tx
    .select({
      id: dealers.id,
      name: dealers.displayName,
      state: dealers.state,
      status: dealers.status,
      deletedAt: dealers.deletedAt,
    })
    .from(dealers)
    .where(eq(dealers.id, dealerId))
    .limit(1);
  if (!d || d.deletedAt) throw new AppError('NOT_FOUND', `${role} dealer not found`);
  if (d.status !== 'active') {
    throw new AppError('VALIDATION', `${role} dealer is inactive`);
  }
  if (!d.state) {
    throw new AppError('VALIDATION', `${role} dealer is missing a state`);
  }
  return { id: d.id, name: d.name, state: d.state.toUpperCase() };
}

export async function allocateDocumentNumber(
  tx: DrizzleTx,
  tenantId: string,
  docType: 'performa_invoice' | 'order',
  prefix: string,
  fy: number,
): Promise<string> {
  const seq = await nextCounter(tx, tenantId, docType, fy);
  return `${prefix}-${fy}-${String(seq).padStart(4, '0')}`;
}

/** A line shape the tax engine + persistence both accept. */
export interface DocumentLine {
  productId: string;
  productSku: string;
  productName: string;
  hsnCode: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  gstRate: number;
  description: string | null;
  notes: string | null;
}

/** Read the source quotation's lines as `DocumentLine`s for conversion. */
export async function loadQuotationLines(
  tx: DrizzleTx,
  quotationId: string,
): Promise<DocumentLine[]> {
  const rows = await tx
    .select()
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, quotationId));
  rows.sort((a, b) => a.lineNumber - b.lineNumber);
  return rows.map((r) => ({
    productId: r.productId,
    productSku: r.productSku,
    productName: r.productName,
    hsnCode: r.hsnCode,
    quantity: Number(r.quantity),
    unitOfMeasure: r.unitOfMeasure,
    unitPrice: Number(r.unitPrice),
    gstRate: Number(r.gstRate),
    description: r.description,
    notes: r.notes,
  }));
}

export function buildPiLineInserts(
  lines: ReadonlyArray<DocumentLine>,
  ctx: { tenantId: string; performaInvoiceId: string },
): Array<Omit<NewPerformaInvoiceLine, 'id' | 'createdAt'>> {
  return lines.map((l, idx) => ({
    tenantId: ctx.tenantId,
    performaInvoiceId: ctx.performaInvoiceId,
    lineNumber: idx + 1,
    productId: l.productId,
    productSku: l.productSku,
    productName: l.productName,
    hsnCode: l.hsnCode,
    quantity: l.quantity.toFixed(3),
    unitOfMeasure: l.unitOfMeasure || 'Nos',
    unitPrice: l.unitPrice.toFixed(2),
    gstRate: l.gstRate.toFixed(2),
    lineTotal: (l.quantity * l.unitPrice).toFixed(2),
    description: l.description?.trim() || null,
    notes: l.notes?.trim() || null,
  }));
}

export async function writePiStatusHistory(
  tx: DrizzleTx,
  args: {
    tenantId: string;
    performaInvoiceId: string;
    fromStatus: PerformaInvoiceStatus | null;
    toStatus: PerformaInvoiceStatus;
    actorId: string;
    reason?: string | null;
  },
): Promise<void> {
  await tx.insert(performaInvoiceStatusHistory).values({
    tenantId: args.tenantId,
    performaInvoiceId: args.performaInvoiceId,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    transitionedBy: args.actorId,
    reason: args.reason ?? null,
  });
}

export async function writeOrderStatusHistory(
  tx: DrizzleTx,
  args: {
    tenantId: string;
    orderId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actorId: string;
    reason?: string | null;
  },
): Promise<void> {
  await tx.insert(orderStatusHistory).values({
    tenantId: args.tenantId,
    orderId: args.orderId,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    transitionedBy: args.actorId,
    reason: args.reason ?? null,
  });
}

/** Load a PI header for guard checks (status, ownership, parties). */
export async function loadPiForGuard(tx: DrizzleTx, id: string) {
  const [pi] = await tx
    .select({
      id: performaInvoices.id,
      tenantId: performaInvoices.tenantId,
      piNumber: performaInvoices.piNumber,
      status: performaInvoices.status,
      preparedBy: performaInvoices.preparedBy,
      quotationId: performaInvoices.quotationId,
      dealId: performaInvoices.dealId,
      billToDealerId: performaInvoices.billToDealerId,
      shipToDealerId: performaInvoices.shipToDealerId,
      tenantStateAtIssue: performaInvoices.tenantStateAtIssue,
      placeOfSupply: performaInvoices.placeOfSupply,
      validUntil: performaInvoices.validUntil,
      discountType: performaInvoices.discountType,
      discountValue: performaInvoices.discountValue,
      termsAndConditions: performaInvoices.termsAndConditions,
      notes: performaInvoices.notes,
      currency: performaInvoices.currency,
      totalAmount: performaInvoices.totalAmount,
    })
    .from(performaInvoices)
    .where(eq(performaInvoices.id, id))
    .limit(1);
  return pi ?? null;
}

export { performaInvoices, performaInvoiceLines, quotations };
