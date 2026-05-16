import { eq, sql } from 'drizzle-orm';

import {
  performaInvoiceStatusHistory,
  performaInvoices,
  type PerformaInvoice,
  type PerformaInvoiceStatus,
} from '../schema/performa-invoice';
import type { DrizzleTx } from '../with-tenant';

/**
 * Performa Invoice state machine (Day 11). The transition table is
 * authoritative — no Server Action may UPDATE `performa_invoices.status`
 * directly; every status change goes through `transitionPi()`.
 *
 *   draft ──send──▶ sent ──confirm──▶ confirmed   (confirmed is terminal)
 *     └──────────── cancel ──────────────┘        (cancel from draft or sent)
 *
 * A `confirmed` PI is immutable: it has already spawned an Order. `cancelled`
 * is terminal too.
 */
export const ALLOWED_TRANSITIONS: Record<PerformaInvoiceStatus, PerformaInvoiceStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: [],
  cancelled: [],
};

export const ALL_PI_STATUSES: PerformaInvoiceStatus[] = ['draft', 'sent', 'confirmed', 'cancelled'];

export function isPiTransitionAllowed(
  from: PerformaInvoiceStatus,
  to: PerformaInvoiceStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class PiInvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  constructor(
    readonly from: PerformaInvoiceStatus,
    readonly to: PerformaInvoiceStatus,
    extra?: string,
  ) {
    super(`Cannot transition PI from "${from}" to "${to}"${extra ? `: ${extra}` : ''}`);
    this.name = 'PiInvalidTransitionError';
  }
}

export class PerformaInvoiceNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(readonly id: string) {
    super(`Performa invoice ${id} not found`);
    this.name = 'PerformaInvoiceNotFoundError';
  }
}

export interface PiTransitionOptions {
  /** Actor user id — recorded on performa_invoice_status_history. */
  userId: string;
  /** Free-text reason (required for `cancelled`, optional otherwise). */
  reason?: string | null;
  /** Marks the transition as auto-triggered. */
  automatic?: boolean;
}

/**
 * Move a PI to a new status with a row lock so concurrent transitions cannot
 * race. Sets the matching timestamp column, writes a status-history row, and
 * returns the updated PI. Caller must already be inside `withTenant(...)`.
 *
 * Throws:
 *   - PerformaInvoiceNotFoundError if the id does not resolve in this tenant
 *   - PiInvalidTransitionError if (current → target) is not allowed
 */
export async function transitionPi(
  tx: DrizzleTx,
  piId: string,
  toStatus: PerformaInvoiceStatus,
  opts: PiTransitionOptions,
): Promise<PerformaInvoice> {
  const locked = await tx.execute<{ id: string; status: PerformaInvoiceStatus; tenant_id: string }>(
    sql`SELECT id, status, tenant_id FROM performa_invoices WHERE id = ${piId} FOR UPDATE`,
  );
  const row = (
    locked as unknown as { id: string; status: PerformaInvoiceStatus; tenant_id: string }[]
  )[0];
  if (!row) throw new PerformaInvoiceNotFoundError(piId);

  const from = row.status;
  if (!isPiTransitionAllowed(from, toStatus)) {
    throw new PiInvalidTransitionError(from, toStatus);
  }

  const now = new Date();
  const updates: Partial<PerformaInvoice> = {
    status: toStatus,
    updatedAt: now,
    updatedBy: opts.userId,
  };
  if (toStatus === 'sent') updates.sentAt = now;
  if (toStatus === 'confirmed') updates.confirmedAt = now;
  if (toStatus === 'cancelled') {
    updates.cancelledAt = now;
    updates.cancelledReason = opts.reason ?? null;
  }

  const [updated] = await tx
    .update(performaInvoices)
    .set(updates)
    .where(eq(performaInvoices.id, piId))
    .returning();
  if (!updated) throw new PerformaInvoiceNotFoundError(piId);

  await tx.insert(performaInvoiceStatusHistory).values({
    tenantId: row.tenant_id,
    performaInvoiceId: piId,
    fromStatus: from,
    toStatus,
    transitionedBy: opts.userId,
    reason: opts.reason ?? null,
  });

  return updated;
}
