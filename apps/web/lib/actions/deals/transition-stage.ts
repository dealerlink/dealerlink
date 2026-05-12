'use server';

import {
  DealInvalidTransitionError,
  DealNotFoundError,
  HighRiskGuardError,
  MissingLostReasonError,
  deals,
  transitionDealStageDb,
} from '@dealerlink/db';
import { closeDealSchema, transitionDealStageSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

/**
 * Manual stage transition (kanban drag or detail page click). Admin can run
 * any transition; sales can only run forward transitions on deals they own.
 * Closing as 'lost' requires a lostReason.
 */
export const transitionDealStage = tenantAction(
  ['admin', 'sales'],
  transitionDealStageSchema,
  async ({ tx, input, auth }) => {
    const [existing] = await tx
      .select({ id: deals.id, assignedTo: deals.assignedTo, status: deals.status })
      .from(deals)
      .where(eq(deals.id, input.id))
      .limit(1);
    if (!existing) throw new AppError('NOT_FOUND', 'Deal not found');
    if (existing.status !== 'open') {
      throw new AppError('VALIDATION', 'Deal is already closed');
    }
    if (auth.user.role === 'sales' && existing.assignedTo !== auth.user.id) {
      throw new AppError(
        'FORBIDDEN',
        'You can only move deals assigned to you. Ask an admin to reassign.',
      );
    }

    const closeStatus = input.toStage === 'closed' ? (input.closeStatus ?? 'won') : undefined;

    try {
      const result = await transitionDealStageDb(tx, input.id, input.toStage, {
        role: auth.user.role,
        userId: auth.user.id,
        automatic: false,
        ...(input.overrideReason && input.overrideReason.trim()
          ? { override: { userId: auth.user.id, reason: input.overrideReason } }
          : {}),
        ...(input.lostReason ? { lostReason: input.lostReason } : {}),
        ...(input.lostReasonNote ? { lostReasonNote: input.lostReasonNote } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(closeStatus ? { closeStatus } : {}),
      });
      return { id: result.deal.id, stage: result.deal.stage, status: result.deal.status };
    } catch (err) {
      if (err instanceof DealNotFoundError) throw new AppError('NOT_FOUND', err.message);
      if (err instanceof HighRiskGuardError) throw new AppError('FORBIDDEN', err.message);
      if (err instanceof MissingLostReasonError) throw new AppError('VALIDATION', err.message);
      if (err instanceof DealInvalidTransitionError) throw new AppError('VALIDATION', err.message);
      throw err;
    }
  },
);

/** Close a deal as won or lost (shorthand for transitioning to 'closed'). */
export const closeDeal = tenantAction(
  ['admin', 'sales'],
  closeDealSchema,
  async ({ tx, input, auth }) => {
    const [existing] = await tx
      .select({ id: deals.id, assignedTo: deals.assignedTo, status: deals.status })
      .from(deals)
      .where(eq(deals.id, input.id))
      .limit(1);
    if (!existing) throw new AppError('NOT_FOUND', 'Deal not found');
    if (existing.status !== 'open') {
      throw new AppError('VALIDATION', 'Deal is already closed');
    }
    if (auth.user.role === 'sales' && existing.assignedTo !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only close deals assigned to you');
    }
    if (input.outcome === 'lost' && !input.lostReason) {
      throw new AppError('VALIDATION', 'Lost deals require a reason');
    }

    try {
      const result = await transitionDealStageDb(tx, input.id, 'closed', {
        role: auth.user.role,
        userId: auth.user.id,
        closeStatus: input.outcome,
        ...(input.lostReason ? { lostReason: input.lostReason } : {}),
        ...(input.lostReasonNote ? { lostReasonNote: input.lostReasonNote } : {}),
        ...(input.overrideReason && input.overrideReason.trim()
          ? { override: { userId: auth.user.id, reason: input.overrideReason } }
          : {}),
      });
      return { id: result.deal.id, status: result.deal.status };
    } catch (err) {
      if (err instanceof HighRiskGuardError) throw new AppError('FORBIDDEN', err.message);
      if (err instanceof MissingLostReasonError) throw new AppError('VALIDATION', err.message);
      if (err instanceof DealInvalidTransitionError) throw new AppError('VALIDATION', err.message);
      throw err;
    }
  },
);
