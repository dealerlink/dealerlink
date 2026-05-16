/**
 * Sentry for the workers process (Day 17, chunk 17a).
 *
 * `initWorkerSentry()` is called once at process start. Each pg-boss job
 * handler is wrapped with `instrumentJobHandler`, which captures any thrown
 * error to Sentry with job context (id, type, attempt) attached, then
 * re-throws so pg-boss's own retry policy still applies.
 *
 * Graceful no-op when SENTRY_DSN is unset (dev).
 */
import * as Sentry from '@sentry/node';

import { scrubEvent } from './scrub';

let initialized = false;

export function initWorkerSentry(): void {
  if (initialized) return;
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
  initialized = true;
}

export interface JobErrorContext {
  jobId: string;
  jobType: string;
  attempt: number;
}

/** Capture a job failure to Sentry with job context as scope tags + context. */
export function captureJobError(error: unknown, ctx: JobErrorContext): void {
  Sentry.withScope((scope) => {
    scope.setTag('job.type', ctx.jobType);
    scope.setTag('job.id', ctx.jobId);
    scope.setContext('job', { ...ctx });
    Sentry.captureException(error);
  });
}

interface PgBossJob<T> {
  id: string;
  data: T;
  /** pg-boss increments this on each retry; absent on the first attempt. */
  retryCount?: number;
}

/**
 * Wrap a pg-boss work handler so any thrown error is captured to Sentry with
 * per-job context, then re-thrown to preserve pg-boss's retry behaviour.
 */
export function instrumentJobHandler<T>(
  jobType: string,
  handler: (jobs: PgBossJob<T>[]) => Promise<void>,
): (jobs: PgBossJob<T>[]) => Promise<void> {
  return async (jobs) => {
    try {
      await handler(jobs);
    } catch (err) {
      for (const job of jobs) {
        captureJobError(err, {
          jobId: job.id,
          jobType,
          attempt: (job.retryCount ?? 0) + 1,
        });
      }
      throw err;
    }
  };
}

/** Flush buffered Sentry events on graceful shutdown. */
export async function flushWorkerSentry(): Promise<void> {
  try {
    await Sentry.flush(2000);
  } catch {
    // Flush failures must not block shutdown.
  }
}
