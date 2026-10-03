/**
 * F.148 A.1 — the agent check-in endpoint.
 *
 * Three things are asserted here that the spec and the operator asked for by
 * name, and each is stated as what it covers rather than as a claim about the
 * whole route:
 *
 * 1. **The four rejections are IDENTICAL**, not merely all 401. A response that
 *    differs in body shape or header between "unknown token" and "revoked token"
 *    confirms a valid token value, which is exactly what the uniform 401 exists
 *    to prevent.
 * 2. **The request-level bound** — a read request writes to no table but the two
 *    it is allowed to. What this does and does not catch is stated at the test.
 * 3. **The token matrix** — absent, malformed, unknown, revoked, valid.
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

import { adminDb } from '@dealerlink/db';
import { hashAgentToken } from '@dealerlink/db/agent-token';
import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { __resetShield } from '@/lib/agent/shield';

import { GET } from './route';

const TENANT = '33333333-3333-4333-8333-333333333333';
const VALID = 'f148-a1-valid-token';
const REVOKED = 'f148-a1-revoked-token';

let ipSeq = 0;
/** A fresh IP per request so the pre-auth shield never confuses one test with another. */
function request(auth?: string, extra: Record<string, string> = {}): NextRequest {
  ipSeq += 1;
  const headers = new Headers({
    'x-forwarded-for': `10.1.${(ipSeq >> 8) & 255}.${ipSeq & 255}`,
    ...extra,
  });
  if (auth !== undefined) headers.set('authorization', auth);
  return new NextRequest('http://localhost/api/agent/checkin', { headers });
}

beforeAll(async () => {
  await adminDb.execute(sql`
    INSERT INTO tenants (id, slug, legal_name, display_name)
    VALUES (${TENANT}::uuid, 'f148-a1', 'F148 A1 Legal', 'F148 A1')
    ON CONFLICT (id) DO NOTHING`);
  await adminDb.execute(sql`
    INSERT INTO agent_tokens (tenant_id, label, secret_token)
    VALUES (${TENANT}::uuid, 'valid', ${hashAgentToken(VALID)})
    ON CONFLICT (secret_token) DO NOTHING`);
  await adminDb.execute(sql`
    INSERT INTO agent_tokens (tenant_id, label, secret_token, revoked_at)
    VALUES (${TENANT}::uuid, 'revoked', ${hashAgentToken(REVOKED)}, now())
    ON CONFLICT (secret_token) DO NOTHING`);
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM agent_tokens WHERE tenant_id = ${TENANT}::uuid`);
  await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${TENANT}::uuid`);
});

beforeEach(() => {
  __resetShield();
});

/** Status + every header + the exact body bytes. Identity, not similarity. */
async function fingerprint(res: Response) {
  return {
    status: res.status,
    headers: [...res.headers.entries()].sort(),
    body: await res.text(),
  };
}

describe('F.148 A.1 — the four rejections are IDENTICAL, not merely all 401', () => {
  it('absent, malformed, unknown and revoked are byte-for-byte the same response', async () => {
    const cases: [string, NextRequest][] = [
      ['absent', request()],
      ['malformed', request('Token not-a-bearer-scheme')],
      ['unknown', request('Bearer f148-a1-no-such-token')],
      ['revoked', request(`Bearer ${REVOKED}`)],
    ];

    const seen: { name: string; fp: Awaited<ReturnType<typeof fingerprint>> }[] = [];
    for (const [name, req] of cases) seen.push({ name, fp: await fingerprint(await GET(req)) });

    // All 401 — necessary and NOT sufficient.
    for (const s of seen) expect(s.fp.status, `${s.name} status`).toBe(401);

    // IDENTICAL. The reference is `absent`; each other case must match it
    // exactly, and the diff names which case diverged.
    const ref = seen[0]!;
    for (const s of seen.slice(1)) {
      expect(s.fp, `${s.name} differs from ${ref.name}`).toEqual(ref.fp);
    }

    // And the body discloses nothing beyond the one actionable bit.
    expect(JSON.parse(ref.fp.body)).toEqual({ error: 'unauthorized' });
    expect(ref.fp.body).not.toMatch(/revok|expir|unknown|not found|exists/i);
    expect(Object.fromEntries(ref.fp.headers)['www-authenticate']).toBe('Bearer');
  });

  it('UNKNOWN and REVOKED are identical BY CONSTRUCTION — the predicate is in the SQL', async () => {
    // `resolveAgentToken` carries `isNull(revokedAt)` in its WHERE clause, so a
    // revoked token does not match and there is no second branch that could
    // acquire a different body, header or cost later. This asserts the
    // consequence; the construction is what makes it durable.
    const unknown = await fingerprint(await GET(request('Bearer f148-a1-definitely-absent')));
    const revoked = await fingerprint(await GET(request(`Bearer ${REVOKED}`)));
    expect(revoked).toEqual(unknown);
  });
});

