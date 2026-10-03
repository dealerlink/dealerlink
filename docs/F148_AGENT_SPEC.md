# F.148 — Tally agent: transport and masters read

**Status:** specification. Written against `docs/F148_AGENT_AUDIT.md`, which is
the authority on _what exists_; this is the authority on _what to build and why_.
Cite the audit rather than restating its enumerations, and re-check its line
citations when carrying them across — it is a snapshot at `242ea0b`.

**What this is.** A small program that runs on the tenant's own machine, beside
their Tally. It is the first component of this system to run on **someone else's
infrastructure**, and that governs almost every decision below.

**What this is not.** The write path. Nothing here posts a voucher, and that
separation is deliberate: a failed read is retried and nothing has happened,
where a failed write may or may not have changed their books. Every mechanism
that exists only because of that — idempotency keys, a durable outbox, the
unknown-outcome path — belongs to F.178 and must not appear here.

---

## 1. Three things do not exist, and this row builds the first two

Per the audit: no per-tenant token, no endpoint a machine polls, and no
data-export response shape. The existing auth is a session — `internal/
sentry-test` gates on `role !== 'operator'` and returns 404 rather than 403 so
the endpoint's existence is not disclosed. **That is a human gate and it does
not transfer.** A machine has no session, no cookie and no user.

So this row builds a machine-caller path that has no precedent in the codebase.
Treat that as the main risk, not the Tally protocol.

---

## 2. Outbound only. Non-negotiable.

The agent **initiates every connection**. Nothing from our side ever reaches
into their network.

- The agent polls our endpoint over HTTPS and posts to `localhost:9000`.
- Tally's XML API has **no authentication**. Anyone who can reach port 9000 can
  read and write their books. It must never be exposed to the internet, and the
  agent must never be the reason it is.
- No inbound port, no tunnel we terminate, no firewall rule on their side.

This also survives a move back on-premise, which they may make. Build for it.

---

## 3. Tenant scoping for a machine caller

The audit's answer to question 3 is the whole of it: `db` connects as
`dealerlink_app` with RLS enforced; `adminDb` connects as `dealerlink`,
`SUPERUSER` and `BYPASSRLS`. Every query path assumes `app.tenant_id` set from a
user session.

**The agent's requests must resolve a tenant from its token and set
`app.tenant_id` from that, then use the RLS-enforced connection.** Not `adminDb`.
A machine caller reaching for `adminDb` because the session plumbing does not fit
is how a cross-tenant read ships — and `rls.test.ts` would not catch it, because
the query would be correct and the scope wrong.

Report, before building, how the existing non-session callers establish scope —
pg-boss jobs, the seed, `adminDb` — and which of those patterns the agent should
follow. If none fits, say so rather than inventing a fourth.

---

## 4. The token

One per tenant, per installation. Minimum properties:

- **Issued and revocable from our side**, not derived from anything the tenant
  controls.
- **Scoped to one tenant.** A token resolves to exactly one tenant and cannot
  name another. Prove this the way the `HEALTH_TOKEN` matrix proved per-
  environment isolation: present tenant A's token against tenant B's data and
  assert it fails. That measurement is cheap and it is the one that would
  otherwise be assumed.
- **Scoped to the read path.** A read token must not become a write token when
  F.178 lands. Decide the shape now so that is structural rather than
  remembered.
- **Stored hashed**, compared in constant time, never logged — including in the
  structured error context F.170 added.

Report what the closest existing pattern is before designing one. The audit says
there is no precedent; confirm that includes `inbound_email_token`, which sounds
adjacent and may not be.

---

## 5. The masters read

This is the row's product: **fetch-then-select**, replacing F.11's abandoned
import-then-select.

The agent asks Tally for the tenant's ledgers and stock items and returns them.
F.11 then presents them for mapping. Nobody exports a file, and a re-fetch
catches a ledger renamed last week rather than trusting a list captured at
onboarding.

Two properties the design must carry:

- **Staleness is visible.** A mapping built against a fetch from three weeks ago
  is not wrong, but the operator should be able to see when it was taken. Record
  the fetch time with the data.
- **A re-fetch diffs rather than replaces.** When a ledger disappears between
  fetches, that is a mapping about to break — surface it rather than silently
  dropping the row. This is the same shape as F.11's re-import diff and the
  reasoning carries.

**No file-import bootstrap**, per the operator ruling. A bootstrap would be a
second mapping source existing solely for a window, and it would outlive the
window.

---

## 6. Their infrastructure fails differently

Their Tally restarts. Their VPS reboots. Their network drops. None of these is a
bug and all of them are normal operation.

The agent must:

- **Distinguish "Tally is not answering" from "Tally answered with nothing".**
  These are different states and the second is a legitimate answer. The audit's
  question 1 asks exactly this of our existing outbound callers; follow whichever
  of them draws the distinction best and say which.
- **Retry with backoff**, and stop. A failing agent must not hammer their machine.
- **Report its own health outbound** — last successful contact with Tally, last
  successful contact with us. Without this, "the sync isn't working" is
  undiagnosable from our side, which is F.170's lesson applied to a component we
  cannot attach a debugger to.
- **Survive a restart** without manual intervention. It runs as a service.
- **Log locally**, because their machine may be the only place a failure is
  visible. That log must never contain the token.

---

## 7. Out of scope

- The write path, and everything that exists only for it — F.178
- Voucher construction and the ledger mapping — F.12, F.11
- Any change to how Tally itself is configured on their machine beyond enabling
  the gateway
- Installation packaging beyond what is needed to run it once on their VPS

---

## 8. Acceptance

1. The agent fetches ledgers and stock items from a Tally instance and returns
   them, demonstrated against a real TallyPrime rather than a mock. **If no real
   Tally is reachable for development, that is a blocker to report, not to work
   around** — a mock built to the spec proves the spec, not the integration.
2. A token resolves to exactly one tenant; tenant A's token against tenant B's
   data fails, measured.
3. The agent uses the RLS-enforced connection, not `adminDb`.
4. Tally unreachable, Tally answering empty, and our endpoint unreachable are
   three distinguishable states, each demonstrated.
5. The agent survives a restart of itself, of Tally, and of the network, each
   demonstrated rather than argued.
6. No inbound connection exists in either direction.
7. The token appears in no log, no error report and no structured context.

---

## 9. Open for the builder

Report; do not decide:

1. Which existing non-session caller's scoping pattern the agent should follow,
   or whether none fits.
2. Whether `inbound_email_token` is a precedent for the token or merely sounds
   like one.
3. What language and runtime the agent should be, given it runs on a Windows VPS
   beside Tally rather than in our container. This is a real decision with
   consequences for packaging and for who can maintain it.
4. Whether a real TallyPrime instance is reachable for development, and what the
   fallback is if not. Per §8.1 this may be a blocker.
