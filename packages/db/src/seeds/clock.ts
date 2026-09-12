/**
 * The seed clock (F.67 Part 2).
 *
 * Every date the seeds write derives from ONE pinned instant, not from
 * `Date.now()`. Before this, 17 data-bearing wall-clock call sites across six
 * seed files computed every quote date, validity date, dispatch date and payment
 * date as "N days before today" — so the dates on the face of every seeded
 * document shifted by one day, every day, and `created_at` moved on every
 * reseed (measured at 10:59:36 then 11:00:05 across two consecutive runs).
 *
 * That made snapshot-testing a rendered document impossible: a reference
 * captured on one day could not be matched by a render made on the next, with an
 * entirely untouched template. The operator's direction was to fix it here
 * rather than to exclude dates from the snapshot:
 *
 *   "Dates appear on every document and are legally relevant, so excluding them
 *    leaves a visible field permanently untested."
 *
 * ── Why this particular instant ────────────────────────────────────────────
 *
 * 2026-09-11T17:30:00Z is when the Day 25 reference PDFs were captured — their
 * footers read "Generated 11-Sept-2026 23:00 IST", which is 17:30 UTC. Pinning
 * to the capture instant means the DATE fields of a freshly seeded document
 * reproduce the dates on the existing reference corpus exactly, rather than
 * being off by however many days have passed. Any fixed instant would make the
 * seed deterministic; this one also keeps the references comparable.
 *
 * ── The cost, stated plainly ───────────────────────────────────────────────
 *
 * Seeded data no longer ages into the present. A dashboard showing "last 30
 * days" will show less as real time moves past the epoch, and eventually
 * nothing. That is the trade the pin buys: reproducibility over recency. Set
 * `SEED_EPOCH` to override it for a local database where recency matters more —
 * but CI and any snapshot run must use the default, or the guarantee is gone.
 */
const DEFAULT_SEED_EPOCH = '2026-09-11T17:30:00.000Z';

/** The pinned instant, as an ISO-8601 string. */
export const SEED_EPOCH_ISO = process.env.SEED_EPOCH ?? DEFAULT_SEED_EPOCH;

const EPOCH_MS = (() => {
  const ms = Date.parse(SEED_EPOCH_ISO);
  if (Number.isNaN(ms)) {
    throw new Error(
      `SEED_EPOCH is not a valid ISO-8601 timestamp: ${JSON.stringify(SEED_EPOCH_ISO)}`,
    );
  }
  return ms;
})();

const DAY_MS = 86_400_000;

/** The seed's "now". Replaces `new Date()` / `Date.now()` in every seed. */
export function seedNow(): Date {
  return new Date(EPOCH_MS);
}

/** Milliseconds since the Unix epoch, for arithmetic that used `Date.now()`. */
export function seedNowMs(): number {
  return EPOCH_MS;
}

/** `days` before the seed epoch, as a `Date`. */
export function daysAgo(days: number): Date {
  return new Date(EPOCH_MS - days * DAY_MS);
}

/** `days` after the seed epoch, as a `Date`. */
export function daysAhead(days: number): Date {
  return new Date(EPOCH_MS + days * DAY_MS);
}

/** `days` before the seed epoch, as a `YYYY-MM-DD` string for a DATE column. */
export function isoDaysAgo(days: number): string {
  return daysAgo(days).toISOString().slice(0, 10);
}

/** Indian fiscal year (April–March) of a date, defaulting to the seed epoch. */
export function seedFiscalYear(d: Date = seedNow()): number {
  const m = d.getUTCMonth();
  return m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
