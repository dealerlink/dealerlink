import {
  dealers,
  quotationLines,
  quotationStatusHistory,
  quotations,
  users,
  withTenant,
  type QuotationDiscountType,
  type QuotationSentVia,
  type QuotationStatus,
} from '@dealerlink/db';
import { type QuotationListFilter, quotationListFilterSchema } from '@dealerlink/schemas';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';

export interface QuotationListRow {
  id: string;
  quoteNumber: string;
  revision: number;
  quoteDate: string;
  validUntil: string;
  status: QuotationStatus;
  dealerId: string;
  dealerName: string;
  totalAmount: number;
  preparedById: string;
  preparedByName: string;
  parentQuotationId: string | null;
  updatedAt: Date;
}

export interface QuotationListResult {
  rows: QuotationListRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function listQuotations(
  tenantId: string,
  raw: Partial<QuotationListFilter>,
  opts: { limit?: number; offset?: number } = {},
): Promise<QuotationListResult> {
  const filter = quotationListFilterSchema.parse(raw);
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  return withTenant(tenantId, async (tx) => {
    const where = [eq(quotations.tenantId, tenantId)];
    if (filter.status && filter.status.length > 0) {
      where.push(inArray(quotations.status, filter.status));
    }
    if (!filter.includeSuperseded) {
      where.push(sql`${quotations.status} <> 'superseded'`);
    }
    if (filter.dealerId) where.push(eq(quotations.dealerId, filter.dealerId));
    if (filter.preparedBy) where.push(eq(quotations.preparedBy, filter.preparedBy));
    if (filter.from) where.push(gte(quotations.quoteDate, filter.from));
    if (filter.to) where.push(lte(quotations.quoteDate, filter.to));
    if (filter.search && filter.search.trim().length > 0) {
      const q = `%${filter.search.trim()}%`;
      const clause = or(ilike(quotations.quoteNumber, q));
      if (clause) where.push(clause);
    }

    const rows = await tx
      .select({
        id: quotations.id,
        quoteNumber: quotations.quoteNumber,
        revision: quotations.revision,
        quoteDate: quotations.quoteDate,
        validUntil: quotations.validUntil,
        status: quotations.status,
        dealerId: quotations.dealerId,
        dealerName: dealers.displayName,
        totalAmount: quotations.totalAmount,
        preparedById: quotations.preparedBy,
        preparedByName: users.fullName,
        parentQuotationId: quotations.parentQuotationId,
        updatedAt: quotations.updatedAt,
      })
      .from(quotations)
      .leftJoin(dealers, eq(dealers.id, quotations.dealerId))
      .leftJoin(users, eq(users.id, quotations.preparedBy))
      .where(and(...where))
      .orderBy(desc(quotations.quoteDate), desc(quotations.createdAt))
      .limit(limit)
      .offset(offset);

    const [agg] = await tx
      .select({ total: count() })
      .from(quotations)
      .where(and(...where));

    return {
      rows: rows.map((r) => ({
        id: r.id,
        quoteNumber: r.quoteNumber,
        revision: r.revision,
        quoteDate: r.quoteDate,
        validUntil: r.validUntil,
        status: r.status,
        dealerId: r.dealerId,
        dealerName: r.dealerName ?? '—',
        totalAmount: Number(r.totalAmount),
        preparedById: r.preparedById,
        preparedByName: r.preparedByName ?? '—',
        parentQuotationId: r.parentQuotationId,
        updatedAt: r.updatedAt,
      })),
      total: agg?.total ?? 0,
      limit,
      offset,
    };
  });
}

export interface QuotationLineRow {
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
  notes: string | null;
}

export interface QuotationDetail {
  id: string;
  tenantId: string;
  quoteNumber: string;
  revision: number;
  parentQuotationId: string | null;
  dealId: string | null;
  dealer: {
    id: string;
    name: string;
    legalName: string;
    state: string | null;
    gstin: string | null;
  };
  preparedBy: {
    id: string;
    fullName: string;
    email: string;
  };
  tenantStateAtIssue: string;
  placeOfSupply: string;
  quoteDate: string;
  validUntil: string;
  currency: string;
  discountType: QuotationDiscountType | null;
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
  status: QuotationStatus;
  sentAt: Date | null;
  sentVia: QuotationSentVia | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  rejectedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: QuotationLineRow[];
  history: Array<{
    id: string;
    fromStatus: QuotationStatus | null;
    toStatus: QuotationStatus;
    transitionedAt: Date;
    reason: string | null;
    actorName: string | null;
  }>;
}

export async function getQuotationById(
  tenantId: string,
  quotationId: string,
): Promise<QuotationDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [base] = await tx
      .select({
        id: quotations.id,
        tenantId: quotations.tenantId,
        quoteNumber: quotations.quoteNumber,
        revision: quotations.revision,
        parentQuotationId: quotations.parentQuotationId,
        dealId: quotations.dealId,
        dealerId: quotations.dealerId,
        dealerName: dealers.displayName,
        dealerLegal: dealers.legalName,
        dealerState: dealers.state,
        dealerGstin: dealers.gstin,
        preparedById: quotations.preparedBy,
        preparedByName: users.fullName,
        preparedByEmail: users.email,
        tenantStateAtIssue: quotations.tenantStateAtIssue,
        placeOfSupply: quotations.placeOfSupply,
        quoteDate: quotations.quoteDate,
        validUntil: quotations.validUntil,
        currency: quotations.currency,
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
        notes: quotations.notes,
        status: quotations.status,
        sentAt: quotations.sentAt,
        sentVia: quotations.sentVia,
        acceptedAt: quotations.acceptedAt,
        rejectedAt: quotations.rejectedAt,
        rejectedReason: quotations.rejectedReason,
        createdAt: quotations.createdAt,
        updatedAt: quotations.updatedAt,
      })
      .from(quotations)
      .leftJoin(dealers, eq(dealers.id, quotations.dealerId))
      .leftJoin(users, eq(users.id, quotations.preparedBy))
      .where(eq(quotations.id, quotationId))
      .limit(1);
    if (!base) return null;

