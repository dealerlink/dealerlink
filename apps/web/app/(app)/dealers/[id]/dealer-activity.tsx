import type { AuditEntry } from '@/lib/queries/audit';

function diffKeys(before: unknown, after: unknown): string[] {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  return Array.from(keys).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
}

export function DealerActivity({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="border-line mt-6 rounded-[6px] border bg-white p-4">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">Activity</h2>
        <p className="text-mute mt-2 text-[12.5px]">No audit entries yet.</p>
      </section>
    );
  }
  return (
    <section className="border-line mt-6 rounded-[6px] border bg-white">
      <header className="border-line border-b px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">
          Activity <span className="text-mute font-normal">({entries.length})</span>
        </h2>
      </header>
      <ul className="divide-line divide-y text-[12.5px]">
        {entries.map((e) => {
          const changed = e.action === 'update' ? diffKeys(e.before, e.after) : [];
          return (
            <li key={e.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="mono text-mute text-[11.5px]">
                  {e.changedAt.toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="text-ink font-medium">
                  {e.changedByName ?? e.changedByEmail ?? 'System'}
                </span>
                <span className="text-mute">{e.action}</span>
              </div>
              {changed.length > 0 && (
                <div className="text-mute mt-1 text-[11.5px]">
                  Changed: <span className="mono">{changed.join(', ')}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
