/**
 * pg-boss bootstrap for the workers process.
 *
 * One PgBoss instance owns the Postgres-backed job queue (no Redis —
 * CLAUDE.md §3). It connects on the DIRECT (superuser) URL because pg-boss
 * creates and owns its own `pgboss` schema.
 *
 * Queues are created explicitly (pg-boss v10 requires it). The email queue
 * carries the retry policy from the Day 14 guardrails: retryLimit=5 with
 * exponential backoff, so a transient `RATE_LIMITED` failure is re-attempted
 * automatically.
 */
import { ALL_QUEUES, EMAIL_QUEUE } from '@dealerlink/schemas';
import PgBoss from 'pg-boss';

import { logger } from '../observability/logger';

/** Retry policy for the outbound email queue — see Day 14 guardrails. */
export const EMAIL_QUEUE_RETRY = {
  retryLimit: 5,
  retryBackoff: true,
} as const;

let boss: PgBoss | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_DIRECT_URL or DATABASE_URL must be set for pg-boss');
  }
  return url;
}

/**
 * Start pg-boss and ensure every declared queue exists. Idempotent — safe to
 * call once per process at boot.
 */
export async function startBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const url = connectionString();
  // pg-boss is built on pg-pool which validates TLS chains strictly. DO
  // Managed Postgres uses a Let's Encrypt cert chain that includes a
  // self-signed intermediate not present in Node's bundled CA store, so
  // strict validation fails with SELF_SIGNED_CERT_IN_CHAIN. When the
  // connection string already opts into TLS (sslmode=require/verify-*),
  // tell pg-pool to skip chain validation; the connection is still
  // encrypted, just not chain-verified.
  const sslRequested = url.includes('sslmode=') || url.includes('ssl=true');
  const instance = sslRequested
    ? new PgBoss({ connectionString: url, ssl: { rejectUnauthorized: false } })
    : new PgBoss(url);
  instance.on('error', (err) => {
    logger.error({ err }, 'pg-boss error');
  });
  await instance.start();
  for (const queue of ALL_QUEUES) {
    if (queue === EMAIL_QUEUE) {
      await instance.createQueue(queue, { name: queue, ...EMAIL_QUEUE_RETRY });
    } else {
      await instance.createQueue(queue);
    }
  }
  boss = instance;
  return instance;
}

/** Stop pg-boss cleanly (graceful shutdown). */
export async function stopBoss(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true });
  boss = null;
}