    const lineRows = await tx
      .select()
      .from(quotationLines)
      .where(eq(quotationLines.quotationId, quotationId))
      .orderBy(asc(quotationLines.lineNumber));

    const historyRows = await tx
      .select({
        id: quotationStatusHistory.id,
        fromStatus: quotationStatusHistory.fromStatus,
        toStatus: quotationStatusHistory.toStatus,
        transitionedAt: quotationStatusHistory.transitionedAt,
        reason: quotationStatusHistory.reason,
        actorId: quotationStatusHistory.transitionedBy,
      })
      .from(quotationStatusHistory)
      .where(eq(quotationStatusHistory.quotationId, quotationId))
      .orderBy(desc(quotationStatusHistory.transitionedAt))
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

    return {
      id: base.id,
      tenantId: base.tenantId,
      quoteNumber: base.quoteNumber,
      revision: base.revision,
      parentQuotationId: base.parentQuotationId,
      dealId: base.dealId,
      dealer: {
        id: base.dealerId,
        name: base.dealerName ?? '—',
        legalName: base.dealerLegal ?? '—',
        state: base.dealerState,
        gstin: base.dealerGstin,
      },
      preparedBy: {
        id: base.preparedById,
        fullName: base.preparedByName ?? '—',
        email: base.preparedByEmail ?? '',
      },
      tenantStateAtIssue: base.tenantStateAtIssue,
      placeOfSupply: base.placeOfSupply,
      quoteDate: base.quoteDate,
      validUntil: base.validUntil,
      currency: base.currency,
      discountType: base.discountType,
      discountValue: base.discountValue != null ? Number(base.discountValue) : null,
      subtotal: Number(base.subtotal),
      discountAmount: Number(base.discountAmount),
      taxableAmount: Number(base.taxableAmount),
      cgstAmount: Number(base.cgstAmount),
      sgstAmount: Number(base.sgstAmount),
      igstAmount: Number(base.igstAmount),
      totalAmount: Number(base.totalAmount),
      termsAndConditions: base.termsAndConditions,
      notes: base.notes,
      status: base.status,
      sentAt: base.sentAt,
      sentVia: base.sentVia,
      acceptedAt: base.acceptedAt,
      rejectedAt: base.rejectedAt,
      rejectedReason: base.rejectedReason,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
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
        notes: l.notes,
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

export async function getQuotationsByDeal(
  tenantId: string,
  dealId: string,
): Promise<QuotationListRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: quotations.id,
        quoteNumber: quotations.quoteNumber,
        revision: quotations.revision,
        quoteDate: quotations.quoteDate,
        validUntil: quotations.validUntil,
        status: quotations.status,
        dealerId: quotations.dealerId,
        dealerName: dealers.displayName,
        totalAmount: quotations.totalAmount,
        preparedById: quotations.preparedBy,
        preparedByName: users.fullName,
        parentQuotationId: quotations.parentQuotationId,
        updatedAt: quotations.updatedAt,
      })
      .from(quotations)
      .leftJoin(dealers, eq(dealers.id, quotations.dealerId))
      .leftJoin(users, eq(users.id, quotations.preparedBy))
      .where(and(eq(quotations.tenantId, tenantId), eq(quotations.dealId, dealId)))
      .orderBy(desc(quotations.quoteDate));
    return rows.map((r) => ({
      id: r.id,
      quoteNumber: r.quoteNumber,
      revision: r.revision,
      quoteDate: r.quoteDate,
      validUntil: r.validUntil,
      status: r.status,
      dealerId: r.dealerId,
      dealerName: r.dealerName ?? '—',
      totalAmount: Number(r.totalAmount),
      preparedById: r.preparedById,
      preparedByName: r.preparedByName ?? '—',
      parentQuotationId: r.parentQuotationId,
      updatedAt: r.updatedAt,
    }));
  });
}

export interface QuotationRevisionLink {
  id: string;
  quoteNumber: string;
  revision: number;
  status: QuotationStatus;
  totalAmount: number;
  quoteDate: string;
}

/**
 * Walk the revision chain starting from any quotation in it. Returns all
 * versions ordered oldest → newest.
 */
export async function getQuotationRevisionChain(
  tenantId: string,
  quotationId: string,
): Promise<QuotationRevisionLink[]> {
  return withTenant(tenantId, async (tx) => {
    const result = await tx.execute<{
      id: string;
      quote_number: string;
      revision: number;
      status: QuotationStatus;
      total_amount: string;
      quote_date: string;
    }>(sql`
      WITH RECURSIVE chain AS (
        SELECT id, quote_number, revision, status, total_amount, quote_date, parent_quotation_id
        FROM quotations
        WHERE id = ${quotationId}
        UNION
        SELECT q.id, q.quote_number, q.revision, q.status, q.total_amount, q.quote_date, q.parent_quotation_id
        FROM quotations q
        JOIN chain c ON q.id = c.parent_quotation_id OR q.parent_quotation_id = c.id
      )
      SELECT id, quote_number, revision, status, total_amount, quote_date FROM chain
      ORDER BY revision ASC
    `);
    const rows = result as unknown as Array<{
      id: string;
      quote_number: string;
      revision: number;
      status: QuotationStatus;
      total_amount: string;
      quote_date: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      quoteNumber: r.quote_number,
      revision: r.revision,
      status: r.status,
      totalAmount: Number(r.total_amount),
      quoteDate: r.quote_date,
    }));
  });
}
