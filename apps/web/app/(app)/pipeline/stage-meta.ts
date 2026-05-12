import type { DealStage } from '@dealerlink/db';

export interface StageMeta {
  key: DealStage;
  number: number;
  name: string;
  shortName: string;
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
