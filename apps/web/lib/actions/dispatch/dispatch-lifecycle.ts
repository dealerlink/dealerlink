'use server';

import { markDispatchDeliveredDb, returnDispatchDb } from '@dealerlink/db';
import { markDeliveredInputSchema, returnDispatchInputSchema } from '@dealerlink/schemas';

import { tenantAction } from '@/lib/actions/wrap';

import { rethrowDispatchError } from './helpers';

/**
 * Mark an in-transit dispatch delivered (admin + dispatch). Captures who
 * signed for the goods, moves every serial to `delivered`, and advances the
 * order to `delivered` once all its dispatches are in.
 */
export const markDispatchDelivered = tenantAction(
  ['admin', 'dispatch'],
  markDeliveredInputSchema,
  async ({ tx, input, auth }) => {
    try {
      return await markDispatchDeliveredDb(tx, input.id, {
        userId: auth.user.id,
        acknowledgedBy: input.acknowledgedBy,
      });
    } catch (err) {
      rethrowDispatchError(err);
    }
  },
);

/**
 * Return an in-transit dispatch (admin only). Serials go back to warehouse
 * stock, the order line dispatched quantities are decremented, and the order
 * fulfilment status is recomputed (it may regress).
 */
export const returnDispatch = tenantAction(
  ['admin'],
  returnDispatchInputSchema,
  async ({ tx, input, auth }) => {
    try {
      return await returnDispatchDb(tx, input.id, {
        userId: auth.user.id,
        reason: input.reason,
      });
    } catch (err) {
      rethrowDispatchError(err);
    }
  },
);
