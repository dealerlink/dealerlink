'use client';

import { ColumnHeader } from './column-header';
import { DealCard, type DealCardData } from './deal-card';
import { STAGES, type StageMeta } from './stage-meta';

import type { DealStage } from '@dealerlink/db';

export interface PipelineBoardProps {
  initialByStage: Record<DealStage, DealCardData[]>;
  viewerRole: 'admin' | 'sales' | 'accounts' | 'dispatch';
  viewerId: string;
}

export function PipelineBoard({ initialByStage }: PipelineBoardProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {STAGES.map((stage) => (
        <Column key={stage.key} stage={stage} cards={initialByStage[stage.key] ?? []} />
      ))}
    </div>
  );
}

function Column({ stage, cards }: { stage: StageMeta; cards: DealCardData[] }) {
  const totalValue = cards.reduce((sum, c) => sum + (c.estimatedValue ?? 0), 0);
  return (
    <section
      aria-label={stage.name}
      className="border-line bg-paper flex w-[280px] shrink-0 flex-col rounded-[6px] border"
    >
      <ColumnHeader stage={stage} count={cards.length} totalValue={totalValue} />
      <div className="flex min-h-[200px] flex-1 flex-col gap-2 p-2">
        {cards.length === 0 ? (
          <div className="text-mute editorial flex h-full items-center justify-center text-[11.5px] italic">
            —
          </div>
        ) : (
          cards.map((card) => <DealCard key={card.id} card={card} />)
        )}
      </div>
    </section>
  );
}
