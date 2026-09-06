/**
 * Stage F Day 19 — security posture verification.
 *
 * Day 19 was an audit-and-patch day. Findings F-1 (Next.js CVE-2025-29927),
 * F-2 (HTTP security headers + CSP) and F-3 (login rate-limit + lockout) were
 * closed earlier, in Stage C.4 and Stage D.2, but nothing asserted them at the
 * browser level — so a regression would have shipped silently. This spec is
 * that guard.
 *
 * Division of labour with the unit tests:
 *   - `lib/rate-limit.test.ts`        — the limiter's threshold + real window
 *                                       release, against the `rate_limit` table.
 *   - `lib/auth/login-enumeration.test.ts` — every failure path returns one
 *                                       identical message.
 *   - THIS SPEC                       — the limiter is actually WIRED INTO the
 *                                       login route, the headers reach a real
 *                                       browser response, and operator
 *                                       impersonation is not collateral damage.
 *
 * Window release is asserted here by rolling the stored window into the past
 * (the limiter derives its window from `Date.now()`, so a past `window_start`
 * is exactly what a rolled-over window looks like). The wall-clock version of
 * that assertion lives in the unit test; the login window is 15 minutes, which
 * no E2E run can wait out.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { adminDb, authEvents, closeDbConnection, rateLimit } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { and, desc, eq, like } from 'drizzle-orm';
import { expect, test } from '@playwright/test';

import { SEEDED_USERS, loginAsOperator } from './helpers';

// Playwright transpiles specs to CJS, so `import.meta` is unavailable here.
// The runner's cwd is `apps/web` (see playwright.config.ts `testDir`).
const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

/** Never a real account, and unique per run so parallel runs cannot collide. */
const PROBE_EMAIL = `f19-e2e-${process.pid}-${Date.now()}@demo.test`;
const PROBE_KEY = `login:${PROBE_EMAIL}`;
const LOGIN_RATE_LIMIT_MAX = 5;

async function cleanupProbe(): Promise<void> {
  await adminDb.delete(rateLimit).where(eq(rateLimit.key, PROBE_KEY));
  await adminDb.delete(authEvents).where(like(authEvents.metadata, `%${PROBE_EMAIL}%`));
}

test.afterAll(async () => {
  await cleanupProbe();
  await closeDbConnection();
});

