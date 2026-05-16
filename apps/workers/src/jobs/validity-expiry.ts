/**
 * `validity-expiry` — daily sweep that expires stale quotations and PIs.
 *
 * A quotation or performa invoice that was sent to the buyer but never acted
 * on becomes stale once its `valid_until` date passes. This job moves any
 * such document still in `sent` status to `expired`.
 *
 * Scheduled at 02:00 IST (see src/index.ts). It is a plain batch UPDATE, so
 * a skipped run (worker down) self-heals — the next run catches every
 * document whose validity has since lapsed. Idempotent: a second run the
 * same day matches nothing.
 *
 * Runs as the BYPASSRLS workers role across all tenants in one statement;
 * the per-row audit trigger on `quotations` / `performa_invoices` records
 * each expiry (system-attributed — no acting user).
 */
import { adminDb, performaInvoices, quotations } from '@dealerlink/db';
import { and, eq, lt } from 'drizzle-orm';

import { logger } from '../observability/logger';

export interface ValidityExpiryResult {
  asOf: string;
  quotationsExpired: number;
  pisExpired: number;
  /** Per-tenant breakdown — logged so a spike is visible per run. */
  perTenant: Record<string, { quotations: number; pis: number }>;
}

function tally(
  perTenant: Record<string, { quotations: number; pis: number }>,
  tenantId: string,
  kind: 'quotations' | 'pis',
): void {
  const entry = (perTenant[tenantId] ??= { quotations: 0, pis: 0 });
  entry[kind] += 1;
}

export async function runValidityExpiry(asOf: Date = new Date()): Promise<ValidityExpiryResult> {
  const today = asOf.toISOString().slice(0, 10);
  const perTenant: Record<string, { quotations: number; pis: number }> = {};

  // Quotations: sent + valid_until strictly before today → expired.
  const expiredQuotes = await adminDb
    .update(quotations)
    .set({ status: 'expired', updatedAt: asOf })
    .where(and(eq(quotations.status, 'sent'), lt(quotations.validUntil, today)))
    .returning({ tenantId: quotations.tenantId });
  for (const q of expiredQuotes) tally(perTenant, q.tenantId, 'quotations');

  // Performa invoices: same rule.
  const expiredPis = await adminDb
    .update(performaInvoices)
    .set({ status: 'expired', updatedAt: asOf })
    .where(and(eq(performaInvoices.status, 'sent'), lt(performaInvoices.validUntil, today)))
    .returning({ tenantId: performaInvoices.tenantId });
  for (const p of expiredPis) tally(perTenant, p.tenantId, 'pis');

  const result: ValidityExpiryResult = {
    asOf: today,
    quotationsExpired: expiredQuotes.length,
    pisExpired: expiredPis.length,
    perTenant,
  };
  logger.info({ job: 'validity-expiry', date: today, ...result }, 'validity-expiry sweep complete');
  return result;
}
