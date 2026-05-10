import * as React from 'react';

import { cn } from '@/lib/utils';

/** Six status states per CLAUDE.md §5 design system */
type StatusTone = 'em' | 'am' | 'ro' | 'in' | 'mu' | 'ink';

const DOT_COLOR: Record<StatusTone, string> = {
  em: '#10B981', // emerald
  am: '#F59E0B', // amber
  ro: '#EF4444', // rose
  in: '#4F46E5', // indigo
  mu: '#9CA3AF', // muted grey
  ink: '#0B0F1A', // ink (for dark pills)
};

const PILL_STYLE: Record<StatusTone, string> = {
  em: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]',
  am: 'border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]',
  ro: 'border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]',
  in: 'border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]',
  mu: 'border-[#E5E7EB] bg-[#F3F4F6] text-[#4B5563]',
  ink: 'border-ink bg-ink text-white',
};

interface StatusPillProps {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}

/**
 * StatusPill — status chip with a coloured dot prefix.
 *
 * Per CLAUDE.md §5: "Status dots before chip text: `<span class="dot s-em"/> Active`"
 * Six states: em (emerald), am (amber), ro (rose), in (indigo), mu (muted), ink.
 *
 * @example
 *   <StatusPill tone="em">Active</StatusPill>
 *   <StatusPill tone="am">Credit Hold</StatusPill>
 *   <StatusPill tone="ro">Blacklisted</StatusPill>
 */
export function StatusPill({ tone, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[20px] items-center gap-[6px] rounded-[4px] border px-2 text-[11px] font-medium',
        PILL_STYLE[tone],
        className,
      )}
    >
      <span className="dot flex-shrink-0" style={{ background: DOT_COLOR[tone] }} />
      {children}
    </span>
  );
}

export type { StatusTone };
