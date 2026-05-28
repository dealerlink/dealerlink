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
