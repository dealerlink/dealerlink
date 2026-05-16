'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatDate, formatINRExact } from '@/lib/format';
import type { ReportColumn, ReportResult, ReportRow } from '@/lib/reports';

/** Format one cell for display. Null → em-dash. Money is exact INR. */
function renderCell(col: ReportColumn, value: ReportRow[string]): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (col.type) {
    case 'money':
      return formatINRExact(Number(value));
    case 'integer':
      return Number(value).toLocaleString('en-IN');
    case 'date':
      return formatDate(new Date(`${value}T00:00:00Z`));
    default:
      return String(value);
  }
}

const RIGHT_ALIGNED = new Set(['money', 'integer']);

/**
 * Renders a `ReportResult` as a sortable, sticky-header table. Reports are
 * grouped aggregates (≤ ~30 rows), so this stays a plain table — see
 * DEVIATIONS for why TanStack Table + virtualization is not pulled in.
 */
export function ReportTable({ result }: { result: ReportResult }) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return result.rows;
    const col = result.columns.find((c) => c.key === sort.key);
    const numeric = col ? RIGHT_ALIGNED.has(col.type) : false;
    return [...result.rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      let cmp: number;
      if (numeric) cmp = Number(av ?? 0) - Number(bv ?? 0);
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [result, sort]);

  const toggleSort = (key: string) => {
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: 'desc' };
      if (cur.dir === 'desc') return { key, dir: 'asc' };
      return null;
    });
  };

  if (result.rows.length === 0) {
    return (
      <div className="border-line mt-4 rounded-[6px] border bg-white px-6 py-16 text-center">
        <div className="text-ink text-[14px] font-medium">No data for these filters</div>
        <div className="text-mute mt-1 text-[12.5px]">
          Try broadening the date range or clearing a filter.
        </div>
      </div>
    );
  }

  return (
    <div className="border-line mt-4 overflow-auto rounded-[6px] border bg-white">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
            {result.columns.map((col) => {
              const right = RIGHT_ALIGNED.has(col.type);
              const active = sort?.key === col.key;
              const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 font-medium ${right ? 'text-right' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`hover:text-ink inline-flex items-center gap-1 uppercase tracking-[0.06em] ${
                      right ? 'flex-row-reverse' : ''
                    }`}
                    aria-label={`Sort by ${col.label}`}
                  >
                    {col.label}
                    <Icon size={11} className={active ? 'text-ink' : 'opacity-40'} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={i} className="border-line hover:bg-paper-2 border-b">
              {result.columns.map((col) => {
                const right = RIGHT_ALIGNED.has(col.type);
                return (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 ${right ? 'mono text-right' : ''} ${
                      col.type === 'date' ? 'mono' : ''
                    }`}
                  >
                    {renderCell(col, row[col.key] ?? null)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {result.totals && (
          <tfoot>
            <tr className="border-line bg-tile border-t-2 font-semibold">
              {result.columns.map((col) => {
                const right = RIGHT_ALIGNED.has(col.type);
                return (
                  <td key={col.key} className={`px-4 py-3 ${right ? 'mono text-right' : ''}`}>
                    {renderCell(col, result.totals![col.key] ?? null)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
