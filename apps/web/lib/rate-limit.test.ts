/**
 * Stage F Day 19 — coverage gap closed for security finding F-3.
 *
 * F-3 (login rate-limit + lockout) landed in Stage D D.2, but its tests
 * covered only the PURE lockout decision logic (`lockout.test.ts`). The
 * Postgres-backed limiter itself — the part that actually blocks an attacker —
 * had no test. This file exercises the real `rate_limit` table.
 *
 * The window-release case uses a 1-second window and a real sleep rather than
 * fake timers: `checkRateLimit` derives its window from `Date.now()` while the
 * postgres driver also relies on timers, and faking them mid-query is a
 * flakiness source. A ~1.2s wait is a fair price for testing the real thing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adminDb, closeDbConnection, rateLimit } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

// Imported after env is loaded so the db client picks up DATABASE_URL.
const { checkRateLimit, peekRateLimit, resetRateLimit } = await import('./rate-limit');

/** Unique per run so concurrent/repeat runs never collide. */
const SCOPE = 'test-ratelimit';
const key = (name: string) =>
  `${name}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await adminDb.delete(rateLimit).where(like(rateLimit.key, `${SCOPE}:%`));
});

afterAll(async () => {
  await adminDb.delete(rateLimit).where(like(rateLimit.key, `${SCOPE}:%`));
  await closeDbConnection();
});

describe('checkRateLimit — blocks after the threshold', () => {
  it('allows exactly `limit` attempts, then blocks', async () => {
    const opts = { scope: SCOPE, key: key('threshold'), limit: 5, windowSec: 900 };

    for (let attempt = 1; attempt <= opts.limit; attempt++) {
      const res = await checkRateLimit(opts);
      expect(res.allowed, `attempt ${attempt} should be allowed`).toBe(true);
      expect(res.remaining).toBe(opts.limit - attempt);
    }

    const blocked = await checkRateLimit(opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('stays blocked for further attempts inside the same window', async () => {
    const opts = { scope: SCOPE, key: key('stays-blocked'), limit: 2, windowSec: 900 };
    await checkRateLimit(opts);
    await checkRateLimit(opts);

    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(opts)).allowed).toBe(false);
    }
  });

  it('counts each key independently', async () => {
    const a = { scope: SCOPE, key: key('key-a'), limit: 1, windowSec: 900 };
    const b = { scope: SCOPE, key: key('key-b'), limit: 1, windowSec: 900 };

    expect((await checkRateLimit(a)).allowed).toBe(true);
    expect((await checkRateLimit(a)).allowed).toBe(false);
    // b is untouched by a's exhaustion.
    expect((await checkRateLimit(b)).allowed).toBe(true);
  });
});

describe('peekRateLimit — reads without incrementing', () => {
  it('does not consume an attempt', async () => {
    const opts = { scope: SCOPE, key: key('peek'), limit: 3, windowSec: 900 };

    for (let i = 0; i < 10; i++) {
      const peek = await peekRateLimit(opts);
      expect(peek.allowed).toBe(true);
      expect(peek.remaining).toBe(3);
    }
    // Still a full budget of real attempts available.
    expect((await checkRateLimit(opts)).allowed).toBe(true);
  });

  it('reports blocked once the recorded count reaches the limit', async () => {
    const opts = { scope: SCOPE, key: key('peek-blocked'), limit: 2, windowSec: 900 };
    expect((await peekRateLimit(opts)).allowed).toBe(true);

    await checkRateLimit(opts);
    expect((await peekRateLimit(opts)).allowed).toBe(true);

    await checkRateLimit(opts);
    // This is the login gate: 2 failures recorded => the 3rd attempt is
    // rejected before any user lookup or argon2 work.
    expect((await peekRateLimit(opts)).allowed).toBe(false);
  });
});

describe('window release', () => {
  it('releases once the window rolls over', async () => {
    const opts = { scope: SCOPE, key: key('release'), limit: 2, windowSec: 1 };

    await checkRateLimit(opts);
    await checkRateLimit(opts);
    expect((await checkRateLimit(opts)).allowed).toBe(false);
    expect((await peekRateLimit(opts)).allowed).toBe(false);

    // Cross into the next fixed window (windows start at multiples of
    // windowMs, so 1.2s guarantees a boundary crossing).
    await sleep(1200);

    const afterWindow = await peekRateLimit(opts);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(opts.limit);
    expect((await checkRateLimit(opts)).allowed).toBe(true);
  });

  it('reports a resetAt inside the current window', async () => {
    const opts = { scope: SCOPE, key: key('reset-at'), limit: 5, windowSec: 900 };
    const res = await checkRateLimit(opts);
    const deltaMs = res.resetAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(0);
    expect(deltaMs).toBeLessThanOrEqual(opts.windowSec * 1000);
  });
});

describe('resetRateLimit — clears on successful login', () => {
  it('restores the full budget immediately', async () => {
    const k = key('reset');
    const opts = { scope: SCOPE, key: k, limit: 2, windowSec: 900 };

    await checkRateLimit(opts);
    await checkRateLimit(opts);
    expect((await peekRateLimit(opts)).allowed).toBe(false);

    await resetRateLimit(SCOPE, k);

    const after = await peekRateLimit(opts);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(opts.limit);
  });
});
