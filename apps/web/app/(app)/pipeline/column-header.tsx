import { formatINR } from '@/lib/format';

import type { StageMeta } from './stage-meta';

interface ColumnHeaderProps {
  stage: StageMeta;
  count: number;
  totalValue: number;
}

export function ColumnHeader({ stage, count, totalValue }: ColumnHeaderProps) {
  return (
    <div className="border-line bg-tile flex items-center justify-between border-b px-3 py-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="mono text-mute text-[10px]">{String(stage.number).padStart(2, '0')}</span>
        <span className="text-ink truncate text-[12px] font-medium">{stage.shortName}</span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="mono text-mute text-[11px]">{count}</span>
        <span className="mono text-ink text-[11px]">{count > 0 ? formatINR(totalValue) : '—'}</span>
      </div>
    </div>
  );
}
