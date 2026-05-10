import { sql } from 'drizzle-orm';

import { db, type DrizzleDb } from './client';

export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/**
 * Run a callback inside a transaction with `app.tenant_id` set so that
 * RLS policies on every tenant-scoped table evaluate against that tenant.
 *
 * SET LOCAL is scoped to the current transaction, which is exactly what
 * we want — no leakage to subsequent connections from the pool.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Same as withTenant, but also sets `app.user_id` so audit-log triggers
 * can populate `changed_by`.
 */
export async function withTenantUser<T>(
  tenantId: string,
  userId: string | null,
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId ?? ''}, true)`);
    return fn(tx);
  });
}
