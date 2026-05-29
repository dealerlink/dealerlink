/**
 * Structured logging for the workers process (Day 17, chunk 17b; transport
 * reworked D.2 / DEV.79).
 *
 * Same destination strategy as the web logger (`apps/web/lib/observability/
 * logger.ts`): pino-pretty in dev, NDJSON to stdout in prod. The
 * `@logtail/pino` worker-thread transport was removed in DEV.79 — on the web
 * side it failed to resolve under Next webpack bundling and surfaced as
 * "Cannot find module 'worker.js'" against the triggering HTTP request. The
 * workers process is plain Node (no bundling), so the transport would have
 * been technically safe here — but they're kept in lock-step for consistency
 * and so a future revisit (DO log drain or @logtail/node HTTP) changes both
 * processes the same way.
 *
 * Workers have no per-request ALS context; call sites attach job context via
 * pino child loggers (`logger.child({ job: ... })`) instead.
 */
import pino, { type Logger } from 'pino';
import pinoPretty from 'pino-pretty';

function build(): Logger {
  const isProd = process.env.NODE_ENV === 'production';
  const options: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
    base: { service: 'workers' },
  };

  if (isProd) {
    // NDJSON to stdout, collected by DO Logs. No worker-thread transport
    // (DEV.79). Mirrored from apps/web/lib/observability/logger.ts.
    return pino(options);
  }
  return pino(
    options,
    pinoPretty({ colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' }),
  );
}

/** The workers process logger. */
export const logger = build();
