import type { DealDetail } from '@/lib/queries/deals';

import { STAGE_LABEL } from '../stage-meta';

export function DealStageHistorySection({ history }: { history: DealDetail['history'] }) {
  return (
    <section className="border-line mt-6 rounded-[6px] border bg-white">
      <header className="border-line flex items-center justify-between border-b px-5 py-3">
        <div className="titlecaps text-mute">Stage history</div>
        <div className="mono text-mute text-[11px]">{history.length} entries</div>
      </header>
      {history.length === 0 ? (
        <div className="text-mute px-5 py-8 text-center text-[12.5px]">No transitions yet.</div>
      ) : (
        <ol className="divide-line divide-y">
          {history.map((h) => (
            <li
              key={h.id}
              className="grid grid-cols-[140px_1fr_auto] gap-4 px-5 py-3 text-[12.5px]"
            >
              <div className="mono text-mute">
                {h.transitionedAt.toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div>
                <div className="text-ink">
                  {h.fromStage ? STAGE_LABEL[h.fromStage] : 'Created'} → {STAGE_LABEL[h.toStage]}
                  {h.toStatus !== 'open' && (
                    <span className={h.toStatus === 'won' ? 'text-emerald-700' : 'text-rose-700'}>
                      {' '}
                      · {h.toStatus.toUpperCase()}
                    </span>
                  )}
                </div>
                {h.reason && (
                  <div className="text-mute mt-0.5 text-[11.5px]">
                    {h.overridden && <span className="text-rose-700">Override:</span>} {h.reason}
                  </div>
                )}
              </div>
              <div className="text-mute text-right text-[11.5px]">
                {h.automatic ? <span className="italic">auto</span> : (h.actorName ?? '—')}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
