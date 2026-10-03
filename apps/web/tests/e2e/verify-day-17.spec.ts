/**
 * Day 17 verify — observability.
 *
 * Asserts the enriched `/health` endpoint reports granular per-component
 * status. The Sentry / Better Stack / Axiom wiring is unit-tested
 * (lib/observability/*.test.ts) — they are no-ops without env config, so an
 * E2E assertion would have nothing to observe; `/health` is the one
 * observability surface that is meaningfully exercisable in a browser test.
 */
import { expect, test } from '@playwright/test';

import { healthDetailHeaders } from './health-token';

test.describe('Day 17 — observability', () => {
  test('/api/health reports granular component status', async ({ request }) => {
    // F.176 — THE DETAIL IS BEHIND A BEARER TOKEN NOW, and this spec presents it
    // rather than dropping to what an anonymous caller can see. Asserting only
    // `{ status }` here would have left the granular component status — the whole
    // point of this spec — permanently untested.
    const res = await request.get('/api/health', { headers: healthDetailHeaders });
    // ok + degraded both serve traffic (200); only `down` is 503.
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toMatch(/^(ok|degraded)$/);
    expect(typeof body.timestamp).toBe('string');
    expect(body.detail).toBe('full');

    // THE BUILD IDENTIFIER. This asserted `typeof body.version === 'string'`,
    // which passed because the old code fell back to the literal `'dev'` — and
    // production reported `'dev'` too, so the assertion held while telling you
    // nothing about which build was live (F.176). `versionSource` names where the
    // value came from, and `null` is now the honest answer when nothing sets it.
    expect(typeof body.versionSource).toBe('string');
    if (body.versionSource === 'unset') expect(body.version).toBeNull();
    else expect(typeof body.version).toBe('string');

    // Every component check is present and carries a status.
    const valid = /^(ok|degraded|down|skipped)$/;
    for (const name of ['db', 'migrations', 'auditTrigger', 'rls', 'resend', 'queue']) {
      expect(body.checks[name], `checks.${name}`).toBeDefined();
      expect(body.checks[name].status, `checks.${name}.status`).toMatch(valid);
    }

    // The database must genuinely be healthy for the suite to be meaningful.
    expect(body.checks.db.status).toBe('ok');
    expect(typeof body.checks.db.latencyMs).toBe('number');
  });

  test('/api/health names no table, queue or credential to an anonymous caller', async ({
    request,
  }) => {
    // The other half of F.176, over real HTTP rather than by calling the handler:
    // `rls.missing` and `auditTrigger.missing` are empty today and become
    // non-empty exactly when something is wrong, so the endpoint published a map
    // of unprotected tables at the moment it was most useful to an attacker.
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const text = await res.text();
    for (const needle of [
      'tenant_settings',
      'audit_log',
      'missing',
      'depthByType',
      'keyScope',
      'applied',
      'latencyMs',
    ]) {
      expect(text, `anonymous response leaked ${needle}`).not.toContain(needle);
    }
    expect(JSON.parse(text).detail).toBe('withheld');
  });
});
