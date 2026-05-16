import { eq, sql } from 'drizzle-orm';

import { payments, type Payment, type PaymentStatus } from '../schema/payment';
import type { DrizzleTx } from '../with-tenant';

/**
 * Payment lifecycle state machine (Day 12). Authoritative — no Server Action
 * may UPDATE `payments.status` directly; every status change goes through
 * `transitionPayment()`.
 *
 *   pending_verification ─verify─▶ verified ─clear──▶ cleared ─refund─▶ refunded
 *                                     └────bounce────▶ bounced
 *
 * Role enforcement (admin+accounts for most; admin-only for refund) lives at
 * the Server Action layer via `tenantAction`. `bounced` and `refunded` are
 * terminal. A bounce/refund REVERSES allocations — the caller handles that.
 *
 * Forbidden by construction: pending_verification → cleared (must verify
 * first), anything → pending_verification, cleared → bounced.
 */
export const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending_verification: ['verified'],
  verified: ['cleared', 'bounced'],
  cleared: ['refunded'],
  bounced: [],
  refunded: [],
};

export const ALL_PAYMENT_STATUSES: PaymentStatus[] = [
  'pending_verification',
  'verified',
  'cleared',
  'bounced',
  'refunded',
];

/** Statuses from which allocations may be made or amended. */
export const ALLOCATABLE_STATUSES: PaymentStatus[] = ['verified', 'cleared'];

export function isPaymentTransitionAllowed(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class PaymentInvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  constructor(
    readonly from: PaymentStatus,
    readonly to: PaymentStatus,
    extra?: string,
  ) {
    super(`Cannot transition payment from "${from}" to "${to}"${extra ? `: ${extra}` : ''}`);
    this.name = 'PaymentInvalidTransitionError';
  }
}

export class PaymentNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(readonly id: string) {
    super(`Payment ${id} not found`);
    this.name = 'PaymentNotFoundError';
  }
}

export interface PaymentTransitionOptions {
  /** Actor user id — recorded on verifiedBy and the audit trail. */
  userId: string;
  /** Reason — required for `bounced` and `refunded`, ignored otherwise. */
  reason?: string | null;
}

/**
 * Move a payment to a new status with a row lock so concurrent transitions
 * cannot race. Stamps the matching timestamp/reason columns and returns the
 * updated payment. Caller must already be inside `withTenant(...)`.
 *
 * Throws:
 *   - PaymentNotFoundError if the id does not resolve in this tenant
 *   - PaymentInvalidTransitionError if (current → target) is not allowed
 */
export async function transitionPayment(
  tx: DrizzleTx,
  paymentId: string,
  toStatus: PaymentStatus,
  opts: PaymentTransitionOptions,
): Promise<Payment> {
  const locked = await tx.execute<{ id: string; status: PaymentStatus }>(
    sql`SELECT id, status FROM payments WHERE id = ${paymentId} FOR UPDATE`,
  );
  const row = (locked as unknown as { id: string; status: PaymentStatus }[])[0];
  if (!row) throw new PaymentNotFoundError(paymentId);

  const from = row.status;
  if (!isPaymentTransitionAllowed(from, toStatus)) {
    throw new PaymentInvalidTransitionError(from, toStatus);
  }

  const now = new Date();
  const updates: Partial<Payment> = {
    status: toStatus,
    updatedAt: now,
    updatedBy: opts.userId,
  };
  if (toStatus === 'verified') {
    updates.verifiedAt = now;
    updates.verifiedBy = opts.userId;
  }
  if (toStatus === 'cleared') updates.clearedAt = now;
  if (toStatus === 'bounced') {
    updates.bouncedAt = now;
    updates.bouncedReason = opts.reason ?? null;
  }
  if (toStatus === 'refunded') {
    updates.refundedAt = now;
    updates.refundedReason = opts.reason ?? null;
  }

  const [updated] = await tx
    .update(payments)
    .set(updates)
    .where(eq(payments.id, paymentId))
    .returning();
  if (!updated) throw new PaymentNotFoundError(paymentId);
  return updated;
}
