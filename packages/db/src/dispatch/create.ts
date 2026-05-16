import { eq, sql } from 'drizzle-orm';

import { transitionStage as transitionDealStageDb } from '../deals/transitions';
import { nextCounter } from '../helpers/document-counter';
import { dispatchItem } from '../inventory/transitions';
import {
  deriveOrderFulfillmentStatus,
  DISPATCHABLE_FROM,
  transitionOrder,
} from '../orders/transitions';
import { dispatchLines, dispatchSerials, dispatches } from '../schema/dispatch';
import { orderLines } from '../schema/order';
import { tenantSettings } from '../schema/tenant-settings';
import type { DrizzleTx } from '../with-tenant';

/**
 * Structured error for every dispatch-creation failure. The `code` is stable
 * and the web `tenantAction` maps it to an `AppError`. The concurrent-dispatch
 * test (Day 13 A2.5) asserts on `code === 'SERIAL_ALREADY_DISPATCHED'`.
 */
export type DispatchErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_DISPATCHABLE'
  | 'ORDER_LINE_NOT_FOUND'
  | 'DUPLICATE_LINE'
  | 'SERIAL_NOT_FOUND'
  | 'SERIAL_NOT_RESERVED'
  | 'SERIAL_ALREADY_DISPATCHED'
  | 'SERIAL_WRONG_ORDER'
  | 'SERIAL_WRONG_PRODUCT'
  | 'SERIAL_DUPLICATED'
  | 'CROSS_TENANT'
  | 'EXCEEDS_REMAINING';

export class DispatchError extends Error {
  constructor(
    readonly code: DispatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DispatchError';
  }
}

export interface CreateDispatchDbLine {
  orderLineId: string;
  serialIds: string[];
}

export interface CreateDispatchDbInput {
  orderId: string;
  lines: CreateDispatchDbLine[];
  dispatchDate?: string | null;
  expectedDeliveryDate?: string | null;
  vehicleNumber?: string | null;
  transporterName?: string | null;
  transporterDocketNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  ewayBillNumber?: string | null;
  ewayBillDate?: string | null;
  notes?: string | null;
}

export interface CreateDispatchDbResult {
  id: string;
  dispatchNumber: string;
  /** Order status after the dispatch (may be partially/fully_dispatched). */
  orderStatus: string;
  serialCount: number;
}

/** Indian fiscal year (Apr 1 – Mar 31) for the document counter. */
function fiscalYearOf(d: Date): number {
  const m = d.getUTCMonth();
  return m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** Allocate the next per-tenant per-FY dispatch number: `DSP-2026-0001`. */
async function allocateDispatchNumber(
  tx: DrizzleTx,
  tenantId: string,
  fy: number,
): Promise<string> {
  const [s] = await tx
    .select({ docPrefixes: tenantSettings.docPrefixes })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  const prefixes = (s?.docPrefixes ?? {}) as Record<string, string>;
  const prefix = prefixes['dispatch'] ?? 'DSP';
  const seq = await nextCounter(tx, tenantId, 'dispatch', fy);
  return `${prefix}-${fy}-${String(seq).padStart(4, '0')}`;
}

interface LockedSerial {
  id: string;
  status: string;
  tenantId: string;
  productId: string;
  reservedForOrderId: string | null;
}

/** Row-lock one inventory item and read the columns dispatch validation needs. */
async function lockSerial(tx: DrizzleTx, itemId: string): Promise<LockedSerial | null> {
  const rows = await tx.execute<{
    id: string;
    status: string;
    tenant_id: string;
    product_id: string;
    reserved_for_order_id: string | null;
  }>(sql`
    SELECT id, status, tenant_id, product_id, reserved_for_order_id
      FROM inventory_items WHERE id = ${itemId} FOR UPDATE
  `);
  const r = (
    rows as unknown as {
      id: string;
      status: string;
      tenant_id: string;
      product_id: string;
      reserved_for_order_id: string | null;
    }[]
  )[0];
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    tenantId: r.tenant_id,
    productId: r.product_id,
    reservedForOrderId: r.reserved_for_order_id,
  };
}

