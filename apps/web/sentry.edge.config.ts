/**
 * Sentry — Edge runtime (Day 17, chunk 17a).
 *
 * Loaded by `instrumentation.ts` when `NEXT_RUNTIME === 'edge'` (middleware).
 * `scrubEvent` is dependency-free and edge-safe, so the same PII guarantee
 * holds here. When the DSN is unset the SDK is a graceful no-op.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubEvent } from '@/lib/observability/scrub';

const dsn = process.env.SENTRY_DSN ?? '';

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
