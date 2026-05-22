import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __dealerlinkPg: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __dealerlinkDb: ReturnType<typeof makeDb> | undefined;
  // eslint-disable-next-line no-var
  var __dealerlinkAdminPg: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __dealerlinkAdminDb: ReturnType<typeof makeAdminDb> | undefined;
}

/**
 * Pool sizing. Defaults suit a roomy production DB, but small managed tiers
 * (e.g. DO's basic 1GB Postgres caps at max_connections=25, ~16 of which DO
 * itself consumes) need much smaller pools shared across the web + workers
 * processes. DB_POOL_MAX / DB_ADMIN_POOL_MAX let an environment cap them
 * without a code change. See DEV.61.
 */
function poolMax(envKey: 'DB_POOL_MAX' | 'DB_ADMIN_POOL_MAX', fallback: number): number {
  const raw = process.env[envKey];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function makeClient(envKey: 'DATABASE_URL' | 'DATABASE_DIRECT_URL') {
  const url = process.env[envKey];
  if (!url) {
    throw new Error(`${envKey} is not set`);
  }
  return postgres(url, {
    max: poolMax('DB_POOL_MAX', process.env.NODE_ENV === 'production' ? 20 : 10),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
  });
}

function makeDb() {
  const client = globalThis.__dealerlinkPg ?? makeClient('DATABASE_URL');
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__dealerlinkPg = client;
  }
  return drizzle(client, { schema, casing: 'snake_case' });
}

function makeAdminDb() {
  const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  const client =
    globalThis.__dealerlinkAdminPg ??
    postgres(url!, {
      max: poolMax('DB_ADMIN_POOL_MAX', process.env.NODE_ENV === 'production' ? 5 : 3),
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: false,
    });
  if (!url) throw new Error('DATABASE_DIRECT_URL or DATABASE_URL must be set');
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__dealerlinkAdminPg = client;
  }
  return drizzle(client, { schema, casing: 'snake_case' });
}

export type DrizzleDb = ReturnType<typeof makeDb>;

/**
 * Lazy proxy. The real client is created on first property access so build-
 * time evaluation (Next.js page-data collection) does not crash when env
 * vars are absent. At runtime, env is set and the proxy resolves once.
 *
 * Connects as `dealerlink_app` — RLS-enforced. Always set `app.tenant_id`
 * inside a transaction before tenant-scoped queries.
 */
const dbProxyTarget: DrizzleDb = Object.create(null);
export const db: DrizzleDb = new Proxy(dbProxyTarget, {
  get(_target, prop) {
    const real = globalThis.__dealerlinkDb ?? makeDb();
    if (process.env.NODE_ENV !== 'production') {
      globalThis.__dealerlinkDb = real;
    }
    const value = real[prop as keyof DrizzleDb];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/**
 * Admin client — connects as `dealerlink` (SUPERUSER, BYPASSRLS).
 * Reserved for trusted server-side code that genuinely needs to cross
 * tenant boundaries: Lucia session validation, operator-only platform
 * tooling, migrations. Never expose its results to client-side code without
 * an explicit tenant check.
 */
const adminDbProxyTarget: DrizzleDb = Object.create(null);
export const adminDb: DrizzleDb = new Proxy(adminDbProxyTarget, {
  get(_target, prop) {
    const real = globalThis.__dealerlinkAdminDb ?? makeAdminDb();
    if (process.env.NODE_ENV !== 'production') {
      globalThis.__dealerlinkAdminDb = real;
    }
    const value = real[prop as keyof DrizzleDb];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export async function closeDbConnection(): Promise<void> {
  if (globalThis.__dealerlinkPg) {
    await globalThis.__dealerlinkPg.end({ timeout: 5 });
    globalThis.__dealerlinkPg = undefined;
    globalThis.__dealerlinkDb = undefined;
  }
  if (globalThis.__dealerlinkAdminPg) {
    await globalThis.__dealerlinkAdminPg.end({ timeout: 5 });
    globalThis.__dealerlinkAdminPg = undefined;
    globalThis.__dealerlinkAdminDb = undefined;
  }
}
