'use server';

import {
  InventoryInvalidTransitionError,
  InventoryItemNotFoundError,
  transitionInventoryItem,
} from '@dealerlink/db';
import { transitionItemSchema } from '@dealerlink/schemas';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

/** Move a single inventory item to a new status via the state machine. */
export const transitionInventory = tenantAction(
  ['admin', 'dispatch'],
  transitionItemSchema,
  async ({ tx, input, auth }) => {
    try {
      const row = await transitionInventoryItem(tx, input.id, input.target, {
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedBy: auth.user.id,
      });
      return { id: row.id, status: row.status };
    } catch (err) {
      if (err instanceof InventoryItemNotFoundError) {
        throw new AppError('NOT_FOUND', err.message);
      }
      if (err instanceof InventoryInvalidTransitionError) {
        throw new AppError('VALIDATION', err.message);
      }
      throw err;
    }
  },
);