describe('F.148 A.1 — the token matrix', () => {
  it('a valid token is accepted and names exactly its own tenant', async () => {
    const res = await GET(request(`Bearer ${VALID}`, { 'x-agent-version': '0.1.0' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tenantId).toBe(TENANT);
    expect(body.scope).toBe('read');
    expect(typeof body.serverTime).toBe('string');
    // No Tally instruction field at all — an empty one would read as "nothing
    // to do" rather than "not built yet" (Gate T / B-1).
    expect(Object.keys(body).sort()).toEqual([
      'ok',
      'scope',
      'serverTime',
      'tenantConfigured',
      'tenantId',
    ]);
  });

  it('records the heartbeat it was sent, and NULLs a version it was not', async () => {
    const read = async () =>
      (
        (await adminDb.execute(sql`
          SELECT last_seen_at, agent_version FROM agent_tokens
          WHERE secret_token = ${hashAgentToken(VALID)}`)) as unknown as {
          last_seen_at: Date | null;
          agent_version: string | null;
        }[]
      )[0]!;

    await GET(request(`Bearer ${VALID}`, { 'x-agent-version': '9.9.9' }));
    const withVersion = await read();
    expect(withVersion.agent_version).toBe('9.9.9');
    expect(withVersion.last_seen_at).not.toBeNull();

    await GET(request(`Bearer ${VALID}`));
    expect((await read()).agent_version).toBeNull();
  });

  it('refuses an absurd version string rather than storing it', async () => {
    await GET(request(`Bearer ${VALID}`, { 'x-agent-version': 'v'.repeat(300) }));
    const rows = (await adminDb.execute(sql`
      SELECT agent_version FROM agent_tokens
      WHERE secret_token = ${hashAgentToken(VALID)}`)) as unknown as {
      agent_version: string | null;
    }[];
    expect(rows[0]!.agent_version).toBeNull();
  });
});

describe('F.148 A.1 — the pre-auth shield exists without a store', () => {
  it('rejects past its limit from one IP, with Retry-After, before any auth', async () => {
    const ip = '10.9.9.9';
    const hit = () =>
      GET(
        new NextRequest('http://localhost/api/agent/checkin', {
          headers: new Headers({ 'x-forwarded-for': ip }),
        }),
      );
    let last = await hit();
    for (let i = 0; i < 40 && last.status !== 429; i++) last = await hit();
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('Retry-After'))).toBeGreaterThan(0);
    // 429 BEFORE 401: the shield runs first, so an unauthenticated flood never
    // reaches the token lookup at all.
    expect(await last.json()).toEqual({ error: 'rate_limited' });
  });
});

