'use server';

import { agentTokens, type DrizzleTx } from '@dealerlink/db';
import { hashAgentToken } from '@dealerlink/db/agent-token';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { operatorAction } from '@/lib/actions/wrap';
import { generateAgentToken } from '@/lib/admin/credentials';
import { issueAgentTokenSchema, revokeAgentTokenSchema } from '@/lib/admin/schemas';
import { AppError } from '@/lib/errors';

/**
 * F.148 — issuing and revoking the Tally agent's credential.
 *
 * ## WHY `operatorAction` AND NOT A TENANT ROLE
 *
 * Settled 2026-10-03. CLAUDE.md §6's four tenant roles were considered first,
 * and within them **Admin** is the only candidate — Sales, Accounts and Dispatch
 * are each explicitly barred from the config-and-credentials class of action.
 * Admin is not chosen, because §6's roles are TENANT-administration roles and in
 * Phase 1 this is not a tenant-administration act.
 *
 * **`operator` is not an invented role:** CLAUDE.md §8 decision 2 defines it
 * ("one tier above tenant `admin`") and `operatorAction()` implements it. The
 * closest existing credential uses exactly this — `regenerateInboundToken` is an
 * `operatorAction` in this same directory, rendered on the same screen.
 *
 * **The deciding argument is what the token's lifecycle is tied to:** an
 * installation WE perform, on a machine we cannot see (F.189). Issuing a token
 * is a step in installing the agent, not something a tenant admin does between
 * invoices. §4's "issued and revocable from our side" reads the same way.
 *
 * **WHAT WOULD CHANGE IT:** self-serve installation in Phase 2. Moving this to
 * tenant Admin then needs **no migration** — `issued_by` is already a `users` FK
 * and records whoever did it, whichever role they hold. The move would be the
 * wrapper and the page, not this logic, which is why the logic is here and not
 * inside a component.
 */

/**
 * `operatorAction` sets no `app.tenant_id`, so a tenant-scoped table needs it
 * bound explicitly inside the transaction. Same helper, same reason, as
 * `inbound-token.ts`.
 */
async function bindTenantContext(tx: DrizzleTx, tenantId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
}

/**
 * Issue a token. **Returns the plaintext ONCE and stores only its digest.**
 *
 * The caller must show the returned value immediately and must not persist it
 * anywhere: `agent_tokens.secret_token` holds `sha256(token)`, so there is
 * nothing to display later and nothing to leak from the database if it is read.
 *
 * NOT BLOCKED WHEN A LIVE TOKEN ALREADY EXISTS. A tenant may legitimately hold
 * two — a replacement VPS during a migration, with a deadline — and refusing
 * would break the case that has the deadline. The count of currently-active
 * tokens is RETURNED so the caller can surface it at the moment of decision and
 * persistently afterwards; a warning shown only at issue time is invisible a
 * week later, which is exactly when it matters.
 */
export const issueAgentToken = operatorAction(
  issueAgentTokenSchema,
  async ({ tx, input, auth }) => {
    await bindTenantContext(tx, input.tenantId);

    const active = await tx
      .select({ id: agentTokens.id, label: agentTokens.label })
      .from(agentTokens)
      .where(and(eq(agentTokens.tenantId, input.tenantId), isNull(agentTokens.revokedAt)));

    const plaintext = generateAgentToken();
    const [row] = await tx
      .insert(agentTokens)
      .values({
        tenantId: input.tenantId,
        label: input.label,
        secretToken: hashAgentToken(plaintext),
        scope: 'read',
        issuedBy: auth.user.id,
      })
      .returning({ id: agentTokens.id, label: agentTokens.label, issuedAt: agentTokens.issuedAt });
    if (!row) throw new AppError('INTERNAL', 'Could not issue the token');

    return {
      tokenId: row.id,
      label: row.label,
      issuedAt: row.issuedAt,
      /**
       * SHOWN ONCE. There is no endpoint, screen or query that can return this
       * again — the column holds a digest. The UI states that as a property of how
       * the credential is protected rather than as an apology for the interface.
       */
      plaintext,
      /** Tokens that were already live BEFORE this one. Surfaced, never blocking. */
      previouslyActive: active.map((a) => a.label),
    };
  },
);

/**
 * Revoke a token. **The row stays in the default listing, marked.**
 *
 * ## WHY IT IS NOT HIDDEN, AND THE ARGUMENT THAT DECIDES IT
 *
 * A revoked token absent from the UI is **indistinguishable from one never
 * issued** — so `audit_log` would hold a revocation event for a row the operator
 * cannot see, and the screen that should corroborate the audit trail instead
 * contradicts it with no way to settle which is right.
 *
 * The weaker form of the same point, kept because it is the one people feel: a
 * revoked installation is evidence, and hiding it is how "we never issued that"
 * gets said in good faith.
 *
 * Filtering is a VIEW concern if the list ever grows. The default shows
 * everything.
 *
 * Idempotent on an already-revoked token — it does not overwrite the original
 * `revoked_at`/`revoked_by`, because the first revocation is the fact and a
 * second click is not a second event.
 */
export const revokeAgentToken = operatorAction(
  revokeAgentTokenSchema,
  async ({ tx, input, auth }) => {
    await bindTenantContext(tx, input.tenantId);

    const [existing] = await tx
      .select({ id: agentTokens.id, revokedAt: agentTokens.revokedAt })
      .from(agentTokens)
      .where(and(eq(agentTokens.id, input.tokenId), eq(agentTokens.tenantId, input.tenantId)))
      .limit(1);
    if (!existing) throw new AppError('NOT_FOUND', 'Token not found for this tenant');
    if (existing.revokedAt) return { tokenId: existing.id, alreadyRevoked: true };

    await tx
      .update(agentTokens)
      .set({ revokedAt: sql`now()`, revokedBy: auth.user.id, updatedAt: sql`now()` })
      .where(eq(agentTokens.id, input.tokenId));

    return { tokenId: existing.id, alreadyRevoked: false };
  },
);
