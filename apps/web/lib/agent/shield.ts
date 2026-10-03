/**
 * The PRE-AUTHENTICATION shield for `/api/agent/*` — F.148 A.1.
 *
 * ## IT DOES NOT CALL `checkRateLimit`, AND THAT IS THE POINT
 *
 * `apps/web/lib/rate-limit.ts` is Postgres-backed and **soft-fails open**, which
 * is correct for rate limiting and wrong for a shield on an unauthenticated
 * route: a shield that disappears under load is absent exactly when it is being
 * tested, and an attacker can **induce the condition** by pressuring the
 * database. Same shape as F.176 — a protection missing precisely when you are
 * vulnerable.
 *
 * **And "make it fail closed" is not the fix.** A store-backed limiter that
 * REJECTS on store failure reaches the same outage by the other door: every
 * tenant's agent offline during the same blip. So this depends on no store at
 * all. **An in-process counter has no failure mode to choose.**
 *
 * The cost is honest and accepted: this is **per instance**, not global, so N
 * app instances permit N × `LIMIT`. A shield on an unauthenticated route does
 * not need global accounting; it needs to exist without conditions. Global
 * accounting is what the token-keyed limit does, after authentication, where
 * failing open is the right trade.
 *
 * Phrased as a separate module rather than a flag on `checkRateLimit` because
 * **a flag is one default away from being wrong**, and defaults are changed by
 * people who never read the comment. "Does not call it" is a property you have
 * to actively destroy, and it shows up in a diff.
 */

/** Requests per IP per window. Deliberately tight — this is a shield, not a quota. */
const LIMIT = 30;
const WINDOW_MS = 60_000;

/**
 * Fixed-window counters, keyed by IP, held in this process only.
 *
 * Bounded on write so a flood of distinct source addresses cannot grow the map
 * without limit — the obvious way to turn a shield into the memory leak it was
 * protecting against. When the map is full and the key is new, the request is
 * REJECTED: under that much pressure, refusing an unknown IP is the posture a
 * shield should take.
 */
const MAX_KEYS = 10_000;
const buckets = new Map<string, { windowStart: number; count: number }>();

export interface ShieldResult {
  allowed: boolean;
  retryAfterSec: number;
}

export function shieldCheck(ip: string, now = Date.now()): ShieldResult {
  const windowStart = now - (now % WINDOW_MS);
  const retryAfterSec = Math.ceil((windowStart + WINDOW_MS - now) / 1000);

  const existing = buckets.get(ip);
  if (existing && existing.windowStart === windowStart) {
    existing.count += 1;
    return { allowed: existing.count <= LIMIT, retryAfterSec };
  }

  if (!existing && buckets.size >= MAX_KEYS) {
    // Full, and this IP is unknown. Sweep stale windows once; if that frees
    // nothing, reject rather than grow.
    for (const [k, v] of buckets) if (v.windowStart !== windowStart) buckets.delete(k);
    if (buckets.size >= MAX_KEYS) return { allowed: false, retryAfterSec };
  }

  buckets.set(ip, { windowStart, count: 1 });
  return { allowed: true, retryAfterSec };
}

/** Test seam only — the counters are process state and tests must not inherit them. */
export function __resetShield(): void {
  buckets.clear();
}

export const SHIELD_LIMIT = LIMIT;
export const SHIELD_WINDOW_MS = WINDOW_MS;
