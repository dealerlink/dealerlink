/**
 * Sentry — browser runtime (Day 17, chunk 17a).
 *
 * Auto-loaded by the Sentry Next.js bundler plugin. The browser DSN MUST be
 * a `NEXT_PUBLIC_*` variable to be inlined into the client bundle. When unset,
 * `enabled: false` makes the SDK a graceful no-op (dev runs without Sentry).
 */
import * as Sentry from '@sentry/nextjs';

import { scrubEvent } from '@/lib/observability/scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  // 10% performance-trace sampling in prod (STAGE_D_HANDOFF §8); errors are 100%.
  tracesSampleRate: 0.1,
  // Privacy: never let the SDK auto-collect IPs / cookies / headers.
  sendDefaultPii: false,
  // Every event is scrubbed of emails / phones / GSTIN / PAN / card runs.
  beforeSend: scrubEvent,
});
