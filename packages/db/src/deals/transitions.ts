import { sql, eq } from 'drizzle-orm';

import { deals, dealStageHistory, type Deal, type DealStageHistory } from '../schema/deal';
import { dealers } from '../schema/dealer';
import type { DrizzleTx } from '../with-tenant';

export type DealStage =
  | 'qualification'
  | 'needs_analysis'
  | 'quotation_sent'
  | 'negotiation'
  | 'verbal_commit'
  | 'po_pending'
  | 'payment_pending'
  | 'ready_for_dispatch'
  | 'closed';

export type DealStatus = 'open' | 'won' | 'lost';

export type DealLostReason = 'price' | 'competitor' | 'timing' | 'no_budget' | 'other';

export type ActorRole = 'admin' | 'sales' | 'accounts' | 'dispatch' | 'operator';

/**
 * BRD §3.4 stage numbering — used by the high-risk guard. Closing as 'lost'
 * is always allowed regardless of the stage number.
 */
export const STAGE_NUMBER: Record<DealStage, number> = {
  qualification: 1,
  needs_analysis: 2,
  quotation_sent: 3,
  negotiation: 4,
  verbal_commit: 5,
  po_pending: 6,
  payment_pending: 7,
  ready_for_dispatch: 8,
  closed: 9,
};

/**
 * Forward transitions allowed for any sales/admin role. Reverse transitions
 * are listed separately because they require admin.
 */
const FORWARD: Record<DealStage, DealStage[]> = {
  qualification: ['needs_analysis', 'closed'],
  needs_analysis: ['quotation_sent', 'closed'],
  quotation_sent: ['negotiation', 'closed'],
  negotiation: ['verbal_commit', 'closed'],
  verbal_commit: ['po_pending', 'closed'],
  po_pending: ['payment_pending', 'closed'],
  payment_pending: ['ready_for_dispatch', 'closed'],
  ready_for_dispatch: ['closed'],
  closed: [],
};

/**
 * Reverse transitions, admin-only. Allow nudging a deal back one stage when
 * an operator made an error or the dealer pulled out of a commit. Does NOT
 * allow re-opening a 'closed' deal — that requires a new deal record.
 */
const REVERSE: Record<DealStage, DealStage[]> = {
  qualification: [],
  needs_analysis: ['qualification'],
  quotation_sent: ['needs_analysis'],
  negotiation: ['quotation_sent'],
  verbal_commit: ['negotiation'],
  po_pending: ['verbal_commit'],
  payment_pending: ['po_pending'],
  ready_for_dispatch: ['payment_pending'],
  closed: [],
};

export const ALLOWED_TRANSITIONS: Record<DealStage, DealStage[]> = {
  qualification: [...FORWARD.qualification, ...REVERSE.qualification],
  needs_analysis: [...FORWARD.needs_analysis, ...REVERSE.needs_analysis],
  quotation_sent: [...FORWARD.quotation_sent, ...REVERSE.quotation_sent],
  negotiation: [...FORWARD.negotiation, ...REVERSE.negotiation],
  verbal_commit: [...FORWARD.verbal_commit, ...REVERSE.verbal_commit],
  po_pending: [...FORWARD.po_pending, ...REVERSE.po_pending],
  payment_pending: [...FORWARD.payment_pending, ...REVERSE.payment_pending],
  ready_for_dispatch: [...FORWARD.ready_for_dispatch, ...REVERSE.ready_for_dispatch],
  closed: [],
};

export const ALL_STAGES: DealStage[] = [
  'qualification',
  'needs_analysis',
  'quotation_sent',
  'negotiation',
  'verbal_commit',
  'po_pending',
  'payment_pending',
  'ready_for_dispatch',
  'closed',
];

