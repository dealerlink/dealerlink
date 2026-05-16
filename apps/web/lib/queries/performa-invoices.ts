import {
  dealers,
  orders,
  performaInvoiceLines,
  performaInvoiceStatusHistory,
  performaInvoices,
  quotations,
  users,
  withTenant,
  type PerformaInvoiceDiscountType,
  type PerformaInvoiceStatus,
} from '@dealerlink/db';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte } from 'drizzle-orm';

import { alias } from 'drizzle-orm/pg-core';

export interface PiListRow {
  id: string;
  piNumber: string;
  piDate: string;
  validUntil: string;
  status: PerformaInvoiceStatus;
  billToDealerId: string;
  billToName: string;
  shipToName: string;
  threeParty: boolean;
  totalAmount: number;
  preparedByName: string;
  dealId: string | null;
}

export interface PiListResult {
  rows: PiListRow[];
  total: number;
}

export async function listPerformaInvoices(
  tenantId: string,
  filter: {
    status?: PerformaInvoiceStatus[] | undefined;
    dealerId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    search?: string | undefined;
  },
  opts: { limit?: number; offset?: number } = {},
): Promise<PiListResult> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const billTo = alias(dealers, 'bill_to');
  const shipTo = alias(dealers, 'ship_to');

  return withTenant(tenantId, async (tx) => {
    const where = [eq(performaInvoices.tenantId, tenantId)];
    if (filter.status && filter.status.length > 0) {
      where.push(inArray(performaInvoices.status, filter.status));
    }
    if (filter.dealerId) where.push(eq(performaInvoices.billToDealerId, filter.dealerId));
    if (filter.from) where.push(gte(performaInvoices.piDate, filter.from));
    if (filter.to) where.push(lte(performaInvoices.piDate, filter.to));
    if (filter.search && filter.search.trim().length > 0) {
      where.push(ilike(performaInvoices.piNumber, `%${filter.search.trim()}%`));
    }

    const rows = await tx
      .select({
        id: performaInvoices.id,
        piNumber: performaInvoices.piNumber,
        piDate: performaInvoices.piDate,
        validUntil: performaInvoices.validUntil,
        status: performaInvoices.status,
        billToDealerId: performaInvoices.billToDealerId,
        shipToDealerId: performaInvoices.shipToDealerId,
        billToName: billTo.displayName,
        shipToName: shipTo.displayName,
        totalAmount: performaInvoices.totalAmount,
        preparedByName: users.fullName,
        dealId: performaInvoices.dealId,
      })
      .from(performaInvoices)
      .leftJoin(billTo, eq(billTo.id, performaInvoices.billToDealerId))
      .leftJoin(shipTo, eq(shipTo.id, performaInvoices.shipToDealerId))
      .leftJoin(users, eq(users.id, performaInvoices.preparedBy))
      .where(and(...where))
      .orderBy(desc(performaInvoices.piDate), desc(performaInvoices.createdAt))
      .limit(limit)
      .offset(offset);

    const [agg] = await tx
      .select({ total: count() })
      .from(performaInvoices)
      .where(and(...where));

    return {
      rows: rows.map((r) => ({
        id: r.id,
        piNumber: r.piNumber,
        piDate: r.piDate,
        validUntil: r.validUntil,
        status: r.status,
        billToDealerId: r.billToDealerId,
        billToName: r.billToName ?? '—',
        shipToName: r.shipToName ?? '—',
        threeParty: r.billToDealerId !== r.shipToDealerId,
        totalAmount: Number(r.totalAmount),
        preparedByName: r.preparedByName ?? '—',
        dealId: r.dealId,
      })),
      total: agg?.total ?? 0,
    };
  });
}

export interface PiPartyView {
  id: string;
  name: string;
  legalName: string;
  state: string | null;
  gstin: string | null;
  email: string | null;
}

export interface PiLineView {
  id: string;
  lineNumber: number;
  productId: string;
  productSku: string;
  productName: string;
  hsnCode: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  gstRate: number;
  lineTotal: number;
  description: string | null;
}

export interface PiDetail {
  id: string;
  tenantId: string;
  piNumber: string;
  status: PerformaInvoiceStatus;
  quotationId: string;
  quoteNumber: string | null;
  dealId: string | null;
  billTo: PiPartyView;
  shipTo: PiPartyView;
  threeParty: boolean;
  preparedByName: string;
  tenantStateAtIssue: string;
  placeOfSupply: string;
  isInterState: boolean;
  piDate: string;
  validUntil: string;
  currency: string;
  discountType: PerformaInvoiceDiscountType | null;
  discountValue: number | null;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  termsAndConditions: string | null;
  notes: string | null;
  sentAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  /** The order spawned on confirmation, if any. */
  order: { id: string; orderNumber: string } | null;
  lines: PiLineView[];
  history: Array<{
    id: string;
    fromStatus: PerformaInvoiceStatus | null;
    toStatus: PerformaInvoiceStatus;
    transitionedAt: Date;
    reason: string | null;
    actorName: string | null;
  }>;
}

