/**
 * Next.js instrumentation hook (Day 17, chunk 17a).
 *
 * `register()` runs once per server/edge runtime at process start and loads
 * the matching Sentry config. `onRequestError` forwards uncaught errors from
 * React Server Components / route handlers to Sentry.
 */
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
