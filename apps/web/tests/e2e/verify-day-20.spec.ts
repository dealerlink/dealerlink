/**
 * Stage F Day 20 — harness repair verification: cookie transport security is
 * an explicit runtime decision, not a NODE_ENV artefact (DEV.87).
 *
 * This spec proves the property that let the verify harness run over plain
 * HTTP in the devcontainer at all:
 *
 *   1. With SESSION_COOKIE_SECURE=false (set by playwright.config.ts's
 *      webServer env), auth works end-to-end over http://localhost AND the
 *      session cookie is NOT marked Secure — so the browser keeps it. Under
 *      the old `secure: NODE_ENV === 'production'` this only worked by
 *      accident of NODE_ENV; now it is an explicit, faithful configuration.
 *   2. The decision function fail-safes to Secure when the var is unset — a
 *      missing var in production can never silently yield an insecure cookie.
 *   3. SESSION_COOKIE_SECURE never reaches the client bundle (it is a
 *      server-only var; asserting on build output guarantees no leak).
 *
 * Deep matrix coverage of the decision function lives in the unit test
 * (lib/auth/cookie-security.test.ts); this spec is the browser-level guard.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { sessionCookieSecure } from '../../lib/auth/cookie-security';
import { loginAs } from './helpers';

const SESSION_COOKIE = 'dealerlink_session';

test.describe('Day 20 — cookie security config', () => {
  test('auth works over plain HTTP and the session cookie is not Secure', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');

    // Reaching anything past /login means the http:// session cookie was
    // accepted by the browser and sent back on the next request.
    expect(page.url()).not.toContain('/login');

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === SESSION_COOKIE);
    expect(session, 'session cookie should be set after login').toBeTruthy();
    // The whole point of Day 20: over plain HTTP the cookie must NOT be Secure,
    // or the browser would have dropped it and login could not have completed.
    expect(session?.secure).toBe(false);
  });

  test('sessionCookieSecure() fail-safes to Secure when the var is unset', () => {
    const saved = process.env.SESSION_COOKIE_SECURE;
    try {
      delete process.env.SESSION_COOKIE_SECURE;
      expect(sessionCookieSecure()).toBe(true);
      // ...and only an explicit `false` disables it.
      process.env.SESSION_COOKIE_SECURE = 'false';
      expect(sessionCookieSecure()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.SESSION_COOKIE_SECURE;
      else process.env.SESSION_COOKIE_SECURE = saved;
    }
  });

  test('SESSION_COOKIE_SECURE never appears in the client bundle', () => {
    // Server-only var: it must not be inlined into any client chunk. Assert on
    // the built client output. Runner cwd is apps/web (playwright testDir).
    const staticDir = path.join(process.cwd(), '.next', 'static');
    if (!fs.existsSync(staticDir)) {
      test.skip(true, '.next/static not present — run a build first for this assertion');
      return;
    }
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
          if (fs.readFileSync(full, 'utf8').includes('SESSION_COOKIE_SECURE')) {
            offenders.push(path.relative(staticDir, full));
          }
        }
      }
    };
    walk(staticDir);
    expect(
      offenders,
      `SESSION_COOKIE_SECURE leaked into client chunks: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
