/**
 * Day 14 — inbound Resend webhook: signature verification + event processing.
 *
 * Signature fixtures are signed with the same RESEND_INBOUND_WEBHOOK_SECRET
 * the verifier reads, so a valid payload verifies and a tampered one does
 * not. Event processing is asserted against real `email_delivery_log` rows.
 *
 * Uses `adminDb` → needs DATABASE_DIRECT_URL; dotenv loads it at module load,
 * before the lazy db proxy issues its first query.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  adminDb,
  closeDbConnection,
  emailDeliveryLog,
  tenants,
  webhookEvents,
} from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { eq, like } from 'drizzle-orm';
import { Webhook } from 'svix';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { processResendEvent, recordWebhookEvent, verifyResendWebhook } from './resend-webhook';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

const TEST_PREFIX = 'day14-webhook-test+';
let tenantId: string;

/** Sign a body with the live webhook secret → raw + Svix headers. */
function sign(body: unknown): { raw: string; headers: Record<string, string> } {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) throw new Error('RESEND_INBOUND_WEBHOOK_SECRET not set');
  const wh = new Webhook(secret);
  const id = `msg_${randomUUID()}`;
  const ts = new Date();
  const raw = JSON.stringify(body);
  const signature = wh.sign(id, ts, raw);
  return {
    raw,
    headers: {
      'svix-id': id,
      'svix-timestamp': Math.floor(ts.getTime() / 1000).toString(),
      'svix-signature': signature,
    },
  };
}

/** Insert a `sent` email_delivery_log row carrying a provider message id. */
async function insertSent(providerMessageId: string, tag: string): Promise<string> {
  const [row] = await adminDb
    .insert(emailDeliveryLog)
    .values({
      tenantId,
      recipient: `${TEST_PREFIX}${tag}@example.test`,
      subject: `Webhook test ${tag}`,
      template: 'test',
      status: 'sent',
      providerMessageId,
      sentAt: new Date(),
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

function event(type: string, emailId: string, extra: Record<string, unknown> = {}) {
  return {
    type,
    created_at: new Date().toISOString(),
    data: { email_id: emailId, ...extra },
  };
}

beforeAll(async () => {
  const [t] = await adminDb.select({ id: tenants.id }).from(tenants).limit(1);
  if (!t) throw new Error('Need a seeded tenant — run pnpm db:seed');
  tenantId = t.id;
});

afterAll(async () => {
  await adminDb.delete(emailDeliveryLog).where(like(emailDeliveryLog.recipient, `${TEST_PREFIX}%`));
  await adminDb.delete(webhookEvents).where(eq(webhookEvents.eventType, 'day14.test.event'));
  await closeDbConnection();
});

describe('verifyResendWebhook', () => {
  it('accepts a correctly signed payload', () => {
    const { raw, headers } = sign(event('email.delivered', 'msg_abc'));
    const result = verifyResendWebhook(raw, headers);
    expect(result.ok).toBe(true);
    expect(result.payload?.type).toBe('email.delivered');
  });

  it('rejects a tampered payload', () => {
    const { headers } = sign(event('email.delivered', 'msg_abc'));
    // Body differs from what was signed → signature no longer matches.
    const tampered = JSON.stringify(event('email.bounced', 'msg_EVIL'));
    const result = verifyResendWebhook(tampered, headers);
    expect(result.ok).toBe(false);
  });

  it('rejects a request with missing Svix headers', () => {
    const { raw } = sign(event('email.delivered', 'msg_abc'));
    const result = verifyResendWebhook(raw, {
      'svix-id': null,
      'svix-timestamp': null,
      'svix-signature': null,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Missing');
  });
});

describe('processResendEvent', () => {
  it('email.delivered → status=delivered + delivered_at', async () => {
    const msgId = `wh-${randomUUID()}`;
    const logId = await insertSent(msgId, 'delivered');
    const result = await processResendEvent(event('email.delivered', msgId) as never);
    expect(result.matched).toBe(true);
    const row = await getRow(logId);
    expect(row?.status).toBe('delivered');
    expect(row?.deliveredAt).not.toBeNull();
    expect(row?.lastEventType).toBe('email.delivered');
  });

  it('email.bounced → status=bounced with type + reason', async () => {
    const msgId = `wh-${randomUUID()}`;
    const logId = await insertSent(msgId, 'bounced');
    const result = await processResendEvent(
      event('email.bounced', msgId, {
        bounce: { type: 'Permanent', message: 'mailbox does not exist' },
      }) as never,
    );
    expect(result.matched).toBe(true);
    const row = await getRow(logId);
    expect(row?.status).toBe('bounced');
    expect(row?.bouncedType).toBe('hard');
    expect(row?.bouncedReason).toBe('mailbox does not exist');
  });

  it('email.opened records the first open only', async () => {
    const msgId = `wh-${randomUUID()}`;
    const logId = await insertSent(msgId, 'opened');
    await processResendEvent(event('email.opened', msgId) as never);
    const firstOpen = (await getRow(logId))?.openedAt;
    expect(firstOpen).not.toBeNull();
    await processResendEvent(event('email.opened', msgId) as never);
    const secondOpen = (await getRow(logId))?.openedAt;
    // Subsequent opens do not move opened_at.
    expect(secondOpen?.getTime()).toBe(firstOpen?.getTime());
  });

  it('an unknown event type is logged without crashing', async () => {
    const msgId = `wh-${randomUUID()}`;
    const logId = await insertSent(msgId, 'unknown');
    const result = await processResendEvent(event('email.something_new', msgId) as never);
    expect(result.matched).toBe(true);
    const row = await getRow(logId);
    expect(row?.lastEventType).toBe('email.something_new');
    expect(row?.status).toBe('sent'); // unchanged
  });

  it('an event for an unknown provider message id is a no-op', async () => {
    const result = await processResendEvent(
      event('email.delivered', `wh-missing-${randomUUID()}`) as never,
    );
    expect(result.matched).toBe(false);
  });
});

describe('recordWebhookEvent — replay protection', () => {
  it('rejects a re-delivered event id as a duplicate', async () => {
    const svixId = `msg_replay_${randomUUID()}`;
    const body = { type: 'day14.test.event', data: {} };
    const first = await recordWebhookEvent({
      provider: 'resend',
      eventType: 'day14.test.event',
      body,
      signatureVerified: true,
      svixId,
    });
    const second = await recordWebhookEvent({
      provider: 'resend',
      eventType: 'day14.test.event',
      body,
      signatureVerified: true,
      svixId,
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
  });
});
