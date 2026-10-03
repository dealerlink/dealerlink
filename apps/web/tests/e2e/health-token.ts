/**
 * The verify-only `/api/health` detail token (F.176).
 *
 * `/api/health` now answers `{ status, timestamp, detail: 'withheld' }` to
 * unauthenticated callers, because its detail named the tables lacking RLS or an
 * audit trigger — and named them precisely when some were missing. The granular
 * component status the Day 1 and Day 17 specs assert on is still there; it now
 * requires the bearer token.
 *
 * **This constant exists so the specs and the webServer that serves them cannot
 * disagree.** The spec process and the server are different processes, so the
 * server's `HEALTH_TOKEN` is set from here in `playwright.config.ts`'s
 * `webServer.env` and read from here by the specs. A literal in two places would
 * drift, and the drift would look exactly like the endpoint withholding
 * correctly.
 *
 * It is NOT a secret: it only ever reaches a localhost dev server booted by
 * Playwright. The production token is set in the DO app spec and is not in this
 * repository.
 */
export const VERIFY_HEALTH_TOKEN = 'verify-only-health-detail-token';

/** Ready-to-spread request headers for a spec that wants the detail. */
export const healthDetailHeaders = { authorization: `Bearer ${VERIFY_HEALTH_TOKEN}` };
