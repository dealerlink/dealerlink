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

> **AMENDED 2026-10-03 by operator ruling (OD-3). This section previously read as
> though ONE rule covered both halves of the request, and it does not.** The
> original text: "**The agent's requests must resolve a tenant from its token and
> set `app.tenant_id` from that, then use the RLS-enforced connection.** Not
> `adminDb`." — followed by "Report, before building, how the existing
> non-session callers establish scope … If none fits, say so rather than
> inventing a fourth."
>
> That report came back and **the answer is that none fits, because the path is
> two patterns joined and the join is new.** The operator's words: "my §3
> conflated two problems: resolution and data access."

**There are two steps and they get different rules.**

**Step 1 — RESOLUTION. Exempt, and narrowed to the bone.** Turning an opaque
token into a tenant id **cannot** run under RLS: `app.tenant_id` is not yet
known, and `rls.test.ts:108-128` forces a `tenant_isolation` policy on any table
carrying a `tenant_id` column — so the lookup could not read its own table. The
structural point, which is why no amount of plumbing fixes it: **you cannot scope
a lookup by the thing the lookup returns.** Lucia already lives with this
(`apps/web/lib/auth/lucia.ts:12` builds its session adapter on `adminDb`, and
`packages/db/src/client.ts:94-95` names session validation as a sanctioned use).

So the bootstrap lookup is exempt, and **it must be the narrowest possible**:

- **one table**, **one lookup**, returning **only a tenant id** — no joins, no
  other column, no tenant data of any kind;
- failing closed, yielding **no tenant** on no match (the `HEALTH_TOKEN`
  precedent, `apps/web/app/api/health/route.ts:249-255`);
- exactly one tenant per token, enforced **by the database** — the
  `inbound_email_token` partial unique index
  (`packages/db/src/schema/tenant-settings.ts:74-75`) is the in-repo precedent.

**A `SECURITY DEFINER` SQL function is the better long-term shape** — the
privilege stays in the database and no `adminDb` appears in application code —
and it is **to be settled before F.178** puts a write path behind the same
resolution. It is not this row's work.

**Step 2 — DATA ACCESS. Unchanged, and not negotiable.** Everything after
resolution runs `withTenant(tenantId, …)` on the RLS-enforced connection,
following `apps/workers/src/jobs/render-pdf.ts:138-139` verbatim in shape.
**Never `adminDb`.** A machine caller reaching for `adminDb` because the session
plumbing does not fit is how a cross-tenant read ships — and `rls.test.ts` would
not catch it, because the query would be correct and the scope wrong.

**The invariant that makes the exemption safe:** the exemption is one statement
wide. If a second unscoped statement appears in this path, the exemption has
stopped being an exemption. `rg -n 'adminDb'` over the agent's paths must return
exactly one site.

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

> **CORRECTED 2026-10-03 — this was the operator's error, and the notes win.**
> A fourth bullet read "Installation packaging beyond what is needed to run it
> once on their VPS". That contradicted F.148's own notes, which require that
> "an upgrade path and a version report have to exist **from day one** rather
> than being added when the first bug lands", because "**WE CANNOT DEPLOY A
> FIX** — there is no `deploy_on_push` for someone else's VPS".
>
> Both could not bind. The operator's ruling: **a component on someone else's
> machine that cannot be updated is a liability.** So the bullet is removed and
> both halves are **IN SCOPE**:
>
> - **A version report** — cheap, and already inside §6's self-reporting
>   requirement. The agent says which build it is, outbound, without being asked.
> - **An upgrade mechanism** — the expensive half, and the one that cannot be
>   retrofitted. It does not have to be elegant on day one; it has to exist, so
>   that the first bug is a deployment rather than a site visit.
>
> This is the one scope change the rulings made, and it makes the row larger.

---

## 8. Acceptance

> **AMENDED 2026-10-03 — criterion 1 is BEHIND A NAMED GATE (B-1 ruling), and
> criterion 3 follows §3's two-step split.** The report asked for by §9.4 came
> back and the answer is that **no real TallyPrime is reachable from anything in
> this repository**: no host, no port, no credential, no licence, no test
> instance. Per this section's own instruction that was reported, not worked
> around. The ruling: **split delivery.**

