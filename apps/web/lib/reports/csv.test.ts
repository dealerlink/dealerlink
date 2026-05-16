/**
 * Day 15 — CSV serialisation. Pure unit tests (no DB).
 *
 * Pins the RFC-4180 escaping rules and the Indian money / ISO date
 * formatting that `reportToCsv` must preserve.
 */
import { describe, expect, it } from 'vitest';

import { csvFilename, reportToCsv } from './csv';
import type { ReportResult } from './types';

function make(rows: ReportResult['rows'], totals: ReportResult['totals'] = null): ReportResult {
  return {
    columns: [
      { key: 'name', label: 'Dealer', type: 'text' },
      { key: 'note', label: 'Notes', type: 'text' },
      { key: 'qty', label: 'Qty', type: 'integer' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    rows,
    totals,
    metadata: {
      reportKey: 'sales-summary',
      reportName: 'Sales Summary',
      generatedAt: '2026-05-16T10:00:00.000Z',
      filterLabel: 'test',
      rowCount: rows.length,
    },
  };
}

describe('reportToCsv', () => {
  it('starts with a UTF-8 BOM and a header row', () => {
    const csv = reportToCsv(make([]));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe('Dealer,Notes,Qty,Amount,Date');
  });

  it('quotes fields containing a comma', () => {
    const csv = reportToCsv(
      make([{ name: 'Acme, Industries', note: 'ok', qty: 1, amount: 100, date: '2026-04-01' }]),
    );
    expect(csv).toContain('"Acme, Industries"');
  });

  it('doubles embedded quotes in product/dealer names', () => {
    const csv = reportToCsv(
      make([{ name: 'The "Best" Co', note: 'x', qty: 1, amount: 0, date: '2026-04-01' }]),
    );
    expect(csv).toContain('"The ""Best"" Co"');
  });

  it('quotes fields containing a newline', () => {
    const csv = reportToCsv(
      make([{ name: 'A', note: 'line one\nline two', qty: 1, amount: 0, date: '2026-04-01' }]),
    );
    expect(csv).toContain('"line one\nline two"');
  });

  it('formats money with Indian grouping and two decimals', () => {
    const csv = reportToCsv(
      make([{ name: 'A', note: 'x', qty: 1, amount: 127200, date: '2026-04-01' }]),
    );
    // 1,27,200.00 contains a comma → quoted.
    expect(csv).toContain('"1,27,200.00"');
  });

  it('emits ISO dates and rounds integers', () => {
    const csv = reportToCsv(
      make([{ name: 'A', note: 'x', qty: 3.7, amount: 0, date: '2026-04-01T00:00:00Z' }]),
    );
    const dataLine = csv.split('\r\n')[1]!;
    expect(dataLine).toContain('2026-04-01');
    expect(dataLine.split(',')).toContain('4');
  });

  it('renders null cells as empty', () => {
    const csv = reportToCsv(
      make([{ name: null, note: null, qty: null, amount: null, date: null }]),
    );
    expect(csv.split('\r\n')[1]).toBe(',,,,');
  });

  it('appends the totals row last', () => {
    const csv = reportToCsv(
      make([{ name: 'A', note: 'x', qty: 1, amount: 50, date: '2026-04-01' }], {
        name: 'Total',
        note: null,
        qty: 1,
        amount: 50,
        date: null,
      }),
    );
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[lines.length - 1]).toContain('Total');
  });
});

describe('csvFilename', () => {
  it('builds {report}-{slug}-{token}.csv and strips unsafe chars', () => {
    expect(csvFilename(make([]), 'demo', '2026-Q1')).toBe('sales-summary-demo-2026-Q1.csv');
    expect(csvFilename(make([]), 'demo')).toBe('sales-summary-demo-2026-05-16.csv');
  });
});
