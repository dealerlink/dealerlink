/**
 * PII scrubbing for Sentry events (Day 17, chunk 17a).
 *
 * Sentry events go through privacy review — no raw emails, phone numbers,
 * GSTINs, PANs, or card-like digit runs may leave the process. `scrubEvent`
 * is wired as the `beforeSend` hook in every `sentry.*.config.ts`, so it runs
 * on EVERY event regardless of where the PII entered (message, stack frame,
 * `extra`, `user`, breadcrumb…).
 *
 * The module is intentionally pure and dependency-free so it is identical and
 * edge-safe across the client, server, and edge Sentry runtimes. A byte-for-
 * byte copy lives in `apps/workers/src/observability/scrub.ts` (the workers
 * process cannot import from `apps/web`); keep the two in sync.
 */
import type { Event } from '@sentry/nextjs';

/** FNV-1a 32-bit hash → 8 hex chars. Deterministic, isomorphic, non-reversible. */
function hash8(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Order matters: email first (a hashed email carries no further PII), then
// GSTIN before PAN (a GSTIN embeds a PAN at chars 3–12), then card before
// phone (a phone is too short to be mistaken for a card, not vice-versa).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g;
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const CARD_RE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const PHONE_RE = /(?<!\d)(?:\+?91[ -]?)?[6-9]\d{9}(?!\d)/g;

/** Replace any PII inside a free-text string. Safe to call on any string. */
export function scrubText(input: string): string {
  return input
    .replace(EMAIL_RE, (m) => `email_${hash8(m.toLowerCase())}@redacted`)
    .replace(GSTIN_RE, '[redacted-gstin]')
    .replace(PAN_RE, '[redacted-pan]')
    .replace(CARD_RE, '[redacted-card]')
    .replace(PHONE_RE, '[redacted-phone]');
}

/** Recursively scrub every string value reachable from `value`. */
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

/**
 * Sentry `beforeSend` hook. Returns a deep-scrubbed copy of the event so no
 * raw PII reaches Sentry — including a deliberately-set `user.email`, which is
 * left as a stable hash (still useful for triage, no longer PII).
 *
 * Generic over the event subtype (`ErrorEvent` etc.) so it slots into
 * `beforeSend` without a cast under `exactOptionalPropertyTypes`.
 */
export function scrubEvent<T extends Event>(event: T): T {
  return deepScrub(event);
}
