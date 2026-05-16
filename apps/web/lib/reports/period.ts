/**
 * Date-period helpers for reports. Phase 1 is hard-wired to the Indian fiscal
 * year (Apr 1 – Mar 31) per locked decision #4 — `tenant_settings.fiscal_year_start`
 * exists for Phase 2 but is read as the constant April here.
 */

/** ISO date (YYYY-MM-DD) in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fiscal year that a calendar date falls into. FY 2026 runs Apr 2026 – Mar
 * 2027, so Jan–Mar dates belong to the *previous* calendar year's FY.
 */
export function fiscalYearOf(date = new Date()): number {
  const y = date.getUTCFullYear();
  // getUTCMonth: Jan = 0, Apr = 3.
  return date.getUTCMonth() < 3 ? y - 1 : y;
}

/** `{ from, to }` ISO dates spanning a fiscal year. */
export function fiscalYearRange(fy: number): { from: string; to: string } {
  return { from: `${fy}-04-01`, to: `${fy + 1}-03-31` };
}

export type FiscalQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

/** Fiscal-quarter labels: Q1 = Apr-Jun … Q4 = Jan-Mar. */
export const FISCAL_QUARTERS: { key: FiscalQuarter; label: string }[] = [
  { key: 'Q1', label: 'Q1 · Apr–Jun' },
  { key: 'Q2', label: 'Q2 · Jul–Sep' },
  { key: 'Q3', label: 'Q3 · Oct–Dec' },
  { key: 'Q4', label: 'Q4 · Jan–Mar' },
];

/** `{ from, to }` ISO dates for a fiscal quarter within fiscal year `fy`. */
export function fiscalQuarterRange(fy: number, q: FiscalQuarter): { from: string; to: string } {
  switch (q) {
    case 'Q1':
      return { from: `${fy}-04-01`, to: `${fy}-06-30` };
    case 'Q2':
      return { from: `${fy}-07-01`, to: `${fy}-09-30` };
    case 'Q3':
      return { from: `${fy}-10-01`, to: `${fy}-12-31` };
    case 'Q4':
      return { from: `${fy + 1}-01-01`, to: `${fy + 1}-03-31` };
  }
}

/** Fiscal quarter a calendar date falls into. */
export function fiscalQuarterOf(date = new Date()): FiscalQuarter {
  const m = date.getUTCMonth(); // 0-11
  if (m >= 3 && m <= 5) return 'Q1';
  if (m >= 6 && m <= 8) return 'Q2';
  if (m >= 9 && m <= 11) return 'Q3';
  return 'Q4';
}
