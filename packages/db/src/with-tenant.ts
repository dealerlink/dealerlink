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
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${options.userId ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.request_ip', ${options.ip ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.request_ua', ${options.userAgent ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', ${options.readOnly ? '1' : ''}, true)`);
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
