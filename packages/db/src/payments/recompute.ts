import { Decimal } from '@dealerlink/tax';
import { sql } from 'drizzle-orm';

import { orders, type OrderPaymentStatus } from '../schema/order';
import type { DrizzleTx } from '../with-tenant';

import { deriveOrderPaymentStatus } from './propagation';

export interface RecomputeResult {
  orderId: string;
  orderTotal: string;
  allocatedAmount: string;
  /** Status before this recompute. */
  fromStatus: OrderPaymentStatus;
  /** Status after this recompute. */
  toStatus: OrderPaymentStatus;
  changed: boolean;
}

/**
 * Recompute and persist an order's `paymentStatus` from the live allocation
 * picture. Locks the order row `FOR UPDATE`, sums every allocation against it
 * from payments currently in `verified`/`cleared` status, derives the status
 * via `deriveOrderPaymentStatus`, and writes it back if it changed.
 *
 * Caller must already be inside `withTenant(...)`. This is the single funnel
 * for order paymentStatus changes driven by allocation/transition events.
 */
export async function recomputeOrderPaymentStatus(
  tx: DrizzleTx,
  orderId: string,
  userId: string,
): Promise<RecomputeResult> {
  const lockedRows = await tx.execute<{
    id: string;
    total_amount: string;
    payment_status: OrderPaymentStatus;
  }>(sql`SELECT id, total_amount, payment_status FROM orders WHERE id = ${orderId} FOR UPDATE`);
  const order = (
    lockedRows as unknown as {
      id: string;
      total_amount: string;
      payment_status: OrderPaymentStatus;
    }[]
  )[0];
  if (!order) throw new Error(`Order ${orderId} not found while recomputing payment status`);

  const sumRows = await tx.execute<{ allocated: string | null }>(sql`
    SELECT COALESCE(SUM(pa.amount), 0) AS allocated
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
     WHERE pa.order_id = ${orderId}
       AND p.status IN ('verified', 'cleared')
  `);
  const allocatedRaw = (sumRows as unknown as { allocated: string | null }[])[0]?.allocated ?? '0';
  const allocated = new Decimal(allocatedRaw);
  const total = new Decimal(order.total_amount);

  const fromStatus = order.payment_status;
  const toStatus = deriveOrderPaymentStatus(total, allocated);
  const changed = fromStatus !== toStatus;

  if (changed) {
    await tx
      .update(orders)
      .set({ paymentStatus: toStatus, updatedAt: new Date(), updatedBy: userId })
      .where(sql`id = ${orderId}`);
  }

  return {
    orderId,
    orderTotal: total.toFixed(2),
    allocatedAmount: allocated.toFixed(2),
    fromStatus,
    toStatus,
    changed,
  };
}
