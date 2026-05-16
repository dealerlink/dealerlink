/**
 * Workers process entry point.
 *
 * Boots pg-boss and registers every background job:
 *   - send-email → outbound email via Resend (Day 14)
 *   - render-pdf → Puppeteer PDF rendering (Day 10 core, queued here)
 *
 * Day 14 chunk d adds the validity-expiry + pdf-cleanup daily crons.
 *
 * The render-pdf web path still spawns a one-shot CLI (DEV.36); the queued
 * handler is wired here for callers that prefer async rendering.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMAIL_QUEUE, RENDER_PDF_QUEUE } from '@dealerlink/schemas';
import { config as loadEnv } from 'dotenv';

import { handleSendEmailJob } from './email/handler';
import { handleRenderPdfJob, type RenderPdfPayload } from './jobs/render-pdf';
import { startBoss, stopBoss } from './queue/boss';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

async function main(): Promise<void> {
  const boss = await startBoss();

  // --- Outbound email ------------------------------------------------------
  await boss.work(EMAIL_QUEUE, handleSendEmailJob);

  // --- PDF rendering -------------------------------------------------------
  await boss.work(RENDER_PDF_QUEUE, async (jobs: { data: RenderPdfPayload }[]) => {
    for (const job of jobs) await handleRenderPdfJob(job);
  });

  // eslint-disable-next-line no-console
  console.log('Workers process started — pg-boss queues registered.');
}

async function shutdown(): Promise<void> {
  await stopBoss();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Workers process failed to start:', err);
  process.exit(1);
});