export async function getPerformaInvoiceById(
  tenantId: string,
  piId: string,
): Promise<PiDetail | null> {
  const billTo = alias(dealers, 'bill_to');
  const shipTo = alias(dealers, 'ship_to');

  return withTenant(tenantId, async (tx) => {
    const [base] = await tx
      .select({
        pi: performaInvoices,
        quoteNumber: quotations.quoteNumber,
        preparedByName: users.fullName,
        billToName: billTo.displayName,
        billToLegal: billTo.legalName,
        billToState: billTo.state,
        billToGstin: billTo.gstin,
        billToEmail: billTo.email,
        shipToName: shipTo.displayName,
        shipToLegal: shipTo.legalName,
        shipToState: shipTo.state,
        shipToGstin: shipTo.gstin,
        shipToEmail: shipTo.email,
      })
      .from(performaInvoices)
      .leftJoin(quotations, eq(quotations.id, performaInvoices.quotationId))
      .leftJoin(users, eq(users.id, performaInvoices.preparedBy))
      .leftJoin(billTo, eq(billTo.id, performaInvoices.billToDealerId))
      .leftJoin(shipTo, eq(shipTo.id, performaInvoices.shipToDealerId))
      .where(eq(performaInvoices.id, piId))
      .limit(1);
    if (!base) return null;
    const pi = base.pi;

    const lineRows = await tx
      .select()
      .from(performaInvoiceLines)
      .where(eq(performaInvoiceLines.performaInvoiceId, piId))
      .orderBy(asc(performaInvoiceLines.lineNumber));

    const historyRows = await tx
      .select({
        id: performaInvoiceStatusHistory.id,
        fromStatus: performaInvoiceStatusHistory.fromStatus,
        toStatus: performaInvoiceStatusHistory.toStatus,
        transitionedAt: performaInvoiceStatusHistory.transitionedAt,
        reason: performaInvoiceStatusHistory.reason,
        actorId: performaInvoiceStatusHistory.transitionedBy,
      })
      .from(performaInvoiceStatusHistory)
      .where(eq(performaInvoiceStatusHistory.performaInvoiceId, piId))
      .orderBy(desc(performaInvoiceStatusHistory.transitionedAt))
      .limit(20);

    const actorIds = Array.from(
      new Set(historyRows.map((h) => h.actorId).filter((id): id is string => id !== null)),
    );
    let actorMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const actors = await tx
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, actorIds));
      actorMap = new Map(actors.map((a) => [a.id, a.name ?? '—']));
    }

    const [order] = await tx
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.performaInvoiceId, piId))
      .limit(1);

    return {
      id: pi.id,
      tenantId: pi.tenantId,
      piNumber: pi.piNumber,
      status: pi.status,
      quotationId: pi.quotationId,
      quoteNumber: base.quoteNumber,
      dealId: pi.dealId,
      billTo: {
        id: pi.billToDealerId,
        name: base.billToName ?? '—',
        legalName: base.billToLegal ?? '—',
        state: base.billToState,
        gstin: base.billToGstin,
        email: base.billToEmail,
      },
      shipTo: {
        id: pi.shipToDealerId,
        name: base.shipToName ?? '—',
        legalName: base.shipToLegal ?? '—',
        state: base.shipToState,
        gstin: base.shipToGstin,
        email: base.shipToEmail,
      },
      threeParty: pi.billToDealerId !== pi.shipToDealerId,
      preparedByName: base.preparedByName ?? '—',
      tenantStateAtIssue: pi.tenantStateAtIssue,
      placeOfSupply: pi.placeOfSupply,
      isInterState: pi.tenantStateAtIssue.trim() !== pi.placeOfSupply.trim(),
      piDate: pi.piDate,
      validUntil: pi.validUntil,
      currency: pi.currency,
      discountType: pi.discountType,
      discountValue: pi.discountValue != null ? Number(pi.discountValue) : null,
      subtotal: Number(pi.subtotal),
      discountAmount: Number(pi.discountAmount),
      taxableAmount: Number(pi.taxableAmount),
      cgstAmount: Number(pi.cgstAmount),
      sgstAmount: Number(pi.sgstAmount),
      igstAmount: Number(pi.igstAmount),
      totalAmount: Number(pi.totalAmount),
      termsAndConditions: pi.termsAndConditions,
      notes: pi.notes,
      sentAt: pi.sentAt,
      confirmedAt: pi.confirmedAt,
      cancelledAt: pi.cancelledAt,
      cancelledReason: pi.cancelledReason,
      order: order ?? null,
      lines: lineRows.map((l) => ({
        id: l.id,
        lineNumber: l.lineNumber,
        productId: l.productId,
        productSku: l.productSku,
        productName: l.productName,
        hsnCode: l.hsnCode,
        quantity: Number(l.quantity),
        unitOfMeasure: l.unitOfMeasure,
        unitPrice: Number(l.unitPrice),
        gstRate: Number(l.gstRate),
        lineTotal: Number(l.lineTotal),
        description: l.description,
      })),
      history: historyRows.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        transitionedAt: h.transitionedAt,
        reason: h.reason,
        actorName: h.actorId ? (actorMap.get(h.actorId) ?? null) : null,
      })),
    };
  });
}
