import { type NextRequest, NextResponse } from 'next/server';

// Health endpoint per CLAUDE.md §7 — used by Better Stack uptime monitoring
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const startMs = Date.now();

  // Day 2 will add real DB + queue checks. For now, return ok.
  const response = {
    status: 'ok' as const,
    checks: {
      db: { ok: false, latencyMs: null, note: 'Not connected yet — Day 2' },
      queue: { ok: false, depth: null, note: 'pg-boss not connected yet — Week 2' },
      worker: { ok: false, lastHeartbeatSeconds: null, note: 'Workers not started yet — Week 2' },
      inboundEmail: { ok: false, lastReceivedSeconds: null, note: 'Resend webhook — Week 3' },
    },
    version: process.env['NEXT_PUBLIC_GIT_SHA'] ?? 'dev',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    responseMs: Date.now() - startMs,
  };

  return NextResponse.json(response, { status: 200 });
}
