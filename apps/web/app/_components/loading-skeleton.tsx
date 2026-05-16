/**
 * Table-shaped loading skeleton. Defaults mirror a typical list grid so the
 * skeleton occupies the same footprint as the real table — no layout shift
 * when data arrives. Pass `columns` to match a specific page's column count.
 */
export function LoadingSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  const cols = Array.from({ length: columns });
  return (
    <div
      role="status"
      aria-label="Loading"
      className="border-line overflow-hidden rounded-[6px] border bg-white"
    >
      <div className="border-line bg-tile flex gap-4 border-b px-4 py-3">
        {cols.map((_, i) => (
          <div key={i} className="skel h-[10px] flex-1 rounded-[3px]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-line flex gap-4 border-b px-4 py-[15px] last:border-b-0">
          {cols.map((_, c) => (
            <div
              key={c}
              className="skel h-[12px] flex-1 rounded-[3px]"
              // First column reads like an identifier — slightly narrower.
              style={c === 0 ? { maxWidth: '40%' } : undefined}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
