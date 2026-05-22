/**
 * Workers process entry point.
 *
 * Boots pg-boss and registers every background job:
 *   - send-email      → outbound email via Resend (Day 14)
 *   - render-pdf      → Puppeteer PDF rendering (Day 10 core, queued here)
 *   - validity-expiry → daily quotation/PI expiry sweep, 02:00 IST (Day 14)
 *   - pdf-cleanup     → daily inline-PDF prune, 03:00 IST (Day 14)
 *
 * The render-pdf web path still spawns a one-shot CLI (DEV.36); the queued
 * handler is wired here for callers that prefer async rendering.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EMAIL_QUEUE,
  PDF_CLEANUP_QUEUE,
  RENDER_PDF_QUEUE,
  VALIDITY_EXPIRY_QUEUE,
} from '@dealerlink/schemas';
import { config as loadEnv } from 'dotenv';

import { handleSendEmailJob } from './email/handler';
import { runPdfCleanup } from './jobs/pdf-cleanup';
import { handleRenderPdfJob, type RenderPdfPayload } from './jobs/render-pdf';
import { runValidityExpiry } from './jobs/validity-expiry';
import { logger } from './observability/logger';
import { flushWorkerSentry, initWorkerSentry, instrumentJobHandler } from './observability/sentry';
import { warmChromium } from './pdf/browser';
import { startBoss, stopBoss } from './queue/boss';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

async function main(): Promise<void> {
  // Initialise Sentry before any queue work so job failures are captured.
  initWorkerSentry();

  const boss = await startBoss();

  // --- Outbound email ------------------------------------------------------
  await boss.work(EMAIL_QUEUE, instrumentJobHandler(EMAIL_QUEUE, handleSendEmailJob));

  // --- PDF rendering -------------------------------------------------------
  await boss.work(
    RENDER_PDF_QUEUE,
    instrumentJobHandler(RENDER_PDF_QUEUE, async (jobs: { data: RenderPdfPayload }[]) => {
      for (const job of jobs) await handleRenderPdfJob(job);
    }),
  );

  // --- Daily maintenance crons (IST) --------------------------------------
  await boss.work(
    VALIDITY_EXPIRY_QUEUE,
    instrumentJobHandler(VALIDITY_EXPIRY_QUEUE, async () => {
      await runValidityExpiry();
    }),
  );
  await boss.work(
    PDF_CLEANUP_QUEUE,
    instrumentJobHandler(PDF_CLEANUP_QUEUE, async () => {
      await runPdfCleanup();
    }),
  );
  // 02:00 IST quotation/PI validity sweep, 03:00 IST inline-PDF prune.
  await boss.schedule(VALIDITY_EXPIRY_QUEUE, '0 2 * * *', undefined, { tz: 'Asia/Kolkata' });
  await boss.schedule(PDF_CLEANUP_QUEUE, '0 3 * * *', undefined, { tz: 'Asia/Kolkata' });

  logger.info('Workers process started — pg-boss queues + daily crons registered.');

  // Eager-warm Chromium's binary extraction in the BACKGROUND (DEV.66) so the
  // first PDF render isn't a slow cold start. Runs AFTER consumers are
  // registered and is fire-and-forget, so a slow/failed warm can never block
  // the worker from processing jobs. Disable with PDF_EAGER_WARM=false.
  if (process.env.PDF_EAGER_WARM !== 'false') {
    const startedAt = Date.now();
    void warmChromium()
      .then(() =>
        logger.info(
          `PDF: eager-warmed Chromium in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
        ),
      )
      .catch((err: unknown) =>
        logger.warn({ err }, 'PDF: eager-warm Chromium failed; first render may be a cold start'),
      );
  }
}

async function shutdown(): Promise<void> {
  await stopBoss();
  await flushWorkerSentry();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

main().catch((err: unknown) => {
  logger.error({ err }, 'Workers process failed to start');
  process.exit(1);
});
