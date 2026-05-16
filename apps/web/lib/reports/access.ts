/**
 * Report access control. The security boundary is server-side (every report
 * page calls `assertReportAccess`); the UI hiding cards a role cannot use is
 * courtesy only.
 *
 * BRD §8 / Day 15 A3.2:
 *   - admin, accounts → all four reports
 *   - sales          → sales summary + outstanding receivables
 *   - dispatch       → inventory valuation
 * An operator impersonating a tenant is read-only but sees every report
 * (same surface as admin), consistent with the rest of the impersonation UX.
 */
import { notFound } from 'next/navigation';

import type { ReportKey } from './types';

export type ReportRole = 'admin' | 'sales' | 'accounts' | 'dispatch' | 'operator';

const ACCESS: Record<ReportRole, ReportKey[]> = {
  admin: ['sales-summary', 'outstanding', 'inventory-valuation', 'gst-summary'],
  accounts: ['sales-summary', 'outstanding', 'inventory-valuation', 'gst-summary'],
  operator: ['sales-summary', 'outstanding', 'inventory-valuation', 'gst-summary'],
  sales: ['sales-summary', 'outstanding'],
  dispatch: ['inventory-valuation'],
};

/** Reports the role may open. Returns a fresh array. */
export function reportsForRole(role: string): ReportKey[] {
  return [...(ACCESS[role as ReportRole] ?? [])];
}

/** True when `role` may open `report`. */
export function canAccessReport(role: string, report: ReportKey): boolean {
  return reportsForRole(role).includes(report);
}

/**
 * Server-side gate for a report page. Renders the 404 page when the role is
 * not entitled — a direct URL to `/reports/gst-summary` as a sales user is
 * indistinguishable from a non-existent route, leaking nothing.
 */
export function assertReportAccess(role: string, report: ReportKey): void {
  if (!canAccessReport(role, report)) notFound();
}

export const REPORT_TITLES: Record<ReportKey, string> = {
  'sales-summary': 'Sales Summary',
  outstanding: 'Outstanding Receivables',
  'inventory-valuation': 'Inventory Valuation',
  'gst-summary': 'GST Summary',
};

export const REPORT_DESCRIPTIONS: Record<ReportKey, string> = {
  'sales-summary':
    'Quotations, proforma invoices and orders rolled up by month, dealer or product.',
  outstanding: 'Unpaid and partially-paid orders aged into 30-day buckets against each dealer.',
  'inventory-valuation': 'In-stock serialised inventory valued at last procurement cost.',
  'gst-summary':
    'CGST / SGST / IGST on supplied orders, grouped by place of supply — the GSTR-1 base.',
};
