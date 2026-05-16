/**
 * Structured logging (Day 17, chunk 17b).
 *
 * One pino instance per process. Every line carries `service` plus the active
 * ALS context (`tenantId` / `userId` / `requestId` / `route`) via pino's
 * `mixin` hook — see als.ts.
 *
 * Destinations:
 *   - dev   → pino-pretty, colourised, in-process stream. Deliberately NOT a
 *             pino `transport` (worker thread): a worker-thread transport is
 *             fragile under Next.js bundling, whereas a plain stream is not.
 *   - prod  → Better Stack via `@logtail/pino` when BETTERSTACK_SOURCE_TOKEN
 *             is set; otherwise NDJSON to stdout (DO Logs ships it onward).
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

  const betterStackToken = process.env.BETTERSTACK_SOURCE_TOKEN;
  if (isProd && betterStackToken) {
    return pino({
      ...options,
      transport: {
        target: '@logtail/pino',
        options: {
          sourceToken: betterStackToken,
          options: {
            endpoint: `https://${
              process.env.BETTERSTACK_INGESTING_HOST ?? 'in.logs.betterstack.com'
            }`,
          },
        },
      },
    });
  }

  if (isProd) {
    // No Better Stack token — NDJSON to stdout, collected by DO Logs.
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
