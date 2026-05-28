/**
 * Login rate-limit + account-lockout decision logic (F-3, Stage D D.2).
 *
 * Two independent mechanisms, both keyed by **email** (not IP) for B2B
 * traffic shape:
 *
 *   1. **Short-window rate limit** — 5 attempts per 15-min window, backed
 *      by the `rate_limit` table via `peekRateLimit` + `checkRateLimit`
 *      in `lib/rate-limit`. Works for unknown emails too (no user row
 *      required), so it can throttle brute-force / enumeration probes
 *      without revealing whether the address exists.
 *   2. **Cumulative lockout** — `users.failed_login_attempts` counter +
 *      `users.lockout_until` timestamp. After 10 cumulative failures the
 *      account is locked for 30 minutes; the counter resets when the
 *      lock fires and stays at 0 until the next failure post-lock.
 *      Only applies to known users — the rate-limit above is what
 *      protects unknown emails.
 *
 * **Generic error preserved.** Every failure path — rate-limited,
 * locked-out, unknown user, bad password — returns the **same**
 * "Invalid email or password." message to the client (per the C.4
 * security-audit guardrail that login errors must not be enumerable).
 * The lockout / rate-limit cause is recorded server-side in
 * `auth_events` for forensics, never surfaced to the caller.
 *
 * **Why pure functions.** The decision logic lives here as branchless
 * pure functions so it's exhaustively unit-testable without a DB. The
 * `apps/web/lib/auth/actions.ts` `login()` composes these with the
 * (DB-backed) rate-limit primitive + a counter UPDATE — the same
 * separation as `password-policy.ts` (pure Zod) vs `change-password.ts`
 * (the action that composes it).
 */

/**
 * Short-window rate-limit threshold: 5 failed attempts per 15 minutes,
 * keyed by email in the `rate_limit` table.
 */
export const LOGIN_RATE_LIMIT_MAX = 5;
export const LOGIN_RATE_LIMIT_WINDOW_SEC = 15 * 60; // 900s

/**
 * Cumulative-failure lockout threshold: after this many failed logins
 * the account is hard-locked for `LOCKOUT_DURATION_MS`.
 */
export const LOCKOUT_THRESHOLD = 10;
export const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 min

/**
 * The single user-facing failure message. Used for unknown email,
 * bad password, rate limit, and lockout — never differentiated to
 * the client. (Operator can distinguish in `auth_events`.)
 */
export const GENERIC_LOGIN_ERROR = 'Invalid email or password.' as const;

/**
 * True iff a lockout is currently in force. `null` means "no lockout
 * ever set, or it expired and was already cleared." Past timestamps
 * are not considered locked — callers should NOT clear them eagerly,
 * because `nextFailureState` does so on the very next failed attempt,
 * naturally rolling forward the counter.
 */
export function isLockedOut(lockoutUntil: Date | null | undefined, now: Date): boolean {
  return lockoutUntil != null && lockoutUntil.getTime() > now.getTime();
}

/**
 * The shape that gets written to `users.failed_login_attempts` +
 * `users.lockout_until` after a failed verify.
 */
export interface FailureState {
  failedLoginAttempts: number;
  lockoutUntil: Date | null;
}

/**
 * Decide what the user row should look like after a fresh failed
 * verify. Three cases:
 *
 *   - Below threshold: counter increments by 1; lockout cleared
 *     (any stale-expired lockout timestamp is wiped, so it can't
 *     resurface in later reads).
 *   - At/above threshold (10): the lock fires. Counter resets to 0
 *     (the lock IS the state now) and `lockoutUntil = now +
 *     LOCKOUT_DURATION_MS`.
 *
 * Callers should NOT call this while a lockout is already active —
 * the login action rejects locked accounts *before* password verify,
 * so failed verify only happens on unlocked accounts. Behaviour if
 * called during a lock is still safe (counter would have been 0,
 * so it goes 0 → 1, no double-lock) but unnecessary.
 */
export function nextFailureState(currentAttempts: number, now: Date): FailureState {
  const next = Math.max(0, currentAttempts) + 1;
  if (next >= LOCKOUT_THRESHOLD) {
    return {
      failedLoginAttempts: 0,
      lockoutUntil: new Date(now.getTime() + LOCKOUT_DURATION_MS),
    };
  }
  return { failedLoginAttempts: next, lockoutUntil: null };
}

/**
 * The shape written on successful login — both fields zeroed. Use a
 * conditional UPDATE so a clean login (already 0 / null) doesn't
 * generate an `audit_log` row.
 */
export function clearedState(): FailureState {
  return { failedLoginAttempts: 0, lockoutUntil: null };
}
