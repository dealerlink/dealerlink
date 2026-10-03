/**
 * F.148 — THE BOUND ON THE READ PATH'S ONE WRITE.
 *
 * The operator's ruling, and the reason this file exists rather than a comment:
 *
 * > "read path" means it does not mutate THEIR books, not that it issues no SQL
 * > … the heartbeat writes exactly `last_seen_at` and `agent_version` on exactly
 * > the authenticating row, and nothing else. State that at the columns and
 * > **assert it** — a read request that touches any other table is a defect, and
 * > that assertion is what keeps "read path" meaningful once F.178 exists.
 *
 * **Without the assertion the phrase decays into "the path we call the read
 * path".** A comment saying "writes only two columns" is a claim; a test that
 * snapshots every other column and every sibling row is a measurement.
 *
 * WHAT IS ASSERTED HERE AND WHAT IS NOT. This covers the two statements in
 * `src/agent-token.ts`, which are the only unscoped statements the agent's path
 * is allowed. **The request-level half — "a read REQUEST touches no other
 * table" — lands with the route**, because there is no route yet (F.148 A.1,
 * gated on the operator's OD rulings). Stating that split rather than implying
 * this file covers both.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashAgentToken, resolveAgentToken, touchAgentToken } from '../src/agent-token';
import { adminDb } from '../src/client';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const TOKEN_A = 'f148-test-token-tenant-a';
const TOKEN_B = 'f148-test-token-tenant-b';

async function mkTenant(id: string, slug: string) {
  await adminDb.execute(sql`
    INSERT INTO tenants (id, slug, legal_name, display_name)
    VALUES (${id}::uuid, ${slug}, ${slug + ' Legal'}, ${slug})
    ON CONFLICT (id) DO NOTHING`);
}

async function mkToken(tenantId: string, token: string, label: string) {
  await adminDb.execute(sql`
    INSERT INTO agent_tokens (tenant_id, label, secret_token)
    VALUES (${tenantId}::uuid, ${label}, ${hashAgentToken(token)})
    ON CONFLICT (secret_token) DO NOTHING`);
}

beforeAll(async () => {
  await mkTenant(TENANT_A, 'f148-a');
  await mkTenant(TENANT_B, 'f148-b');
  await mkToken(TENANT_A, TOKEN_A, 'A site');
  await mkToken(TENANT_B, TOKEN_B, 'B site');
});

afterAll(async () => {
  await adminDb.execute(
    sql`DELETE FROM agent_tokens WHERE tenant_id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`,
  );
  await adminDb.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}::uuid, ${TENANT_B}::uuid)`,
  );
});

describe('F.148 — resolution returns a tenant id and nothing else', () => {
  it('resolves a valid token to exactly its own tenant', async () => {
    const a = await resolveAgentToken(TOKEN_A);
    const b = await resolveAgentToken(TOKEN_B);
    expect(a?.tenantId).toBe(TENANT_A);
    expect(b?.tenantId).toBe(TENANT_B);
    // A token names ONE tenant. If these were ever equal the whole design is void.
    expect(a?.tenantId).not.toBe(b?.tenantId);
  });

  it('returns ONLY tokenId, tenantId and scope — no tenant data rides along', async () => {
    const a = await resolveAgentToken(TOKEN_A);
    // The shape IS the contract: §3 narrows the exempt statement to "returning
    // only a tenant id". A joined legal_name here would be a widened exemption.
    expect(Object.keys(a ?? {}).sort()).toEqual(['scope', 'tenantId', 'tokenId']);
  });

  it('FAILS CLOSED — unknown, empty and revoked tokens all yield null', async () => {
    expect(await resolveAgentToken('not-a-token')).toBeNull();
    expect(await resolveAgentToken('')).toBeNull();

    await adminDb.execute(
      sql`UPDATE agent_tokens SET revoked_at = now() WHERE secret_token = ${hashAgentToken(TOKEN_B)}`,
    );
    expect(await resolveAgentToken(TOKEN_B)).toBeNull();
    await adminDb.execute(
      sql`UPDATE agent_tokens SET revoked_at = NULL WHERE secret_token = ${hashAgentToken(TOKEN_B)}`,
    );
    // Restored, so the revocation test cannot silently break the others.
    expect((await resolveAgentToken(TOKEN_B))?.tenantId).toBe(TENANT_B);
  });

  it('stores a DIGEST, never the token', async () => {
    const rows = (await adminDb.execute(
      sql`SELECT secret_token FROM agent_tokens WHERE tenant_id = ${TENANT_A}::uuid`,
    )) as unknown as { secret_token: string }[];
    expect(rows[0]!.secret_token).not.toBe(TOKEN_A);
    expect(rows[0]!.secret_token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('F.148 — the heartbeat writes EXACTLY two columns on EXACTLY one row', () => {
  /**
   * KEYED BY `id`, NOT COMPARED BY POSITION — and that is a correction a control
   * forced. The first version ordered by `label` and paired rows by index, so
   * when the control under test wrote to `label` the ordering changed and the
   * comparison lined up DIFFERENT rows: the test still went red, but its message
   * named `id` and `created_at` as "changed" when nothing of the sort had
   * happened. A failure that misreports its own cause is most of the way to
   * being ignored.
   */
  const snapshot = async () => {
    const rows = (await adminDb.execute(sql`
      SELECT id::text, tenant_id::text, label, secret_token, scope,
             issued_at, issued_by::text, revoked_at, revoked_by::text,
             last_seen_at, agent_version, created_at, updated_at
      FROM agent_tokens`)) as unknown as Record<string, unknown>[];
    return new Map(rows.map((r) => [String(r['id']), r]));
  };

  it('changes last_seen_at and agent_version, and NOTHING else, on NO other row', async () => {
    const before = await snapshot();
    const a = await resolveAgentToken(TOKEN_A);
    await touchAgentToken(a!.tokenId, '1.2.3');
    const after = await snapshot();

    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());

    for (const [id, b] of before) {
      const f = after.get(id)!;
      const changed = Object.keys(b).filter((k) => String(b[k]) !== String(f[k]));
      if (id === a!.tokenId) {
        // THE AUTHENTICATING ROW. Exactly the two columns, enumerated — not a
        // count, so a third column appearing names itself in the failure.
        expect(changed.sort()).toEqual(['agent_version', 'last_seen_at']);
      } else {
        // EVERY OTHER ROW IS UNTOUCHED. A heartbeat with a missing WHERE clause
        // passes the assertion above and fails this one.
        expect(changed).toEqual([]);
      }
    }
  });

  it('does NOT touch updated_at — that column describes operator changes', async () => {
    const a = await resolveAgentToken(TOKEN_A);
    const read = async () =>
      (
        (await adminDb.execute(
          sql`SELECT updated_at FROM agent_tokens WHERE id = ${a!.tokenId}::uuid`,
        )) as unknown as { updated_at: Date }[]
      )[0]!.updated_at;
    const before = await read();
    await touchAgentToken(a!.tokenId, '9.9.9');
    expect(String(await read())).toBe(String(before));
  });

  it('writes a NULL agent_version rather than inventing one', async () => {
    const a = await resolveAgentToken(TOKEN_A);
    await touchAgentToken(a!.tokenId, null);
    const rows = (await adminDb.execute(
      sql`SELECT agent_version FROM agent_tokens WHERE id = ${a!.tokenId}::uuid`,
    )) as unknown as { agent_version: string | null }[];
    expect(rows[0]!.agent_version).toBeNull();
  });
});

