'use client';

import Link from 'next/link';

import { formatINR } from '@/lib/format';

import { relativeDays } from './stage-meta';

export interface DealCardData {
  id: string;
  dealCode: string;
  title: string;
  estimatedValue: number | null;
  hot: boolean;
  lastActivityAt: Date;
  dealer: {
    id: string;
    name: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
  assignee: {
    initials: string;
    fullName: string;
  };
}

interface DealCardProps {
  card: DealCardData;
  /** When true, the card is being dragged — slight tilt + shadow. */
  dragging?: boolean;
  /** When true, render as a static overlay (no Link). */
  asOverlay?: boolean;
}

export function DealCard({ card, dragging = false, asOverlay = false }: DealCardProps) {
  const riskTone =
    card.dealer.riskLevel === 'high'
      ? '#B91C1C'
      : card.dealer.riskLevel === 'medium'
        ? '#B45309'
        : '#047857';

  const inner = (
    <div
      className={`border-line rounded-[5px] border bg-white px-3 py-2 ${
        dragging ? 'ring-ink/10 rotate-[0.5deg] shadow-md ring-1' : 'hover:bg-paper-2'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mono text-mute mb-1 flex items-center gap-1 text-[10.5px]">
            <span>{card.dealCode}</span>
            {card.hot && <span className="text-rose-700">●</span>}
          </div>
          <div className="text-ink truncate text-[12.5px] font-medium leading-tight">
            {card.title}
          </div>
        </div>
        <span
          title={card.assignee.fullName}
          className="border-line text-mute bg-tile mono inline-flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full border px-1 text-[10px]"
        >
          {card.assignee.initials}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full"
            style={{ background: riskTone }}
          />
          <span className="text-mute truncate text-[11px]">{card.dealer.name}</span>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-ink text-[11.5px]">
            {card.estimatedValue != null ? formatINR(card.estimatedValue) : '—'}
          </div>
          <div className="mono text-mute text-[10px]">{relativeDays(card.lastActivityAt)}</div>
        </div>
      </div>
    </div>
  );

  if (asOverlay) return inner;
  return (
    <Link href={`/pipeline/${card.id}`} className="block focus:outline-none">
      {inner}
    </Link>
  );
}
