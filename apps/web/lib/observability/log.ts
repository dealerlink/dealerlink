/**
 * Error reporting (Day 17, chunk 17a).
 *
 * `reportError` is the single call site for application error telemetry. It
 * routes to Sentry (`captureException`) AND keeps the structured console line
 * so the error is still visible in the dev terminal / DO Logs. Centralising
 * the call site means swapping the backend is a one-file change.
 *
 * Isomorphic: `@sentry/nextjs` exposes `captureException` on both the browser
 * and Node runtimes, so this module is safe to import from Client Components
 * (e.g. `app/(app)/error.tsx`) as well as server code.
 *
 * NOTE: errors are deliberately NOT written to `audit_log` from application
 * code — that table is trigger-owned (CLAUDE.md §7). Application error
 * telemetry belongs in Sentry; business analytics belong in Axiom.
 */
import * as Sentry from '@sentry/nextjs';

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const payload = {
    at: new Date().toISOString(),
    ...context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  // Kept alongside Sentry so the error still surfaces in the dev terminal.
  // eslint-disable-next-line no-console -- intentional: parallel dev-visible sink
  console.error('[dealerlink:error]', JSON.stringify(payload));

  Sentry.captureException(error, context ? { extra: context } : undefined);
}
