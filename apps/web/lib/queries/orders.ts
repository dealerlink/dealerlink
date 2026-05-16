import {
  dealers,
  inventoryItems,
  orderLines,
  orderStatusHistory,
  orders,
  performaInvoices,
  products,
  users,
  withTenant,
  type OrderPaymentStatus,
  type OrderStatus,
} from '@dealerlink/db';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte } from 'drizzle-orm';

export interface OrderListRow {
  id: string;
  orderNumber: string;
  orderDate: string;
  expectedDispatchDate: string | null;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  billToName: string;
  totalAmount: number;
}

export async function listOrders(
  tenantId: string,
  filter: {
    status?: OrderStatus[] | undefined;
    paymentStatus?: OrderPaymentStatus[] | undefined;
    dealerId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    search?: string | undefined;
  },
  opts: { limit?: number; offset?: number } = {},
): Promise<{ rows: OrderListRow[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  return withTenant(tenantId, async (tx) => {
    const where = [eq(orders.tenantId, tenantId)];
    if (filter.status && filter.status.length > 0)
      where.push(inArray(orders.status, filter.status));
    if (filter.paymentStatus && filter.paymentStatus.length > 0) {
      where.push(inArray(orders.paymentStatus, filter.paymentStatus));
    }
    if (filter.dealerId) where.push(eq(orders.billToDealerId, filter.dealerId));
    if (filter.from) where.push(gte(orders.orderDate, filter.from));
    if (filter.to) where.push(lte(orders.orderDate, filter.to));
    if (filter.search && filter.search.trim().length > 0) {
      where.push(ilike(orders.orderNumber, `%${filter.search.trim()}%`));
    }

    const rows = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        orderDate: orders.orderDate,
        expectedDispatchDate: orders.expectedDispatchDate,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        billToName: dealers.displayName,
        totalAmount: orders.totalAmount,
      })
      .from(orders)
      .leftJoin(dealers, eq(dealers.id, orders.billToDealerId))
      .where(and(...where))
      .orderBy(desc(orders.orderDate), desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const [agg] = await tx
      .select({ total: count() })
      .from(orders)
      .where(and(...where));

    return {
      rows: rows.map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        orderDate: r.orderDate,
        expectedDispatchDate: r.expectedDispatchDate,
        status: r.status,
        paymentStatus: r.paymentStatus,
        billToName: r.billToName ?? '—',
        totalAmount: Number(r.totalAmount),
      })),
      total: agg?.total ?? 0,
    };
  });
}

export interface OrderPartyView {
  id: string;
  name: string;
  legalName: string;
  state: string | null;
  gstin: string | null;
}

export interface OrderLineView {
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
  reservedQuantity: number;
  dispatchedQuantity: number;
}

export interface ReservedSerialView {
  id: string;
  serialNumber: string | null;
  productName: string;
  productSku: string;
  status: string;
  warehouseCode: string | null;
}

export interface OrderDetail {
  id: string;
  tenantId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  performaInvoiceId: string;
  piNumber: string | null;
  quotationId: string;
  dealId: string | null;
  billTo: OrderPartyView;
  shipTo: OrderPartyView;
  threeParty: boolean;
  tenantStateAtIssue: string;
  placeOfSupply: string;
  isInterState: boolean;
  orderDate: string;
  expectedDispatchDate: string | null;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  notes: string | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  lines: OrderLineView[];
  reservedSerials: ReservedSerialView[];
  history: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    transitionedAt: Date;
    reason: string | null;
    actorName: string | null;
  }>;
}

