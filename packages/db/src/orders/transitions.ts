import { eq, sql } from 'drizzle-orm';

import { dispatches } from '../schema/dispatch';
import {
  orderLines,
  orderStatusHistory,
  orders,
  type Order,
  type OrderStatus,
} from '../schema/order';
import type { DrizzleTx } from '../with-tenant';

/**
 * Order fulfilment state machine (Day 11, extended Day 13). Authoritative —
 * no Server Action may UPDATE `orders.status` directly; every status change
 * goes through `transitionOrder()`.
 *
 *   pending ─confirm─▶ confirmed ─dispatch─▶ partially_dispatched
 *                            └──────────────▶ fully_dispatched ─▶ delivered ─▶ closed
 *   (any non-terminal) ─cancel─▶ cancelled
 *
 * Day 11 exercised `pending → confirmed` and `* → cancelled`. Day 13 wires
 * the dispatch transitions. The dispatch transitions also run in reverse
 * (`fully_dispatched → partially_dispatched`, `partially_dispatched →
 * confirmed`) because a returned dispatch regresses the order's fulfilment.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['partially_dispatched', 'fully_dispatched', 'cancelled'],
  partially_dispatched: [
    'confirmed',
    'partially_dispatched',
    'fully_dispatched',
    'delivered',
    'cancelled',
  ],
  fully_dispatched: ['confirmed', 'partially_dispatched', 'fully_dispatched', 'delivered'],
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

/** Statuses from which a new dispatch may be created. */
export const DISPATCHABLE_FROM: OrderStatus[] = ['confirmed', 'partially_dispatched'];

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
  if (toStatus === 'partially_dispatched') updates.partiallyDispatchedAt = now;
  if (toStatus === 'fully_dispatched') updates.fullyDispatchedAt = now;
  if (toStatus === 'delivered') updates.deliveredAt = now;
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

/**
 * Derive the fulfilment status an order *should* hold, given its lines'
 * dispatched quantities and the status of every dispatch raised against it.
 *
 * This is the single source of truth for `createDispatch`, `markDispatchDelivered`
 * and `returnDispatch` — each mutates the underlying rows, then calls this to
 * recompute the order status (and only transitions if it actually changed).
 *
 *   - no units dispatched            → confirmed
 *   - some (< all) units dispatched  → partially_dispatched
 *   - all units dispatched           → fully_dispatched
 *   - all units dispatched AND every
 *     non-returned dispatch delivered → delivered
 *
 * Returned dispatches do not count toward delivery — `returnDispatch` has
 * already decremented `order_lines.dispatchedQuantity` for them.
 */
export async function deriveOrderFulfillmentStatus(
  tx: DrizzleTx,
  orderId: string,
): Promise<
  Extract<OrderStatus, 'confirmed' | 'partially_dispatched' | 'fully_dispatched' | 'delivered'>
> {
  const [totals] = await tx
    .select({
      ordered: sql<string>`COALESCE(SUM(${orderLines.quantity}), 0)`,
      dispatched: sql<string>`COALESCE(SUM(${orderLines.dispatchedQuantity}), 0)`,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId));

  const ordered = Number(totals?.ordered ?? 0);
  const dispatched = Number(totals?.dispatched ?? 0);

  if (dispatched <= 0) return 'confirmed';
  if (dispatched + 1e-6 < ordered) return 'partially_dispatched';

  // All units dispatched — check whether every live dispatch has been delivered.
  const liveDispatches = await tx
    .select({ status: dispatches.status })
    .from(dispatches)
    .where(eq(dispatches.orderId, orderId));

  const nonReturned = liveDispatches.filter((d) => d.status !== 'returned');
  if (nonReturned.length > 0 && nonReturned.every((d) => d.status === 'delivered')) {
    return 'delivered';
  }
  return 'fully_dispatched';
}
