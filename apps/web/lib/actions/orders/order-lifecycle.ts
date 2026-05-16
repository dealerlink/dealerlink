'use server';

import {
  DealInvalidTransitionError,
  HighRiskGuardError,
  ORDER_CANCELLABLE_FROM,
  orders,
  releaseInventoryForOrder,
  transitionDealStageDb,
  transitionOrder,
} from '@dealerlink/db';
import { cancelOrderSchema, updateOrderExpectedDispatchSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

/** Set or clear an order's expected dispatch date (admin + dispatch). */
export const updateOrderExpectedDispatch = tenantAction(
  ['admin', 'dispatch'],
  updateOrderExpectedDispatchSchema,
  async ({ tx, input, auth }) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, input.id))
      .limit(1);
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    if (order.status === 'cancelled' || order.status === 'closed') {
      throw new AppError('VALIDATION', `Cannot edit a ${order.status} order`);
    }

    await tx
      .update(orders)
      .set({
        expectedDispatchDate: input.expectedDispatchDate,
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(eq(orders.id, input.id));

    return { id: input.id, expectedDispatchDate: input.expectedDispatchDate };
  },
);

/**
 * Cancel an order (admin only). Releases every reserved serial back to
 * `in_stock`, captures the reason, and nudges the linked deal back from
 * payment_pending to po_pending. Only `pending` / `confirmed` orders can be
 * cancelled — once goods are dispatched, cancellation is a returns process.
 */
export const cancelOrder = tenantAction(
  ['admin'],
  cancelOrderSchema,
  async ({ tx, input, auth }) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status, dealId: orders.dealId })
      .from(orders)
      .where(eq(orders.id, input.id))
      .limit(1);
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    if (!ORDER_CANCELLABLE_FROM.includes(order.status)) {
      throw new AppError('VALIDATION', `An order in "${order.status}" status cannot be cancelled`);
    }

    const releasedCount = await releaseInventoryForOrder(tx, input.id, auth.user.id);

    await transitionOrder(tx, input.id, 'cancelled', {
      userId: auth.user.id,
      reason: input.reason,
    });

    // Move the deal back a stage so the pipeline reflects reality. A reverse
    // transition is admin-only — and cancelOrder is admin-only — so this is
    // permitted. A deal elsewhere is not an error.
    if (order.dealId) {
      try {
        await transitionDealStageDb(tx, order.dealId, 'po_pending', {
          role: 'admin',
          userId: auth.user.id,
          reason: `order cancelled: ${input.reason}`,
        });
      } catch (err) {
        if (!(err instanceof DealInvalidTransitionError) && !(err instanceof HighRiskGuardError)) {
          throw err;
        }
      }
    }

    return { id: input.id, status: 'cancelled' as const, releasedCount };
  },
);
