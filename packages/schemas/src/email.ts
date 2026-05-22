import { z } from 'zod';

/**
 * Email + webhook contracts (Day 14).
 *
 * These Zod schemas are the shared boundary between:
 *   - the web process, which enqueues `send-email` jobs;
 *   - the workers process, which consumes them and calls Resend;
 *   - the webhook route, which validates inbound Resend delivery events.
 */

// ---------------------------------------------------------------------------
// pg-boss queue names — the single source of truth for both processes.
// ---------------------------------------------------------------------------
export const EMAIL_QUEUE = 'send-email';
export const RENDER_PDF_QUEUE = 'render-pdf';
export const VALIDITY_EXPIRY_QUEUE = 'validity-expiry';
export const PDF_CLEANUP_QUEUE = 'pdf-cleanup';

/** Every queue the system declares — created idempotently on boss startup. */
export const ALL_QUEUES = [
  EMAIL_QUEUE,
  RENDER_PDF_QUEUE,
  VALIDITY_EXPIRY_QUEUE,
  PDF_CLEANUP_QUEUE,
] as const;

// ---------------------------------------------------------------------------
// Outbound: the `send-email` job payload.
// ---------------------------------------------------------------------------
/**
 * The job carries only identifiers. The worker re-loads the
 * `email_delivery_log` row by id (never trusts a stale snapshot) — the row
 * holds the recipient, subject, rendered HTML, and attachment document ids
 * in its `meta`. This mirrors the render-pdf job's "re-load by id" rule and
 * keeps job data JSON-small.
 */
export const emailJobPayloadSchema = z.object({
  tenantId: z.string().uuid().nullable(),
  emailLogId: z.string().uuid(),
});
export type EmailJobPayload = z.infer<typeof emailJobPayloadSchema>;

// ---------------------------------------------------------------------------
// Outbound: the `render-pdf` job payload.
// ---------------------------------------------------------------------------
/**
 * The render job carries only identifiers — the worker re-loads the source
 * document by id (never trusts a stale snapshot) and writes a new
 * `generated_documents` row. Mirrors the email job's "re-load by id" rule.
 *
 * The web process enqueues this and then polls `generated_documents` for the
 * resulting row (DEV.63); the workers process consumes it via
 * `handleRenderPdfJob`.
 */
export const renderPdfJobPayloadSchema = z.object({
  documentType: z.enum(['quotation', 'performa_invoice', 'invoice', 'dispatch', 'payment_receipt']),
  documentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  /** Acting user id — written to generated_documents.generatedBy + audit. */
  userId: z.string().uuid().nullable(),
});
export type RenderPdfJobPayload = z.infer<typeof renderPdfJobPayloadSchema>;

/**
 * Shape of `email_delivery_log.meta` for a queued outbound email. `queueEmail`
 * writes this; the worker reads it to build the Resend request.
 */
export const emailLogMetaSchema = z.object({
  fromEmail: z.string().optional(),
  html: z.string(),
  text: z.string().optional(),
  /** generated_documents row ids — the worker decodes each to a PDF attachment. */
  attachmentDocumentIds: z.array(z.string().uuid()).optional(),
});
export type EmailLogMeta = z.infer<typeof emailLogMetaSchema>;

// ---------------------------------------------------------------------------
// Inbound: the Resend webhook payload.
// ---------------------------------------------------------------------------
export const RESEND_EVENT_TYPES = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.complained',
  'email.bounced',
  'email.opened',
  'email.clicked',
  'email.failed',
] as const;
export type ResendEventType = (typeof RESEND_EVENT_TYPES)[number];

/**
 * Resend wraps every webhook in `{ type, created_at, data }`. `data` varies
 * by event type, so it is parsed loosely — the processor reads only the
 * fields it needs (`email_id`, and `bounce` for bounce events).
 */
export const resendWebhookPayloadSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z
    .object({
      email_id: z.string().optional(),
      created_at: z.string().optional(),
      bounce: z
        .object({
          type: z.string().optional(),
          subType: z.string().optional(),
          message: z.string().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
});
export type ResendWebhookPayload = z.infer<typeof resendWebhookPayloadSchema>;