export async function getOrderById(tenantId: string, orderId: string): Promise<OrderDetail | null> {
  const billTo = alias(dealers, 'bill_to');
  const shipTo = alias(dealers, 'ship_to');

  return withTenant(tenantId, async (tx) => {
    const [base] = await tx
      .select({
        order: orders,
        piNumber: performaInvoices.piNumber,
        billToName: billTo.displayName,
        billToLegal: billTo.legalName,
        billToState: billTo.state,
        billToGstin: billTo.gstin,
        shipToName: shipTo.displayName,
        shipToLegal: shipTo.legalName,
        shipToState: shipTo.state,
        shipToGstin: shipTo.gstin,
      })
      .from(orders)
      .leftJoin(performaInvoices, eq(performaInvoices.id, orders.performaInvoiceId))
      .leftJoin(billTo, eq(billTo.id, orders.billToDealerId))
      .leftJoin(shipTo, eq(shipTo.id, orders.shipToDealerId))
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!base) return null;
    const o = base.order;

    const lineRows = await tx
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(orderLines.lineNumber));

    const serialRows = await tx
      .select({
        id: inventoryItems.id,
        serialNumber: inventoryItems.serialNumber,
        status: inventoryItems.status,
        warehouseCode: inventoryItems.warehouseCode,
        productName: products.name,
        productSku: products.sku,
      })
      .from(inventoryItems)
      .leftJoin(products, eq(products.id, inventoryItems.productId))
      .where(eq(inventoryItems.reservedForOrderId, orderId))
      .orderBy(asc(products.sku));

    const historyRows = await tx
      .select({
        id: orderStatusHistory.id,
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        transitionedAt: orderStatusHistory.transitionedAt,
        reason: orderStatusHistory.reason,
        actorId: orderStatusHistory.transitionedBy,
      })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(desc(orderStatusHistory.transitionedAt))
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
      id: o.id,
      tenantId: o.tenantId,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      performaInvoiceId: o.performaInvoiceId,
      piNumber: base.piNumber,
      quotationId: o.quotationId,
      dealId: o.dealId,
      billTo: {
        id: o.billToDealerId,
        name: base.billToName ?? '—',
        legalName: base.billToLegal ?? '—',
        state: base.billToState,
        gstin: base.billToGstin,
      },
      shipTo: {
        id: o.shipToDealerId,
        name: base.shipToName ?? '—',
        legalName: base.shipToLegal ?? '—',
        state: base.shipToState,
        gstin: base.shipToGstin,
      },
      threeParty: o.billToDealerId !== o.shipToDealerId,
      tenantStateAtIssue: o.tenantStateAtIssue,
      placeOfSupply: o.placeOfSupply,
      isInterState: o.tenantStateAtIssue.trim() !== o.placeOfSupply.trim(),
      orderDate: o.orderDate,
      expectedDispatchDate: o.expectedDispatchDate,
      currency: o.currency,
      subtotal: Number(o.subtotal),
      discountAmount: Number(o.discountAmount),
      taxableAmount: Number(o.taxableAmount),
      cgstAmount: Number(o.cgstAmount),
      sgstAmount: Number(o.sgstAmount),
      igstAmount: Number(o.igstAmount),
      totalAmount: Number(o.totalAmount),
      notes: o.notes,
      confirmedAt: o.confirmedAt,
      cancelledAt: o.cancelledAt,
      cancelledReason: o.cancelledReason,
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
        reservedQuantity: Number(l.reservedQuantity),
        dispatchedQuantity: Number(l.dispatchedQuantity),
      })),
      reservedSerials: serialRows.map((s) => ({
        id: s.id,
        serialNumber: s.serialNumber,
        productName: s.productName ?? '—',
        productSku: s.productSku ?? '—',
        status: s.status,
        warehouseCode: s.warehouseCode,
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

export interface ReservationPreviewLine {
  productId: string;
  productSku: string;
  productName: string;
  requested: number;
  available: number;
  short: number;
}

/**
 * Preview the inventory a pending order would reserve on confirmation.
 * `available` counts `in_stock` serials per product; `short` is the gap.
 */
export async function getReservationPreview(
  tenantId: string,
  orderId: string,
): Promise<{ lines: ReservationPreviewLine[]; canConfirm: boolean }> {
  return withTenant(tenantId, async (tx) => {
    const lineRows = await tx
      .select({
        productId: orderLines.productId,
        productSku: orderLines.productSku,
        productName: orderLines.productName,
        quantity: orderLines.quantity,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId));

    const lines: ReservationPreviewLine[] = [];
    for (const l of lineRows) {
      const [agg] = await tx
        .select({ available: count() })
        .from(inventoryItems)
        .where(
          and(eq(inventoryItems.productId, l.productId), eq(inventoryItems.status, 'in_stock')),
        );
      const requested = Math.round(Number(l.quantity));
      const available = agg?.available ?? 0;
      lines.push({
        productId: l.productId,
        productSku: l.productSku,
        productName: l.productName,
        requested,
        available,
        short: Math.max(0, requested - available),
      });
    }
    return { lines, canConfirm: lines.every((l) => l.short === 0) };
  });
}
