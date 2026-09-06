/**
 * Stage F Day 19 — coverage gap closed for security finding F-3.
 *
 * The audit's central claim about login is that Dealerlink leaks **no
 * user-enumeration oracle**: every failure path returns one identical string.
 * D.2 added two new failure paths (rate-limited, locked-out) on top of the
 * original two (unknown email, bad password), and nothing asserted that the
 * four still agree. This file does.
 *
 * It drives the REAL `login()` server action against the real database. A
 * throwaway user is created and deleted per run so the seeded tenants that
 * `pnpm verify` depends on are never mutated — in particular, this test must
 * never leave a seeded account locked out.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adminDb, authEvents, closeDbConnection, rateLimit, tenants, users } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { eq, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

// `lib/auth/session` wraps getAuthContext in React's request-scoped `cache`,
// which only exists inside a React server render. Outside one it is a no-op.
vi.mock('react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react');
  return { ...actual, cache: (fn: unknown) => fn };
});

// `login()` reads request headers and (on success only) sets a cookie.
vi.mock('next/headers', () => ({
  headers: () => ({ get: (name: string) => (name === 'user-agent' ? 'vitest' : null) }),
  cookies: () => ({ set: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/observability/events', () => ({ trackEvent: vi.fn() }));

const { login } = await import('./actions');
const { GENERIC_LOGIN_ERROR, LOCKOUT_THRESHOLD, LOGIN_RATE_LIMIT_MAX } = await import('./lockout');
const { hashPassword } = await import('./password');

const PROBE_EMAIL = `f19-probe-${process.pid}-${Date.now()}@demo.test`;
const UNKNOWN_EMAIL = `f19-nobody-${process.pid}-${Date.now()}@demo.test`;
const REAL_PASSWORD = 'Probe-Pass-19!';
const WRONG_PASSWORD = 'Definitely-Wrong-19!';

let tenantSlug: string;
let probeUserId: string;

beforeAll(async () => {
  const [tenant] = await adminDb
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, 'demo'))
    .limit(1);
  if (!tenant) throw new Error('seed missing: expected a tenant with slug "demo"');
  tenantSlug = tenant.slug;

  const [created] = await adminDb
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: PROBE_EMAIL,
      passwordHash: await hashPassword(REAL_PASSWORD),
      fullName: 'Day 19 Probe',
      role: 'sales',
      status: 'active',
    })
    .returning({ id: users.id });
  if (!created) throw new Error('failed to create the probe user');
  probeUserId = created.id;
});

afterAll(async () => {
  if (probeUserId) {
    await adminDb.delete(authEvents).where(eq(authEvents.userId, probeUserId));
    await adminDb.delete(users).where(eq(users.id, probeUserId));
  }
  await adminDb
    .delete(authEvents)
    .where(
      or(
        like(authEvents.metadata, `%${PROBE_EMAIL}%`),
        like(authEvents.metadata, `%${UNKNOWN_EMAIL}%`),
      ),
    );
  await adminDb
    .delete(rateLimit)
    .where(
      or(eq(rateLimit.key, `login:${PROBE_EMAIL}`), eq(rateLimit.key, `login:${UNKNOWN_EMAIL}`)),
    );
  await closeDbConnection();
});

/** Clear both throttles so each case starts from a clean slate. */
async function clearThrottles(email: string) {
  await adminDb.delete(rateLimit).where(eq(rateLimit.key, `login:${email}`));
  await adminDb
    .update(users)
    .set({ failedLoginAttempts: 0, lockoutUntil: null })
    .where(eq(users.id, probeUserId));
}

function errorOf(result: Awaited<ReturnType<typeof login>>): string {
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.error;
}

