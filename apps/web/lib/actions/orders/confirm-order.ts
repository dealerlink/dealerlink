'use server';

import {
  InsufficientInventoryError,
  orders,
  reserveInventoryForOrder,
  transitionOrder,
} from '@dealerlink/db';
import { confirmOrderSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import { trackEvent } from '@/lib/observability/events';

/**
 * Confirm a pending order. Reserves serialised inventory FIFO for every line
 * (`SELECT ... FOR UPDATE`), then transitions the order pending → confirmed —
 * all in one transaction. If any line is short the reservation throws,
 * everything rolls back, and the caller gets a `CONFLICT` error whose meta
 * carries the exact per-product shortages.
 */
export const confirmOrder = tenantAction(
  ['admin', 'sales'],
  confirmOrderSchema,
  async ({ tx, input, auth }) => {
    const [order] = await tx
      .select({
        id: orders.id,
        status: orders.status,
        shipToDealerId: orders.shipToDealerId,
      })
      .from(orders)
      .where(eq(orders.id, input.id))
      .limit(1);
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    if (order.status !== 'pending') {
      throw new AppError(
        'VALIDATION',
        `Only pending orders can be confirmed (this one is "${order.status}")`,
      );
    }

    let reservedCount: number;
    try {
      const result = await reserveInventoryForOrder(tx, input.id, {
        dealerId: order.shipToDealerId,
        userId: auth.user.id,
      });
      reservedCount = result.reservedItemIds.length;
    } catch (err) {
      if (err instanceof InsufficientInventoryError) {
        // Name every short product with its required vs available quantity so
        // the user knows exactly what to procure (UX finding I-4).
        const detail = err.shortages
          .map((s) => `${s.productName}: need ${s.requested}, have ${s.available}`)
          .join('; ');
        throw new AppError('CONFLICT', `Cannot confirm — ${detail}`, {
          meta: { shortages: err.shortages },
        });
      }
      throw err;
    }

    await transitionOrder(tx, input.id, 'confirmed', {
      userId: auth.user.id,
      reason: 'inventory_reserved',
    });

    trackEvent('order.confirmed', { orderId: input.id });

    return { id: input.id, status: 'confirmed' as const, reservedCount };
  },
);