test.describe('Day 19 — security posture (F-1, F-2, F-3)', () => {
  test.setTimeout(3 * 60_000);

  test('the app boots on the patched Next.js (>= 14.2.35, F-1)', async ({ page }) => {
    // The dependency itself: the CVE-2025-29927 fix landed in 14.2.25 and the
    // Server-Component DoS fixes in 14.2.35.
    const pkg = JSON.parse(
      await readFile(path.join(repoRoot, 'apps/web/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    const pinned = pkg.dependencies.next ?? '';
    expect(pinned, 'next must be pinned to an exact 14.2.x patch').toMatch(/^14\.2\.\d+$/);

    const patch = Number(pinned.split('.')[2]);
    expect(patch, `next 14.2.${patch} is below the F-1 floor of 14.2.35`).toBeGreaterThanOrEqual(
      35,
    );

    // And that version actually serves traffic.
    const res = await page.request.get('/api/health');
    expect(res.status(), 'the app must boot and answer /api/health').toBeLessThan(500);
    const body = (await res.json()) as { status?: string };
    expect(['ok', 'degraded']).toContain(body.status);
  });

  test('security headers are present on an authenticated page response (F-2)', async ({ page }) => {
    const user = SEEDED_USERS.demo.admin;
    await page.goto('/login?tenant=demo');
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard|change-password/, { timeout: 30_000 });

    // Re-request the authenticated page so we hold its top-level response.
    const response = await page.goto('/dashboard');
    expect(response, 'expected a navigation response').not.toBeNull();
    const headers = response!.headers();

    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['permissions-policy']).toContain('microphone=()');
    expect(headers['permissions-policy']).toContain('geolocation=()');

    const csp = headers['content-security-policy'];
    expect(csp, 'a CSP must be present').toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test('login rate-limit triggers after the threshold and releases after the window (F-3)', async ({
    page,
  }) => {
    await cleanupProbe();

    const attempt = async () => {
      await page.goto('/login?tenant=demo');
      await page.fill('input[type="email"]', PROBE_EMAIL);
      await page.fill('input[type="password"]', 'Wrong-Password-19!');
      await page.click('button[type="submit"]');
      // Every failure renders the same generic message by design (F-3).
      await expect(page.getByText('Invalid email or password.')).toBeVisible({ timeout: 30_000 });
    };

    // Burn the whole window. Unknown emails are throttled identically to known
    // ones, so no enumeration signal leaks through differential limits.
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i++) await attempt();

    const [counted] = await adminDb
      .select({ count: rateLimit.count })
      .from(rateLimit)
      .where(eq(rateLimit.key, PROBE_KEY))
      .limit(1);
    expect(counted?.count, 'each failed attempt must be recorded').toBe(LOGIN_RATE_LIMIT_MAX);

    // The next attempt is rejected by the limiter BEFORE any user lookup or
    // argon2 work. The UI message is unchanged; the proof is the audit trail.
    await attempt();

    const [event] = await adminDb
      .select({ metadata: authEvents.metadata })
      .from(authEvents)
      .where(
        and(eq(authEvents.eventType, 'login_failed'), like(authEvents.metadata, `rate_limited:%`)),
      )
      .orderBy(desc(authEvents.createdAt))
      .limit(1);
    expect(event?.metadata, 'the limiter must short-circuit the 6th attempt').toBe(
      `rate_limited:${PROBE_EMAIL}`,
    );

    // Release: roll the recorded window into the past, which is precisely the
    // state the limiter sees once a window expires.
    await adminDb
      .update(rateLimit)
      .set({ windowStart: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(rateLimit.key, PROBE_KEY));

    const [afterRelease] = await adminDb
      .select({ count: rateLimit.count })
      .from(rateLimit)
      .where(and(eq(rateLimit.key, PROBE_KEY), eq(rateLimit.count, LOGIN_RATE_LIMIT_MAX)))
      .limit(1);
    expect(afterRelease, 'the stale window row should still exist, just expired').toBeTruthy();

    // A fresh attempt is accepted by the gate again: it reaches the user
    // lookup and fails there, writing a NON-rate-limited audit row.
    await attempt();

    const [postRelease] = await adminDb
      .select({ metadata: authEvents.metadata })
      .from(authEvents)
      .where(eq(authEvents.eventType, 'login_failed'))
      .orderBy(desc(authEvents.createdAt))
      .limit(1);
    expect(
      postRelease?.metadata,
      'after the window rolls over the attempt must get past the limiter',
    ).toBe('no_user_or_inactive');
  });

  test('operator impersonation still works end to end and is not caught by the rate limiter', async ({
    page,
  }) => {
    page.setDefaultTimeout(30_000);

    // Precondition: the probe email is at its cap. A limiter keyed too broadly
    // (by IP, say) would take the operator down with it — this is the
    // regression that would break every operator workflow.
    await adminDb.delete(rateLimit).where(eq(rateLimit.key, PROBE_KEY));
    await adminDb
      .insert(rateLimit)
      .values({
        key: PROBE_KEY,
        windowStart: new Date(Date.now() - (Date.now() % (15 * 60 * 1000))),
        count: LOGIN_RATE_LIMIT_MAX + 5,
      })
      .onConflictDoNothing();

    // Same browser, same IP, immediately after a burst of failures.
    await loginAsOperator(page);
    await expect(page).toHaveURL(/admin/);

    await page.goto('/admin/tenants');
    const demoRow = page.locator('.grid').filter({ hasText: 'demo.dealerlink.in' }).first();
    await demoRow.getByRole('link', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/admin\/tenants\/[0-9a-f-]+/);

    await page.getByRole('button', { name: 'Enter workspace' }).click();
    await page.waitForURL(/tenant=demo/, { timeout: 30_000 });
    await expect(page.getByText('Operator impersonation')).toBeVisible();

    // Read a tenant page while impersonating — the full path still works.
    await page.goto('/dealers');
    await expect(page).toHaveURL(/\/dealers/);
    await expect(page.getByText('Operator impersonation')).toBeVisible();

    // The operator's own login was never throttled.
    const [operatorLimit] = await adminDb
      .select({ count: rateLimit.count })
      .from(rateLimit)
      .where(eq(rateLimit.key, `login:${SEEDED_USERS.operator.email}`))
      .limit(1);
    expect(
      operatorLimit?.count ?? 0,
      'a successful operator login must leave no rate-limit debt',
    ).toBe(0);
  });
});
