import { sql } from 'drizzle-orm';

import { db, type DrizzleDb } from './client';

export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

export interface TenantContextOptions {
  /** Acting user id — written to audit_log.changed_by via the trigger. */
  userId?: string | null;
  /** Caller IP — written to audit_log.ip via the trigger. */
  ip?: string | null;
  /** Caller user-agent — written to audit_log.user_agent via the trigger. */
  userAgent?: string | null;
  /**
   * If true, the transaction will reject any INSERT/UPDATE/DELETE on
   * tenant-scoped tables. Used by the operator-impersonation flow to keep
   * the operator strictly read-only.
   */
  readOnly?: boolean;
}

/**
 * Operator read-only view — belt #2 (DB-level, path-independent).
 *
 * The operator read-only tenant view (ADR-014) must hold "by construction":
 * EVERY `withTenant` transaction in an impersonated request must be read-only,
 * whether or not the caller (a read query helper, a future server component,
 * an as-yet-unwritten side-effect) remembered to pass `{ readOnly: true }`.
 *
 * `packages/db` cannot read the Next.js request (cookies live in `next/headers`,
 * a web-only, request-scoped API). So the web app injects a resolver here at
 * startup; `withTenant` consults it and forces read-only when it returns true.
 * The resolver only ever ADDS restriction (forces read-only) — it can never
 * relax it — so a faulty/missing resolver fails safe (no read-only forced) and
 * can never widen write access.
 *
 * Outside a request (workers, seeds, cron) the resolver must return false.
 */
type ReadOnlyResolver = () => boolean;

// Stored on globalThis (like the DB pools in client.ts) so a single resolver is
// shared even if Next.js loads more than one instance of this module across its
// server bundles — otherwise a resolver registered in one bundle would be
// invisible to a `withTenant` running in another.
interface ReadOnlyResolverGlobal {
  __dealerlinkReadOnlyResolver?: ReadOnlyResolver | null;
}
const resolverGlobal = globalThis as unknown as ReadOnlyResolverGlobal;

/** Register (or clear, with null) the global force-read-only resolver. */
export function setReadOnlyResolver(resolver: ReadOnlyResolver | null): void {
  resolverGlobal.__dealerlinkReadOnlyResolver = resolver;
}

function forcedReadOnly(): boolean {
  const resolver = resolverGlobal.__dealerlinkReadOnlyResolver;
  if (!resolver) return false;
  try {
    return resolver() === true;
  } catch {
    // A resolver that throws (e.g. called outside a request scope) must never
    // grant write access — treat it as "not forced" and let the explicit
    // `options.readOnly` decide.
    return false;
  }
}

/**
 * Run a callback inside a transaction with `app.tenant_id` (and optionally
 * `app.user_id`, `app.request_ip`, `app.request_ua`, `app.read_only`) set so
 * that RLS policies and audit triggers resolve to the right tenant + actor.
 *
 * SET LOCAL is scoped to the current transaction, so nothing leaks back to
 * the connection pool after commit/rollback.
 *
 * Errors propagate; the transaction rolls back. Postgres-js handles this.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: DrizzleTx) => Promise<T>,
  options: TenantContextOptions = {},
): Promise<T> {
  // Read-only is forced when the caller asks for it OR when the operator
  // read-only-view resolver says this request is impersonating. Either belt
  // alone suffices; together they are defense-in-depth (ADR-014).
  const readOnly = options.readOnly === true || forcedReadOnly();
  return db.transaction(async (tx) => {
    // SET TRANSACTION READ ONLY must precede the first real query in the
    // transaction, so it goes BEFORE the set_config() SELECTs. This makes
    // Postgres itself refuse every INSERT/UPDATE/DELETE on ANY table —
    // including non-audited / non-RLS tables the audit trigger never sees —
    // regardless of code path. `app.read_only` (below) is the surgical,
    // friendlier-message belt the audit trigger enforces on top.
    if (readOnly) {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
    }
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${options.userId ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.request_ip', ${options.ip ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.request_ua', ${options.userAgent ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', ${readOnly ? '1' : ''}, true)`);
    return fn(tx);
  });
}

/**
 * Compat alias retained for Day 2 callers. Same as `withTenant(tenantId, fn,
 * { userId })`.
 */
export async function withTenantUser<T>(
  tenantId: string,
  userId: string | null,
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  return withTenant(tenantId, fn, { userId });
}

/**
 * Run a callback as a platform operator (no tenant context). Sets only
 * `app.user_id`. Useful for operator-app server actions that don't touch
 * tenant-scoped tables.
 */
export async function withOperator<T>(
  userId: string | null,
  fn: (tx: DrizzleTx) => Promise<T>,
  options: Omit<TenantContextOptions, 'userId'> = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.request_ip', ${options.ip ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.request_ua', ${options.userAgent ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', ${options.readOnly ? '1' : ''}, true)`);
    return fn(tx);
  });
}
