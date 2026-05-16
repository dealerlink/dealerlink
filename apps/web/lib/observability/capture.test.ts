import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { setSentryRoute, setSentryTenant, setSentryUser } from './context';
import { scrubEvent } from './scrub';

/**
 * Integration test for the Sentry capture pipeline (Day 17, chunk 17a A1.7).
 *
 * Rather than mock the wire transport, we initialise Sentry with a `beforeSend`
 * that runs the real `scrubEvent` and intercepts the processed event (then
 * returns `null` so nothing leaves the process). This exercises the whole
 * path — init → scope enrichment → captureException → beforeSend scrub — and
 * lets us assert the final payload.
 */
let captured: Sentry.ErrorEvent | null = null;

Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  enabled: true,
  defaultIntegrations: false,
  beforeSend(event) {
    captured = scrubEvent(event) as Sentry.ErrorEvent;
    return null; // intercept — never send over the network
  },
});

describe('Sentry capture pipeline', () => {
  beforeEach(() => {
    captured = null;
    Sentry.getCurrentScope().clear();
  });

  afterAll(async () => {
    await Sentry.close();
  });

  it('captures an error with tenant/user/route tags and scrubbed PII', async () => {
    setSentryUser({ userId: 'u-1', email: 'owner@acme.com', role: 'admin' });
    setSentryTenant({ tenantId: 't-1', tenantSlug: 'demo' });
    setSentryRoute({ route: '/api/internal/sentry-test', method: 'GET' });

    Sentry.captureException(new Error('payment failed — contact owner@acme.com / 9876543210'), {
      extra: { gstin: '27AAPFU0939F1ZV' },
    });
    await Sentry.flush(2000);

    expect(captured).not.toBeNull();
    const event = captured as Sentry.ErrorEvent;

    // Context tags are present for triage.
    expect(event.tags?.['tenant.slug']).toBe('demo');
    expect(event.tags?.['tenant.id']).toBe('t-1');
    expect(event.tags?.['user.role']).toBe('admin');
    expect(event.tags?.['route']).toBe('/api/internal/sentry-test');

    // PII is scrubbed everywhere — exception message, extra, user.email.
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('owner@acme.com');
    expect(serialized).not.toContain('9876543210');
    expect(serialized).not.toContain('27AAPFU0939F1ZV');

    // User id survives (not PII); email is left as a hash.
    expect(event.user?.id).toBe('u-1');
    expect(event.user?.email).toMatch(/^email_[0-9a-f]{8}@redacted$/);
  });
});
