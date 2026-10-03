'use client';

import { AlertTriangle, KeyRound, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';

import { issueAgentToken, revokeAgentToken } from '@/lib/actions/admin/agent-tokens';
import { describeLastSeen } from '@/lib/agent/last-seen';

export interface AgentTokenView {
  id: string;
  label: string;
  scope: string;
  issuedAt: string;
  issuedByEmail: string | null;
  revokedAt: string | null;
  revokedByEmail: string | null;
  lastSeenAt: string | null;
  agentVersion: string | null;
}

/**
 * F.148 — the Tally agent's credentials for one tenant.
 *
 * Three decisions are visible in this component and each is written down at the
 * place it shows up, because each is the kind of thing a later edit would undo
 * without noticing:
 *
 * 1. **Show-once is stated as a PROPERTY, not an apology.** "We store a digest,
 *    so this cannot be recovered" tells the operator something true about how
 *    their credential is protected. "Make sure to save it, we can't show it
 *    again" invites the reading that we chose not to.
 * 2. **Revoked tokens stay in the default listing, marked.** A revoked token
 *    absent from the UI is indistinguishable from one never issued, so
 *    `audit_log` would hold a revocation event for a row the operator cannot
 *    see — the screen that should corroborate the audit trail instead
 *    contradicts it, with no way to settle which is right. Filtering is a view
 *    concern if the list grows; the default shows everything.
 * 3. **A second live token is permitted, surfaced, and never blocked.** A
 *    replacement VPS mid-migration is the case with the deadline. Two live
 *    tokens is also what a compromise looks like, so the count is shown
 *    PERSISTENTLY rather than only at issue time — a warning at issue time is
 *    invisible a week later, which is exactly when it matters.
 */
export function AgentTokensSection({
  tenantId,
  tokens,
  onChanged,
}: {
  tenantId: string;
  tokens: AgentTokenView[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [issued, setIssued] = useState<{ label: string; plaintext: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = tokens.filter((t) => !t.revokedAt);

  const issue = () => {
    setError(null);
    startTransition(async () => {
      const result = await issueAgentToken({ tenantId, label });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setIssued({ label: result.data.label, plaintext: result.data.plaintext });
      setLabel('');
      setAdding(false);
      onChanged();
    });
  };

  const revoke = (tokenId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await revokeAgentToken({ tenantId, tokenId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onChanged();
    });
  };

  return (
    <section className="hairline rounded-[8px] bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-mute">
            <KeyRound size={13} />
          </span>
          <div className="titlecaps">Tally agent tokens</div>
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-mute hover:text-ink inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12px]"
          >
            <Plus size={11} /> Issue token
          </button>
        ) : null}
      </div>

      {/* PERSISTENT, not only at issue time. */}
      {active.length > 1 ? (
        <div
          data-testid="agent-multiple-active"
          className="mb-3 flex items-start gap-2 rounded-[6px] bg-[#FFF8E1] p-3 text-[12.5px]"
        >
          <AlertTriangle size={13} className="mt-[2px] shrink-0" />
          <div>
            <strong>{active.length} tokens are live for this tenant.</strong> That is correct during
            a replacement or a second site. It is also what a compromise looks like — revoke the one
            you are retiring once the new installation has checked in.
          </div>
        </div>
      ) : null}

      {issued ? (
        <div
          data-testid="agent-token-once"
          className="mb-3 rounded-[6px] border border-[var(--line)] bg-[var(--paper-2)] p-3"
        >
          <div className="text-[12.5px] font-medium">Token for “{issued.label}”</div>
          <div className="mono mt-2 break-all text-[12.5px]">{issued.plaintext}</div>
          {/* THE PROPERTY, NOT AN APOLOGY. */}
          <div className="text-mute mt-2 text-[12px]">
            We store a <strong>digest</strong> of this token, not the token. It cannot be recovered
            — copy it into the agent’s config now. Issue a replacement if it is lost.
          </div>
          <button
            type="button"
            onClick={() => setIssued(null)}
            className="text-mute hover:text-ink mt-2 text-[12px] underline"
          >
            I have copied it
          </button>
        </div>
      ) : null}

      {adding ? (
        <div className="mb-3 rounded-[6px] border border-[var(--line)] p-3">
          <label className="text-mute block text-[12px]" htmlFor="agent-token-label">
            What is this installation? (shown in this list, and in support)
          </label>
          <input
            id="agent-token-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ponda VPS"
            className="border-line mt-1 h-8 w-full rounded-[5px] border px-2 text-[12.5px]"
          />
          {active.length > 0 ? (
            <div className="text-mute mt-2 text-[12px]">
              This tenant already has {active.length} active token
              {active.length === 1 ? '' : 's'}: {active.map((a) => a.label).join(', ')}. A second is
              correct for a replacement or a second site.
            </div>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending || label.trim().length < 3}
              onClick={issue}
              className="border-accent bg-accent inline-flex h-8 items-center rounded-[5px] border px-3 text-[12px] font-medium text-white disabled:opacity-50"
            >
              {pending ? 'Issuing…' : 'Issue'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setLabel('');
              }}
              className="text-mute hover:text-ink h-8 px-2 text-[12px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="mb-3 text-[12.5px] text-[var(--danger)]">{error}</div> : null}

      {tokens.length === 0 ? (
        <div className="text-mute text-[12.5px]">
          No agent token has been issued. The Tally agent cannot check in without one.
        </div>
      ) : (
        <ul className="divide-line divide-y">
          {tokens.map((t) => {
            const seen = describeLastSeen(t.lastSeenAt ? new Date(t.lastSeenAt) : null);
            return (
              <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <div className="text-[12.5px] font-medium">
                    {t.label}
                    {t.revokedAt ? (
                      <span
                        data-testid="agent-token-revoked"
                        className="text-mute ml-2 rounded-[4px] bg-[var(--paper-2)] px-1.5 py-[1px] text-[11px]"
                      >
                        revoked
                      </span>
                    ) : null}
                  </div>
                  {/* Bucketed, never an exact time — see lib/agent/last-seen.ts. */}
                  <div
                    data-testid="agent-token-lastseen"
                    className={`mt-0.5 text-[12px] ${seen.attention ? 'text-[var(--danger)]' : 'text-mute'}`}
                  >
                    {seen.label}
                    {t.agentVersion ? ` · agent ${t.agentVersion}` : ' · version not reported'}
                  </div>
                  <div className="text-mute mt-0.5 text-[11.5px]">
                    Issued {new Date(t.issuedAt).toLocaleDateString('en-IN')}
                    {t.issuedByEmail ? ` by ${t.issuedByEmail}` : ''}
                    {t.revokedAt
                      ? ` · revoked ${new Date(t.revokedAt).toLocaleDateString('en-IN')}${
                          t.revokedByEmail ? ` by ${t.revokedByEmail}` : ''
                        }`
                      : ''}
                  </div>
                </div>
                {!t.revokedAt ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revoke(t.id)}
                    className="text-mute hover:text-ink h-7 shrink-0 px-2 text-[12px] disabled:opacity-50"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
