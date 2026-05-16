import {
  dealers,
  dispatchLines,
  dispatchSerials,
  dispatches,
  inventoryItems,
  orderLines,
  orders,
  products,
  users,
  withTenant,
  type DispatchStatus,
} from '@dealerlink/db';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte } from 'drizzle-orm';

export interface DispatchListRow {
  id: string;
  dispatchNumber: string;
  dispatchDate: string;
  status: DispatchStatus;
  orderId: string;
  orderNumber: string;
  shipToName: string;
  vehicleNumber: string | null;
  transporterName: string | null;
  serialCount: number;
}

/** Dispatch list — newest first, with filters (status, dealer, transporter, dates). */
export async function listDispatches(
  tenantId: string,
  filter: {
    status?: DispatchStatus[] | undefined;
    dealerId?: string | undefined;
    transporter?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    search?: string | undefined;
  },
  opts: { limit?: number; offset?: number } = {},
): Promise<{ rows: DispatchListRow[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  return withTenant(tenantId, async (tx) => {
    const where = [eq(dispatches.tenantId, tenantId)];
    if (filter.status && filter.status.length > 0) {
      where.push(inArray(dispatches.status, filter.status));
    }
    if (filter.dealerId) where.push(eq(dispatches.shipToDealerId, filter.dealerId));
    if (filter.transporter && filter.transporter.trim().length > 0) {
      where.push(ilike(dispatches.transporterName, `%${filter.transporter.trim()}%`));
    }
    if (filter.from) where.push(gte(dispatches.dispatchDate, filter.from));
    if (filter.to) where.push(lte(dispatches.dispatchDate, filter.to));
    if (filter.search && filter.search.trim().length > 0) {
      where.push(ilike(dispatches.dispatchNumber, `%${filter.search.trim()}%`));
    }

    const rows = await tx
      .select({
        id: dispatches.id,
        dispatchNumber: dispatches.dispatchNumber,
        dispatchDate: dispatches.dispatchDate,
        status: dispatches.status,
        orderId: dispatches.orderId,
        orderNumber: orders.orderNumber,
        shipToName: dealers.displayName,
        vehicleNumber: dispatches.vehicleNumber,
        transporterName: dispatches.transporterName,
        serialCount: count(dispatchSerials.id),
      })
      .from(dispatches)
      .leftJoin(orders, eq(orders.id, dispatches.orderId))
      .leftJoin(dealers, eq(dealers.id, dispatches.shipToDealerId))
      .leftJoin(dispatchSerials, eq(dispatchSerials.dispatchId, dispatches.id))
      .where(and(...where))
      .groupBy(dispatches.id, orders.orderNumber, dealers.displayName)
      .orderBy(desc(dispatches.dispatchDate), desc(dispatches.createdAt))
      .limit(limit)
      .offset(offset);

    const [agg] = await tx
      .select({ total: count() })
      .from(dispatches)
      .where(and(...where));

    return {
      rows: rows.map((r) => ({
        id: r.id,
        dispatchNumber: r.dispatchNumber,
        dispatchDate: r.dispatchDate,
        status: r.status as DispatchStatus,
        orderId: r.orderId,
        orderNumber: r.orderNumber ?? '—',
        shipToName: r.shipToName ?? '—',
        vehicleNumber: r.vehicleNumber,
        transporterName: r.transporterName,
        serialCount: Number(r.serialCount),
      })),
      total: agg?.total ?? 0,
    };
  });
}

export interface DispatchableLine {
  orderLineId: string;
  productId: string;
  productSku: string;
  productName: string;
  ordered: number;
  reserved: number;
  dispatched: number;
  remaining: number;
}

/**
 * Per-order-line fulfilment counts for the create-dispatch UI:
 *   ordered   — the order line quantity
 *   reserved  — serials still `reserved` for this order (pickable now)
 *   dispatched — units already on a dispatch
 *   remaining — ordered − dispatched (the cap for a new dispatch line)
 */
export async function getDispatchableLines(
  tenantId: string,
  orderId: string,
): Promise<DispatchableLine[]> {
  return withTenant(tenantId, async (tx) => {
    const lines = await tx
      .select({
        orderLineId: orderLines.id,
        productId: orderLines.productId,
        productSku: orderLines.productSku,
        productName: orderLines.productName,
        ordered: orderLines.quantity,
        dispatched: orderLines.dispatchedQuantity,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(orderLines.lineNumber));

    const reservedRows = await tx
      .select({
        productId: inventoryItems.productId,
        reserved: count(inventoryItems.id),
      })
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.reservedForOrderId, orderId), eq(inventoryItems.status, 'reserved')),
      )
      .groupBy(inventoryItems.productId);
    const reservedByProduct = new Map(reservedRows.map((r) => [r.productId, Number(r.reserved)]));

    return lines.map((l) => {
      const ordered = Number(l.ordered);
      const dispatched = Number(l.dispatched);
      return {
        orderLineId: l.orderLineId,
        productId: l.productId,
        productSku: l.productSku,
        productName: l.productName,
        ordered,
        reserved: reservedByProduct.get(l.productId) ?? 0,
        dispatched,
        remaining: Math.max(0, ordered - dispatched),
      };
    });
  });
}

