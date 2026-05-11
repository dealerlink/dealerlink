import { adminDb, sessions, users } from '@dealerlink/db';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { Lucia } from 'lucia';

// Lucia uses the admin client because session validation must look up the
// user row by id BEFORE we know which tenant context to set. The lookup is
// by primary key (no enumeration risk) and only the matching user is
// returned to the validated session — never exposed cross-tenant.
const adapter = new DrizzlePostgreSQLAdapter(adminDb, sessions, users);

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
  // Drizzle returns columns by their TS property names (camelCase), regardless
  // of the snake_case DB columns. The adapter passes the row through verbatim,
  // so we read camelCase here too.
  getUserAttributes: (data) => ({
    tenantId: data.tenantId,
    email: data.email,
    role: data.role,
    fullName: data.fullName,
    status: data.status,
  }),
});

export type Auth = typeof lucia;

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      tenantId: string | null;
      email: string;
      role: 'admin' | 'sales' | 'accounts' | 'dispatch' | 'operator';
      fullName: string;
      status: 'active' | 'invited' | 'suspended' | 'deleted';
    };
  }
}
