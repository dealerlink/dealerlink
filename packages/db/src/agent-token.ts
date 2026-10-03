import { createHash } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { adminDb } from './client';
import { agentTokens } from './schema/agent-token';

/**
 * F.148 — the two statements the agent's READ path is allowed to run against
 * `agent_tokens`, and nothing else lives here on purpose.
 *
 * ## WHY THIS FILE IS SO SMALL
 *
 * `docs/F148_AGENT_SPEC.md` §3 splits the request in two:
 *
 * - **RESOLUTION is exempt from RLS and nothing else is.** It cannot run under
 *   RLS because `app.tenant_id` is not known yet — you cannot scope a lookup by
 *   the thing the lookup returns. So it uses `adminDb`, and **the exemption is
 *   ONE STATEMENT WIDE.**
 * - **DATA ACCESS is RLS-enforced, always**, through `withTenant` on `db`.
 *   None of that is here.
 *
 * Keeping both unscoped statements in one named module is what makes the bound
 * checkable: `rg -n 'adminDb'` over the agent's paths must return this file and
 * nothing else. A second unscoped statement elsewhere is not a style problem —
 * it means the exemption has stopped being an exemption.
 */

/** SHA-256 hex of a presented token. The column stores the digest, never the token. */
export function hashAgentToken(presented: string): string {
  return createHash('sha256').update(presented).digest('hex');
}

/**
 * STATEMENT 1 OF 2 — resolve a presented token to a tenant id.
 *
 * Returns the tenant id and the token's own id, **and nothing else**: no tenant
 * name, no settings, no joined row. A caller that needs tenant data fetches it
 * afterwards through `withTenant` like every other caller.
 *
 * FAILS CLOSED: an unknown, malformed or revoked token yields `null`, which the
 * caller must treat as "no tenant" rather than as "any tenant" — the
 * `HEALTH_TOKEN` posture (`apps/web/app/api/health/route.ts`), where an absent
 * secret means nobody gets in rather than everybody.
 */
export async function resolveAgentToken(
  presented: string,
): Promise<{ tokenId: string; tenantId: string; scope: string } | null> {
  if (!presented) return null;
  const [row] = await adminDb
    .select({
      tokenId: agentTokens.id,
      tenantId: agentTokens.tenantId,
      scope: agentTokens.scope,
    })
    .from(agentTokens)
    .where(
      and(eq(agentTokens.secretToken, hashAgentToken(presented)), isNull(agentTokens.revokedAt)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * STATEMENT 2 OF 2 — the heartbeat.
 *
 * **WRITES EXACTLY `last_seen_at` AND `agent_version`, ON EXACTLY THE
 * AUTHENTICATING ROW, AND NOTHING ELSE.** That bound is the whole contract, and
 * it is asserted in `tests/agent-token.test.ts` rather than trusted.
 *
 * Operator ruling: **"read path" means it does not mutate THEIR books, not that
 * it issues no SQL.** `last_seen_at` is the only thing that makes "the sync
 * isn't working" diagnosable from our side, which spec §6 requires, and a
 * separate home for it would mean building and securing a second write path for
 * one timestamp.
 *
 * **Why that bound matters once F.178 exists:** without it, "read path" decays
 * into "the path we call the read path". The assertion is what keeps the phrase
 * meaning something when a write path sits next to it.
 *
 * Note `updated_at` is deliberately NOT touched. It describes operator changes
 * to the credential — label, scope, revocation — and an agent polling every
 * minute would otherwise make it meaningless.
 */
export async function touchAgentToken(tokenId: string, agentVersion: string | null): Promise<void> {
  await adminDb.execute(
    sql`UPDATE agent_tokens
          SET last_seen_at = now(),
              agent_version = ${agentVersion}
        WHERE id = ${tokenId}::uuid`,
  );
}
