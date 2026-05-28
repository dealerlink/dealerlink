'use server';

import { authEvents, db, tenants, users } from '@dealerlink/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { runWithLogContext } from '@/lib/observability/als';
import { trackEvent } from '@/lib/observability/events';
import { checkRateLimit, peekRateLimit, resetRateLimit } from '@/lib/rate-limit';

import {
  clearedState,
  GENERIC_LOGIN_ERROR,
  isLockedOut,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_SEC,
  nextFailureState,
} from './lockout';
import { lucia } from './lucia';
import { verifyPassword } from './password';
import { getAuthContext } from './session';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  tenantSlug: z.string().trim().toLowerCase().optional(),
  rememberMe: z.boolean().optional(),
});

export type LoginResult = { ok: true; redirectTo: string } | { ok: false; error: string };

function clientMeta() {
  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  const userAgent = h.get('user-agent') ?? null;
  return { ip, userAgent };
}

/**
 * F-3 (Stage D D.2): the rate-limit + lockout state shared between
 * `peekRateLimit`/`checkRateLimit` (windowed throttle on the `rate_limit`
 * table) and the per-user counter (`users.failed_login_attempts` +
 * `users.lockout_until`). See `lockout.ts` for the design rationale and
 * the guardrail that ALL failure paths return the same generic message.
 */
const rateLimitOpts = (email: string) => ({
  scope: 'login',
  key: email,
  limit: LOGIN_RATE_LIMIT_MAX,
  windowSec: LOGIN_RATE_LIMIT_WINDOW_SEC,
});

export async function login(input: z.input<typeof loginSchema>): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Please enter a valid email and password.' };
  }
  const { email, password, tenantSlug } = parsed.data;
  const { ip, userAgent } = clientMeta();

  // F-3 step 1: short-window rate limit. Peek (no increment) so a
  // soon-to-succeed login doesn't penalise the counter — only failed
  // verifies record a hit. After 5 failures in 15 min the 6th attempt
  // gets rejected here, **before** any user lookup or argon2 work.
  // Key is the parsed (normalized) email so unknown-email probing is
  // throttled identically to known-email brute-force — no enumeration
  // signal leaks through differential rate limits.
  const peek = await peekRateLimit(rateLimitOpts(email));
  if (!peek.allowed) {
    await db.insert(authEvents).values({
      eventType: 'login_failed',
      success: false,
      ip,
      userAgent,
      metadata: `rate_limited:${email}`,
    });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  // Resolve tenant if slug supplied. Operators have no tenant.
  let resolvedTenantId: string | null | undefined = undefined;
  if (tenantSlug) {
    const [t] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);
    if (!t) {
      await db.insert(authEvents).values({
        eventType: 'login_failed',
        success: false,
        ip,
        userAgent,
        metadata: `unknown_tenant:${tenantSlug}`,
      });
      return { ok: false, error: GENERIC_LOGIN_ERROR };
    }
    resolvedTenantId = t.id;
  }

  // Look up user. If a tenant was resolved, scope to it; otherwise scope to
  // the platform (operators). RLS enforces this at the DB layer too — we set
  // app.tenant_id inside a transaction so the user lookup respects isolation.
  const candidateRows = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${resolvedTenantId ?? ''}, true)`);
    return resolvedTenantId
      ? tx
          .select()
          .from(users)
          .where(and(eq(users.tenantId, resolvedTenantId), eq(users.email, email)))
          .limit(1)
      : tx
          .select()
          .from(users)
          .where(and(isNull(users.tenantId), eq(users.email, email)))
          .limit(1);
  });

  const user = candidateRows[0];
  if (!user || user.status !== 'active') {
    // Record the failure against the rate-limit window so an attacker
    // probing unknown emails still hits the 5/15-min cap.
    await checkRateLimit(rateLimitOpts(email));
    await db.insert(authEvents).values({
      tenantId: resolvedTenantId ?? null,
      userId: user?.id ?? null,
      eventType: 'login_failed',
      success: false,
      ip,
      userAgent,
      metadata: 'no_user_or_inactive',
    });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  // F-3 step 2: cumulative lockout. A known user with an active lockout
  // is rejected **before** verify (no argon2 work, no counter touch),
  // with the same generic message. The auth_events row records the
  // lockout for forensics + the operator's manual-clear runbook.
  if (isLockedOut(user.lockoutUntil, new Date())) {
    await db.insert(authEvents).values({
      tenantId: user.tenantId,
      userId: user.id,
      eventType: 'login_failed',
      success: false,
      ip,
      userAgent,
      metadata: 'locked_out',
    });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    // Record the failure on the windowed limiter AND on the per-user
    // counter. If the counter crosses LOCKOUT_THRESHOLD, the lockout
    // fires (handled by `nextFailureState`). Both writes are best-effort
    // — a transient DB error must not change the user-facing outcome.
    await checkRateLimit(rateLimitOpts(email));
    const failureState = nextFailureState(user.failedLoginAttempts, new Date());
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${user.tenantId ?? ''}, true)`);
      await tx
        .update(users)
        .set({
          failedLoginAttempts: failureState.failedLoginAttempts,
          lockoutUntil: failureState.lockoutUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    });
    await db.insert(authEvents).values({
      tenantId: user.tenantId,
      userId: user.id,
      eventType: 'login_failed',
      success: false,
      ip,
      userAgent,
      metadata: failureState.lockoutUntil ? 'bad_password:locked' : 'bad_password',
    });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  // Success path. Clear the windowed limiter so the next 5 attempts get
  // the full window again, and zero the per-user counter / lockout iff
  // they aren't already clean — a conditional UPDATE keeps the audit log
  // quiet for routine logins (every UPDATE on `users` writes an audit
  // row via the trigger; we don't want a per-login audit hit).
  await resetRateLimit('login', email);
  if (user.failedLoginAttempts > 0 || user.lockoutUntil != null) {
    const cleared = clearedState();
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${user.tenantId ?? ''}, true)`);
      await tx
        .update(users)
        .set({
          failedLoginAttempts: cleared.failedLoginAttempts,
          lockoutUntil: cleared.lockoutUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    });
  }

  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  cookies().set(cookie.name, cookie.value, cookie.attributes);

  await db.insert(authEvents).values({
    tenantId: user.tenantId,
    userId: user.id,
    eventType: 'login_success',
    success: true,
    ip,
    userAgent,
  });

  // Business-event analytics — seed the log context so the event carries the
  // user it belongs to (login runs outside the action wrapper's ALS scope).
  runWithLogContext(
    { userId: user.id, role: user.role, ...(user.tenantId ? { tenantId: user.tenantId } : {}) },
    () => trackEvent('user.logged_in', { method: 'password' }),
  );

  // Users carrying the must-change flag are routed straight to the rotation
  // screen (CLAUDE.md §6, ADR-010, DEV.56); the layout guards keep them there
  // until the flag clears. Everyone else goes to their home surface.
  const redirectTo = user.mustChangePassword
    ? '/change-password'
    : user.role === 'operator'
      ? '/admin'
      : '/dashboard';
  return { ok: true, redirectTo };
}

export async function logout(): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx) {
    await lucia.invalidateSession(ctx.session.id);
    const { ip, userAgent } = clientMeta();
    await db.insert(authEvents).values({
      tenantId: ctx.user.tenantId,
      userId: ctx.user.id,
      eventType: 'logout',
      success: true,
      ip,
      userAgent,
    });
  }
  const blank = lucia.createBlankSessionCookie();
  cookies().set(blank.name, blank.value, blank.attributes);
  redirect('/login');
}
