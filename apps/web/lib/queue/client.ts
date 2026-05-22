import 'server-only';

import { ALL_QUEUES, EMAIL_QUEUE, type EmailJobPayload } from '@dealerlink/schemas';
import PgBoss from 'pg-boss';

import { logger } from '@/lib/observability/logger';

/**
 * pg-boss client for the web process.
 *
 * The web process only ever *enqueues* jobs — the workers process consumes
 * them. pg-boss is started in send-only mode (`supervise: false`) so the web
 * app does not run queue maintenance or job workers.
 *
 * The instance is cached on `globalThis` so Next.js hot-reload / multiple
 * route invocations reuse one connection pool instead of leaking pools.
 */
const EMAIL_RETRY = { retryLimit: 5, retryBackoff: true } as const;

interface BossGlobal {
  __dealerlinkBoss?: Promise<PgBoss>;
}
const bossGlobal = globalThis as unknown as BossGlobal;

function connectionString(): string {
  const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_DIRECT_URL or DATABASE_URL must be set for pg-boss');
  return url;
}

async function initBoss(): Promise<PgBoss> {
  const url = connectionString();
  // See apps/workers/src/queue/boss.ts — pg-pool strict TLS validation
  // fails against DO Managed Postgres' Let's Encrypt chain. Same fix.
  const sslRequested = url.includes('sslmode=') || url.includes('ssl=true');
  // pg-connection-string parses sslmode= and that overrides our explicit
  // ssl config; strip it from the URL so only our { rejectUnauthorized:
  // false } applies.
  const cleanedUrl = sslRequested
    ? url
        .replace(/[?&]sslmode=[^&]+/g, '')
        .replace(/[?&]ssl=true/g, '')
        .replace(/\?&/, '?')
        .replace(/\?$/, '')
    : url;
  // Cap pg-boss's pool on small managed DB tiers (DEV.61).
  const max = Number(process.env.PGBOSS_POOL_MAX) || undefined;
  const boss = new PgBoss({
    connectionString: cleanedUrl,
    supervise: false,
    ...(max ? { max } : {}),
    ...(sslRequested ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  boss.on('error', (err) => {
    logger.error({ err }, 'pg-boss (web) error');
  });
  await boss.start();
  // Ensure every queue exists so a send never races queue creation.
  for (const queue of ALL_QUEUES) {
    if (queue === EMAIL_QUEUE) {
      await boss.createQueue(queue, { name: queue, ...EMAIL_RETRY });
    } else {
      await boss.createQueue(queue);
    }
  }
  return boss;
}

function getBoss(): Promise<PgBoss> {
  if (!bossGlobal.__dealerlinkBoss) {
    bossGlobal.__dealerlinkBoss = initBoss();
  }
  return bossGlobal.__dealerlinkBoss;
}

/** Enqueue an outbound email job. Returns the pg-boss job id (or null). */
export async function enqueueEmailJob(payload: EmailJobPayload): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(EMAIL_QUEUE, payload, EMAIL_RETRY);
}
