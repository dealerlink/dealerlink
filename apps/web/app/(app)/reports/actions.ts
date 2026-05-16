'use server';

import { tenants, withTenant } from '@dealerlink/db';
import { eq } from 'drizzle-orm';

import { getAuthContext } from '@/lib/auth/session';
import {
  canAccessReport,
  csvFilename,
  reportPeriodToken,
  reportToCsv,
  runReport,
  type ReportKey,
  type ReportParams,
} from '@/lib/reports';
import { impersonationTenantId } from '@/lib/tenant/context';

export type CsvExportResult =
  | { ok: true; csv: string; filename: string }
  | { ok: false; error: string };

/**
 * Generate a report CSV server-side. The whole query + serialisation runs on
 * the server (the guardrail: never ship the dataset to the client to convert
 * in JS); the client only receives the finished string to save as a file.
 *
 * Role enforcement here is the security boundary — `canAccessReport` is the
 * same gate the report pages use. A role hitting an export it cannot see gets
 * a flat refusal.
 */
export async function exportReportCsv(
  report: ReportKey,
  params: ReportParams,
): Promise<CsvExportResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: 'Your session has expired. Sign in and try again.' };
  if (!canAccessReport(ctx.user.role, report)) {
    return { ok: false, error: 'You do not have access to this report.' };
  }
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) return { ok: false, error: 'No tenant context for this export.' };

  const [result, slug] = await Promise.all([
    runReport(tenantId, report, params),
    withTenant(tenantId, async (tx) => {
      const [t] = await tx
        .select({ slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return t?.slug ?? 'tenant';
    }),
  ]);

  return {
    ok: true,
    csv: reportToCsv(result),
    filename: csvFilename(result, slug, reportPeriodToken(report, params)),
  };
}
