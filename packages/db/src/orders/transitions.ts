import { eq, sql } from 'drizzle-orm';

import { orderStatusHistory, orders, type Order, type OrderStatus } from '../schema/order';
import type { DrizzleTx } from '../with-tenant';

/**
 * Order fulfilment state machine (Day 11). Authoritative — no Server Action
 * may UPDATE `orders.status` directly; every status change goes through
 * `transitionOrder()`.
 *
 *   pending ─confirm─▶ confirmed ─dispatch─▶ partially_dispatched
 *                            └──────────────▶ fully_dispatched ─▶ delivered ─▶ closed
 *   (any non-terminal) ─cancel─▶ cancelled
 *
 * Day 11 exercises `pending → confirmed` and `* → cancelled`. The dispatch
 * transitions are declared up front but only wired in Day 13.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['partially_dispatched', 'fully_dispatched', 'cancelled'],
  partially_dispatched: ['partially_dispatched', 'fully_dispatched', 'cancelled'],
  fully_dispatched: ['delivered'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
};

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'partially_dispatched',
  'fully_dispatched',
  'delivered',
  'closed',
  'cancelled',
];

/** Statuses from which an order may still be cancelled (releasing reservations). */
export const CANCELLABLE_FROM: OrderStatus[] = ['pending', 'confirmed'];

export function isOrderTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class OrderInvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    extra?: string,
  ) {
    super(`Cannot transition order from "${from}" to "${to}"${extra ? `: ${extra}` : ''}`);
    this.name = 'OrderInvalidTransitionError';
  }
}

export class OrderNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(readonly id: string) {
    super(`Order ${id} not found`);
    this.name = 'OrderNotFoundError';
  }
}

export interface OrderTransitionOptions {
  /** Actor user id — recorded on order_status_history. */
  userId: string;
  /** Free-text reason (required for `cancelled`, optional otherwise). */
  reason?: string | null;
  /** Marks the transition as auto-triggered. */
  automatic?: boolean;
}

/**
 * Move an order to a new status with a row lock so concurrent transitions
 * cannot race. Sets the matching timestamp column, writes a status-history
 * row, and returns the updated order. Caller must already be inside
 * `withTenant(...)`.
 *
 * Throws:
 *   - OrderNotFoundError if the id does not resolve in this tenant
 *   - OrderInvalidTransitionError if (current → target) is not allowed
 */
export async function transitionOrder(
  tx: DrizzleTx,
  orderId: string,
  toStatus: OrderStatus,
  opts: OrderTransitionOptions,
): Promise<Order> {
  const locked = await tx.execute<{ id: string; status: OrderStatus; tenant_id: string }>(
    sql`SELECT id, status, tenant_id FROM orders WHERE id = ${orderId} FOR UPDATE`,
  );
  const row = (locked as unknown as { id: string; status: OrderStatus; tenant_id: string }[])[0];
  if (!row) throw new OrderNotFoundError(orderId);

  const from = row.status;
  if (!isOrderTransitionAllowed(from, toStatus)) {
    throw new OrderInvalidTransitionError(from, toStatus);
  }

  const now = new Date();
  const updates: Partial<Order> = {
    status: toStatus,
    updatedAt: now,
    updatedBy: opts.userId,
  };
  if (toStatus === 'confirmed') updates.confirmedAt = now;
  if (toStatus === 'cancelled') {
    updates.cancelledAt = now;
    updates.cancelledReason = opts.reason ?? null;
  }

  const [updated] = await tx.update(orders).set(updates).where(eq(orders.id, orderId)).returning();
  if (!updated) throw new OrderNotFoundError(orderId);

  await tx.insert(orderStatusHistory).values({
    tenantId: row.tenant_id,
    orderId,
    fromStatus: from,
    toStatus,
    transitionedBy: opts.userId,
    reason: opts.reason ?? null,
  });

  return updated;
}
