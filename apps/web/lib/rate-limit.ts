import { rateLimit, db } from '@dealerlink/db';
import { sql } from 'drizzle-orm';

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
    console.error('[rate-limit] check failed, failing open', { fullKey, err });
    return { allowed: true, remaining: opts.limit, resetAt };
  }
}
