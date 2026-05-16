/**
 * Structured logging for the workers process (Day 17, chunk 17b).
 *
 * Same destination strategy as the web logger (`apps/web/lib/observability/
 * logger.ts`): pino-pretty in dev, Better Stack via `@logtail/pino` in prod
 * when configured, else NDJSON to stdout. The workers process is plain Node
 * (no Next bundling), so a worker-thread transport would also be safe here —
 * the in-process pretty stream is kept only for consistency with web.
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
    return pino(options);
  }
  return pino(
    options,
    pinoPretty({ colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' }),
  );
}

/** The workers process logger. */
export const logger = build();