describe('login — no user-enumeration oracle across any failure path', () => {
  it('unknown email and known-email-wrong-password return the identical message', async () => {
    await clearThrottles(UNKNOWN_EMAIL);
    const unknown = errorOf(
      await login({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD, tenantSlug }),
    );

    await clearThrottles(PROBE_EMAIL);
    const badPassword = errorOf(
      await login({ email: PROBE_EMAIL, password: WRONG_PASSWORD, tenantSlug }),
    );

    expect(unknown).toBe(badPassword);
    expect(unknown).toBe(GENERIC_LOGIN_ERROR);
  });

  it('a rate-limited attempt returns the same message as a first bad password', async () => {
    await clearThrottles(PROBE_EMAIL);
    const firstFailure = errorOf(
      await login({ email: PROBE_EMAIL, password: WRONG_PASSWORD, tenantSlug }),
    );

    // Exhaust the short window, then one more attempt to trip the gate.
    for (let i = 1; i < LOGIN_RATE_LIMIT_MAX; i++) {
      await login({ email: PROBE_EMAIL, password: WRONG_PASSWORD, tenantSlug });
    }
    const rateLimited = errorOf(
      await login({ email: PROBE_EMAIL, password: WRONG_PASSWORD, tenantSlug }),
    );

    expect(rateLimited).toBe(firstFailure);
    expect(rateLimited).toBe(GENERIC_LOGIN_ERROR);
  });

  it('a locked-out account returns the same message — even with the CORRECT password', async () => {
    await clearThrottles(PROBE_EMAIL);
    await adminDb
      .update(users)
      .set({
        failedLoginAttempts: LOCKOUT_THRESHOLD,
        lockoutUntil: new Date(Date.now() + 30 * 60 * 1000),
      })
      .where(eq(users.id, probeUserId));

    // The correct password must not distinguish "locked" from "wrong password".
    const locked = errorOf(
      await login({ email: PROBE_EMAIL, password: REAL_PASSWORD, tenantSlug }),
    );
    expect(locked).toBe(GENERIC_LOGIN_ERROR);
  });

  it('an unknown TENANT slug returns the same message too', async () => {
    const unknownTenant = errorOf(
      await login({
        email: PROBE_EMAIL,
        password: REAL_PASSWORD,
        tenantSlug: 'no-such-tenant-f19',
      }),
    );
    expect(unknownTenant).toBe(GENERIC_LOGIN_ERROR);
  });

  it('throttles an unknown email exactly like a known one (no differential signal)', async () => {
    // If unknown emails were not counted, an attacker could distinguish them
    // by observing that they are never rate-limited.
    await clearThrottles(UNKNOWN_EMAIL);
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i++) {
      await login({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD, tenantSlug });
    }

    const [row] = await adminDb
      .select({ count: rateLimit.count })
      .from(rateLimit)
      .where(eq(rateLimit.key, `login:${UNKNOWN_EMAIL}`))
      .limit(1);

    expect(row?.count).toBe(LOGIN_RATE_LIMIT_MAX);
    expect(
      errorOf(await login({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD, tenantSlug })),
    ).toBe(GENERIC_LOGIN_ERROR);
  });
});

describe('login — the lockout is real, not just a message', () => {
  it('rejects the correct password while locked, and accepts it once cleared', async () => {
    await clearThrottles(PROBE_EMAIL);
    await adminDb
      .update(users)
      .set({ lockoutUntil: new Date(Date.now() + 30 * 60 * 1000) })
      .where(eq(users.id, probeUserId));

    const whileLocked = await login({ email: PROBE_EMAIL, password: REAL_PASSWORD, tenantSlug });
    expect(whileLocked.ok).toBe(false);

    // An expired lockout must not block: set it in the past.
    await adminDb
      .update(users)
      .set({ lockoutUntil: new Date(Date.now() - 60 * 1000), failedLoginAttempts: 0 })
      .where(eq(users.id, probeUserId));
    await adminDb.delete(rateLimit).where(eq(rateLimit.key, `login:${PROBE_EMAIL}`));

    const afterExpiry = await login({ email: PROBE_EMAIL, password: REAL_PASSWORD, tenantSlug });
    expect(afterExpiry.ok).toBe(true);
  });
});
