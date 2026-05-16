import { NextResponse, type NextRequest } from 'next/server';

import {
  markWebhookProcessed,
  processResendEvent,
  recordWebhookEvent,
  verifyResendWebhook,
} from '@/lib/email/resend-webhook';

/**
 * Inbound Resend webhook endpoint (Day 14, closes A.10).
 *
 * PUBLIC by necessity — Resend calls it from their infrastructure with no
 * Dealerlink session. The Svix signature IS the authentication: every
 * request is verified against RESEND_INBOUND_WEBHOOK_SECRET before any
 * processing. A failed verification is rejected (400) and still logged to
 * `webhook_events` for forensics.
 *
 * Processing is synchronous (low volume). Replays are absorbed by the
 * `webhook_events` unique constraint on the Svix message id.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Best-effort event-type extraction for logging an unverified body. */
function peekEventType(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as { type?: unknown };
    return typeof parsed.type === 'string' ? parsed.type : 'unknown';
  } catch {
    return 'unparseable';
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // The raw body is required verbatim for signature verification — do NOT
  // JSON.parse before verifying.
  const rawBody = await req.text();
  const headers: Record<string, string | null> = {
    'svix-id': req.headers.get('svix-id'),
    'svix-timestamp': req.headers.get('svix-timestamp'),
    'svix-signature': req.headers.get('svix-signature'),
  };

  const verification = verifyResendWebhook(rawBody, headers);

  // --- Rejected: bad / missing signature ----------------------------------
  if (!verification.ok || !verification.payload) {
    await recordWebhookEvent({
      provider: 'resend',
      eventType: peekEventType(rawBody),
      body: rawBody,
      signatureVerified: false,
      svixId: verification.svixId ?? headers['svix-id'] ?? null,
    }).catch(() => undefined); // logging must never mask the 400
    return NextResponse.json({ error: 'signature verification failed' }, { status: 400 });
  }

  // --- Verified: log, then process ----------------------------------------
  const payload = verification.payload;
  const recorded = await recordWebhookEvent({
    provider: 'resend',
    eventType: payload.type,
    body: payload,
    signatureVerified: true,
    svixId: verification.svixId ?? null,
  });

  // Replay — the same Svix event id already arrived. Acknowledge without
  // re-applying the event.
  if (recorded.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const result = await processResendEvent(payload);
    await markWebhookProcessed(recorded.id, result.matched ? undefined : result.note);
  } catch (err) {
    // Processing failed — record the error but still answer 200 so Resend
    // does not hammer us with retries for a bug on our side.
    await markWebhookProcessed(
      recorded.id,
      err instanceof Error ? err.message : 'processing error',
    ).catch(() => undefined);
  }

  // 200 even for an unmatched event — never reveal to the sender which
  // message ids we recognise.
  return NextResponse.json({ ok: true });
}