export interface AvailableSerial {
  id: string;
  serialNumber: string | null;
  productId: string;
  productSku: string;
  productName: string;
}

/** Serials currently `reserved` for an order — the pickable pool for a dispatch. */
export async function getAvailableSerialsForOrder(
  tenantId: string,
  orderId: string,
): Promise<AvailableSerial[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: inventoryItems.id,
        serialNumber: inventoryItems.serialNumber,
        productId: inventoryItems.productId,
        productSku: products.sku,
        productName: products.name,
      })
      .from(inventoryItems)
      .leftJoin(products, eq(products.id, inventoryItems.productId))
      .where(
        and(eq(inventoryItems.reservedForOrderId, orderId), eq(inventoryItems.status, 'reserved')),
      )
      .orderBy(asc(products.sku), asc(inventoryItems.serialNumber));
    return rows.map((r) => ({
      id: r.id,
      serialNumber: r.serialNumber,
      productId: r.productId,
      productSku: r.productSku ?? '—',
      productName: r.productName ?? '—',
    }));
  });
}

export interface DispatchForOrder {
  id: string;
  dispatchNumber: string;
  dispatchDate: string;
  status: DispatchStatus;
  serialCount: number;
}

/** Every dispatch raised against an order — for the order detail "Dispatches" tab. */
export async function getDispatchesForOrder(
  tenantId: string,
  orderId: string,
): Promise<DispatchForOrder[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: dispatches.id,
        dispatchNumber: dispatches.dispatchNumber,
        dispatchDate: dispatches.dispatchDate,
        status: dispatches.status,
        serialCount: count(dispatchSerials.id),
      })
      .from(dispatches)
      .leftJoin(dispatchSerials, eq(dispatchSerials.dispatchId, dispatches.id))
      .where(eq(dispatches.orderId, orderId))
      .groupBy(dispatches.id)
      .orderBy(desc(dispatches.dispatchDate), desc(dispatches.createdAt));
    return rows.map((r) => ({
      id: r.id,
      dispatchNumber: r.dispatchNumber,
      dispatchDate: r.dispatchDate,
      status: r.status as DispatchStatus,
      serialCount: Number(r.serialCount),
    }));
  });
}

export interface DispatchableOrderRow {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: string;
  billToName: string;
  shipToName: string;
  remaining: number;
}

/**
 * Orders that can still be dispatched — `confirmed` or `partially_dispatched`
 * with units left to dispatch. Drives the order typeahead on /dispatch/new
 * and the "orders ready to dispatch" dashboard widget.
 */
export async function getDispatchableOrders(tenantId: string): Promise<DispatchableOrderRow[]> {
  return withTenant(tenantId, async (tx) => {
    const shipTo = dealers;
    const rows = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        orderDate: orders.orderDate,
        status: orders.status,
        billToName: dealers.displayName,
        orderedQty: orderLines.quantity,
        dispatchedQty: orderLines.dispatchedQuantity,
        shipToId: orders.shipToDealerId,
      })
      .from(orders)
      .leftJoin(dealers, eq(dealers.id, orders.billToDealerId))
      .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
      .where(inArray(orders.status, ['confirmed', 'partially_dispatched']))
      .orderBy(desc(orders.orderDate));

    // Aggregate the per-line rows back up to one row per order.
    const byOrder = new Map<string, DispatchableOrderRow & { shipToId: string }>();
    for (const r of rows) {
      const existing = byOrder.get(r.id);
      const remainingLine = Math.max(0, Number(r.orderedQty ?? 0) - Number(r.dispatchedQty ?? 0));
      if (existing) {
        existing.remaining += remainingLine;
      } else {
        byOrder.set(r.id, {
          id: r.id,
          orderNumber: r.orderNumber,
          orderDate: r.orderDate,
          status: r.status,
          billToName: r.billToName ?? '—',
          shipToName: '—',
          remaining: remainingLine,
          shipToId: r.shipToId,
        });
      }
    }

    const result = [...byOrder.values()].filter((o) => o.remaining > 0);

    // Resolve Ship-To names in one pass.
    const shipToIds = [...new Set(result.map((o) => o.shipToId))];
    if (shipToIds.length > 0) {
      const names = await tx
        .select({ id: shipTo.id, name: shipTo.displayName })
        .from(shipTo)
        .where(inArray(shipTo.id, shipToIds));
      const nameById = new Map(names.map((n) => [n.id, n.name]));
      for (const o of result) o.shipToName = nameById.get(o.shipToId) ?? '—';
    }

    return result.map(({ shipToId: _shipToId, ...rest }) => rest);
  });
}

