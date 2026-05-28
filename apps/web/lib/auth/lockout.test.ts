import { describe, expect, it } from 'vitest';

import {
  clearedState,
  GENERIC_LOGIN_ERROR,
  isLockedOut,
  LOCKOUT_DURATION_MS,
  LOCKOUT_THRESHOLD,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_SEC,
  nextFailureState,
} from './lockout';

const NOW = new Date('2026-05-28T12:00:00.000Z');

describe('lockout — constants', () => {
  it('rate-limit thresholds match the C.4 audit recommendation (5 per 15 min)', () => {
    expect(LOGIN_RATE_LIMIT_MAX).toBe(5);
    expect(LOGIN_RATE_LIMIT_WINDOW_SEC).toBe(15 * 60);
  });

  it('lockout fires at 10 cumulative failures with a 30-minute hold', () => {
    expect(LOCKOUT_THRESHOLD).toBe(10);
    expect(LOCKOUT_DURATION_MS).toBe(30 * 60 * 1000);
  });

  it('the user-facing error is the single non-enumerable string', () => {
    expect(GENERIC_LOGIN_ERROR).toBe('Invalid email or password.');
  });
});

describe('isLockedOut', () => {
  it('returns false for a null / undefined timestamp (never locked)', () => {
    expect(isLockedOut(null, NOW)).toBe(false);
    expect(isLockedOut(undefined, NOW)).toBe(false);
  });

  it('returns true for a future lockout timestamp', () => {
    const future = new Date(NOW.getTime() + 60_000);
    expect(isLockedOut(future, NOW)).toBe(true);
  });

  it('returns false for an expired lockout (timestamp in the past)', () => {
    const past = new Date(NOW.getTime() - 60_000);
    expect(isLockedOut(past, NOW)).toBe(false);
  });

  it('returns false at exactly the lockout deadline (boundary: > not ≥)', () => {
    expect(isLockedOut(NOW, NOW)).toBe(false);
  });
});

describe('nextFailureState — sub-threshold progression', () => {
  it('increments a fresh counter 0 → 1 with no lockout', () => {
    expect(nextFailureState(0, NOW)).toEqual({
      failedLoginAttempts: 1,
      lockoutUntil: null,
    });
  });

  it('walks 1 → 2 → … → 9 without triggering a lockout', () => {
    for (let i = 1; i < LOCKOUT_THRESHOLD - 1; i += 1) {
      const next = nextFailureState(i, NOW);
      expect(next.failedLoginAttempts).toBe(i + 1);
      expect(next.lockoutUntil).toBeNull();
    }
  });

  it('clears a stale (expired) lockoutUntil implicitly by returning null below threshold', () => {
    // A row may carry a now-expired lockoutUntil from a previous lock. The
    // failure-path UPDATE writes lockoutUntil = null, so the row never
    // re-surfaces an old expired timestamp.
    const next = nextFailureState(2, NOW);
    expect(next.lockoutUntil).toBeNull();
  });

  it('treats a negative attempts value as 0 (defensive)', () => {
    expect(nextFailureState(-3, NOW)).toEqual({
      failedLoginAttempts: 1,
      lockoutUntil: null,
    });
  });
});

describe('nextFailureState — lockout fires at LOCKOUT_THRESHOLD', () => {
  it('the 10th cumulative failure (9 → 10) sets a lockout 30 minutes out', () => {
    const next = nextFailureState(LOCKOUT_THRESHOLD - 1, NOW);
    expect(next.failedLoginAttempts).toBe(0);
    expect(next.lockoutUntil).not.toBeNull();
    expect(next.lockoutUntil!.getTime()).toBe(NOW.getTime() + LOCKOUT_DURATION_MS);
  });

  it('a single far-overflow attempt also locks (defensive — counter never legitimately exceeds threshold)', () => {
    const next = nextFailureState(100, NOW);
    expect(next.failedLoginAttempts).toBe(0);
    expect(next.lockoutUntil).not.toBeNull();
  });

  it('the lockoutUntil deadline is exactly 30 min ahead of "now"', () => {
    const next = nextFailureState(LOCKOUT_THRESHOLD - 1, NOW);
    const delta = next.lockoutUntil!.getTime() - NOW.getTime();
    expect(delta).toBe(LOCKOUT_DURATION_MS);
  });

  it('post-lockout: simulating "lockout expired + first new failure" walks counter 0 → 1', () => {
    // After a lock fires, the row holds attempts=0, lockoutUntil=futureT.
    // Once `now > futureT` (lock expired), the next failed verify enters
    // this function with currentAttempts=0 and gets a 1 — the counter
    // resets are baked in.
    const afterExpiry = new Date(NOW.getTime() + LOCKOUT_DURATION_MS + 1);
    const next = nextFailureState(0, afterExpiry);
    expect(next.failedLoginAttempts).toBe(1);
    expect(next.lockoutUntil).toBeNull();
  });
});

describe('clearedState — success path', () => {
  it('returns both fields zeroed', () => {
    expect(clearedState()).toEqual({
      failedLoginAttempts: 0,
      lockoutUntil: null,
    });
  });

  it('returns a fresh object each call (no shared mutation)', () => {
    const a = clearedState();
    const b = clearedState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