describe('F.148 A.1 — the heartbeat throttle caps the audit volume', () => {
  /**
   * CONTROL F EXISTED BEFORE THIS TEST DID, and passed — which is how the gap
   * was found. Removing the throttle left every assertion green, because the
   * write-bound test snapshots ONE request and one request writes one audit row
   * either way. **The throttle's whole effect is across two requests inside the
   * window, so only a two-request assertion can see it.**
   *
   * Operator ruling: accept the audit, cap the write. 15 minutes, because
   * minute-resolution on "when did this agent last check in" is false precision
   * and 1,440 rows per tenant per day buries the revocations someone reads.
   */
  const auditRows = async () =>
    (
      (await adminDb.execute(sql`
        SELECT count(*)::int AS n FROM audit_log
        WHERE entity_type = 'agent_tokens'`)) as unknown as { n: number }[]
    )[0]!.n;

  it('two check-ins inside the window write ONE audit row, not two', async () => {
    // Clear the throttle so the first call is guaranteed to write.
    await adminDb.execute(sql`
      UPDATE agent_tokens SET last_seen_at = NULL, agent_version = NULL
      WHERE secret_token = ${hashAgentToken(VALID)}`);

    const start = await auditRows();
    await GET(request(`Bearer ${VALID}`, { 'x-agent-version': '2.0.0' }));
    const afterFirst = await auditRows();
    await GET(request(`Bearer ${VALID}`, { 'x-agent-version': '2.0.0' }));
    const afterSecond = await auditRows();

    expect(afterFirst - start, 'the first check-in should write once').toBe(1);
    expect(afterSecond - afterFirst, 'the second, inside the window, should write nothing').toBe(0);
  });

  it('but a VERSION CHANGE writes immediately — an upgrade is worth its real timestamp', async () => {
    const before = await auditRows();
    await GET(request(`Bearer ${VALID}`, { 'x-agent-version': '2.0.1' }));
    expect(await auditRows()).toBe(before + 1);
    // And a repeat of the NEW version is throttled again.
    await GET(request(`Bearer ${VALID}`, { 'x-agent-version': '2.0.1' }));
    expect(await auditRows()).toBe(before + 1);
  });
});

