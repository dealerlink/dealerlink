/**
 * Day 14 — pg-boss `send-email` job handler.
 *
 * Drives `runSendEmail` directly with a mocked Resend client and asserts the
 * `email_delivery_log` row transitions correctly: success → sent, permanent
 * failure → failed, rate-limit → re-thrown (pg-boss retries) with the row
 * left visibly pending.
 *
 * Requires migrations + a seeded tenant. Uses `adminDb`, so it needs
 * DATABASE_DIRECT_URL — loaded from the repo-root env files below. dotenv
 * runs at module load, before the lazy db proxy issues its first query.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adminDb, closeDbConnection, emailDeliveryLog, tenants } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runSendEmail } from '../src/email/handler';
import { EmailSendError } from '../src/email/resend-client';
import { EMAIL_QUEUE_RETRY } from '../src/queue/boss';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

const TEST_PREFIX = 'day14-handler-test+';

let tenantA: string;
let tenantB: string;

/** Insert a queued email_delivery_log row, return its id. */
async function insertQueued(tenantId: string, tag: string): Promise<string> {
  const [row] = await adminDb
    .insert(emailDeliveryLog)
    .values({
      tenantId,
      recipient: `${TEST_PREFIX}${tag}@example.test`,
      subject: `Test email ${tag}`,
      template: 'test',
      status: 'queued',
      meta: { html: `<p>hello ${tag}</p>`, text: `hello ${tag}` },
    })
    .returning({ id: emailDeliveryLog.id });
  if (!row) throw new Error('insert failed');
  return row.id;
}

async function getRow(id: string) {
  const [row] = await adminDb
    .select()
    .from(emailDeliveryLog)
    .where(eq(emailDeliveryLog.id, id))
    .limit(1);
  return row ?? null;
}

beforeAll(async () => {
  const rows = await adminDb.select({ id: tenants.id }).from(tenants).limit(2);
  if (rows.length < 2) throw new Error('Need at least 2 seeded tenants — run pnpm db:seed');
  tenantA = rows[0]!.id;
  tenantB = rows[1]!.id;
});

afterAll(async () => {
  await adminDb.delete(emailDeliveryLog).where(like(emailDeliveryLog.recipient, `${TEST_PREFIX}%`));
  await closeDbConnection();
});

describe('runSendEmail', () => {
  it('marks the row sent and records the provider message id on success', async () => {
    const id = await insertQueued(tenantA, 'ok');
    const sendFn = vi.fn().mockResolvedValue({ providerMessageId: 'msg_success_1' });

    const result = await runSendEmail({ tenantId: tenantA, emailLogId: id }, sendFn);

    expect(result.status).toBe('sent');
    expect(sendFn).toHaveBeenCalledTimes(1);
    const row = await getRow(id);
    expect(row?.status).toBe('sent');
    expect(row?.providerMessageId).toBe('msg_success_1');
    expect(row?.sentAt).not.toBeNull();
    // Body is dropped from meta once sent (R.3 / temp-password hygiene).
    expect((row?.meta as Record<string, unknown>).html).toBeUndefined();
  });

  it('marks the row failed on a permanent EmailSendError (no retry)', async () => {
    const id = await insertQueued(tenantA, 'badaddr');
    const sendFn = vi.fn().mockRejectedValue(new EmailSendError('INVALID_EMAIL', 'bad address'));

    const result = await runSendEmail({ tenantId: tenantA, emailLogId: id }, sendFn);

    expect(result.status).toBe('failed');
    const row = await getRow(id);
    expect(row?.status).toBe('failed');
    expect(row?.errorMessage).toContain('bad address');
  });

  it('re-throws on RATE_LIMITED so pg-boss retries, leaving the row queued', async () => {
    const id = await insertQueued(tenantA, 'ratelimit');
    const sendFn = vi.fn().mockRejectedValue(new EmailSendError('RATE_LIMITED', 'slow down'));

    await expect(runSendEmail({ tenantId: tenantA, emailLogId: id }, sendFn)).rejects.toThrow(
      'slow down',
    );

    const row = await getRow(id);
    // Left visibly pending so the configured retry can re-attempt it.
    expect(row?.status).toBe('queued');
  });

  it('email queue retry policy is retryLimit=5 with backoff', () => {
    expect(EMAIL_QUEUE_RETRY.retryLimit).toBe(5);
    expect(EMAIL_QUEUE_RETRY.retryBackoff).toBe(true);
  });

  it('is idempotent — a replayed job for a sent row does not re-send', async () => {
    const id = await insertQueued(tenantA, 'replay');
    const sendFn = vi.fn().mockResolvedValue({ providerMessageId: 'msg_replay' });

    const first = await runSendEmail({ tenantId: tenantA, emailLogId: id }, sendFn);
    const second = await runSendEmail({ tenantId: tenantA, emailLogId: id }, sendFn);

    expect(first.status).toBe('sent');
    expect(second.status).toBe('skipped');
    expect(second.reason).toBe('already_sent');
    expect(sendFn).toHaveBeenCalledTimes(1); // never sent twice
  });

  it('rejects a job whose tenant does not match the log row', async () => {
    const id = await insertQueued(tenantA, 'mismatch');
    const sendFn = vi.fn().mockResolvedValue({ providerMessageId: 'msg_x' });

    const result = await runSendEmail({ tenantId: tenantB, emailLogId: id }, sendFn);

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('tenant_mismatch');
    expect(sendFn).not.toHaveBeenCalled();
  });

  it('no-ops when the log row does not exist (rolled-back enqueue)', async () => {
    const sendFn = vi.fn();
    const result = await runSendEmail(
      { tenantId: tenantA, emailLogId: '00000000-0000-0000-0000-000000000000' },
      sendFn,
    );
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('log_row_not_found');
    expect(sendFn).not.toHaveBeenCalled();
  });

  it('processes 10 concurrently queued emails — all sent, none double-sent', async () => {
    const ids = await Promise.all(
      Array.from({ length: 10 }, (_v, i) => insertQueued(tenantA, `concurrent-${i}`)),
    );
    const sendFn = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ providerMessageId: `msg_${Math.random().toString(36).slice(2)}` }),
      );

    const results = await Promise.all(
      ids.map((id) => runSendEmail({ tenantId: tenantA, emailLogId: id }, sendFn)),
    );

    expect(results.every((r) => r.status === 'sent')).toBe(true);
    expect(sendFn).toHaveBeenCalledTimes(10); // exactly one send per row
    for (const id of ids) {
      const row = await getRow(id);
      expect(row?.status).toBe('sent');
    }
  });
});