export interface DispatchDetailSerial {
  id: string;
  inventoryItemId: string;
  serialNumber: string | null;
}

export interface DispatchDetailLine {
  id: string;
  lineNumber: number;
  productSku: string;
  productName: string;
  quantity: number;
  serials: DispatchDetailSerial[];
}

export interface DispatchDetail {
  id: string;
  dispatchNumber: string;
  dispatchDate: string;
  expectedDeliveryDate: string | null;
  status: DispatchStatus;
  orderId: string;
  orderNumber: string;
  orderDate: string;
  vehicleNumber: string | null;
  transporterName: string | null;
  transporterDocketNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  ewayBillNumber: string | null;
  ewayBillDate: string | null;
  deliveredAt: Date | null;
  deliveredAcknowledgedBy: string | null;
  returnedAt: Date | null;
  returnedReason: string | null;
  notes: string | null;
  createdAt: Date;
  createdByName: string | null;
  billTo: { name: string; legalName: string; city: string | null; state: string | null };
  shipTo: { name: string; legalName: string; city: string | null; state: string | null };
  lines: DispatchDetailLine[];
}

/** Full dispatch detail — header, parties, lines + serials. Null if not in tenant. */
export async function getDispatchDetail(
  tenantId: string,
  id: string,
): Promise<DispatchDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [d] = await tx.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
    if (!d) return null;

    const [order] = await tx
      .select({ orderNumber: orders.orderNumber, orderDate: orders.orderDate })
      .from(orders)
      .where(eq(orders.id, d.orderId))
      .limit(1);

    const [billTo] = await tx
      .select({
        name: dealers.displayName,
        legalName: dealers.legalName,
        city: dealers.city,
        state: dealers.state,
      })
      .from(dealers)
      .where(eq(dealers.id, d.billToDealerId))
      .limit(1);
    const [shipTo] = await tx
      .select({
        name: dealers.displayName,
        legalName: dealers.legalName,
        city: dealers.city,
        state: dealers.state,
      })
      .from(dealers)
      .where(eq(dealers.id, d.shipToDealerId))
      .limit(1);

    const [creator] = await tx
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, d.createdBy))
      .limit(1);

    const lineRows = await tx
      .select()
      .from(dispatchLines)
      .where(eq(dispatchLines.dispatchId, id))
      .orderBy(asc(dispatchLines.lineNumber));

    const serialRows = await tx
      .select({
        id: dispatchSerials.id,
        dispatchLineId: dispatchSerials.dispatchLineId,
        inventoryItemId: dispatchSerials.inventoryItemId,
        serialNumber: inventoryItems.serialNumber,
      })
      .from(dispatchSerials)
      .leftJoin(inventoryItems, eq(inventoryItems.id, dispatchSerials.inventoryItemId))
      .where(eq(dispatchSerials.dispatchId, id));

    const serialsByLine = new Map<string, DispatchDetailSerial[]>();
    for (const s of serialRows) {
      const arr = serialsByLine.get(s.dispatchLineId) ?? [];
      arr.push({ id: s.id, inventoryItemId: s.inventoryItemId, serialNumber: s.serialNumber });
      serialsByLine.set(s.dispatchLineId, arr);
    }

    return {
      id: d.id,
      dispatchNumber: d.dispatchNumber,
      dispatchDate: d.dispatchDate,
      expectedDeliveryDate: d.expectedDeliveryDate,
      status: d.status as DispatchStatus,
      orderId: d.orderId,
      orderNumber: order?.orderNumber ?? '—',
      orderDate: order?.orderDate ?? d.dispatchDate,
      vehicleNumber: d.vehicleNumber,
      transporterName: d.transporterName,
      transporterDocketNumber: d.transporterDocketNumber,
      driverName: d.driverName,
      driverPhone: d.driverPhone,
      ewayBillNumber: d.ewayBillNumber,
      ewayBillDate: d.ewayBillDate,
      deliveredAt: d.deliveredAt,
      deliveredAcknowledgedBy: d.deliveredAcknowledgedBy,
      returnedAt: d.returnedAt,
      returnedReason: d.returnedReason,
      notes: d.notes,
      createdAt: d.createdAt,
      createdByName: creator?.name ?? null,
      billTo: {
        name: billTo?.name ?? '—',
        legalName: billTo?.legalName ?? '—',
        city: billTo?.city ?? null,
        state: billTo?.state ?? null,
      },
      shipTo: {
        name: shipTo?.name ?? '—',
        legalName: shipTo?.legalName ?? '—',
        city: shipTo?.city ?? null,
        state: shipTo?.state ?? null,
      },
      lines: lineRows.map((l) => ({
        id: l.id,
        lineNumber: l.lineNumber,
        productSku: l.productSku,
        productName: l.productName,
        quantity: Number(l.quantity),
        serials: serialsByLine.get(l.id) ?? [],
      })),
    };
  });
}