describe('F.148 — the audit trigger, which nothing enumerates (F.168)', () => {
  /**
   * ASSERTED EXPLICITLY, AND THAT IS THE WHOLE REASON THIS BLOCK EXISTS.
   *
   * `rls.test.ts` derives its population from `pg_class` and picked this table
   * up the moment it existed — measured: dropping the policy turns it red with
   * "agent_tokens: enabled=true forced=true tenant_isolation=false". **Audit
   * triggers have no such enumeration** (F.168), so a forgotten `audit_trg`
   * stanza looks exactly like a present one. This is the hand-written substitute.
   */
  it('fires on insert, and REDACTS secret_token while keeping label', async () => {
    const token = 'f148-audit-probe-token';
    await adminDb.execute(sql`
      INSERT INTO agent_tokens (tenant_id, label, secret_token)
      VALUES (${TENANT_A}::uuid, 'audit probe', ${hashAgentToken(token)})`);

    const rows = (await adminDb.execute(sql`
      SELECT after FROM audit_log
      WHERE entity_type = 'agent_tokens' AND action = 'insert'
      ORDER BY changed_at DESC LIMIT 1`)) as unknown as { after: Record<string, unknown> }[];

    // The trigger fired at all — without the stanza there is no row to find.
    expect(rows.length).toBe(1);
    const payload = rows[0]!.after;

    // THE PAYOFF OF THE COLUMN NAME. `secret_token` ends in `_token`, so
    // `audit_redact()` catches it.
    expect(payload['secret_token']).toBe('[redacted]');
    expect(JSON.stringify(payload)).not.toContain(hashAgentToken(token));

    // AND THE REDACTION IS SELECTIVE, which is what makes the line above
    // non-vacuous: a function that redacted everything would pass it.
    expect(payload['label']).toBe('audit probe');

    await adminDb.execute(
      sql`DELETE FROM agent_tokens WHERE secret_token = ${hashAgentToken(token)}`,
    );
  });

  it('would NOT have redacted `agent_token_hash` — the reason the column is named `secret_token`', async () => {
    /**
     * THE WORKAROUND, EXECUTED RATHER THAN ASSERTED FROM READING.
     *
     * `src/schema/agent-token.ts` says the clearer name is `agent_token_hash`
     * and that it is unavailable because `audit_redact()` matches on key NAME
     * and `%_hash` is not among its patterns. **That is a claim about a
     * database function, and this runs it.** If someone extends
     * `audit_redact()` to cover `%_hash`, this test goes red — which is the
     * signal to rename the column, exactly as the comment instructs.
     */
    const probe = (await adminDb.execute(sql`
      SELECT audit_redact(
        '{"secret_token":"aaa","agent_token_hash":"bbb","label":"ccc"}'::jsonb
      ) AS out`)) as unknown as { out: Record<string, unknown> }[];
    const out = probe[0]!.out;

    expect(out['secret_token']).toBe('[redacted]');
    // The misleading-but-safe name is caught; the accurate name would NOT be.
    expect(out['agent_token_hash']).toBe('bbb');
    expect(out['label']).toBe('ccc');
  });
});
