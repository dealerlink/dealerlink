import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth/session';
import { setSentryRoute } from '@/lib/observability/context';
import { reportError } from '@/lib/observability/log';

/**
 * Operator-only Sentry smoke-test endpoint (Day 17, chunk 17a).
 *
 * Throwing on demand lets an operator confirm — post-deploy — that the Sentry
 * wiring works end-to-end: the error reaches the dev terminal (via
 * `reportError`'s console sink) and Sentry (via `captureException` + the
 * route-error instrumentation hook). Not linked from any navigation; gated to
 * the `operator` role and 404s for everyone else so it cannot be probed.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.user.role !== 'operator') {
    // 404 (not 403) so the endpoint's existence is not disclosed.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  setSentryRoute({ route: '/api/internal/sentry-test', method: 'GET' });
  const error = new Error('Sentry test error — triggered from /api/internal/sentry-test');
  // reportError captures to Sentry AND prints to the dev terminal, so the
  // operator sees confirmation regardless of whether a DSN is configured.
  reportError(error, { trigger: 'sentry-test-endpoint', operatorId: ctx.user.id });
  throw error;
}
