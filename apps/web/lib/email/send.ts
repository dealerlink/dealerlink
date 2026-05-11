/**
 * Resend wrapper with a dev fallback.
 *
 * When `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set, calls the Resend
 * API. Otherwise logs the rendered email to stdout and returns a synthetic
 * message id starting with `dev-`. Either way the `email_delivery_log` row
 * receives a non-empty `providerMessageId`, so downstream code can
 * distinguish dev rows by the prefix.
 */

export interface SendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Header used by Resend webhooks to correlate deliveries. */
  tag?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? 'Dealerlink <onboarding@resend.dev>';

  if (!apiKey) {
    // Dev fallback — log enough to verify content without leaking the
    // raw HTML into terminals (which clutters scrollback).
    const devId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // eslint-disable-next-line no-console
    console.log(
      `[email:dev] would send "${input.subject}" to ${input.to} (tag=${input.tag ?? 'none'}) id=${devId}`,
    );
    return { ok: true, providerMessageId: devId };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.tag ? { tags: [{ name: 'dl_template', value: input.tag }] } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    const body = (await res.json()) as { id?: string };
    if (!body.id) {
      return { ok: false, error: 'Resend response missing id' };
    }
    return { ok: true, providerMessageId: body.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown Resend error',
    };
  }
}
