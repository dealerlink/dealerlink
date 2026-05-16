/**
 * PII scrubbing for Sentry events — workers process (Day 17, chunk 17a).
 *
 * Byte-for-byte mirror of `apps/web/lib/observability/scrub.ts`. The workers
 * process is a separate app and cannot import from `apps/web`; keep the two
 * copies in sync. See the web copy for the full rationale.
 */
import type { Event } from '@sentry/node';

/** FNV-1a 32-bit hash → 8 hex chars. Deterministic, non-reversible. */
function hash8(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g;
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const CARD_RE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const PHONE_RE = /(?<!\d)(?:\+?91[ -]?)?[6-9]\d{9}(?!\d)/g;

/** Replace any PII inside a free-text string. */
export function scrubText(input: string): string {
  return input
    .replace(EMAIL_RE, (m) => `email_${hash8(m.toLowerCase())}@redacted`)
    .replace(GSTIN_RE, '[redacted-gstin]')
    .replace(PAN_RE, '[redacted-pan]')
    .replace(CARD_RE, '[redacted-card]')
    .replace(PHONE_RE, '[redacted-phone]');
}

function deepScrub<T>(value: T): T {
  if (typeof value === 'string') return scrubText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepScrub(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepScrub(v);
    return out as unknown as T;
  }
  return value;
}

/** Sentry `beforeSend` hook — returns a deep-scrubbed copy of the event. */
export function scrubEvent<T extends Event>(event: T): T {
  return deepScrub(event);
}
