import { rateLimit, db } from '@dealerlink/db';
import { and, eq, sql } from 'drizzle-orm';

import { logger } from '@/lib/observability/logger';

export interface RateLimitOptions {
  /** Logical scope (e.g., 'login', 'health'). Joined with `key` into the row. */
  scope: string;
  /** Caller identifier — IP, user id, etc. */
  key: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Postgres-backed fixed-window rate limiter. Cheap-and-cheerful: one row
 * per (key, window_start). For Phase 1 traffic this is plenty; switch to a
 * sliding window or a dedicated service if a hot endpoint outgrows it.
 *
 * Uses ON CONFLICT ... DO UPDATE so increments are atomic per connection.
 * Does NOT throw; soft-fails open so a flaky DB never wedges public endpoints.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SOFT-FAILING OPEN IS CORRECT HERE AND WRONG FOR A SECURITY SHIELD.
 * READ THIS BEFORE REACHING FOR THIS HELPER ON AN UNAUTHENTICATED ROUTE.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * F.148 needs two limits that look alike and are not the same thing. The
 * distinction is recorded here, at the helper, because the mistake available is
 * reusing this function for both on the assumption that they are.
 *
 * **1 — THE TOKEN-KEYED, POST-AUTHENTICATION LIMIT. MAY fail open. Use this.**
 *
 * Its job is to bound ONE INSTALLATION's agent and to make a runaway visible —
 * the likely failure is our own software in a retry loop on a machine we cannot
 * see (F.189), not an attacker. It is keyed on the TOKEN, never the IP: several
 * agents can sit behind one NAT, one agent's IP can change, and the thing being
 * bounded is an installation, which is exactly what the token identifies.
 *
 * Generous enough never to trip in normal polling, **so that a trip is a signal
 * rather than noise**, with `Retry-After` on the 429 so a well-behaved agent
 * backs off and a misbehaving one is at least told.
 *
 * Failing open is right: if this store is unavailable, a looping agent keeps
 * looping — bad, bounded, and already authenticated. Failing CLOSED would turn a
 * storage blip into **every tenant's sync going dark at once**, which is worse
 * than the thing prevented.
 *
 * **2 — THE IP-KEYED, PRE-AUTHENTICATION SHIELD. MUST NOT fail open. DO NOT USE
 * THIS FUNCTION FOR IT.**
 *
 * Its job is to bound UNAUTHENTICATED traffic — token guessing, anonymous
 * flooding. A shield that disappears under load is absent exactly when it is
 * being tested, and an attacker can **induce the condition**: pressure the
 * database and the limiter stops limiting. That is not a safety margin, it is a
 * trigger. Same shape as F.176 — a protection that is missing precisely when
 * you are vulnerable.
 *
 * **AND THE FIX IS NOT "make it fail closed".** A store-backed limiter that
 * REJECTS on store failure reaches the same outage by the other door: every
 * agent offline during the same blip. So the shield **must not depend on the
 * store at all** — an in-process, per-instance counter, which has no failure
 * mode to choose. Weaker limit (per instance, not global), unconditional
 * existence. A shield on an unauthenticated route does not need global
 * accounting; it needs to exist without conditions.
 *
 * **Why it is phrased as "the shield does not call `checkRateLimit`" rather than
 * as a flag on this function:** a posture flag is one default away from being
 * wrong, and defaults get changed by people who never read this comment. "Does
 * not call it" is a property you have to actively destroy, and it shows up in a
 * diff.
 *
 * Settled 2026-10-03 (F.148 A.1). The operator's own first wording was "fail
 * closed", corrected to this on the grounds above.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const fullKey = `${opts.scope}:${opts.key}`;
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;
  const windowStart = new Date(now - (now % windowMs));
  const resetAt = new Date(windowStart.getTime() + windowMs);

  try {
    const rows = await db
      .insert(rateLimit)
      .values({ key: fullKey, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimit.key, rateLimit.windowStart],
        set: { count: sql`${rateLimit.count} + 1`, updatedAt: sql`now()` },
      })
      .returning({ count: rateLimit.count });

    const count = rows[0]?.count ?? 1;
    const remaining = Math.max(0, opts.limit - count);
    return { allowed: count <= opts.limit, remaining, resetAt };
  } catch (err) {
    logger.error({ fullKey, err }, 'rate-limit: check failed, failing open');
    return { allowed: true, remaining: opts.limit, resetAt };
  }
}

/**
 * Read-only check of the current window count without incrementing.
 *
 * F-3 (login rate-limit) needs to gate **before** password verify, so
 * `checkRateLimit`'s atomic upsert-and-return semantics don't fit:
 * incrementing-on-peek would penalise a clean lookup that's about to
 * succeed. The pattern is therefore:
 *
 *   const peek = await peekRateLimit({ scope:'login', key:email, … });
 *   if (!peek.allowed) return GENERIC;          // already at cap
 *   const ok = await verifyPassword(…);
 *   if (!ok) await checkRateLimit({ …same opts… });   // record failure
 *
 * `allowed` here means "count < limit" — i.e. another attempt is
 * still permitted. With the login defaults (limit 5), after 5 recorded
 * failures `peekRateLimit` returns allowed=false on the 6th, rejecting
 * before any work. Soft-fails open on DB error, like `checkRateLimit`.
 */
export async function peekRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const fullKey = `${opts.scope}:${opts.key}`;
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;
  const windowStart = new Date(now - (now % windowMs));
  const resetAt = new Date(windowStart.getTime() + windowMs);

  try {
    const rows = await db
      .select({ count: rateLimit.count })
      .from(rateLimit)
      .where(and(eq(rateLimit.key, fullKey), eq(rateLimit.windowStart, windowStart)))
      .limit(1);

    const count = rows[0]?.count ?? 0;
    const remaining = Math.max(0, opts.limit - count);
    return { allowed: count < opts.limit, remaining, resetAt };
  } catch (err) {
    logger.error({ fullKey, err }, 'rate-limit: peek failed, failing open');
    return { allowed: true, remaining: opts.limit, resetAt };
  }
}

/**
 * Drop every recorded window for `(scope, key)` so the counter resets
 * to 0 on the next peek/check. Called on successful login — a verified
 * caller invalidates the brute-force suspicion for that email, so the
 * next 5 attempts get the full window again.
 *
 * Soft-fails: a transient DB error here is benign (worst case the
 * counter rolls naturally at window-end).
 */
export async function resetRateLimit(scope: string, key: string): Promise<void> {
  const fullKey = `${scope}:${key}`;
  try {
    await db.delete(rateLimit).where(eq(rateLimit.key, fullKey));
  } catch (err) {
    logger.error({ fullKey, err }, 'rate-limit: reset failed, ignoring');
  }
}
