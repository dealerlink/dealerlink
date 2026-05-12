'use client';

import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

import { ColumnHeader } from './column-header';
import type { StageMeta } from './stage-meta';

interface DroppableColumnProps {
  stage: StageMeta;
  count: number;
  totalValue: number;
  /** True when a drag is in progress; used to highlight valid drop targets. */
  highlight?: 'valid' | 'invalid' | 'none';
  children: ReactNode;
}

export function DroppableColumn({
  stage,
  count,
  totalValue,
  highlight = 'none',
  children,
}: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.key}` });

  const ring =
    highlight === 'valid'
      ? isOver
        ? 'ring-2 ring-emerald-500/60'
        : 'ring-1 ring-emerald-400/30'
      : highlight === 'invalid'
        ? 'ring-1 ring-line/40 opacity-60'
        : '';

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      data-stage={stage.key}
      className={`border-line bg-paper flex w-[280px] shrink-0 flex-col rounded-[6px] border transition-shadow ${ring}`}
    >
      <ColumnHeader stage={stage} count={count} totalValue={totalValue} />
      <div className="flex min-h-[200px] flex-1 flex-col gap-2 p-2">{children}</div>
    </section>
  );
}
