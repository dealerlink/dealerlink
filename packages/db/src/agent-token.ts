import { createHash } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { adminDb } from './client';
import { agentTokens } from './schema/agent-token';
import type { DrizzleTx } from './with-tenant';

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
 * - **DATA ACCESS is RLS-enforced, always**, through `withTenant` on `db` — and
 *   that now includes the heartbeat below, which takes the transaction.
 *
 * ## HOW THIS MODULE IS REACHED, AND WHY NOT THROUGH THE BARREL
 *
 * Exported as the subpath `@dealerlink/db/agent-token`, NOT from `src/index.ts`.
 * It imports `node:crypto`, and the barrel is on the Edge path:
 * `apps/web/lib/tenant/resolve.ts` imports `"."` and is inlined into the Next.js
 * middleware bundle, where webpack cannot resolve a `node:` scheme. One barrel
 * line broke `pnpm build` with `UnhandledSchemeError` (DEV.158).
 *
 * **A subpath cannot cause that**, because it is reachable only by a caller that
 * names it. Accidental reachability was the defect; an explicit import by a
 * module that has declared `runtime = 'nodejs'` is not the same thing.
 *
 * Keeping the ONE unscoped statement in a named module is what makes the bound
 * checkable: `rg -n 'adminDb'` over the agent's paths must return **this file,
 * once**. A second unscoped statement anywhere — including in this file — is not
 * a style problem; it means the exemption has stopped being an exemption. It was
 * two until 2026-10-03, when the measurement was actually taken.
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
 * THE HEARTBEAT — RLS-ENFORCED, AND THROTTLED.
 *
 * ## IT TAKES A TRANSACTION, AND THAT IS A CORRECTION
 *
 * This used to run on `adminDb`, which made the agent's path TWO unscoped
 * statements rather than one. **The invariant — `rg -n adminDb` over the agent's
 * paths returns exactly one site — did not hold, and the measurement is what
 * found it**, not the docblock above, which claimed "one statement wide" while
 * the code was one statement wider.
 *
 * It does not need the exemption. By the time the heartbeat runs the tenant is
 * known, so it goes through `withTenant` on the RLS-enforced connection and RLS
 * ADDITIONALLY constrains it to that tenant's rows — a better guarantee than the
 * `WHERE id` alone, obtained by deleting a privilege rather than adding a check.
 *
 * ## WRITES EXACTLY TWO COLUMNS, ON EXACTLY ONE ROW, AND USUALLY NOT AT ALL
 *
 * ### The throttle, and why it is not premature optimisation
 *
 * Every UPDATE here fires `audit_trg` on `agent_tokens` and writes an
 * `audit_log` row. **An agent polling every minute would write 1,440 audit rows
 * per tenant per day for heartbeats alone, burying the revocations somebody will
 * actually read** — measured, not predicted: the write-bound test in
 * `apps/web/app/api/agent/checkin/route.test.ts` reported `audit_log` growing and
 * that is how this was noticed.
 *
 * Operator ruling: **accept the audit, cap the write.** Stopping the audit on
 * this table is wrong — revocation is the thing you most want audited — and a
 * separate un-audited heartbeat table is new schema and a stop-and-ask.
 *
 * **INTERVAL: 15 MINUTES.** Chosen because minute-resolution on "when did this
 * agent last check in" is **false precision**: the question it answers is "is
 * this installation alive", which is a support question at human scale, and a
 * 15-minute answer resolves it exactly as well as a 1-minute one. It cuts the
 * audit volume ~15x, to about 96 rows per tenant per day.
 *
 * ### ...unless the VERSION changed, and then it writes immediately
 *
 * The predicate also fires on `agent_version IS DISTINCT FROM` the presented
 * value. An upgrade is rare and is **exactly the event worth having in the audit
 * log with its real timestamp** — throttling it would be the one case where the
 * cap costs something.
 *
 * ### What this means for a reader of `last_seen_at`
 *
 * **It is a lower bound, not a last-contact time**: the agent may have checked in
 * up to 15 minutes more recently than the column says. Anything comparing it
 * against a staleness threshold must allow for that, which is why the interval is
 * named here as a constant rather than inlined.
 *
 * `updated_at` is deliberately untouched — it describes operator changes to the
 * credential, and an agent would make it meaningless.
 */
export const HEARTBEAT_THROTTLE = '15 minutes';

export async function touchAgentToken(
  tx: DrizzleTx,
  tokenId: string,
  agentVersion: string | null,
): Promise<void> {
  await tx.execute(
    sql`UPDATE agent_tokens
          SET last_seen_at = now(),
              agent_version = ${agentVersion}
        WHERE id = ${tokenId}::uuid
          AND (last_seen_at IS NULL
               OR last_seen_at < now() - interval '${sql.raw(HEARTBEAT_THROTTLE)}'
               OR agent_version IS DISTINCT FROM ${agentVersion})`,
  );
}
