import Link from 'next/link';

import { formatINR } from '@/lib/format';
import type { PipelineMetrics } from '@/lib/queries/deals';

import { STAGES } from '../pipeline/stage-meta';

export function PipelineKpiRow({ metrics }: { metrics: PipelineMetrics }) {
  return (
    <div className="mt-8 grid grid-cols-4 gap-3">
      <Kpi label="Pipeline value" value={formatINR(metrics.totalValue)} accent="indigo" mono />
      <Kpi label="Open deals" value={metrics.total.toLocaleString('en-IN')} accent="emerald" mono />
      <Kpi label="Hot deals" value={metrics.hotCount.toLocaleString('en-IN')} accent="rose" mono />
      <Kpi
        label="Stalled (14d+)"
        value={metrics.stalledCount.toLocaleString('en-IN')}
        accent="amber"
        mono
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent: 'emerald' | 'amber' | 'indigo' | 'rose' | 'mute';
  mono?: boolean;
}) {
  const dotColor = {
    emerald: '#10B981',
    amber: '#F59E0B',
    indigo: '#4F46E5',
    rose: '#B91C1C',
    mute: '#9CA3AF',
  }[accent];
  return (
    <div className="border-line rounded-[6px] border bg-white p-4">
      <div className="text-mute mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.05em]">
        <span
          className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full"
          style={{ background: dotColor }}
        />
        {label}
      </div>
      <div className={`${mono ? 'mono' : ''} text-[24px] font-semibold tracking-tight`}>
        {value}
      </div>
    </div>
  );
}

export function PipelineFunnel({ metrics }: { metrics: PipelineMetrics }) {
  // Show only the 8 open stages in the funnel (skip 'closed' which is terminal).
  const openStages = metrics.byStage.filter((s) => s.stage !== 'closed');
  const max = openStages.reduce((m, s) => Math.max(m, s.count), 0) || 1;

  return (
    <section className="border-line mt-6 rounded-[6px] border bg-white p-5">
      <div className="titlecaps text-mute mb-3 flex items-center justify-between">
        <span>Stage funnel</span>
        <Link href="/pipeline" className="text-accent text-[11px] hover:underline">
          Open pipeline →
        </Link>
      </div>
      {metrics.total === 0 ? (
        <div className="text-mute editorial text-[12.5px] italic">
          No open deals yet — start one from the Pipeline page.
        </div>
      ) : (
        <ol className="space-y-2">
          {openStages.map((s) => {
            const stage = STAGES.find((x) => x.key === s.stage)!;
            const widthPct = Math.max(2, Math.round((s.count / max) * 100));
            return (
              <li key={s.stage} className="grid grid-cols-[160px_1fr_110px] items-center gap-3">
                <div className="text-ink text-[12.5px]">
                  <span className="mono text-mute mr-2 text-[10px]">
                    {String(stage.number).padStart(2, '0')}
                  </span>
                  {stage.shortName}
                </div>
                <div className="bg-paper-2 relative h-[18px] overflow-hidden rounded-[3px]">
                  <div className="bg-ink h-full" style={{ width: `${widthPct}%` }} aria-hidden />
                </div>
                <div className="mono text-mute text-right text-[12px]">
                  <span className="text-ink">{s.count}</span>
                  {' · '}
                  {s.value > 0 ? formatINR(s.value) : '—'}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function PipelineHotStalled({ metrics }: { metrics: PipelineMetrics }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4">
      <section className="border-line rounded-[6px] border bg-white p-5">
        <div className="titlecaps text-mute mb-3 flex items-center justify-between">
          <span>Hot deals</span>
          <span className="mono text-mute text-[11px]">{metrics.hotCount}</span>
        </div>
        {metrics.hotSample.length === 0 ? (
          <div className="text-mute text-[12.5px]">No hot deals.</div>
        ) : (
          <ul className="space-y-2">
            {metrics.hotSample.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-[13px]">
                <Link
                  href={`/pipeline/${d.id}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  <span className="text-rose-700">●</span> {d.title}
                  <div className="text-mute truncate text-[11px]">{d.dealerName}</div>
                </Link>
                <span className="mono shrink-0 text-[12px]">
                  {d.estimatedValue != null ? formatINR(d.estimatedValue) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="border-line rounded-[6px] border bg-white p-5">
        <div className="titlecaps text-mute mb-3 flex items-center justify-between">
          <span>Stalled deals</span>
          <span className="mono text-mute text-[11px]">{metrics.stalledCount}</span>
        </div>
        {metrics.stalledSample.length === 0 ? (
          <div className="text-mute text-[12.5px]">Nothing stalled. Nice.</div>
        ) : (
          <ul className="space-y-2">
            {metrics.stalledSample.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-[13px]">
                <Link
                  href={`/pipeline/${d.id}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {d.title}
                  <div className="text-mute truncate text-[11px]">{d.dealerName}</div>
                </Link>
                <div className="shrink-0 text-right">
                  <div className="mono text-[12px]">
                    {d.estimatedValue != null ? formatINR(d.estimatedValue) : '—'}
                  </div>
                  <div className="mono text-mute text-[11px]">{d.daysSinceActivity}d idle</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
