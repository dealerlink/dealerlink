'use server';

import { transitionPayment } from '@dealerlink/db';
import { paymentIdSchema, transitionPaymentInputSchema } from '@dealerlink/schemas';

import { tenantAction } from '@/lib/actions/wrap';

import { affectedOrderIds, recomputeAffectedOrders, reverseAllocations } from './helpers';

/**
 * Verify a payment: pending_verification → verified (admin + accounts). Once
 * verified, allocations may be made. A freshly recorded payment has no
 * allocations yet, so the propagation pass is usually a no-op — it is run
 * anyway so the action is correct if a payment is ever re-verified.
 */
export const verifyPayment = tenantAction(
  ['admin', 'accounts'],
  paymentIdSchema,
  async ({ tx, input, auth }) => {
    await transitionPayment(tx, input.id, 'verified', { userId: auth.user.id });
    const orderIds = await affectedOrderIds(tx, input.id);
    await recomputeAffectedOrders(tx, orderIds, auth.user.id);
    return { id: input.id, status: 'verified' as const };
  },
);

/**
 * Mark a payment cleared: verified → cleared (admin + accounts). The cheque
 * cleared / the bank receipt is confirmed; allocations are now final.
 */
export const markPaymentCleared = tenantAction(
  ['admin', 'accounts'],
  paymentIdSchema,
  async ({ tx, input, auth }) => {
    await transitionPayment(tx, input.id, 'cleared', { userId: auth.user.id });
    const orderIds = await affectedOrderIds(tx, input.id);
    await recomputeAffectedOrders(tx, orderIds, auth.user.id);
    return { id: input.id, status: 'cleared' as const };
  },
);

/**
 * Mark a payment bounced: verified → bounced (admin + accounts). ATOMIC —
 * reverses every allocation (deletes the rows, zeroes allocatedAmount) and
 * recomputes paymentStatus on each affected order, which may regress from
 * `paid`/`partially_paid` back towards `unpaid`.
 */
export const markPaymentBounced = tenantAction(
  ['admin', 'accounts'],
  transitionPaymentInputSchema,
  async ({ tx, input, auth }) => {
    await transitionPayment(tx, input.id, 'bounced', {
      userId: auth.user.id,
      reason: input.reason,
    });
    const recomputed = await reverseAllocations(tx, input.id, auth.user.id);
    return {
      id: input.id,
      status: 'bounced' as const,
      ordersAffected: recomputed.filter((r) => r.changed).length,
    };
  },
);

/**
 * Refund a payment: cleared → refunded (admin only). Same atomic allocation
 * reversal as a bounce — the money has gone back to the dealer.
 */
export const refundPayment = tenantAction(
  ['admin'],
  transitionPaymentInputSchema,
  async ({ tx, input, auth }) => {
    await transitionPayment(tx, input.id, 'refunded', {
      userId: auth.user.id,
      reason: input.reason,
    });
    const recomputed = await reverseAllocations(tx, input.id, auth.user.id);
    return {
      id: input.id,
      status: 'refunded' as const,
      ordersAffected: recomputed.filter((r) => r.changed).length,
    };
  },
);
