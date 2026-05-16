'use server';

import { createDispatchDb } from '@dealerlink/db';
import { createDispatchInputSchema } from '@dealerlink/schemas';

import { tenantAction } from '@/lib/actions/wrap';
import { trackEvent } from '@/lib/observability/events';

import { rethrowDispatchError } from './helpers';

/**
 * Create a dispatch against a confirmed order — the highest-stakes write of
 * Day 13. Dispatch is the primary role here; admin has full access. Sales
 * and Accounts may view dispatches but never create them.
 *
 * The whole operation (serial validation, dispatch insert, inventory
 * transitions, order-status recompute, deal close) runs inside one
 * `tenantAction` transaction. Any failure rolls everything back — serials
 * stay `reserved`, the order is untouched, and no orphan dispatch survives.
 */
export const createDispatch = tenantAction(
  ['admin', 'dispatch'],
  createDispatchInputSchema,
  async ({ tx, input, auth }) => {
    try {
      const result = await createDispatchDb(
        tx,
        {
          orderId: input.orderId,
          lines: input.lines,
          dispatchDate: input.dispatchDate ?? null,
          expectedDeliveryDate: input.expectedDeliveryDate ?? null,
          vehicleNumber: input.vehicleNumber ?? null,
          transporterName: input.transporterName ?? null,
          transporterDocketNumber: input.transporterDocketNumber ?? null,
          driverName: input.driverName ?? null,
          driverPhone: input.driverPhone ?? null,
          ewayBillNumber: input.ewayBillNumber ?? null,
          ewayBillDate: input.ewayBillDate ?? null,
          notes: input.notes ?? null,
        },
        { userId: auth.user.id },
      );
      trackEvent('dispatch.created', {
        dispatchId: result.id,
        serialCount: result.serialCount,
      });
      return result;
    } catch (err) {
      rethrowDispatchError(err);
    }
  },
);
