/**
 * Structured logging (Day 17, chunk 17b; logger transport reworked D.2 / DEV.79).
 *
 * One pino instance per process. Every line carries `service` plus the active
 * ALS context (`tenantId` / `userId` / `requestId` / `route`) via pino's
 * `mixin` hook — see als.ts.
 *
 * Destinations:
 *   - dev   → pino-pretty, colourised, in-process stream. Deliberately NOT a
 *             pino `transport` (worker thread): a worker-thread transport is
 *             fragile under Next.js bundling, whereas a plain stream is not.
 *   - prod  → NDJSON to stdout. DO App Platform collects stdout into DO Logs;
 *             a log drain to Better Stack can be configured separately at the
 *             DO layer when log shipping is revisited.
 *
 * **Why no `@logtail/pino` transport here (DEV.79):** the @logtail/pino target
 * runs in a pino worker thread. Under Next.js webpack bundling the worker's
 * entrypoint chunk (resolved by `thread-stream`) is not produced reliably —
 * every log call raises `Error: Cannot find module 'worker.js'`, which the
 * Next runtime surfaces against the *triggering* HTTP request (in production
 * the most visible victim was POST /login, where it looked like an auth
 * outage). Removing the transport branch makes the in-process pino emit
 * NDJSON directly, with **zero impact on auth or request handling**. The
 * `BETTERSTACK_SOURCE_TOKEN` env var stays in production (kept harmless,
 * read only by the uptime monitor at the BS side); when log shipping is
 * revisited post-pilot the candidate is either a DO log-drain or
 * `@logtail/node`'s HTTP path (no worker thread), not this transport.
 *
 * `console.*` across the app is replaced by `logger.*`; the only survivor is
 * the parallel `console.error` inside `reportError` (a dev-terminal sink that
 * runs alongside Sentry).
 */
import pino, { type DestinationStream, type Logger } from 'pino';
import pinoPretty from 'pino-pretty';

import { getLogContext } from './als';

export type ServiceName = 'web' | 'workers';

function resolveLevel(): string {
  return process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
}

/**
 * Build a logger for a service. `destination` is for tests (a memory stream);
 * production code uses the env-driven default destination.
 */
export function createLogger(service: ServiceName, destination?: DestinationStream): Logger {
  const isProd = process.env.NODE_ENV === 'production';
  const options: pino.LoggerOptions = {
    level: resolveLevel(),
    base: { service },
    // Injected on every log call — keeps request context off the call sites.
    mixin: () => getLogContext(),
  };

  if (destination) {
    return pino(options, destination);
  }

  if (isProd) {
    // NDJSON to stdout, collected by DO Logs. No worker-thread transport
    // (DEV.79) — the @logtail/pino path failed to resolve under Next webpack
    // bundling. When log shipping is revisited, prefer a DO log drain or
    // @logtail/node's HTTP client (in-process, no worker).
    return pino(options);
  }

  // Dev — pretty, colourised, in-process (no worker thread).
  return pino(
    options,
    pinoPretty({
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname',
    }),
  );
}

/** The web process logger. */
export const logger = createLogger('web');
