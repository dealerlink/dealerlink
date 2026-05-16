// NOTE: deliberately no `import 'server-only'` — this module is exercised by
// vitest unit tests. It is still server-only in practice (it uses `adminDb`);
// the only importer is the Node-runtime webhook route.
import { adminDb, emailDeliveryLog, webhookEvents } from '@dealerlink/db';
import { resendWebhookPayloadSchema, type ResendWebhookPayload } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';
import { Webhook } from 'svix';

/**
 * Inbound Resend webhook — verification + event processing.
 *
 * Resend signs every webhook with Svix. Signature verification IS the
 * security boundary: the endpoint is public (Resend calls it from their
 * infrastructure) and carries no session. A failed verification is rejected
 * with 400 and still logged to `webhook_events` for forensics.
 *
 * Processing runs synchronously inside the route handler (low volume —
 * deferred async processing is a Phase 2 concern). This module lives in the
 * web app (not workers) because A3.3 requires synchronous processing in the
 * route; placing it in workers would force the web bundle to import the
 * workers package (DEV.48).
 */

export const SVIX_HEADERS = ['svix-id', 'svix-timestamp', 'svix-signature'] as const;

export interface VerifyResult {
  ok: boolean;
  payload?: ResendWebhookPayload;
  /** The Svix message id — used as the replay-dedup key. */
  svixId?: string;
  error?: string;
}

/**
 * Verify a raw webhook request against RESEND_INBOUND_WEBHOOK_SECRET.
 * Returns the parsed payload on success; never throws.
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: Record<string, string | null>,
): VerifyResult {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, error: 'RESEND_INBOUND_WEBHOOK_SECRET is not configured' };
  }
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, error: 'Missing Svix signature headers' };
  }
  try {
    const wh = new Webhook(secret);
    const verified = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
    const parsed = resendWebhookPayloadSchema.safeParse(verified);
    if (!parsed.success) {
      return { ok: false, svixId, error: `Unexpected payload shape: ${parsed.error.message}` };
    }
    return { ok: true, payload: parsed.data, svixId };
  } catch (err) {
    return { ok: false, svixId, error: err instanceof Error ? err.message : 'Verification failed' };
  }
}

export interface RecordedWebhook {
  id: string;
  /** True when this exact event was already logged (replay) — skip processing. */
  duplicate: boolean;
}

/**
 * Persist a webhook event to `webhook_events`. The Svix message id is stored
 * as `payload.id` so the `(provider, payload->>'id')` unique index rejects a
 * replayed delivery — a duplicate insert is reported, not thrown.
 */
export async function recordWebhookEvent(input: {
  provider: string;
  eventType: string;
  body: unknown;
  signatureVerified: boolean;
  svixId: string | null;
}): Promise<RecordedWebhook> {
  const payload = {
    ...(typeof input.body === 'object' && input.body !== null ? input.body : { raw: input.body }),
    // Inject the Svix message id as the dedup key for the unique index.
    id: input.svixId,
  };
  try {
    const [row] = await adminDb
      .insert(webhookEvents)
      .values({
        provider: input.provider,
        eventType: input.eventType,
        payload,
        signatureVerified: input.signatureVerified,
      })
      .returning({ id: webhookEvents.id });
    if (!row) throw new Error('webhook_events insert returned no row');
    return { id: row.id, duplicate: false };
  } catch (err) {
    // 23505 = unique_violation → the same event id arrived twice (replay).
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return { id: '', duplicate: true };
    }
    throw err;
  }
}

/** Mark a webhook_events row as processed (optionally with an error note). */
export async function markWebhookProcessed(id: string, processingError?: string): Promise<void> {
  if (!id) return;
  await adminDb
    .update(webhookEvents)
    .set({ processedAt: new Date(), processingError: processingError ?? null })
    .where(eq(webhookEvents.id, id));
}

/** Map a Resend bounce type to our 'hard' | 'soft' classification. */
function classifyBounce(type: string | undefined): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes('permanent') || t === 'hard') return 'hard';
  if (t.includes('transient') || t === 'soft') return 'soft';
  return t;
}

export interface ProcessResult {
  /** True when an email_delivery_log row matched the event's email id. */
  matched: boolean;
  note?: string;
}

/**
 * Apply a verified Resend event to the matching `email_delivery_log` row.
 *
 * Events are correlated by `provider_message_id` (globally unique — no
 * tenant scope needed). An event for an unknown id is a no-op (returns
 * `matched: false`); the caller logs it and still answers 200.
 */
export async function processResendEvent(payload: ResendWebhookPayload): Promise<ProcessResult> {
  const emailId = payload.data.email_id;
  if (!emailId) {
    return { matched: false, note: 'event carries no data.email_id' };
  }

  const [row] = await adminDb
    .select()
    .from(emailDeliveryLog)
    .where(eq(emailDeliveryLog.providerMessageId, emailId))
    .limit(1);
  if (!row) {
    return { matched: false, note: `no email_delivery_log row for ${emailId}` };
  }

  // Event time, falling back to receipt time.
  const evtTime = payload.created_at ? new Date(payload.created_at) : new Date();
  const eventAt = Number.isNaN(evtTime.getTime()) ? new Date() : evtTime;

  const updates: Partial<typeof emailDeliveryLog.$inferInsert> = {
    lastEventAt: eventAt,
    lastEventType: payload.type,
  };
  const terminalNegative = row.status === 'bounced' || row.status === 'complained';

  switch (payload.type) {
    case 'email.delivered':
      updates.deliveredAt = eventAt;
      if (!terminalNegative) updates.status = 'delivered';
      break;
    case 'email.bounced':
      updates.bouncedAt = eventAt;
      updates.bouncedType = classifyBounce(payload.data.bounce?.type);
      updates.bouncedReason = payload.data.bounce?.message ?? null;
      updates.status = 'bounced';
      break;
    case 'email.complained':
      updates.complainedAt = eventAt;
      updates.status = 'complained';
      break;
    case 'email.opened':
      // First open only — subsequent opens just refresh last_event_*.
      if (!row.openedAt) updates.openedAt = eventAt;
      break;
    case 'email.clicked':
      if (!row.clickedAt) updates.clickedAt = eventAt;
      break;
    case 'email.failed':
      if (!terminalNegative) updates.status = 'failed';
      updates.errorMessage = `Resend reported delivery failure (${payload.type})`;
      break;
    case 'email.sent':
    case 'email.delivery_delayed':
      // Informational — no status change, just the last-event stamp.
      break;
    default:
      // Unknown event type — recorded via last_event_*, never crashes.
      break;
  }

  await adminDb.update(emailDeliveryLog).set(updates).where(eq(emailDeliveryLog.id, row.id));
  return { matched: true };
}
