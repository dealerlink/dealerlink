/**
 * F.176 — BOTH HALVES, OR THE ROW IS HALF DONE.
 *
 * The row's control requirement, verbatim in substance: assert from an
 * UNAUTHENTICATED request that the response contains no table names, no queue
 * type names and no credential scope — and assert from an AUTHENTICATED one that
 * it still does, "because a fix that hides the detail from everybody has removed
 * the operator's diagnostic rather than secured it."
 *
 * So the second half is not belt-and-braces. A route that returned
 * `{ status }` to everyone would pass the first assertion and have broken
 * `pnpm merge-status`, which reads `checks.migrations.applied` to compare the
 * deployed schema against `_journal.json` (F.173, F.138).
 *
 * THE FORBIDDEN STRINGS ARE ASSERTED AGAINST THE SERIALISED BODY, not against
 * parsed fields. A field renamed or re-nested is still a leak, and a test that
 * checks `body.checks?.rls` is absent would pass while `rls_missing` sat at the
 * top level.
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

// apps/web's vitest config loads no env; the DB-backed specs load it per file.
const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET } from './route';

const TOKEN = 'f176-test-token-not-a-real-secret';

/**
 * Strings that must never reach an unauthenticated caller. Each is named with
 * what it would tell an attacker, because "a list of strings" is the kind of
 * fixture that gets trimmed by someone who does not know why an entry is there.
 */
const MUST_NOT_LEAK: [string, string][] = [
  ['tenant_settings', 'a table name from the RLS/audit expectation lists'],
  ['audit_log', 'likewise, and it names the audit trail itself'],
  ['document_counters', 'likewise'],
  ['missing', 'the KEY under which unprotected tables are named'],
  ['depthByType', 'job type names plus backlog depth'],
  ['keyScope', 'the scope of the Resend API credential'],
  ['applied', 'the migration count — which migrations you have, so which you lack'],
  ['latencyMs', 'internal timing, and it identifies the db check'],
  ['auditTrigger', 'the check name itself'],
];

function request(auth?: string): NextRequest {
  const headers = new Headers({
    'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
  });
  if (auth !== undefined) headers.set('authorization', auth);
  return new NextRequest('http://localhost/api/health', { headers });
}

const original = process.env.HEALTH_TOKEN;
beforeEach(() => {
  process.env.HEALTH_TOKEN = TOKEN;
});
afterEach(() => {
  if (original === undefined) delete process.env.HEALTH_TOKEN;
  else process.env.HEALTH_TOKEN = original;
});

describe('F.176 — /api/health withholds its detail from unauthenticated callers', () => {
  it('leaks nothing without a token, and still answers the monitor', async () => {
    const res = await GET(request());
    expect([200, 503]).toContain(res.status);
    const text = await res.text();

    for (const [needle, why] of MUST_NOT_LEAK) {
      expect(text, `leaked ${JSON.stringify(needle)} — ${why}`).not.toContain(needle);
    }

    const body = JSON.parse(text);
    // The monitor's contract: a status word and a 200/503. Nothing else.
    expect(Object.keys(body).sort()).toEqual(['detail', 'status', 'timestamp']);
    expect(['ok', 'degraded', 'down']).toContain(body.status);
    expect(body.detail).toBe('withheld');
  });

  it('withholds from a WRONG token exactly as from no token', async () => {
    const res = await GET(request(`Bearer ${TOKEN}-wrong`));
    const text = await res.text();
    for (const [needle] of MUST_NOT_LEAK) expect(text).not.toContain(needle);
    expect(JSON.parse(text).detail).toBe('withheld');
  });

  it('FAILS CLOSED — with HEALTH_TOKEN unset, a bearer header buys nothing', async () => {
    delete process.env.HEALTH_TOKEN;
    const res = await GET(request(`Bearer ${TOKEN}`));
    const text = await res.text();
    for (const [needle] of MUST_NOT_LEAK) expect(text).not.toContain(needle);
    expect(JSON.parse(text).detail).toBe('withheld');
  });

  it('STILL GIVES THE OPERATOR THE DIAGNOSTIC with the token — the other half', async () => {
    const res = await GET(request(`Bearer ${TOKEN}`));
    const body = await res.json();

    expect(body.detail).toBe('full');
    // The field pnpm merge-status reads. A number, not merely present.
    expect(typeof body.checks.migrations.applied).toBe('number');
    expect(body.checks.migrations.applied).toBeGreaterThan(0);
    // The arrays whose names were the disclosure — the operator must still see them.
    expect(Array.isArray(body.checks.rls.missing)).toBe(true);
    expect(Array.isArray(body.checks.auditTrigger.missing)).toBe(true);
    expect(body.checks.queue).toHaveProperty('status');
    expect(body.checks.db).toHaveProperty('latencyMs');
  });

  it('reports the build as UNSET rather than claiming "dev"', async () => {
    const saved = { s: process.env.SENTRY_RELEASE, g: process.env.NEXT_PUBLIC_GIT_SHA };
    delete process.env.SENTRY_RELEASE;
    delete process.env.NEXT_PUBLIC_GIT_SHA;
    try {
      const body = await (await GET(request(`Bearer ${TOKEN}`))).json();
      // Production reported `version: 'dev'`, which is a claim about the
      // environment rather than a fact about the build (F.176).
      expect(body.version).toBeNull();
      expect(body.versionSource).toBe('unset');
    } finally {
      if (saved.s !== undefined) process.env.SENTRY_RELEASE = saved.s;
      if (saved.g !== undefined) process.env.NEXT_PUBLIC_GIT_SHA = saved.g;
    }
  });

  it('reports a real build identifier when one IS set', async () => {
    const saved = process.env.SENTRY_RELEASE;
    process.env.SENTRY_RELEASE = 'deadbeefcafe';
    try {
      const body = await (await GET(request(`Bearer ${TOKEN}`))).json();
      expect(body.version).toBe('deadbeefcafe');
      expect(body.versionSource).toBe('SENTRY_RELEASE');
    } finally {
      if (saved === undefined) delete process.env.SENTRY_RELEASE;
      else process.env.SENTRY_RELEASE = saved;
    }
  });
});
