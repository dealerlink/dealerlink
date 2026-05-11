import { adminDb, sessions, users } from '@dealerlink/db';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { Lucia } from 'lucia';
import { z } from 'zod';

// Lucia uses the admin client because session validation must look up the
// user row by id BEFORE we know which tenant context to set. The lookup is
// by primary key (no enumeration risk) and only the matching user is
// returned to the validated session — never exposed cross-tenant.
const adapter = new DrizzlePostgreSQLAdapter(adminDb, sessions, users);

// ============================================================================
// ZOD AT THE LUCIA BOUNDARY  (resolves PROJECT_PLAN.md R.8, see ADR-009)
// ----------------------------------------------------------------------------
// Day 2 had a silent failure where `getUserAttributes` read snake_case keys
// from a row Drizzle returned in camelCase. Every attribute was undefined and
// the Sidebar crashed downstream. We now run the row through Zod here so
// shape drift fails LOUDLY at validation time rather than silently elsewhere.
// ============================================================================
const userAttributesSchema = z.object({
  tenantId: z.string().uuid().nullable(),
  email: z.string().min(1),
  role: z.enum(['admin', 'sales', 'accounts', 'dispatch', 'operator']),
  fullName: z.string().min(1),
  status: z.enum(['active', 'invited', 'suspended', 'deleted']),
});

export type UserAttributes = z.infer<typeof userAttributesSchema>;

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: 'dealerlink_session',
    expires: false, // session cookie expiry follows the DB session
    attributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      // Cross-subdomain sharing per ADR-001 in production
      ...(process.env.NODE_ENV === 'production' ? { domain: '.dealerlink.in' } : {}),
    },
  },
  getUserAttributes: (data) => {
    const parsed = userAttributesSchema.safeParse(data);
    if (!parsed.success) {
      const got = Object.keys(data as Record<string, unknown>).join(',') || '(empty)';
      throw new Error(
        `[lucia] DatabaseUserAttributes failed Zod validation. ` +
          `Got keys: ${got}. Issues: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  },
});

export type Auth = typeof lucia;

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    // Lucia's adapter passes the raw row through. With Drizzle's casing:'snake_case',
    // TS keys are camelCase even though DB columns are snake_case. The Zod schema
    // above is the single source of truth — these keys must match it.
    DatabaseUserAttributes: {
      tenantId: string | null;
      email: string;
      role: 'admin' | 'sales' | 'accounts' | 'dispatch' | 'operator';
      fullName: string;
      status: 'active' | 'invited' | 'suspended' | 'deleted';
    };
  }
}