/** BRD §3.4 transitions that are auto-triggered by other events, not by user click. */
export const AUTO_TRIGGERED: Array<{ from: DealStage; to: DealStage; reason: string }> = [
  { from: 'needs_analysis', to: 'quotation_sent', reason: 'quotation_email_delivered' },
  { from: 'po_pending', to: 'payment_pending', reason: 'order_confirmed' },
  { from: 'payment_pending', to: 'ready_for_dispatch', reason: 'payment_recorded' },
  { from: 'ready_for_dispatch', to: 'closed', reason: 'dispatch_created' },
];

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  constructor(
    readonly from: DealStage,
    readonly to: DealStage,
    extra?: string,
  ) {
    super(`Cannot transition deal from "${from}" to "${to}"${extra ? `: ${extra}` : ''}`);
    this.name = 'InvalidTransitionError';
  }
}

export class HighRiskGuardError extends Error {
  readonly code = 'HIGH_RISK_GUARD' as const;
  constructor(readonly target: DealStage) {
    super(
      `Deal is for a high-risk dealer — moving past Negotiation requires an admin override (target: ${target})`,
    );
    this.name = 'HighRiskGuardError';
  }
}

export class DealNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(readonly id: string) {
    super(`Deal ${id} not found`);
    this.name = 'DealNotFoundError';
  }
}

export class MissingLostReasonError extends Error {
  readonly code = 'VALIDATION' as const;
  constructor() {
    super('Closing a deal as lost requires a lost_reason');
    this.name = 'MissingLostReasonError';
  }
}

/** Pure predicate: is the (from, to) pair listed as allowed regardless of role? */
export function isAllowed(from: DealStage, to: DealStage): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Forward direction only (sales-allowed). */
export function isForward(from: DealStage, to: DealStage): boolean {
  return FORWARD[from]?.includes(to) ?? false;
}

/** Reverse direction only (admin-only). */
export function isReverse(from: DealStage, to: DealStage): boolean {
  return REVERSE[from]?.includes(to) ?? false;
}

/**
 * High-risk dealer guard per BRD §3.4: deals for high-risk dealers cannot
 * move PAST stage 4 (negotiation) without an admin override. Returns true
 * when the target stage breaches the guard.
 *
 * Closing as 'lost' is always allowed — the guard only blocks forward
 * commercial movement.
 */
export function breachesHighRiskGuard(
  riskLevel: 'low' | 'medium' | 'high' | null | undefined,
  targetStage: DealStage,
  targetStatus: DealStatus,
): boolean {
  if (riskLevel !== 'high') return false;
  if (targetStage === 'closed' && targetStatus === 'lost') return false;
  return STAGE_NUMBER[targetStage] > STAGE_NUMBER.negotiation;
}

interface AdminOverride {
  userId: string;
  reason: string;
}

export interface TransitionOptions {
  /** Actor's role — only 'admin' may run reverse transitions. */
  role: ActorRole;
  /** Actor's user id — recorded on deal_stage_history. */
  userId: string;
  /** Marks the transition as auto-triggered (e.g., from a webhook). */
  automatic?: boolean;
  /**
   * Admin-only escape hatch for the high-risk dealer guard. The reason is
   * captured in deal_stage_history.reason. Operators may not override.
   */
  override?: AdminOverride;
  /** Required when closing as 'lost'. */
  lostReason?: DealLostReason;
  /** Optional free-text note (saved on the deal + history row). */
  lostReasonNote?: string;
  /** Generic reason text recorded on the history row (e.g., for reverse moves). */
  reason?: string;
  /**
   * Used when targetStage === 'closed' to decide between 'won' and 'lost'.
   * Defaults to 'won' for closures that aren't explicitly lost.
   */
  closeStatus?: 'won' | 'lost';
}

interface DealRow extends Record<string, unknown> {
  id: string;
  stage: DealStage;
  status: DealStatus;
  risk: 'low' | 'medium' | 'high';
  tenant_id: string;
}

/**
 * Move a deal to a new stage with a row lock so concurrent transitions
 * cannot race. Caller must already be inside withTenant(...).
 *
 * Throws:
 *   - DealNotFoundError if the id does not resolve in this tenant
 *   - InvalidTransitionError if (current, target) is not in ALLOWED_TRANSITIONS
 *     or if a reverse move is attempted by a non-admin
 *   - HighRiskGuardError if the dealer is high-risk and override is absent
 *   - MissingLostReasonError if closing as lost without a lostReason
 */
