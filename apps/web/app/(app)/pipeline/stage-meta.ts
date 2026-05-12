import type { DealStage } from '@dealerlink/db';

export type ActorRole = 'admin' | 'sales' | 'accounts' | 'dispatch';

export interface StageMeta {
  key: DealStage;
  number: number;
  name: string;
  shortName: string;
}

/**
 * Client-safe duplicate of DEAL_STAGE_NUMBER from @dealerlink/db. The DB
 * package transitively imports `postgres` so we cannot pull its runtime
 * exports into client components. The values must stay in lockstep with
 * packages/db/src/deals/transitions.ts — there's a unit test in
 * tests/stage-meta.test.ts that asserts the two sources match.
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

/**
 * Per-role allowed drop targets, identical to dealAllowedTargets() in
 * the DB package. Sales sees forward only; admin sees forward + reverse.
 */
export function clientAllowedTargets(from: DealStage, role: ActorRole): DealStage[] {
  if (role === 'admin') return [...FORWARD[from], ...REVERSE[from]];
  return FORWARD[from];
}

export const STAGES: StageMeta[] = [
  { key: 'qualification', number: 1, name: 'Qualification', shortName: 'Qualification' },
  { key: 'needs_analysis', number: 2, name: 'Needs Analysis', shortName: 'Needs Analysis' },
  { key: 'quotation_sent', number: 3, name: 'Quotation Sent', shortName: 'Quotation Sent' },
  { key: 'negotiation', number: 4, name: 'Negotiation', shortName: 'Negotiation' },
  { key: 'verbal_commit', number: 5, name: 'Verbal Commit', shortName: 'Verbal Commit' },
  { key: 'po_pending', number: 6, name: 'PO Pending', shortName: 'PO Pending' },
  { key: 'payment_pending', number: 7, name: 'Payment Pending', shortName: 'Payment Pending' },
  {
    key: 'ready_for_dispatch',
    number: 8,
    name: 'Ready for Dispatch',
    shortName: 'Ready · Dispatch',
  },
  { key: 'closed', number: 9, name: 'Closed', shortName: 'Closed' },
];

export const STAGE_LABEL: Record<DealStage, string> = Object.fromEntries(
  STAGES.map((s) => [s.key, s.name]),
) as Record<DealStage, string>;

export function relativeDays(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / 86400_000);
  if (days <= 0) {
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 1) return 'now';
    return `${hours}h ago`;
  }
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
