import {
  InsufficientInventoryError,
  dealers,
  nextCounter,
  orders,
  payments,
  paymentAllocations,
  performaInvoices,
  recomputeOrderPaymentStatus,
  reserveInventoryForOrder,
  tenantSettings,
  transitionOrder,
  type DrizzleTx,
  type RecomputeResult,
} from '@dealerlink/db';
import { Decimal } from '@dealerlink/tax';
import { eq, sql } from 'drizzle-orm';

import { AppError } from '@/lib/errors';

import { fiscalYear } from '../quotations/fiscal-year';

export { fiscalYear };

/** Allocate the next per-tenant per-FY payment number: `PAY-2026-0001`. */
export async function allocatePaymentNumber(
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
  const prefix = prefixes['payment'] ?? 'PAY';
  const seq = await nextCounter(tx, tenantId, 'payment', fy);
  return `${prefix}-${fy}-${String(seq).padStart(4, '0')}`;
}

/** Resolve a dealer for use as the payer on a payment. Tenant-scoped by RLS. */
export async function loadPayerDealer(tx: DrizzleTx, dealerId: string) {
  const [d] = await tx
    .select({
      id: dealers.id,
      name: dealers.displayName,
      status: dealers.status,
      deletedAt: dealers.deletedAt,
    })
    .from(dealers)
    .where(eq(dealers.id, dealerId))
    .limit(1);
  if (!d || d.deletedAt) throw new AppError('NOT_FOUND', 'Dealer not found');
  if (d.status !== 'active') throw new AppError('VALIDATION', 'The payer dealer is inactive');
  return d;
}

/** Load a payment header and take a `FOR UPDATE` row lock. */
export async function loadPaymentLocked(tx: DrizzleTx, id: string) {
  const rows = await tx.execute<{
    id: string;
    tenant_id: string;
    payment_number: string;
    dealer_id: string;
    amount: string;
    allocated_amount: string;
    status: string;
  }>(sql`
    SELECT id, tenant_id, payment_number, dealer_id, amount, allocated_amount, status
      FROM payments WHERE id = ${id} FOR UPDATE
  `);
  const row = (
    rows as unknown as {
      id: string;
      tenant_id: string;
      payment_number: string;
      dealer_id: string;
      amount: string;
      allocated_amount: string;
      status: string;
    }[]
  )[0];
  if (!row) throw new AppError('NOT_FOUND', 'Payment not found');
  return row;
}

/** Distinct order ids touched by a payment's allocations. */
export async function affectedOrderIds(tx: DrizzleTx, paymentId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ orderId: paymentAllocations.orderId })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, paymentId));
  return rows.map((r) => r.orderId).filter((id): id is string => id !== null);
}

/** Recompute paymentStatus on every order a payment's allocations touch. */
export async function recomputeAffectedOrders(
  tx: DrizzleTx,
  orderIds: string[],
  userId: string,
): Promise<RecomputeResult[]> {
  const results: RecomputeResult[] = [];
  for (const orderId of orderIds) {
    results.push(await recomputeOrderPaymentStatus(tx, orderId, userId));
  }
  return results;
}

/**
 * Reverse every allocation of a bounced/refunded payment: delete the
 * allocation rows, zero the denormalised `allocatedAmount`, and recompute
 * paymentStatus on each affected order (which may regress paid → unpaid).
 * Returns the per-order recompute results.
 */
export async function reverseAllocations(
  tx: DrizzleTx,
  paymentId: string,
  userId: string,
): Promise<RecomputeResult[]> {
  const orderIds = await affectedOrderIds(tx, paymentId);
  await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
  await tx
    .update(payments)
    .set({ allocatedAmount: '0', updatedAt: new Date(), updatedBy: userId })
    .where(eq(payments.id, paymentId));
  return recomputeAffectedOrders(tx, orderIds, userId);
}

/**
 * Funds-received-then-confirm flow: when an order's paymentStatus reaches
 * `paid` while it is still `pending`, reserve serialised inventory and
 * advance it to `confirmed`. Best-effort — if stock is short the order stays
 * `pending` (the money allocation must not roll back over an inventory
 * shortfall); the caller surfaces the outcome.
 */
export async function tryAutoConfirmOrder(
  tx: DrizzleTx,
  orderId: string,
  userId: string,
): Promise<{ confirmed: boolean; reason?: string }> {
  const [order] = await tx
    .select({ id: orders.id, status: orders.status, shipToDealerId: orders.shipToDealerId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.status !== 'pending') return { confirmed: false };

  try {
    await reserveInventoryForOrder(tx, orderId, {
      dealerId: order.shipToDealerId,
      userId,
    });
  } catch (err) {
    if (err instanceof InsufficientInventoryError) {
      return { confirmed: false, reason: 'insufficient_inventory' };
    }
    throw err;
  }
  await transitionOrder(tx, orderId, 'confirmed', {
    userId,
    reason: 'payment_received',
  });
  return { confirmed: true };
}

/** Sum of amounts already allocated to an order from verified/cleared payments. */
export async function orderAllocatedTotal(tx: DrizzleTx, orderId: string): Promise<Decimal> {
  const rows = await tx.execute<{ allocated: string | null }>(sql`
    SELECT COALESCE(SUM(pa.amount), 0) AS allocated
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
     WHERE pa.order_id = ${orderId}
       AND p.status IN ('verified', 'cleared')
  `);
  return new Decimal((rows as unknown as { allocated: string | null }[])[0]?.allocated ?? '0');
}

/** Sum of amounts already allocated to a PI from verified/cleared payments. */
export async function piAllocatedTotal(tx: DrizzleTx, piId: string): Promise<Decimal> {
  const rows = await tx.execute<{ allocated: string | null }>(sql`
    SELECT COALESCE(SUM(pa.amount), 0) AS allocated
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
     WHERE pa.performa_invoice_id = ${piId}
       AND p.status IN ('verified', 'cleared')
  `);
  return new Decimal((rows as unknown as { allocated: string | null }[])[0]?.allocated ?? '0');
}

/** Load an order's total + status for allocation validation. */
export async function loadOrderForAllocation(tx: DrizzleTx, orderId: string) {
  const [o] = await tx
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      totalAmount: orders.totalAmount,
      status: orders.status,
      billToDealerId: orders.billToDealerId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return o ?? null;
}

/** Load a PI's total + status for advance-allocation validation. */
export async function loadPiForAllocation(tx: DrizzleTx, piId: string) {
  const [p] = await tx
    .select({
      id: performaInvoices.id,
      piNumber: performaInvoices.piNumber,
      totalAmount: performaInvoices.totalAmount,
      status: performaInvoices.status,
      billToDealerId: performaInvoices.billToDealerId,
    })
    .from(performaInvoices)
    .where(eq(performaInvoices.id, piId))
    .limit(1);
  return p ?? null;
}
