'use server';

import { deals } from '@dealerlink/db';
import { reassignDealSchema, updateDealMetadataSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

/**
 * Update editable metadata on a deal. Admin can edit any; sales can edit
 * only deals assigned to themselves. The `hot` flag and notes are the most
 * common edits.
 */
export const updateDealMetadata = tenantAction(
  ['admin', 'sales'],
  updateDealMetadataSchema,
  async ({ tx, input, auth }) => {
    const [existing] = await tx
      .select({ id: deals.id, assignedTo: deals.assignedTo, status: deals.status })
      .from(deals)
      .where(eq(deals.id, input.id))
      .limit(1);
    if (!existing) throw new AppError('NOT_FOUND', 'Deal not found');
    if (auth.user.role === 'sales' && existing.assignedTo !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only edit deals assigned to you');
    }
    if (existing.status !== 'open') {
      throw new AppError('VALIDATION', 'Cannot edit a closed deal');
    }

    const updates: Record<string, unknown> = {
      lastActivityAt: new Date(),
      updatedAt: new Date(),
      updatedBy: auth.user.id,
    };
    if (input.title !== undefined) updates['title'] = input.title;
    if (input.estimatedValue !== undefined)
      updates['estimatedValue'] =
        input.estimatedValue != null ? String(input.estimatedValue) : null;
    if (input.probabilityPercent !== undefined)
      updates['probabilityPercent'] = input.probabilityPercent;
    if (input.expectedCloseDate !== undefined)
      updates['expectedCloseDate'] = input.expectedCloseDate;
    if (input.source !== undefined) updates['source'] = input.source;
    if (input.notes !== undefined) updates['notes'] = input.notes || null;
    if (input.hot !== undefined) updates['hot'] = input.hot;

    await tx.update(deals).set(updates).where(eq(deals.id, input.id));
    return { id: input.id };
  },
);

/** Reassign a deal to a different owner. Admin only. */
export const reassignDeal = tenantAction(
  ['admin'],
  reassignDealSchema,
  async ({ tx, input, auth }) => {
    const [existing] = await tx
      .select({ id: deals.id, status: deals.status })
      .from(deals)
      .where(eq(deals.id, input.id))
      .limit(1);
    if (!existing) throw new AppError('NOT_FOUND', 'Deal not found');
    if (existing.status !== 'open') {
      throw new AppError('VALIDATION', 'Cannot reassign a closed deal');
    }
    await tx
      .update(deals)
      .set({
        assignedTo: input.assignedTo,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(eq(deals.id, input.id));
    return { id: input.id, assignedTo: input.assignedTo };
  },
);
