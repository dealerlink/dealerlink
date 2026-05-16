import { authEvents, db, users } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { setSentryUser } from '@/lib/observability/context';

import { lucia } from './lucia';

export type AuthContext = {
  user: {
    id: string;
    tenantId: string | null;
    email: string;
    role: 'admin' | 'sales' | 'accounts' | 'dispatch' | 'operator';
    fullName: string;
    status: 'active' | 'invited' | 'suspended' | 'deleted';
    mustChangePassword: boolean;
  };
  session: {
    id: string;
    expiresAt: Date;
  };
};

const HEARTBEAT_GAP_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Read the session cookie, validate it, and return the current user/session.
 * Returns null when there is no session or it is invalid.
 *
 * Wrapped in `react.cache` so multiple Server Components in one request share
 * a single DB lookup.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const cookieStore = cookies();
  const cookieName = lucia.sessionCookieName;
  const sessionId = cookieStore.get(cookieName)?.value ?? null;
  if (!sessionId) return null;

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    try {
      const blank = lucia.createBlankSessionCookie();
      cookieStore.set(blank.name, blank.value, blank.attributes);
    } catch {
      // Reading cookies in a Server Component cannot mutate them; ignore.
    }
    return null;
  }

  // Refresh the cookie when Lucia rotated the session
  if (result.session.fresh) {
    try {
      const fresh = lucia.createSessionCookie(result.session.id);
      cookieStore.set(fresh.name, fresh.value, fresh.attributes);
    } catch {
      // Same caveat — only writable in Server Actions / Route Handlers
    }
  }

  // Heartbeat into auth_events at most once per 24h per user
  void writeHeartbeatIfDue(result.user.id, result.user.tenantId).catch(() => {
    // Logging the heartbeat must never break a request
  });

  // Enrich the Sentry scope so any error in this request is attributable to a
  // user + role. The email is scrubbed to a stable hash before any event is
  // sent (see scrub.ts), so this is privacy-safe.
  setSentryUser({
    userId: result.user.id,
    email: result.user.email,
    role: result.user.role,
  });

  return {
    user: {
      id: result.user.id,
      tenantId: result.user.tenantId,
      email: result.user.email,
      role: result.user.role,
      fullName: result.user.fullName,
      status: result.user.status,
      mustChangePassword: result.user.mustChangePassword,
    },
    session: {
      id: result.session.id,
      expiresAt: result.session.expiresAt,
    },
  };
});

async function writeHeartbeatIfDue(userId: string, tenantId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true)`);
    const [row] = await tx
      .select({ lastAuthEventAt: users.lastAuthEventAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const last = row?.lastAuthEventAt;
    const now = Date.now();
    if (last && now - last.getTime() < HEARTBEAT_GAP_MS) return;

    await tx.insert(authEvents).values({
      tenantId,
      userId,
      eventType: 'session_heartbeat',
      success: true,
    });
    await tx
      .update(users)
      .set({ lastAuthEventAt: sql`now()` })
      .where(eq(users.id, userId));
  });
}
