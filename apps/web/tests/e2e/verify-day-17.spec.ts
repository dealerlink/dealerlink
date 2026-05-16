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

test.describe('Day 17 — observability', () => {
  test('/api/health reports granular component status', async ({ request }) => {
    const res = await request.get('/api/health');
    // ok + degraded both serve traffic (200); only `down` is 503.
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toMatch(/^(ok|degraded)$/);
    expect(typeof body.version).toBe('string');
    expect(typeof body.timestamp).toBe('string');

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
});
