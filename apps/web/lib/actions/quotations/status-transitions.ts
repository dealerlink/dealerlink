'use server';

import {
  DealInvalidTransitionError,
  HighRiskGuardError,
  quotations,
  transitionDealStageDb,
  type QuotationStatus,
} from '@dealerlink/db';
import { markAcceptedSchema, markRejectedSchema, sendQuotationSchema } from '@dealerlink/schemas';
import { and, eq, lte } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import { loadQuotationForGuard, writeStatusHistory } from './helpers';

const VALID_FROM_FOR_SEND: QuotationStatus[] = ['draft'];

export const sendQuotation = tenantAction(
  ['admin', 'sales'],
  sendQuotationSchema,
  async ({ tx, input, auth }) => {
    const existing = await loadQuotationForGuard(tx, input.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');
    if (auth.user.role === 'sales' && existing.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only send quotations you prepared');
    }
    if (!VALID_FROM_FOR_SEND.includes(existing.status)) {
      throw new AppError('VALIDATION', `Cannot send a quotation in "${existing.status}" status`);
    }

    const now = new Date();
    await tx
      .update(quotations)
      .set({
        status: 'sent',
        sentAt: now,
        sentVia: input.via,
        updatedAt: now,
        updatedBy: auth.user.id,
      })
      .where(eq(quotations.id, input.id));

    await writeStatusHistory(tx, {
      tenantId: existing.tenantId,
      quotationId: input.id,
      fromStatus: existing.status,
      toStatus: 'sent',
      actorId: auth.user.id,
      reason: `sent_via_${input.via}`,
    });

    // Pipeline integration: if linked to a deal in needs_analysis, auto-
    // advance to quotation_sent. Day 14 will replace this with the Resend
    // delivery webhook firing the same transition.
    const [linked] = await tx
      .select({ dealId: quotations.dealId })
      .from(quotations)
      .where(eq(quotations.id, input.id))
      .limit(1);
    if (linked?.dealId) {
      try {
        await transitionDealStageDb(tx, linked.dealId, 'quotation_sent', {
          role: auth.user.role === 'admin' ? 'admin' : 'sales',
          userId: auth.user.id,
          automatic: true,
          reason: `quotation ${existing.quoteNumber} sent`,
        });
      } catch (err) {
        if (!(err instanceof DealInvalidTransitionError) && !(err instanceof HighRiskGuardError)) {
          throw err;
        }
      }
    }

    return { id: input.id, status: 'sent' as const };
  },
);

const VALID_FROM_FOR_ACCEPT: QuotationStatus[] = ['sent'];

export const markQuotationAccepted = tenantAction(
  ['admin', 'sales'],
  markAcceptedSchema,
  async ({ tx, input, auth }) => {
    const existing = await loadQuotationForGuard(tx, input.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');
    if (!VALID_FROM_FOR_ACCEPT.includes(existing.status)) {
      throw new AppError('VALIDATION', `Cannot accept a quotation in "${existing.status}" status`);
    }
    if (auth.user.role === 'sales' && existing.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only update quotations you prepared');
    }

    const now = new Date();
    await tx
      .update(quotations)
      .set({
        status: 'accepted',
        acceptedAt: now,
        updatedAt: now,
        updatedBy: auth.user.id,
      })
      .where(eq(quotations.id, input.id));
    await writeStatusHistory(tx, {
      tenantId: existing.tenantId,
      quotationId: input.id,
      fromStatus: existing.status,
      toStatus: 'accepted',
      actorId: auth.user.id,
      reason: input.reason?.toString().trim() || null,
    });
    return { id: input.id, status: 'accepted' as const };
  },
);

export const markQuotationRejected = tenantAction(
  ['admin', 'sales'],
  markRejectedSchema,
  async ({ tx, input, auth }) => {
    const existing = await loadQuotationForGuard(tx, input.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');
    if (existing.status !== 'sent') {
      throw new AppError('VALIDATION', `Cannot reject a quotation in "${existing.status}" status`);
    }
    if (auth.user.role === 'sales' && existing.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only update quotations you prepared');
    }

    const now = new Date();
    await tx
      .update(quotations)
      .set({
        status: 'rejected',
        rejectedAt: now,
        rejectedReason: input.reason,
        updatedAt: now,
        updatedBy: auth.user.id,
      })
      .where(eq(quotations.id, input.id));
    await writeStatusHistory(tx, {
      tenantId: existing.tenantId,
      quotationId: input.id,
      fromStatus: existing.status,
      toStatus: 'rejected',
      actorId: auth.user.id,
      reason: input.reason,
    });
    return { id: input.id, status: 'rejected' as const };
  },
);

/**
 * Mark a single quotation as expired. The validity-expiry sweep (Day 14)
 * will call this in a loop; for now an admin can also trigger it manually.
 */
export const markQuotationExpired = tenantAction(
  ['admin'],
  sendQuotationSchema.pick({ id: true }),
  async ({ tx, input, auth }) => {
    const existing = await loadQuotationForGuard(tx, input.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');
    if (existing.status !== 'sent') {
      throw new AppError('VALIDATION', `Cannot expire a quotation in "${existing.status}" status`);
    }
    const now = new Date();
    await tx
      .update(quotations)
      .set({ status: 'expired', updatedAt: now, updatedBy: auth.user.id })
      .where(eq(quotations.id, input.id));
    await writeStatusHistory(tx, {
      tenantId: existing.tenantId,
      quotationId: input.id,
      fromStatus: existing.status,
      toStatus: 'expired',
      actorId: auth.user.id,
      reason: 'validity_expired',
    });
    return { id: input.id, status: 'expired' as const };
  },
);

/**
 * Best-effort sweep used by the validity-expiry job in Day 14.
 * For each tenant, expires any quotation whose valid_until is in the past
 * and which is still in 'sent' state. Returns the count expired.
 */
export async function sweepExpiredQuotationsForTenant(
  tx: import('@dealerlink/db').DrizzleTx,
  tenantId: string,
  asOf: Date,
  actorId: string,
): Promise<number> {
  const today = asOf.toISOString().slice(0, 10);
  const due = await tx
    .select({ id: quotations.id, status: quotations.status })
    .from(quotations)
    .where(
      and(
        eq(quotations.tenantId, tenantId),
        eq(quotations.status, 'sent'),
        lte(quotations.validUntil, today),
      ),
    );
  if (due.length === 0) return 0;
  await tx
    .update(quotations)
    .set({ status: 'expired', updatedAt: asOf, updatedBy: actorId })
    .where(
      and(
        eq(quotations.tenantId, tenantId),
        eq(quotations.status, 'sent'),
        lte(quotations.validUntil, today),
      ),
    );
  for (const r of due) {
    await writeStatusHistory(tx, {
      tenantId,
      quotationId: r.id,
      fromStatus: 'sent',
      toStatus: 'expired',
      actorId,
      reason: 'validity_expired',
    });
  }
  return due.length;
}
