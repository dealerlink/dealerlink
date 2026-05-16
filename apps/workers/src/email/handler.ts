/**
 * pg-boss `send-email` job handler.
 *
 * The job carries only `{ tenantId, emailLogId }`. This handler re-loads the
 * `email_delivery_log` row (never trusts a stale snapshot), renders any PDF
 * attachments from `generated_documents`, calls Resend, and writes the
 * delivery state back onto the same row.
 *
 * Retry policy: a `RATE_LIMITED` (transient) failure re-throws so pg-boss
 * retries it (retryLimit=5, retryBackoff=true configured at enqueue time).
 * Permanent failures (bad address, bad key, blocked domain) mark the row
 * `failed` and return normally — no point retrying.
 *
 * Idempotency: a row already in a terminal/sent state is skipped, so a
 * duplicate or replayed job never double-sends. An `emailLogId` that does
 * not resolve (e.g. the enqueueing transaction rolled back) is a no-op.
 */
import { adminDb, emailDeliveryLog, generatedDocuments } from '@dealerlink/db';
import { emailLogMetaSchema, type EmailJobPayload } from '@dealerlink/schemas';
import { and, eq } from 'drizzle-orm';

import {
  EmailSendError,
  sendEmail as defaultSendEmail,
  type EmailAttachment,
  type SendEmailFn,
} from './resend-client';

/** Statuses from which a send must NOT be re-attempted. */
const TERMINAL_STATUSES = new Set(['sent', 'delivered', 'bounced', 'complained', 'failed']);

export interface SendEmailJobResult {
  status: 'sent' | 'failed' | 'skipped';
  emailLogId: string;
  reason?: string;
  providerMessageId?: string;
}

/** Load + base64-decode the inline PDF for each generated_documents id. */
async function loadAttachments(
  tenantId: string | null,
  documentIds: string[],
): Promise<EmailAttachment[]> {
  if (!tenantId || documentIds.length === 0) return [];
  const attachments: EmailAttachment[] = [];
  for (const docId of documentIds) {
    const [doc] = await adminDb
      .select()
      .from(generatedDocuments)
      .where(and(eq(generatedDocuments.tenantId, tenantId), eq(generatedDocuments.id, docId)))
      .limit(1);
    if (!doc) continue; // Document purged or never generated — send without it.
    if (doc.storage !== 'inline') continue; // Spaces fetch is a Stage D activation.
    attachments.push({
      filename: doc.filename,
      content: Buffer.from(doc.storageRef, 'base64'),
      contentType: doc.mimeType,
    });
  }
  return attachments;
}

/**
 * Core send routine — exported so tests can drive it directly with a mock
 * Resend client. `handleSendEmailJob` is the pg-boss adapter.
 */
export async function runSendEmail(
  payload: EmailJobPayload,
  sendFn: SendEmailFn = defaultSendEmail,
): Promise<SendEmailJobResult> {
  const { emailLogId } = payload;

  const [row] = await adminDb
    .select()
    .from(emailDeliveryLog)
    .where(eq(emailDeliveryLog.id, emailLogId))
    .limit(1);

  if (!row) {
    // The enqueueing transaction likely rolled back. Nothing to do.
    return { status: 'skipped', emailLogId, reason: 'log_row_not_found' };
  }
  if (row.tenantId !== payload.tenantId) {
    await adminDb
      .update(emailDeliveryLog)
      .set({ status: 'failed', errorMessage: 'Job tenant does not match the log row' })
      .where(eq(emailDeliveryLog.id, emailLogId));
    return { status: 'failed', emailLogId, reason: 'tenant_mismatch' };
  }
  if (TERMINAL_STATUSES.has(row.status)) {
    // Duplicate / replayed job — never double-send.
    return { status: 'skipped', emailLogId, reason: `already_${row.status}` };
  }

  const metaParsed = emailLogMetaSchema.safeParse(row.meta ?? {});
  if (!metaParsed.success) {
    await adminDb
      .update(emailDeliveryLog)
      .set({ status: 'failed', errorMessage: `Malformed email meta: ${metaParsed.error.message}` })
      .where(eq(emailDeliveryLog.id, emailLogId));
    return { status: 'failed', emailLogId, reason: 'bad_meta' };
  }
  const meta = metaParsed.data;

  await adminDb
    .update(emailDeliveryLog)
    .set({ status: 'sending' })
    .where(eq(emailDeliveryLog.id, emailLogId));

  const from =
    meta.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? 'Dealerlink <onboarding@resend.dev>';

  try {
    const attachments = await loadAttachments(row.tenantId, meta.attachmentDocumentIds ?? []);
    const result = await sendFn({
      tenantId: row.tenantId,
      to: row.recipient,
      from,
      subject: row.subject,
      html: meta.html,
      ...(meta.text ? { text: meta.text } : {}),
      attachments,
    });
    // Drop the rendered body from `meta` once sent: it is single-use (welcome
    // emails carry a temporary password) and would otherwise bloat the 90-day
    // log table (R.3). Non-body keys (attachment ids, etc.) are kept.
    const { html: _html, text: _text, ...slimMeta } = (row.meta ?? {}) as Record<string, unknown>;
    void _html;
    void _text;
    await adminDb
      .update(emailDeliveryLog)
      .set({
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
        errorMessage: null,
        meta: slimMeta,
      })
      .where(eq(emailDeliveryLog.id, emailLogId));
    return { status: 'sent', emailLogId, providerMessageId: result.providerMessageId };
  } catch (err) {
    if (err instanceof EmailSendError && err.retryable) {
      // Transient — leave the row visibly pending and re-throw so pg-boss
      // retries with exponential backoff.
      await adminDb
        .update(emailDeliveryLog)
        .set({ status: 'queued', errorMessage: `retrying — ${err.message}` })
        .where(eq(emailDeliveryLog.id, emailLogId));
      throw err;
    }
    // Permanent failure — record and stop.
    const message = err instanceof Error ? err.message : String(err);
    await adminDb
      .update(emailDeliveryLog)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(emailDeliveryLog.id, emailLogId));
    return { status: 'failed', emailLogId, reason: 'send_failed' };
  }
}

/** pg-boss work handler — receives a batch of jobs (batchSize 1 → one job). */
export async function handleSendEmailJob(jobs: { data: EmailJobPayload }[]): Promise<void> {
  for (const job of jobs) {
    await runSendEmail(job.data);
  }
}