**GATE T — "Tally-verified".** Every criterion below marked **[T]** stays OPEN
until a real TallyPrime instance has been reached. They are not re-written to be
passable with a fixture, because that is weakening a gate to clear it
(CLAUDE.md §11.1 ruling 1).

**The line, stated so a closeout cannot blur it: a mock-passing suite must never
report a [T] criterion as met.** A mock built to the spec proves the spec, not
the integration — and a passing result that could not have detected the thing the
check exists for is DEV.138's exact signature.

1. **[T]** The agent fetches ledgers and stock items from a Tally instance and
   returns them, **demonstrated against a real TallyPrime rather than a mock.**
2. A token resolves to exactly one tenant, and a request bearing tenant A's token
   returns only tenant A's rows — measured, **with a positive control that goes
   red when the scope is removed.**
3. **Data access** runs through `withTenant` on the RLS-enforced connection.
   **The only unscoped statement in the whole path is §3's resolution lookup**: one
   table, one lookup, a tenant id and nothing else. `rg -n 'adminDb'` over the
   agent's paths returns exactly one site.
4. Tally unreachable, Tally answering empty, and our endpoint unreachable are
   three distinguishable states, each demonstrated. **The "our endpoint
   unreachable" third is reachable now; the two Tally states are [T] in their
   integration half** — in particular "port 9000 answers while no company is
   loaded", which nobody here has observed and a fixture can only assert our
   guess about.
5. The agent survives a restart of itself, of the network to us, and **[T]** of
   Tally — each demonstrated rather than argued.
6. No inbound connection exists in either direction: no listening socket in the
   agent (its own source enumerated, plus an executed socket check on the running
   process), no tenant-network address as a request target on our side, and no new
   route into their network in the DO spec.
7. The token appears in none of the named sinks — the agent's local log, the
   `reportError`/Sentry path, `audit_log`, the Axiom payload, the pino stream —
   **and the assertion goes red when a line deliberately logs it.** Note that
   `apps/web/lib/observability/scrub.ts` has no token pattern, so this cannot
   lean on an existing safety net.
8. **A version report exists** and the agent states its build outbound (§7, as
   corrected).

---

## 9. Open for the builder

**Four of these are now SETTLED and are recorded here so nobody re-asks them.**

| #   | Question                                    | Status                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which non-session scoping pattern to follow | **SETTLED — none does.** §3 is amended: resolution is exempt and narrowed, data access is RLS-only. `SECURITY DEFINER` before F.178                                                                                                                                                      |
| 2   | Is `inbound_email_token` a precedent        | **SETTLED by reading the code. Do not re-ask.** Partial precedent — the DB-enforced one-tenant-per-token index — and an active counter-example: it is plaintext `text()`, shown in the admin UI, not compared in constant time, and it authenticates nothing (no resolution site exists) |
| 3   | Language and runtime on a Windows VPS       | **OPEN — OD-2.** Not to be decided from the chair. Node buys familiarity only: the read path shares no code with the monorepo, and this repo's packaging (`tsx` over source, whole-monorepo copy) must never touch a client VPS. Decide on the **upgrade path**                          |
| 4   | Is a real TallyPrime reachable              | **SETTLED: no. See Gate T above**                                                                                                                                                                                                                                                        |
| 5   | Where the agent's code lives                | **SETTLED — a separate repository.** A client VPS must never receive a copy of this monorepo, and the read path shares no code with it                                                                                                                                                   |

**Still open, and the day does not start until they are ruled:** OD-2 (runtime),
OD-4 (token storage — a migration, therefore STOP AND ASK), OD-5 (how criterion 7
is enforced), OD-6 (which host the agent calls, and the middleware matcher).

**And one thing to resolve BEFORE anyone builds to this spec:** `CLIENT_CONTEXT.md`
says **TallyPrime Silver**, which is single-user; F.148's notes say **multi-user
and cloud-hosted**, and the entire dissolution of the operational-fragility
objection rests on the second. **If Silver is right the design still holds but its
justification changes** — and that belongs on the row before anyone builds to it.
