import 'server-only';

import { emailDeliveryLog, type DrizzleTx } from '@dealerlink/db';
import { enqueueEmailJob } from '@/lib/queue/client';

/**
 * Async-first outbound email (Day 14, closes R.13).
 *
 * `queueEmail` is the ONLY way the web app sends mail. It does NOT talk to
 * Resend — the Day 4 inline `sendEmail` helper is gone. Instead it:
 *
 *   1. inserts an `email_delivery_log` row with `status='queued'`, stashing
 *      the rendered HTML / text / attachment ids in `meta`;
 *   2. enqueues a pg-boss `send-email` job carrying just the row id.
 *
 * The workers process picks the job up, calls Resend, and flips the row to
 * `sent` / `failed`. The caller does NOT await delivery — it returns as soon
 * as the job is queued (R.13: email is async). The UI shows "queued".
 *
 * Call this inside an existing tenant/operator action transaction (`tx`) so
 * the log row is written under the right RLS + audit context.
 */
export interface QueueEmailInput {
  /** Owning tenant, or null for platform mail (operator welcome). */
  tenantId: string | null;
  to: string;
  subject: string;
  /** Rendered HTML body — required. */
  html: string;
  /** Optional plain-text alternative. */
  text?: string;
  /** Template marker for log filtering (e.g. 'quotation-pdf'). */
  template?: string;
  /** Overrides the default Resend From address. */
  fromEmail?: string;
  /** generated_documents row ids — the worker attaches each as a PDF. */
  attachmentDocumentIds?: string[];
  /** Extra non-body metadata to retain on the log row for traceability. */
  extraMeta?: Record<string, unknown>;
}

export interface QueueEmailResult {
  emailLogId: string;
}

export async function queueEmail(tx: DrizzleTx, input: QueueEmailInput): Promise<QueueEmailResult> {
  const meta: Record<string, unknown> = {
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    ...(input.fromEmail ? { fromEmail: input.fromEmail } : {}),
    ...(input.attachmentDocumentIds && input.attachmentDocumentIds.length > 0
      ? { attachmentDocumentIds: input.attachmentDocumentIds }
      : {}),
    ...(input.extraMeta ?? {}),
  };

  const [row] = await tx
    .insert(emailDeliveryLog)
    .values({
      tenantId: input.tenantId,
      recipient: input.to,
      subject: input.subject,
      template: input.template ?? null,
      status: 'queued',
      meta,
    })
    .returning({ id: emailDeliveryLog.id });
  if (!row) throw new Error('Failed to record the email in email_delivery_log');

  // Enqueue the send. If the surrounding transaction later rolls back the
  // log row vanishes; the worker treats a missing row as a no-op, so the
  // orphaned job is harmless.
  await enqueueEmailJob({ tenantId: input.tenantId, emailLogId: row.id });

  return { emailLogId: row.id };
}