export async function transitionStage(
  tx: DrizzleTx,
  dealId: string,
  toStage: DealStage,
  opts: TransitionOptions,
): Promise<{ deal: Deal; history: DealStageHistory }> {
  // Row lock — block concurrent transitions on the same deal until commit.
  const lockedRows = await tx.execute<DealRow>(sql`
    SELECT d.id, d.stage, d.status, d.tenant_id, dl.risk_level AS risk
    FROM deals d
    JOIN dealers dl ON dl.id = d.dealer_id
    WHERE d.id = ${dealId}
    FOR UPDATE OF d
  `);
  const lockedArr = lockedRows as unknown as DealRow[];
  const locked = lockedArr[0];
  if (!locked) throw new DealNotFoundError(dealId);

  const from = locked.stage;
  if (from === toStage) {
    throw new InvalidTransitionError(from, toStage, 'deal already in this stage');
  }
  if (!isAllowed(from, toStage)) {
    throw new InvalidTransitionError(from, toStage);
  }

  // Reverse transitions are admin-only.
  if (isReverse(from, toStage) && opts.role !== 'admin') {
    throw new InvalidTransitionError(from, toStage, 'reverse transitions require admin role');
  }

  // Resolve target status.
  let toStatus: DealStatus = 'open';
  if (toStage === 'closed') {
    toStatus = opts.closeStatus ?? 'won';
    if (toStatus === 'lost' && !opts.lostReason) {
      throw new MissingLostReasonError();
    }
  }

  // High-risk guard. Override allowed only with admin role + reason.
  if (breachesHighRiskGuard(locked.risk, toStage, toStatus)) {
    if (!opts.override || opts.role !== 'admin' || !opts.override.reason.trim()) {
      throw new HighRiskGuardError(toStage);
    }
  }

  const now = new Date();
  const overridden =
    Boolean(opts.override) && breachesHighRiskGuard(locked.risk, toStage, toStatus);

  const historyReason =
    opts.override?.reason?.trim() ||
    opts.reason?.trim() ||
    (toStatus === 'lost' ? opts.lostReasonNote?.trim() : undefined) ||
    null;

  const updates: Partial<Deal> = {
    stage: toStage,
    status: toStatus,
    lastActivityAt: now,
    updatedAt: now,
    updatedBy: opts.userId,
  };
  if (toStage === 'closed' && toStatus === 'lost') {
    updates.lostReason = opts.lostReason ?? null;
    updates.lostReasonNote = opts.lostReasonNote ?? null;
  }
  if (toStage !== 'closed') {
    // Re-opening a deal via reverse move should clear any stale lost_reason.
    updates.lostReason = null;
    updates.lostReasonNote = null;
  }

  const [updated] = await tx.update(deals).set(updates).where(eq(deals.id, dealId)).returning();
  if (!updated) throw new DealNotFoundError(dealId);

  const [history] = await tx
    .insert(dealStageHistory)
    .values({
      tenantId: locked.tenant_id,
      dealId,
      fromStage: from,
      toStage,
      fromStatus: locked.status,
      toStatus,
      transitionedBy: opts.userId,
      automatic: opts.automatic ?? false,
      overridden,
      reason: historyReason,
    })
    .returning();

  if (!history) throw new Error('deal_stage_history insert returned no row');

  return { deal: updated, history };
}

/**
 * Returns the list of stages a deal can move to from the given current stage
 * given the actor's role. Used by the UI to gray out impossible drop
 * targets. Does NOT consider the high-risk guard — the UI surfaces that as
 * a confirmation modal, not a hard disable.
 */
export function allowedTargets(from: DealStage, role: ActorRole): DealStage[] {
  if (role === 'admin') return ALLOWED_TRANSITIONS[from] ?? [];
  return FORWARD[from] ?? [];
}

/** Convenience reference exposed for tests. */
export const __internal = { FORWARD, REVERSE, dealers };
