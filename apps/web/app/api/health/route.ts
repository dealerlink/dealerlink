import { createHash, timingSafeEqual } from 'node:crypto';

import { adminDb } from '@dealerlink/db';
import { sql } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit } from '@/lib/rate-limit';

// Per docs/LOGGING.md — used by Better Stack uptime monitoring + DO App
// Platform health checks. DO treats any non-200 as unhealthy.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// /health (Day 17, chunk 17d) — granular component status.
//
//   ok        → 200   every component healthy
//   degraded  → 200   still serving traffic; alert but do NOT kill the pod
//   down      → 503   a critical component is unavailable
//
// Checks run in PARALLEL, each behind its own timeout, so the happy path
// answers in well under 500ms and the worst case is bounded by the slowest
// single timeout (the Resend ping, 3s) — never their sum.
// ---------------------------------------------------------------------------

type CheckStatus = 'ok' | 'degraded' | 'down' | 'skipped';

interface ComponentCheck {
  status: CheckStatus;
  [k: string]: unknown;
}

const EXPECTED_RLS_TABLES = [
  'users',
  'tenant_settings',
  'document_counters',
  'audit_log',
  'auth_events',
  'access_log',
];

/** Resolve to `onTimeout` if `p` has not settled within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(onTimeout), ms);
    }),
  ]);
}

// --- database: SELECT 1, 2s budget ----------------------------------------
async function dbCheck(): Promise<ComponentCheck> {
  const start = Date.now();
  const run = (async (): Promise<ComponentCheck> => {
    try {
      await adminDb.execute(sql`SELECT 1`);
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - start, error: (err as Error).message };
    }
  })();
  return withTimeout(run, 2000, { status: 'down', latencyMs: 2000, error: 'timeout' });
}

async function migrationsCheck(): Promise<ComponentCheck> {
  try {
    const [row] = await adminDb.execute(sql`
      SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations
    `);
    const n = (row as { n: number } | undefined)?.n ?? 0;
    return { status: n > 0 ? 'ok' : 'down', applied: n };
  } catch (err) {
    return { status: 'down', error: (err as Error).message };
  }
}

async function auditTriggerCheck(): Promise<ComponentCheck> {
  try {
    const rows = await adminDb.execute(sql`
      SELECT tgrelid::regclass::text AS table_name
      FROM pg_trigger
      WHERE tgname = 'audit_trg' AND NOT tgisinternal
    `);
    const tables = (rows as unknown as Array<{ table_name: string }>).map((r) => r.table_name);
    const required = ['tenants', 'users'];
    const missing = required.filter((t) => !tables.includes(t));
    return { status: missing.length === 0 ? 'ok' : 'down', missing };
  } catch (err) {
    return { status: 'down', error: (err as Error).message };
  }
}

async function rlsCheck(): Promise<ComponentCheck> {
  try {
    const rows = await adminDb.execute(sql`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relkind = 'r' AND relname IN ${sql.raw(
        `(${EXPECTED_RLS_TABLES.map((t) => `'${t}'`).join(',')})`,
      )}
    `);
    const status = (
      rows as unknown as Array<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>
    ).reduce<Record<string, boolean>>((acc, r) => {
      acc[r.relname] = r.relrowsecurity && r.relforcerowsecurity;
      return acc;
    }, {});
    const missing = EXPECTED_RLS_TABLES.filter((t) => !status[t]);
    return { status: missing.length === 0 ? 'ok' : 'down', missing };
  } catch (err) {
    return { status: 'down', error: (err as Error).message };
  }
}

// --- resend: status ping, 3s budget ---------------------------------------
// A failed ping is `degraded`, not `down`: Resend being unreachable does not
// stop Dealerlink serving traffic — outbound email is queued + retried by
// pg-boss. So it never alone forces a 503.
async function resendCheck(): Promise<ComponentCheck> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: 'skipped', message: 'RESEND_API_KEY not set' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      return { status: 'ok', latencyMs: Date.now() - start, httpStatus: res.status };
    }
    // The production key is a least-privilege *sending-only* key: it can POST
    // /emails but is NOT scoped to read /domains, so Resend answers this liveness
    // ping with 401 + name 'restricted_api_key'. That exact response is itself
    // proof the key is valid and accepted — authentication succeeded; only the
    // scope is narrowed — so it counts as `ok`. We match the precise error name
    // (never "any 401") so a genuinely invalid or revoked key still surfaces as
    // `degraded`. A failed Resend ping stays `degraded`, never `down`: outbound
    // email is queued + retried by pg-boss, so Resend must never alone 503 us.
    if (res.status === 401) {
      const body = (await res.json().catch(() => null)) as { name?: string } | null;
      if (body?.name === 'restricted_api_key') {
        return {
          status: 'ok',
          latencyMs: Date.now() - start,
          httpStatus: res.status,
          keyScope: 'sending-only',
        };
      }
    }
    return { status: 'degraded', latencyMs: Date.now() - start, httpStatus: res.status };
  } catch (err) {
    return { status: 'degraded', latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

// --- queue: pg-boss backlog depth -----------------------------------------
// Depth > 100 in any queue → degraded; > 500 → down. When pg-boss has never
// started (no `pgboss` schema) the check is `skipped`.
async function queueCheck(): Promise<ComponentCheck> {
  try {
    const rows = await adminDb.execute(sql`
      SELECT name, count(*)::int AS depth
      FROM pgboss.job
      WHERE state IN ('created', 'retry', 'active')
      GROUP BY name
    `);
    const depthByType = (rows as unknown as Array<{ name: string; depth: number }>).reduce<
      Record<string, number>
    >((acc, r) => {
      acc[r.name] = r.depth;
      return acc;
    }, {});
    const max = Object.values(depthByType).reduce((m, d) => Math.max(m, d), 0);
    const status: CheckStatus = max > 500 ? 'down' : max > 100 ? 'degraded' : 'ok';
    return { status, depthByType };
  } catch (err) {
    const message = (err as Error).message;
    // 42P01 = undefined_table → pg-boss has not bootstrapped yet.
    if (message.includes('pgboss.job') || message.includes('does not exist')) {
      return { status: 'skipped', message: 'pg-boss not initialised' };
    }
    return { status: 'degraded', error: message };
  }
}

// ---------------------------------------------------------------------------
// F.176 — WHO MAY SEE THE DETAIL
//
// ## THE DISCLOSURE WAS LATENT AND CORRELATED WITH THE INCIDENT
//
// This endpoint is unauthenticated BY DESIGN — `middleware.ts`'s matcher excludes
// it so Better Stack can ping it every 30s. The detail it returned, however,
// included `rls.missing` and `auditTrigger.missing`: named arrays of tables
// lacking tenant isolation or an audit trail.
//
// **Those arrays are empty when nothing is wrong, and non-empty exactly when
// something is.** So the endpoint published a map of unprotected tables at the
// moment that map was most useful to an attacker, and a reviewer reading the live
// response on a good day saw two empty arrays and concluded there was nothing to
// protect. **A field that leaks only when you are vulnerable is worse than one
// that always leaks**, because nothing in normal operation shows you the risk.
// Also exposed: `queue.depthByType` (job names + backlog), `resend.keyScope`,
// and `migrations.applied` — which tells a reader which migrations you have and
// therefore which you do not.
//
// ## THE SHAPE
//
// Unauthenticated callers get `{ status, timestamp }` and the same HTTP code.
// An uptime monitor needs a 200 and a status word; it does not need the names of
// your unprotected tables. The checks still all RUN — `status` and the 503 are
// computed from them exactly as before — only the serialisation changes.
//
// Rejected alternative (recorded on F.176): keep the detail but reduce `missing`
// to COUNTS and `depthByType` to a total. A count of missing RLS policies still
// says "there is a hole" to anyone watching, and it leaves the operator who needs
// the detail with no way to get it.
//
// ## WHY A SHARED SECRET AND NOT AN OPERATOR SESSION
//
// The row permitted either. The secret is what got built, for three reasons:
// `pnpm merge-status` (F.173) is the actual consumer and cannot hold a browser
// session; a token FAILS CLOSED, because if `HEALTH_TOKEN` is unset nobody can
// read the detail, whereas a session path is only as good as the session code
// reached from an unauthenticated route; and a second auth path on a public
// endpoint is a second thing to get wrong. A human who needs the detail uses the
// same token. **Not a rejection of the session option on the merits — if an
// operator-facing health page is ever wanted, that is the moment to add it.**
//
// Comparison is timing-safe over SHA-256 digests, which also makes it
// length-independent: `timingSafeEqual` throws on unequal-length buffers, and
// catching that throw would itself leak the length.
// ---------------------------------------------------------------------------

/** Constant-time string equality, via equal-length digests. */
function secretEquals(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

/**
 * True only for a caller presenting the configured bearer token.
 *
 * FAILS CLOSED: with `HEALTH_TOKEN` unset, this is always false and the detail
 * is unreachable by anyone. That is the correct default for a public route — an
 * absent secret must not mean "no check".
 */
function detailAuthorised(req: NextRequest): boolean {
  const expected = process.env.HEALTH_TOKEN;
  if (!expected) return false;
  const presented = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!presented) return false;
  return secretEquals(presented, expected);
}