/**
 * Create a dispatch against a confirmed (or partially-dispatched) order — the
 * highest-stakes write of Day 13. Everything happens in the caller's
 * transaction; any throw rolls the whole thing back, so a serial can never be
 * left half-dispatched and no orphan dispatch row survives.
 *
 * Concurrency: the order is row-locked FIRST, then every picked serial. Two
 * operators dispatching the same serials serialise on the order lock; the
 * loser re-reads the now-`dispatched` serial and fails with
 * `SERIAL_ALREADY_DISPATCHED`. The `dispatch_serials` UNIQUE constraint is the
 * final backstop if the state machine were ever bypassed.
 *
 * Caller must already be inside `withTenant(tenantId, ...)`.
 */
export async function createDispatchDb(
  tx: DrizzleTx,
  input: CreateDispatchDbInput,
  ctx: { userId: string },
): Promise<CreateDispatchDbResult> {
  // 1. Lock the order.
  const orderRows = await tx.execute<{
    id: string;
    tenant_id: string;
    status: string;
    bill_to_dealer_id: string;
    ship_to_dealer_id: string;
    deal_id: string | null;
  }>(sql`
    SELECT id, tenant_id, status, bill_to_dealer_id, ship_to_dealer_id, deal_id
      FROM orders WHERE id = ${input.orderId} FOR UPDATE
  `);
  const order = (
    orderRows as unknown as {
      id: string;
      tenant_id: string;
      status: string;
      bill_to_dealer_id: string;
      ship_to_dealer_id: string;
      deal_id: string | null;
    }[]
  )[0];
  if (!order) throw new DispatchError('ORDER_NOT_FOUND', 'Order not found');

  // 2. Order must be dispatchable.
  if (!(DISPATCHABLE_FROM as string[]).includes(order.status)) {
    throw new DispatchError(
      'ORDER_NOT_DISPATCHABLE',
      `Order is "${order.status}" — only confirmed or partially-dispatched orders can be dispatched`,
    );
  }

  if (input.lines.length === 0) {
    throw new DispatchError('ORDER_LINE_NOT_FOUND', 'A dispatch must have at least one line');
  }

  // Load every order line once (keyed by id).
  const lineRows = await tx
    .select({
      id: orderLines.id,
      productId: orderLines.productId,
      productSku: orderLines.productSku,
      productName: orderLines.productName,
      quantity: orderLines.quantity,
      dispatchedQuantity: orderLines.dispatchedQuantity,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, input.orderId));
  const lineById = new Map(lineRows.map((l) => [l.id, l]));

  // 3–6. Validate every picked serial under a row lock.
  const seenLineIds = new Set<string>();
  const seenSerialIds = new Set<string>();
  const validated: {
    orderLineId: string;
    productId: string;
    productSku: string;
    productName: string;
    serialIds: string[];
  }[] = [];

  for (const line of input.lines) {
    if (seenLineIds.has(line.orderLineId)) {
      throw new DispatchError(
        'DUPLICATE_LINE',
        'The same order line appears twice in this dispatch',
      );
    }
    seenLineIds.add(line.orderLineId);

    const orderLine = lineById.get(line.orderLineId);
    if (!orderLine) {
      throw new DispatchError(
        'ORDER_LINE_NOT_FOUND',
        'An order line does not belong to this order',
      );
    }

    for (const serialId of line.serialIds) {
      if (seenSerialIds.has(serialId)) {
        throw new DispatchError(
          'SERIAL_DUPLICATED',
          'The same serial cannot be dispatched on two lines',
        );
      }
      seenSerialIds.add(serialId);

      const serial = await lockSerial(tx, serialId);
      if (!serial) throw new DispatchError('SERIAL_NOT_FOUND', `Serial ${serialId} not found`);
      // Defense in depth — RLS already scopes to the tenant.
      if (serial.tenantId !== order.tenant_id) {
        throw new DispatchError('CROSS_TENANT', 'Serial belongs to another tenant');
      }
      if (serial.status === 'dispatched' || serial.status === 'delivered') {
        throw new DispatchError(
          'SERIAL_ALREADY_DISPATCHED',
          `Serial ${serialId} has already been dispatched`,
        );
      }
      if (serial.status !== 'reserved') {
        throw new DispatchError(
          'SERIAL_NOT_RESERVED',
          `Serial ${serialId} is "${serial.status}", not reserved — it cannot be dispatched`,
        );
      }
      if (serial.reservedForOrderId !== input.orderId) {
        throw new DispatchError(
          'SERIAL_WRONG_ORDER',
          `Serial ${serialId} is reserved for a different order`,
        );
      }
      if (serial.productId !== orderLine.productId) {
        throw new DispatchError(
          'SERIAL_WRONG_PRODUCT',
          `Serial ${serialId} is not the product on this order line`,
        );
      }
    }

    const count = line.serialIds.length;
    const remaining = Number(orderLine.quantity) - Number(orderLine.dispatchedQuantity);
    if (count > remaining + 1e-6) {
      throw new DispatchError(
        'EXCEEDS_REMAINING',
        `Line ${orderLine.productSku}: dispatching ${count} exceeds the ${remaining} still to dispatch`,
      );
    }

    validated.push({
      orderLineId: orderLine.id,
      productId: orderLine.productId,
      productSku: orderLine.productSku,
      productName: orderLine.productName,
      serialIds: line.serialIds,
    });
  }

  // 7. Allocate the dispatch number.
  const dispatchDate = input.dispatchDate ?? new Date().toISOString().slice(0, 10);
  const fy = fiscalYearOf(new Date(dispatchDate));
  const dispatchNumber = await allocateDispatchNumber(tx, order.tenant_id, fy);

  // 8. Insert the dispatch header.
  const [dispatch] = await tx
    .insert(dispatches)
    .values({
      tenantId: order.tenant_id,
      dispatchNumber,
      orderId: input.orderId,
      billToDealerId: order.bill_to_dealer_id,
      shipToDealerId: order.ship_to_dealer_id,
      dispatchDate,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
      vehicleNumber: input.vehicleNumber ?? null,
      transporterName: input.transporterName ?? null,
      transporterDocketNumber: input.transporterDocketNumber ?? null,
      driverName: input.driverName ?? null,
      driverPhone: input.driverPhone ?? null,
      ewayBillNumber: input.ewayBillNumber ?? null,
      ewayBillDate: input.ewayBillDate ?? null,
      status: 'in_transit',
      notes: input.notes ?? null,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    })
    .returning({ id: dispatches.id });
  if (!dispatch) throw new DispatchError('ORDER_NOT_FOUND', 'Failed to create the dispatch');

  // 9–11. Per line: insert the line, its serials, transition each serial,
  // and bump the order line's dispatchedQuantity.
  let serialCount = 0;
  let lineNumber = 0;
  for (const v of validated) {
    lineNumber += 1;
    const count = v.serialIds.length;
    const [dLine] = await tx
      .insert(dispatchLines)
      .values({
        tenantId: order.tenant_id,
        dispatchId: dispatch.id,
        lineNumber,
        orderLineId: v.orderLineId,
        productId: v.productId,
        productSku: v.productSku,
        productName: v.productName,
        quantity: count.toFixed(3),
      })
      .returning({ id: dispatchLines.id });
    if (!dLine) throw new DispatchError('ORDER_NOT_FOUND', 'Failed to create a dispatch line');

    for (const serialId of v.serialIds) {
      await tx.insert(dispatchSerials).values({
        tenantId: order.tenant_id,
        dispatchId: dispatch.id,
        dispatchLineId: dLine.id,
        inventoryItemId: serialId,
      });
      // reserved → dispatched (FOR UPDATE lock inside).
      await dispatchItem(tx, serialId, dispatch.id, ctx.userId);
      serialCount += 1;
    }

    await tx
      .update(orderLines)
      .set({
        dispatchedQuantity: sql`${orderLines.dispatchedQuantity} + ${count}`,
      })
      .where(eq(orderLines.id, v.orderLineId));
  }

  // 12–14. Recompute + transition the order status.
  const derived = await deriveOrderFulfillmentStatus(tx, input.orderId);
  if (derived !== order.status) {
    await transitionOrder(tx, input.orderId, derived, {
      userId: ctx.userId,
      reason: `dispatch ${dispatchNumber}`,
    });
  }

  // 15. A fully-dispatched order closes its linked deal (final stage).
  if (derived === 'fully_dispatched' && order.deal_id) {
    try {
      await transitionDealStageDb(tx, order.deal_id, 'closed', {
        role: 'admin',
        userId: ctx.userId,
        reason: `order fully dispatched (${dispatchNumber})`,
      });
    } catch {
      // A deal already elsewhere in the pipeline is not a dispatch error.
    }
  }

  return {
    id: dispatch.id,
    dispatchNumber,
    orderStatus: derived,
    serialCount,
  };
}
