import { afterEach, describe, expect, it } from 'vitest';

import { runWithLogContext } from './als';
import { __setEventSinkForTests, buildEvent, trackEvent, type TrackedEvent } from './events';

afterEach(() => {
  __setEventSinkForTests(null);
});

describe('buildEvent', () => {
  it('attaches the event name, service, and an ISO timestamp', () => {
    const e = buildEvent('user.password_changed', { forced: true });
    expect(e.event).toBe('user.password_changed');
    expect(e.service).toBe('web');
    expect(e.forced).toBe(true);
    expect(() => new Date(e.timestamp).toISOString()).not.toThrow();
    expect(new Date(e.timestamp).toISOString()).toBe(e.timestamp);
  });

  it('auto-attaches tenantId / userId / role from the ALS context', () => {
    runWithLogContext({ tenantId: 't-7', userId: 'u-7', role: 'sales' }, () => {
      const e = buildEvent('dealer.created', { dealerId: 'd-1', dealerName: 'Acme' });
      expect(e).toMatchObject({ tenantId: 't-7', userId: 'u-7', role: 'sales', dealerId: 'd-1' });
    });
  });

  it('standard properties win over caller properties on key collision', () => {
    const e = buildEvent('tenant.created', { tenantId: 'caller-supplied', slug: 'demo' });
    // No ALS context running → standard tenantId is undefined and overrides.
    expect(e.tenantId).toBeUndefined();
    expect(e.slug).toBe('demo');
  });
});

describe('trackEvent', () => {
  it('routes the built event to the configured sink', () => {
    const captured: TrackedEvent[] = [];
    __setEventSinkForTests((e) => captured.push(e));
    trackEvent('payment.recorded', { paymentId: 'p-1', amount: 5000 });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      event: 'payment.recorded',
      paymentId: 'p-1',
      amount: 5000,
      service: 'web',
    });
  });

  it('quotation-send flow: the event carries quotationId + request context', () => {
    const captured: TrackedEvent[] = [];
    __setEventSinkForTests((e) => captured.push(e));
    // Simulates sendQuotation firing inside a tenantAction's ALS scope.
    runWithLogContext({ tenantId: 't-9', userId: 'u-9', role: 'admin' }, () => {
      trackEvent('quotation.sent', { quotationId: 'q-42' });
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      event: 'quotation.sent',
      quotationId: 'q-42',
      tenantId: 't-9',
      userId: 'u-9',
    });
  });

  it('does not throw on the dev-logger path (no sink, no Axiom)', () => {
    expect(() =>
      trackEvent('pdf.generated', { documentId: 'doc-1', documentType: 'quotation' }),
    ).not.toThrow();
  });

  it('rejects unknown event names + wrong property shapes at compile time', () => {
    __setEventSinkForTests(() => {});
    // @ts-expect-error — 'not.a.real.event' is not in the taxonomy.
    trackEvent('not.a.real.event', {});
    // @ts-expect-error — quotation.sent requires `quotationId`, not `foo`.
    trackEvent('quotation.sent', { foo: 1 });
  });
});
