'use server';

import { authEvents, db, tenants, users } from '@dealerlink/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { runWithLogContext } from '@/lib/observability/als';
import { trackEvent } from '@/lib/observability/events';

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

export async function login(input: z.input<typeof loginSchema>): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Please enter a valid email and password.' };
  }
  const { email, password, tenantSlug } = parsed.data;
  const { ip, userAgent } = clientMeta();

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
      return { ok: false, error: 'Invalid email or password.' };
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
    await db.insert(authEvents).values({
      tenantId: resolvedTenantId ?? null,
      userId: user?.id ?? null,
      eventType: 'login_failed',
      success: false,
      ip,
      userAgent,
      metadata: 'no_user_or_inactive',
    });
    return { ok: false, error: 'Invalid email or password.' };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    await db.insert(authEvents).values({
      tenantId: user.tenantId,
      userId: user.id,
      eventType: 'login_failed',
      success: false,
      ip,
      userAgent,
      metadata: 'bad_password',
    });
    return { ok: false, error: 'Invalid email or password.' };
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
