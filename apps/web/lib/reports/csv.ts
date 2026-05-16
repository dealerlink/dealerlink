/**
 * Report → CSV. Pure function — no DB, no IO.
 *
 * Formatting contract:
 *   - Money is rendered with Indian grouping and two decimals ("1,27,200.00").
 *   - Dates are ISO (2026-05-16) for portability across spreadsheet locales.
 *   - Any field containing a comma, quote, CR or LF is wrapped in double
 *     quotes; embedded quotes are doubled (RFC 4180).
 *   - The output is prefixed with a UTF-8 BOM so Excel opens it cleanly.
 */
import type { ReportColumn, ReportResult, ReportRow } from './types';

const BOM = '﻿';

const moneyFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Render one cell as the raw (unquoted) CSV value. */
function cellValue(col: ReportColumn, raw: ReportRow[string]): string {
  if (raw === null || raw === undefined || raw === '') return '';
  switch (col.type) {
    case 'money':
      return moneyFmt.format(Number(raw));
    case 'integer':
      return String(Math.round(Number(raw)));
    case 'date':
      // Stored values are already ISO date strings; pass through.
      return String(raw).slice(0, 10);
    default:
      return String(raw);
  }
}

/** Quote a field iff it contains a comma, quote, or line break. */
function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toLine(values: string[]): string {
  return values.map(escapeField).join(',');
}

/** Serialise a `ReportResult` (header + data rows + totals row) to a CSV string. */
export function reportToCsv(result: ReportResult): string {
  const lines: string[] = [];
  lines.push(toLine(result.columns.map((c) => c.label)));
  for (const row of result.rows) {
    lines.push(toLine(result.columns.map((c) => cellValue(c, row[c.key] ?? null))));
  }
  if (result.totals) {
    lines.push(toLine(result.columns.map((c) => cellValue(c, result.totals![c.key] ?? null))));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Build a download filename: `{report-key}-{tenant-slug}-{token}.csv`.
 * `token` is a caller-supplied period label (e.g. `2026-Q1`), defaulting to
 * the generation date.
 */
export function csvFilename(result: ReportResult, tenantSlug: string, token?: string): string {
  const tail = (token ?? result.metadata.generatedAt.slice(0, 10)).replace(/[^A-Za-z0-9-]/g, '');
  return `${result.metadata.reportKey}-${tenantSlug}-${tail}.csv`;
}