describe('F.148 A.1 — the request-level bound', () => {
  /**
   * WHAT THIS COVERS, WHAT IT DOES NOT, AND WHY IT IS NARROWER THAN IT WAS.
   *
   * ## THE FAILURE THAT NARROWED IT
   *
   * The first version snapshotted the row count of EVERY public table. It passed
   * locally and failed in CI with:
   *
   *     expected [ 'audit_log', 'email_delivery_log' ] to deeply equal [ 'audit_log' ]
   *
   * **Nothing in the check-in path touches `email_delivery_log`.** Another test
   * file, running in parallel in the same vitest process pool, wrote to it inside
   * this test's before/after window — and a global snapshot **attributes every
   * write in the database to this request.**
   *
   * Classified as a STATE BUG IN THE TEST, not a flake: the cause is
   * deterministic (a global-scope assertion under parallel execution) even though
   * its appearance is not. A green re-run would not be evidence.
   *
   * ## THE TWO SIBLING RULES, AND THIS WAS BOTH AT ONCE
   *
   * DEV.157: a control must own its preconditions for the window it measures.
   * DEV.154: an assertion on an absolute value of shared mutable state is an
   * assertion about test ORDER, not about the code. **They are the same defect
   * from two sides**, and a global row-count snapshot under parallel execution is
   * both: it does not own the database, and it reads absolute counts of it.
   *
   * ## WHAT IT COVERS NOW
   *
   * **COVERS:** of the ENUMERATED tables below, only `agent_tokens`,
   * `rate_limit` and `audit_log` change — and all three DO change, which is the
   * half that keeps the narrowing from silently weakening the claim.
   *
   * **DOES NOT COVER, AND THIS IS THE COST OF NARROWING:** a write to a table
   * OUTSIDE the enumerated set. The old version would have caught that; this one
   * cannot. **The static enumeration below covers it from the other direction**,
   * by reading the agent's own source for a table name outside its allowed set —
   * so the two assertions together cover what one global snapshot used to, and
   * neither covers it alone. Saying so here rather than letting the heading imply
   * the old reach is the thing already corrected once in this row.
   *
   * **ALSO DOES NOT COVER:** an extra READ. A `SELECT` changes no row count.
   * Same static enumeration, same reason.
   */

  /**
   * THE ENUMERATED SET: the three that must change, plus the tables the agent
   * path could PLAUSIBLY reach if someone widened it carelessly — a join through
   * `issued_by`, an over-read during resolution, a numbering call, an
   * auth-adjacent log.
   *
   * Deliberately EXCLUDED: `email_delivery_log`, `webhook_events`,
   * `generated_documents` and the document tables. Not because a write there
   * would be acceptable, but because **other suites write them**, and including
   * them is what made this test measure the whole process pool. The static scan
   * is the instrument for those.
   */
  const WATCHED = [
    'agent_tokens',
    'rate_limit',
    'audit_log',
    'tenant_settings',
    'tenants',
    'users',
    'sessions',
    'document_counters',
    'access_log',
    'auth_events',
  ] as const;

  /**
   * ONLY `audit_log` GROWS BY A ROW, and that is a correction the paired
   * assertion forced on its first run:
   *
   *     rate_limit should have grown: expected 208 to be greater than 208
   *
   * **`rate_limit` is a FIXED-WINDOW counter** keyed on (key, window_start), so
   * a second request in the same window INCREMENTS the existing row rather than
   * inserting one. Row count is the wrong observable for it, exactly as it is
   * for `agent_tokens` (an UPDATE). I had assumed row growth was the observable
   * for all three.
   *
   * So each of the three is asserted on ITS OWN observable, named:
   *   `audit_log`    — a row is inserted      -> count grows
   *   `agent_tokens` — the heartbeat UPDATE   -> `last_seen_at` becomes non-null
   *   `rate_limit`   — the window counter     -> `count` increases for this key
   */
  const MUST_GROW = ['audit_log'] as const;
  const UPDATED_NOT_GROWN = ['agent_tokens', 'rate_limit'] as const;

  const snapshot = async () => {
    const out: Record<string, number> = {};
    for (const t of WATCHED) {
      const r = (await adminDb.execute(
        sql`SELECT count(*)::int AS n FROM ${sql.raw(`"${t}"`)}`,
      )) as unknown as { n: number }[];
      out[t] = r[0]!.n;
    }
    return out;
  };

  /**
   * SUM, not MAX, and that is a second correction from the same assertion:
   *
   *     the limiter should have counted this request: expected 9 to be greater than 9
   *
   * The limiter is a FIXED WINDOW, so there is one row per (key, window_start)
   * and several windows accumulate over a suite. `max(count)` is dominated by
   * whichever window was busiest, so an increment in the CURRENT window is
   * invisible to it. **A sum rises by one for every counted request, whichever
   * window row it lands in**, which is the property being asserted.
   */
  const limiterCount = async () =>
    (
      (await adminDb.execute(sql`
        SELECT COALESCE(sum(count), 0)::int AS n FROM rate_limit
        WHERE key LIKE 'agent-checkin:%'`)) as unknown as { n: number }[]
    )[0]!.n;

  const lastSeenOf = async () =>
    (
      (await adminDb.execute(sql`
        SELECT last_seen_at FROM agent_tokens
        WHERE secret_token = ${hashAgentToken(VALID)}`)) as unknown as {
        last_seen_at: Date | null;
      }[]
    )[0]!.last_seen_at;

  it('the three expected tables change, and nothing else enumerated does', async () => {
    // Clear the throttle so the write is guaranteed to land — otherwise a
    // check-in inside the window is a deliberate no-op and the "must change"
    // half would be asserting against a design decision.
    await adminDb.execute(sql`
      UPDATE agent_tokens SET last_seen_at = NULL, agent_version = NULL
      WHERE secret_token = ${hashAgentToken(VALID)}`);

    const before = await snapshot();
    const seenBefore = await lastSeenOf();
    const limiterBefore = await limiterCount();
    await GET(request(`Bearer ${VALID}`, { 'x-agent-version': '1.1.1' }));
    const after = await snapshot();
    const seenAfter = await lastSeenOf();
    const limiterAfter = await limiterCount();

    // ── THEY GREW. Immune to other suites: another test writing to `audit_log`
    //    cannot make THIS request's write disappear, so a false pass here would
    //    need the request to have done nothing at all.
    for (const t of MUST_GROW) {
      expect(after[t]!, `${t} should have grown by a row`).toBeGreaterThan(before[t]!);
    }
    // The two whose observable is a COLUMN, not a row count.
    expect(seenBefore, 'the throttle reset should have nulled last_seen_at').toBeNull();
    expect(seenAfter, 'the heartbeat should have written last_seen_at').not.toBeNull();
    expect(limiterAfter, 'the limiter should have counted this request').toBeGreaterThan(
      limiterBefore,
    );

    // ── AND NOTHING ELSE ENUMERATED MOVED. Equality runs over the enumerated
    //    set only, which is what makes it survive a parallel run.
    const changesExpected: readonly string[] = [...MUST_GROW, ...UPDATED_NOT_GROWN];
    const rest = WATCHED.filter((t) => !changesExpected.includes(t));
    const moved = rest.filter((t) => after[t] !== before[t]);
    expect(moved, 'a check-in wrote to a table it has no business writing to').toEqual([]);
  });

  it("the agent's OWN code names no table outside its set — the half that catches an extra READ", async () => {
    // STATIC ENUMERATION, because a stray SELECT is invisible to row counts.
    //
    // **THE CLAIM IS NARROWER THAN THE SECTION HEADING, DELIBERATELY.** Scanned:
    // the three files that contain the agent's own queries. NOT scanned:
    // `lib/rate-limit.ts` and `packages/db/src/with-tenant.ts`, which are shared
    // infrastructure reached through a function call, have their own tests, and
    // would drag their tables into an "allowed" set that then means nothing.
    //
    // So this asserts **"the agent's own code names no table outside its set"**,
    // not "no table is touched by a request". `rate_limit` is touched, through
    // `checkRateLimit`, and is covered by the write-bound test above instead.
    // Stating the gap because the first version of this test claimed three
    // tables and the shared helpers made that false.
    const fs = await import('node:fs');
    const files = [
      'app/api/agent/checkin/route.ts',
      'lib/agent/shield.ts',
      '../../packages/db/src/agent-token.ts',
    ];
    // COMMENTS ARE STRIPPED FIRST, and that is a correction a control forced.
    // The first version scanned raw file text, so a DOCBLOCK explaining "this
    // fires audit_trg and writes an audit_log row" tripped the assertion — it
    // failed for a true sentence in a comment. That is a false-positive
    // generator which would fire on every future explanation, and the fastest
    // way to get an assertion deleted by someone in a hurry.
    const strip = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const src = files
      .map((f) => strip(fs.readFileSync(path.resolve(process.cwd(), f), 'utf8')))
      .join('\n');

    // BOTH SPELLINGS, and that is a correction this test's own non-vacuity
    // check forced. Drizzle schema objects are exported camelCase
    // (`tenantSettings`, `creditNotes`, `performaInvoices`), while the SQL and
    // this list are snake_case — so the first version of this assertion could
    // not have caught an extra read of any table whose two spellings differ.
    // It passed, and it passed for the wrong reason. The "allowed tables are
    // genuinely present" check at the bottom is what failed and exposed it.
    const snakeToCamel = (t: string) => t.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const bothSpellings = (t: string) => [t, snakeToCamel(t)];
    const allowed = ['agent_tokens', 'tenant_settings'];
    const candidates = [
      'quotations',
      'orders',
      'invoices',
      'dealers',
      'products',
      'inventory_items',
      'payments',
      'dispatches',
      'users',
      'sessions',
      'tenants',
      'audit_log',
      'access_log',
      'auth_events',
      'document_counters',
      'credit_notes',
      'debit_notes',
      'performa_invoices',
      'deals',
      'generated_documents',
      'email_delivery_log',
      'webhook_events',
      'inbound_token_history',
      'dealer_addresses',
    ];
    const found = candidates
      .flatMap(bothSpellings)
      .filter((t) => new RegExp(`\\b${t}\\b`).test(src));
    expect(found, 'the agent path names a table outside its allowed set').toEqual([]);

    // NON-VACUITY: the allowed three are genuinely present, in one spelling or
    // the other, so the assertion above is not passing because the files failed
    // to load or the regexes never match anything.
    for (const t of allowed) {
      const hit = bothSpellings(t).some((v) => new RegExp(`\\b${v}\\b`).test(src));
      expect(hit, `expected ${t} (either spelling) in the agent path`).toBe(true);
    }
  });
});
