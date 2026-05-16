/**
 * Error reporting shim. Day 17 (Observability) wires the real Sentry client
 * here; until then `reportError` just writes a structured line to the
 * console. Centralising the call site means Day 17 is a one-file change.
 *
 * NOTE: errors are deliberately NOT written to `audit_log` from application
 * code — that table is trigger-owned (CLAUDE.md §7). Application error
 * telemetry belongs in Sentry / Axiom, which Day 17 connects.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const payload = {
    at: new Date().toISOString(),
    ...context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  // eslint-disable-next-line no-console -- intentional until Day 17 Sentry wiring
  console.error('[dealerlink:error]', JSON.stringify(payload));
}
