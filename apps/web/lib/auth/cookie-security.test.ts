/**
 * Day 20 — cookie transport security must be an explicit runtime decision,
 * never derived from NODE_ENV (DEV.87). The critical property (2.3): a missing
 * var in production must NEVER silently produce an insecure cookie.
 *
 * Env is manipulated via `vi.stubEnv` (type-safe, auto-restored) rather than
 * assigning `process.env.NODE_ENV` directly, which Next types as read-only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sessionCookieSecure } from './cookie-security';

describe('sessionCookieSecure', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is secure by default when the var is unset (fail-safe)', () => {
    vi.stubEnv('SESSION_COOKIE_SECURE', undefined);
    expect(sessionCookieSecure()).toBe(true);
  });

  it('is secure when the var is empty (fail-safe)', () => {
    vi.stubEnv('SESSION_COOKIE_SECURE', '');
    expect(sessionCookieSecure()).toBe(true);
  });

  it("is insecure ONLY when the var is exactly 'false'", () => {
    vi.stubEnv('SESSION_COOKIE_SECURE', 'false');
    expect(sessionCookieSecure()).toBe(false);
  });

  it("is secure when the var is 'true'", () => {
    vi.stubEnv('SESSION_COOKIE_SECURE', 'true');
    expect(sessionCookieSecure()).toBe(true);
  });

  it('is secure for any non-"false" value (e.g. "0", "no", typos)', () => {
    for (const v of ['0', 'no', 'FALSE', 'False', 'off', 'secure']) {
      vi.stubEnv('SESSION_COOKIE_SECURE', v);
      expect(sessionCookieSecure()).toBe(true);
    }
  });

  it('a production process with the var UNSET stays secure (never silently insecure)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_COOKIE_SECURE', undefined);
    expect(sessionCookieSecure()).toBe(true);
  });

  it('does not read NODE_ENV: production + explicit false is honoured as insecure', () => {
    // Proves the decision is driven by the explicit var, not the build mode.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_COOKIE_SECURE', 'false');
    expect(sessionCookieSecure()).toBe(false);
  });
});
