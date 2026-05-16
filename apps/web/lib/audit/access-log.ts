import { accessLog, db } from '@dealerlink/db';
import { headers } from 'next/headers';

import { getAuthContext } from '@/lib/auth/session';
import { logger } from '@/lib/observability/logger';

export type AccessAction = 'view' | 'export' | 'download' | 'operator_impersonation_view';

/**
 * Record a sensitive-route observation. Per docs/LOGGING.md, this fires on
 * dealer detail views, payment views, CSV/Excel exports, and dispatch opens.
 *
 * Inserts directly via the app DB connection — RLS allows tenant_isolation
 * INSERTs against the tenant we're writing for, because we set
 * `app.tenant_id` inside the transaction. The transaction also keeps the
 * write from leaking into the global pool state.
 *
 * Soft-fail: any error is swallowed and reported to stderr. Access logging
 * must never break the user-facing request.
 */
export async function recordAccess(
  entityType: string,
  entityId: string | null,
  action: AccessAction = 'view',
): Promise<void> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return;
    if (!ctx.user.tenantId && action !== 'operator_impersonation_view') {
      // Operators outside an impersonation context do not touch tenant data.
      return;
    }

    const h = headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
    const userAgent = h.get('user-agent') ?? null;

    // tenant_id is whichever scope the action targets. For tenant users it's
    // their own; for operator impersonation it's the impersonated tenant
    // (read from the impersonation cookie in the caller and passed in via
    // entityType convention — Day 6 work).
    const tenantId = ctx.user.tenantId;
    if (!tenantId) return;

    await db.insert(accessLog).values({
      tenantId,
      userId: ctx.user.id,
      entityType,
      entityId,
      action,
      ip,
      userAgent,
    });
  } catch (err) {
    logger.error({ entityType, entityId, action, err }, 'access-log: failed to record');
  }
}
