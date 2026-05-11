import { adminDb } from '@dealerlink/db';
import { sql } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { checkRateLimit } from '@/lib/rate-limit';

// Per CLAUDE.md §6 — used by Better Stack uptime monitoring.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EXPECTED_RLS_TABLES = [
  'users',
  'tenant_settings',
  'document_counters',
  'audit_log',
  'auth_events',
  'access_log',
];

interface HealthCheck {
  ok: boolean;
  [k: string]: unknown;
}

async function dbCheck(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await adminDb.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

async function migrationsCheck(): Promise<HealthCheck> {
  try {
    const [row] = await adminDb.execute(sql`
      SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations
    `);
    const n = (row as { n: number } | undefined)?.n ?? 0;
    return { ok: n > 0, applied: n };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function auditTriggerCheck(): Promise<HealthCheck> {
  try {
    const rows = await adminDb.execute(sql`
      SELECT tgrelid::regclass::text AS table_name
      FROM pg_trigger
      WHERE tgname = 'audit_trg' AND NOT tgisinternal
    `);
    const tables = (rows as unknown as Array<{ table_name: string }>).map((r) => r.table_name);
    const required = ['tenants', 'users'];
    const missing = required.filter((t) => !tables.includes(t));
    return { ok: missing.length === 0, tables, missing };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function rlsCheck(): Promise<HealthCheck> {
  try {
    const rows = await adminDb.execute(sql`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relkind = 'r' AND relname IN ${sql.raw(`(${EXPECTED_RLS_TABLES.map((t) => `'${t}'`).join(',')})`)}
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
    return { ok: missing.length === 0, missing };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function GET(req: NextRequest) {
  const start = Date.now();

  // Rate-limit at 60/min/IP. /api/health is public so it's worth shielding.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const rl = await checkRateLimit({
    scope: 'health',
    key: ip,
    limit: 60,
    windowSec: 60,
  });
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

  const [db, migrations, auditTrigger, rls] = await Promise.all([
    dbCheck(),
    migrationsCheck(),
    auditTriggerCheck(),
    rlsCheck(),
  ]);

  const allOk = db.ok && migrations.ok && auditTrigger.ok && rls.ok;
  const status = allOk ? 'ok' : 'degraded';

  return NextResponse.json(
    {
      status,
      checks: {
        db,
        migrations,
        auditTrigger,
        rls,
        // Day 2+ placeholders — wired up as those subsystems land.
        queue: { ok: false, note: 'pg-boss not connected yet — Week 2' },
        worker: { ok: false, note: 'workers not started yet — Week 2' },
        inboundEmail: { ok: false, note: 'Resend webhook — Week 3' },
      },
      version: process.env['NEXT_PUBLIC_GIT_SHA'] ?? 'dev',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      responseMs: Date.now() - start,
    },
    {
      status: allOk ? 200 : 503,
      headers: {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': rl.remaining.toString(),
        'X-RateLimit-Reset': Math.floor(rl.resetAt.getTime() / 1000).toString(),
      },
    },
  );
}
