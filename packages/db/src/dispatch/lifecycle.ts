import { eq, sql } from 'drizzle-orm';

import { deliverItem, returnItem } from '../inventory/transitions';
import { deriveOrderFulfillmentStatus, transitionOrder } from '../orders/transitions';
import { dispatchLines, dispatchSerials, dispatches } from '../schema/dispatch';
import { orderLines } from '../schema/order';
import type { DrizzleTx } from '../with-tenant';

import { DispatchError } from './create';

/** Row-lock a dispatch and read the columns the lifecycle actions need. */
async function lockDispatch(
  tx: DrizzleTx,
  dispatchId: string,
): Promise<{ id: string; tenantId: string; orderId: string; status: string } | null> {
  const rows = await tx.execute<{
    id: string;
    tenant_id: string;
    order_id: string;
    status: string;
  }>(sql`
    SELECT id, tenant_id, order_id, status
      FROM dispatches WHERE id = ${dispatchId} FOR UPDATE
  `);
  const r = (
    rows as unknown as { id: string; tenant_id: string; order_id: string; status: string }[]
  )[0];
  if (!r) return null;
  return { id: r.id, tenantId: r.tenant_id, orderId: r.order_id, status: r.status };
}

/** Recompute the source order's fulfilment status and transition if it moved. */
async function syncOrderStatus(tx: DrizzleTx, orderId: string, userId: string, reason: string) {
  const derived = await deriveOrderFulfillmentStatus(tx, orderId);
  const rows = await tx.execute<{ status: string }>(
    sql`SELECT status FROM orders WHERE id = ${orderId}`,
  );
  const current = (rows as unknown as { status: string }[])[0]?.status;
  if (current && derived !== current) {
    await transitionOrder(tx, orderId, derived, { userId, reason });
  }
  return derived;
}

export interface MarkDeliveredDbResult {
  id: string;
  orderId: string;
  orderStatus: string;
  deliveredSerials: number;
}

/**
 * Mark an in-transit dispatch delivered. Every serial moves
 * dispatched → delivered; when all of the order's dispatches are delivered
 * the order itself advances to `delivered`. Caller must be inside
 * `withTenant(...)`.
 */
export async function markDispatchDeliveredDb(
  tx: DrizzleTx,
  dispatchId: string,
  ctx: { userId: string; acknowledgedBy: string },
): Promise<MarkDeliveredDbResult> {
  const dispatch = await lockDispatch(tx, dispatchId);
  if (!dispatch) throw new DispatchError('ORDER_NOT_FOUND', 'Dispatch not found');
  if (dispatch.status !== 'in_transit') {
    throw new DispatchError(
      'ORDER_NOT_DISPATCHABLE',
      `Dispatch is "${dispatch.status}" — only in-transit dispatches can be marked delivered`,
    );
  }

  const serials = await tx
    .select({ inventoryItemId: dispatchSerials.inventoryItemId })
    .from(dispatchSerials)
    .where(eq(dispatchSerials.dispatchId, dispatchId));

  for (const s of serials) {
    await deliverItem(tx, s.inventoryItemId, ctx.userId, ctx.acknowledgedBy);
  }

  const now = new Date();
  await tx
    .update(dispatches)
    .set({
      status: 'delivered',
      deliveredAt: now,
      deliveredAcknowledgedBy: ctx.acknowledgedBy,
      updatedAt: now,
      updatedBy: ctx.userId,
    })
    .where(eq(dispatches.id, dispatchId));

  const orderStatus = await syncOrderStatus(tx, dispatch.orderId, ctx.userId, `dispatch delivered`);

  return {
    id: dispatchId,
    orderId: dispatch.orderId,
    orderStatus,
    deliveredSerials: serials.length,
  };
}

export interface ReturnDispatchDbResult {
  id: string;
  orderId: string;
  orderStatus: string;
  returnedSerials: number;
}

/**
 * Return an in-transit dispatch — every serial goes back to warehouse stock
 * (dispatched → returned → in_stock, clearing its order reservation), each
 * order line's `dispatchedQuantity` is decremented, and the order's
 * fulfilment status is recomputed (it may regress, e.g. fully_dispatched →
 * partially_dispatched). Caller must be inside `withTenant(...)`.
 */
export async function returnDispatchDb(
  tx: DrizzleTx,
  dispatchId: string,
  ctx: { userId: string; reason: string },
): Promise<ReturnDispatchDbResult> {
  const dispatch = await lockDispatch(tx, dispatchId);
  if (!dispatch) throw new DispatchError('ORDER_NOT_FOUND', 'Dispatch not found');
  if (dispatch.status !== 'in_transit') {
    throw new DispatchError(
      'ORDER_NOT_DISPATCHABLE',
      `Dispatch is "${dispatch.status}" — only in-transit dispatches can be returned`,
    );
  }

  const lines = await tx
    .select({
      id: dispatchLines.id,
      orderLineId: dispatchLines.orderLineId,
      quantity: dispatchLines.quantity,
    })
    .from(dispatchLines)
    .where(eq(dispatchLines.dispatchId, dispatchId));

  const serials = await tx
    .select({ inventoryItemId: dispatchSerials.inventoryItemId })
    .from(dispatchSerials)
    .where(eq(dispatchSerials.dispatchId, dispatchId));

  for (const s of serials) {
    await returnItem(tx, s.inventoryItemId, ctx.userId);
  }

  for (const line of lines) {
    await tx
      .update(orderLines)
      .set({
        dispatchedQuantity: sql`GREATEST(${orderLines.dispatchedQuantity} - ${Number(line.quantity)}, 0)`,
      })
      .where(eq(orderLines.id, line.orderLineId));
  }

  const now = new Date();
  await tx
    .update(dispatches)
    .set({
      status: 'returned',
      returnedAt: now,
      returnedReason: ctx.reason,
      updatedAt: now,
      updatedBy: ctx.userId,
    })
    .where(eq(dispatches.id, dispatchId));

  const orderStatus = await syncOrderStatus(
    tx,
    dispatch.orderId,
    ctx.userId,
    `dispatch returned: ${ctx.reason}`,
  );

  return {
    id: dispatchId,
    orderId: dispatch.orderId,
    orderStatus,
    returnedSerials: serials.length,
  };
}
