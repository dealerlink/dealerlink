import * as Sentry from '@sentry/nextjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearSentryContext, setSentryRoute, setSentryTenant, setSentryUser } from './context';

/**
 * The context helpers go through the top-level `Sentry.setUser` / `setTag`,
 * which write to the *isolation scope*. We assert against that scope directly
 * (no SDK init / no network).
 */
describe('Sentry scope enrichment', () => {
  beforeEach(() => {
    Sentry.getIsolationScope().clear();
  });

  it('setSentryUser attaches id, email, role + a user.role tag', () => {
    setSentryUser({ userId: 'user-123', email: 'a@b.com', role: 'admin' });
    const data = Sentry.getIsolationScope().getScopeData();
    expect(data.user).toEqual({ id: 'user-123', email: 'a@b.com', username: 'admin' });
    expect(data.tags['user.role']).toBe('admin');
  });

  it('setSentryUser omits email when not provided', () => {
    setSentryUser({ userId: 'user-456' });
    expect(Sentry.getIsolationScope().getScopeData().user).toEqual({ id: 'user-456' });
  });

  it('setSentryTenant attaches tenant.id + tenant.slug tags', () => {
    setSentryTenant({ tenantId: 'tenant-1', tenantSlug: 'demo' });
    const tags = Sentry.getIsolationScope().getScopeData().tags;
    expect(tags['tenant.id']).toBe('tenant-1');
    expect(tags['tenant.slug']).toBe('demo');
  });

  it('setSentryRoute attaches a route + http.method tag', () => {
    setSentryRoute({ route: '/dealers/[id]', method: 'POST' });
    const tags = Sentry.getIsolationScope().getScopeData().tags;
    expect(tags['route']).toBe('/dealers/[id]');
    expect(tags['http.method']).toBe('POST');
  });

  it('clearSentryContext drops the user', () => {
    setSentryUser({ userId: 'user-789' });
    clearSentryContext();
    expect(Sentry.getIsolationScope().getScopeData().user).toEqual({});
  });
});
