import 'server-only';

import { adminDb, emailDeliveryLog } from '@dealerlink/db';
import { and, eq, sql } from 'drizzle-orm';

import { renderTenantWelcome } from './templates/tenant-welcome';
import { sendEmail } from './send';

const MAX_ATTEMPTS = 3;

/**
 * Render-and-send pending `email_delivery_log` rows.
 *
 * Used as the "worker pulse" until pg-boss is bootstrapped in Day 5. The
 * operator-app tenant detail page calls this after a successful
 * `createTenant()` so the welcome email is dispatched within the same
 * request cycle (good enough for Phase 1 onboarding volumes; pg-boss takes
 * over once we have multiple email types).
 *
 * Uses `adminDb` because:
 *   - It needs to read rows whose `tenant_id` may be NULL (platform mail)
 *   - It needs to write `sent` / `failed` status regardless of caller
 *     tenant context (operator may be on /admin with no tenant)
 *
 * Tenant scoping is enforced by the caller passing a `tenantId` filter
 * — admins of one tenant can never trigger dispatch for another.
 */
export async function dispatchPendingEmails(filter?: { tenantId?: string }): Promise<{
  attempted: number;
  sent: number;
  failed: number;
}> {
  const where = filter?.tenantId
    ? and(eq(emailDeliveryLog.status, 'queued'), eq(emailDeliveryLog.tenantId, filter.tenantId))
    : eq(emailDeliveryLog.status, 'queued');

  const pending = await adminDb.select().from(emailDeliveryLog).where(where).limit(20);

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    if (row.template !== 'tenant-welcome') {
      // Unknown template — mark failed so the operator can investigate.
      await adminDb
        .update(emailDeliveryLog)
        .set({
          status: 'failed',
          errorMessage: `Unknown template "${row.template ?? '(null)'}"`,
        })
        .where(eq(emailDeliveryLog.id, row.id));
      failed++;
      continue;
    }

    const meta = (row.meta ?? {}) as Record<string, string>;
    const rendered = renderTenantWelcome({
      tenantDisplayName: meta.tenantDisplayName ?? '',
      adminFullName: meta.adminFullName ?? '',
      adminEmail: row.recipient,
      loginUrl: meta.loginUrl ?? '',
      temporaryPassword: meta.temporaryPassword ?? '',
    });

    const result = await sendEmail({
      to: row.recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tag: row.template,
    });

    if (result.ok && result.providerMessageId) {
      // Strip the temporary password from meta after dispatch — it's
      // single-use and shouldn't linger in the queue table.
      const cleanedMeta = { ...meta };
      delete cleanedMeta.temporaryPassword;
      await adminDb
        .update(emailDeliveryLog)
        .set({
          status: 'sent',
          providerMessageId: result.providerMessageId,
          sentAt: sql`now()`,
          meta: cleanedMeta,
        })
        .where(eq(emailDeliveryLog.id, row.id));
      sent++;
    } else {
      // Crude retry: bump a counter in meta; mark failed at MAX_ATTEMPTS.
      const attempts = Number(meta.attempts ?? 0) + 1;
      const willGiveUp = attempts >= MAX_ATTEMPTS;
      await adminDb
        .update(emailDeliveryLog)
        .set({
          status: willGiveUp ? 'failed' : 'queued',
          errorMessage: result.error ?? 'unknown send failure',
          meta: { ...meta, attempts },
        })
        .where(eq(emailDeliveryLog.id, row.id));
      failed++;
    }
  }

  return { attempted: pending.length, sent, failed };
}