/**
 * The build actually running, or `null` when nothing says.
 *
 * **It used to fall back to the string `'dev'`, and production reported `'dev'`**
 * — so from outside you could not tell which build was live, which is F.173's
 * problem one layer down. `'dev'` is a CLAIM about the environment; `null` with
 * a named source is the truth. Neither env var is set on either DO app today, so
 * this reports `{ version: null, versionSource: 'unset' }` until the spec sets
 * one — a live-spec change, and the operator's (DEV.64).
 */
function build(): { version: string | null; versionSource: string } {
  if (process.env.SENTRY_RELEASE)
    return { version: process.env.SENTRY_RELEASE, versionSource: 'SENTRY_RELEASE' };
  if (process.env.NEXT_PUBLIC_GIT_SHA)
    return { version: process.env.NEXT_PUBLIC_GIT_SHA, versionSource: 'NEXT_PUBLIC_GIT_SHA' };
  return { version: null, versionSource: 'unset' };
}

/** Roll component statuses up into one overall status. */
function aggregate(statuses: CheckStatus[]): 'ok' | 'degraded' | 'down' {
  if (statuses.includes('down')) return 'down';
  if (statuses.includes('degraded')) return 'degraded';
  return 'ok';
}

export async function GET(req: NextRequest) {
  const start = Date.now();

  // Rate-limit at 60/min/IP (~1 req/s). /api/health is public so it's worth
  // shielding; DO + Better Stack poll at 60s intervals, well under the cap.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const rl = await checkRateLimit({ scope: 'health', key: ip, limit: 60, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { status: 'rate_limited', resetAt: rl.resetAt.toISOString() },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.floor(rl.resetAt.getTime() / 1000).toString(),
        },
      },
    );
  }

  const [db, migrations, auditTrigger, rls, resend, queue] = await Promise.all([
    dbCheck(),
    migrationsCheck(),
    auditTriggerCheck(),
    rlsCheck(),
    resendCheck(),
    queueCheck(),
  ]);

  const checks = { db, migrations, auditTrigger, rls, resend, queue };
  const status = aggregate(Object.values(checks).map((c) => c.status));
  const httpStatus = status === 'down' ? 503 : 200;

  const timestamp = new Date().toISOString();

  // THE PUBLIC BODY. Same `status`, same HTTP code, no detail. The monitor's
  // contract is unchanged; everything a reader could mine is gone.
  const body = detailAuthorised(req)
    ? {
        status,
        ...build(),
        checks,
        timestamp,
        uptimeSeconds: Math.floor(process.uptime()),
        responseMs: Date.now() - start,
        detail: 'full' as const,
      }
    : { status, timestamp, detail: 'withheld' as const };

  return NextResponse.json(body, {
    status: httpStatus,
    headers: {
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': rl.remaining.toString(),
      'X-RateLimit-Reset': Math.floor(rl.resetAt.getTime() / 1000).toString(),
    },
  });
}
