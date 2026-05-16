/**
 * Resend client wrapper for the workers process.
 *
 * A thin wrapper over the Resend HTTP API (same transport the Day 4 web
 * `send.ts` used — no SDK dependency). Day 14 moves all outbound email here:
 * the web process only ever enqueues a job; this module is the single place
 * that talks to Resend.
 *
 * Dev fallback: with no `RESEND_API_KEY` set, `sendEmail` logs the message
 * and returns a synthetic `dev-` id, so the whole pg-boss path is exercised
 * locally without a real Resend account.
 */

import { logger } from '../observability/logger';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Stable error codes for classified Resend failures. */
export type EmailSendErrorCode =
  | 'RATE_LIMITED' // 429 — transient; the job should be retried
  | 'INVALID_EMAIL' // 422 — bad recipient; permanent
  | 'INVALID_API_KEY' // 401/403 — misconfiguration; permanent
  | 'BLOCKED_DOMAIN' // recipient domain blocked; permanent
  | 'UNKNOWN'; // anything else

/** Codes that are transient — the email worker re-queues these. */
export const RETRYABLE_CODES: readonly EmailSendErrorCode[] = ['RATE_LIMITED'];

export class EmailSendError extends Error {
  readonly code: EmailSendErrorCode;
  /** True when re-attempting the send could plausibly succeed. */
  readonly retryable: boolean;
  constructor(code: EmailSendErrorCode, message: string) {
    super(message);
    this.name = 'EmailSendError';
    this.code = code;
    this.retryable = RETRYABLE_CODES.includes(code);
  }
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailInput {
  /** Tenant the email belongs to (null for platform mail) — diagnostics only. */
  tenantId: string | null;
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  providerMessageId: string;
}

/** Map a Resend HTTP error response to a typed, classified EmailSendError. */
function classifyError(status: number, body: string): EmailSendError {
  let name = '';
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { name?: string; message?: string };
    name = parsed.name ?? '';
    message = parsed.message ?? message;
  } catch {
    // Non-JSON body — fall back to the raw text.
  }
  if (status === 429 || name === 'rate_limit_exceeded') {
    return new EmailSendError('RATE_LIMITED', `Resend rate limit: ${message}`);
  }
  if (status === 401 || status === 403 || name.includes('api_key')) {
    return new EmailSendError('INVALID_API_KEY', `Resend rejected the API key: ${message}`);
  }
  if (/blocked|restricted|denylist/i.test(`${name} ${message}`)) {
    return new EmailSendError('BLOCKED_DOMAIN', `Recipient blocked: ${message}`);
  }
  if (status === 422 || name === 'validation_error') {
    return new EmailSendError('INVALID_EMAIL', `Invalid email request: ${message}`);
  }
  return new EmailSendError('UNKNOWN', `Resend ${status}: ${message}`);
}

/**
 * Send one email through Resend.
 *
 * @returns the provider message id on success.
 * @throws  {EmailSendError} with a classified `code` on any failure.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    const devId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info(
      {
        subject: input.subject,
        to: input.to,
        tenantId: input.tenantId ?? 'platform',
        attachments: input.attachments?.length ?? 0,
        devId,
      },
      'email (dev): RESEND_API_KEY unset — message not actually sent',
    );
    return { providerMessageId: devId };
  }

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.attachments && input.attachments.length > 0
          ? {
              attachments: input.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString('base64'),
                content_type: a.contentType,
              })),
            }
          : {}),
      }),
    });
  } catch (err) {
    // Network-level failure — transient, treat as retryable.
    throw new EmailSendError(
      'RATE_LIMITED',
      `Network error reaching Resend: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw classifyError(res.status, await res.text());
  }

  const body = (await res.json()) as { id?: string };
  if (!body.id) {
    throw new EmailSendError('UNKNOWN', 'Resend response missing message id');
  }
  return { providerMessageId: body.id };
}

export type SendEmailFn = typeof sendEmail;
