/**
 * Sentry — Node.js server runtime (Day 17, chunk 17a).
 *
 * Loaded by `instrumentation.ts` when `NEXT_RUNTIME === 'nodejs'`. The server
 * DSN is a server-only secret (no `NEXT_PUBLIC_` prefix). When unset the SDK
 * is a graceful no-op.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubEvent } from '@/lib/observability/scrub';

const dsn = process.env.SENTRY_DSN ?? '';

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE,
  // 10% performance-trace sampling in prod (STAGE_D_HANDOFF §8); errors are 100%.
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
