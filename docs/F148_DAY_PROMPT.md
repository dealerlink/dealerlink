# Day 56–61 — F.148: the Tally agent, transport and masters-READ path only

> **DRAFT from `prompt-drafter`, 2026-10-03. Untracked and unamended — the operator amends, then it lands with the day's own PR.**
>
> ## MAIN-THREAD CORRECTION BEFORE YOU READ IT
>
> **The draft's headline finding is wrong, and it is wrong for a reason worth knowing.** It opens by reporting that `docs/F148_AGENT_AUDIT.md` "does not exist in the repository", that `pnpm check:paths` has a live failure on the spec's citation of it, and that Phase C must fix that citation.
>
> **The audit exists and is on `main`** — PR #95, merged. The drafter ran against the `f148-spec` working tree, which was cut from `origin/main` _before_ #95 merged, so on that branch the file genuinely was absent. It read its own tree correctly and generalised to "the repository" incorrectly.
>
> Measured after rebasing onto the merged `main`: **`pnpm check:paths` exits 0.** #96's `checks` job was green all along, because GitHub tests the PR's merge commit, where the audit is present.
>
> **STRIKE from the draft:** item 4 of "Read first"; note 1 of "NOTES I COULD NOT CONFIRM"; the first bullet of Phase C; item 1 of "FOUND WHILE READING"; and criterion 9's clause about the audit citation. **Everything else stands** — and the drafter's decision to re-derive every load-bearing claim from code rather than trust a relayed audit is why the rest of the document is worth more, not less.
>
> **The main thread independently verified, with `git grep -n` and direct reads, the five premise corrections the operator's decisions turn on. All five hold:** the Resend webhook's six `adminDb` sites; `inboundEmailToken` as a plaintext `text()` column rendered into an address in the admin UI at `tenant-detail-sections.tsx:1012-1013`; **`apps/web/lib/email/resend-webhook.ts` absent from the complete list of files referencing `inboundTokenHistory`**, so the 7-day grace window really is unimplemented; `scrub.ts` scrubbing email/GSTIN/PAN/card/phone and nothing else; and `audit_redact`'s patterns (`password_hash`, `inbound_email_token`, `token`, `%_secret`, `%_token`) matching **none** of a column named `*_token_hash`.

**STATUS: DRAFT. NOT READY TO START.** Six open decisions (OD-1…OD-6) and one reported blocker (B-1) must be settled first. Three of the spec's seven acceptance criteria are not measurable as written and one is not satisfiable from anything in this repository; all four are restated below. Per the F.6 precedent these are named before the day starts rather than discovered at closeout.

**Read first, in this order:**

1. `docs/F148_AGENT_SPEC.md` — the authority on **what to build and why**. Read in full.
2. `docs/stage-f-tasks.json` row **F.148** (the 2026-10-03 operator rewrite, four numbered changes — the sequencing inversion is change 2), row **F.178** (the write path: **nothing on that row appears here**), row **F.11** (fetch-then-select, which consumes this row), row **F.179** (the cutover placeholder).
3. `CLAUDE.md` §4 (RLS on every table, including log tables), §6 (`tenantAction`/`operatorAction`), §10.1 (stop and ask), §11.1 rulings 1, 2, 5 and 7.
4. `docs/F148_AGENT_AUDIT.md` — the authority on **what exists**. The PREMISE CHECK below re-derives its load-bearing claims from code independently; where the two differ, the code wins and the difference is named.

**What this day does not do:** no voucher posting, no idempotency key, no outbox, no unknown-outcome reconciliation, no conflict handling, no ordering — every one of those is **F.178** and the split is a property of the two halves, not a convenient cut. No ledger mapping and no product-name matching (**F.11**, **F.12**). No historical-data migration (**F.179**).

---

## PREMISE CHECK — re-derived against the code, 2026-10-03, at `main = 242ea0b`

### Confirmed

| Claim                                                                                                             | Evidence                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db` connects as `dealerlink_app`, RLS enforced                                                                   | `packages/db/src/client.ts:78` (**not `:77-78`** — line 77 is a bare ` *`)                                                                                                   |
| `adminDb` connects as `dealerlink`, SUPERUSER, BYPASSRLS                                                          | `packages/db/src/client.ts:92`                                                                                                                                               |
| `internal/sentry-test` gates on `role !== 'operator'` and returns **404, not 403**, so existence is not disclosed | `apps/web/app/api/internal/sentry-test/route.ts:21-23`                                                                                                                       |
| Exactly **three** `route.ts` under `apps/web/app/api/`                                                            | Affirmative enumeration of the complete glob: `internal/sentry-test/route.ts`, `webhooks/resend/route.ts`, `health/route.ts` (+ `health/route.test.ts`, a test)              |
| `packages/db/tests/rls.test.ts` exists, and covers a new table **automatically**                                  | `:108-128` — it derives the table list from `pg_class` joined to a `tenant_id` attribute; "a new table is covered the moment it exists, with no list to update" (`:101-103`) |
| `inbound_email_token` has a real action module                                                                    | `apps/web/lib/actions/admin/inbound-token.ts` (rotation + 7-day grace)                                                                                                       |
| `withTenant` needs **no session** — it takes a bare `tenantId` and uses RLS-enforced `db`                         | `packages/db/src/with-tenant.ts:78-104`, `:97`                                                                                                                               |
| The workers process exposes **no HTTP port**                                                                      | `apps/workers/Dockerfile:73`. So the agent's endpoint must live in `apps/web`. Not a decision.                                                                               |

### Drifted or wrong — the code wins

1. **"Exactly two `fetch(` sites" holds only for application source.** `rg` over tracked files finds **ten** across seven files. Two are application code — `apps/workers/src/email/resend-client.ts:114` and `apps/web/app/api/health/route.ts:129`. The other eight are repo tooling (`scripts/merge-status.mjs:222`, `scripts/load-test/lib/http.mjs:35,66`, `packages/db/scripts/smoke-dashboard.mjs:35`, `packages/db/scripts/smoke-day3.mjs:39,54,65,133`). State the scope when you repeat the claim.

2. **The spec's §1 — "this row builds a machine-caller path that has no precedent in the codebase" — is FALSE as written, and the correction changes the work.** There are **two** existing machine-caller paths:
   - **The Resend webhook.** `apps/web/app/api/webhooks/resend/route.ts:13-17` — "PUBLIC by necessity — Resend calls it from their infrastructure with no Dealerlink session. The Svix signature IS the authentication." It uses **`adminDb` for everything** (`lib/email/resend-webhook.ts:115,140,174,228`) and explicitly declines to scope: "correlated by `provider_message_id` (globally unique — **no tenant scope needed**)" (`:166-167`).
   - **The `/api/health` detail token (F.176, landed days ago).** `apps/web/app/api/health/route.ts:253-259` parses a `Bearer` header; `:240-244` compares in constant time over SHA-256 digests — **and the reason is already written down** (`:234-236`): digests make it length-independent, because `timingSafeEqual` throws on unequal-length buffers and catching that throw would itself leak the length. `:249-255` **fails closed** when `HEALTH_TOKEN` is unset.

   So §4's "Report what the closest existing pattern is before designing one" is **answered by reading**: `detailAuthorised` + `secretEquals` are the shape, and they are already in the tree. **Reuse them; do not re-derive them.** What genuinely has no precedent is much narrower: a **per-tenant** machine credential that _resolves to a tenant_ and then _scopes data access_. Both existing paths are tenant-agnostic by design.

3. **`inbound_email_token` is a partial precedent and in two respects an active counter-example** (this answers spec §9 question 2 — do not re-ask it):
   - **For:** `packages/db/src/schema/tenant-settings.ts:74-75` + `packages/db/migrations/0000_cultured_iron_man.sql:111` put a **partial UNIQUE index** on the token where NOT NULL. That is exactly §4's "a token resolves to exactly one tenant", enforced by the DB rather than by code. Rotation with a grace window is real (`inbound-token.ts:11,36-42`). `audit_redact()` redacts the key (`packages/db/src/triggers/audit-log.sql:32`).
   - **Against:** the column is `text()` — **plaintext, not a hash** (`tenant-settings.ts:60`), it is deliberately human-readable and **displayed in the admin UI** (`apps/web/app/admin/tenants/[id]/tenant-detail-sections.tsx:1012-1013`), and nothing compares it in constant time.
   - **And it authenticates nothing.** Affirmative enumeration of every `inboundTokenHistory` reference in the repo: the schema file, the insert in `inbound-token.ts:37`, a display query in `apps/web/app/admin/tenants/[id]/page.tsx:41-54`, and two test inserts. **There is no resolution or matching site.** The schema comment at `packages/db/src/schema/inbound-token-history.ts:8-11` says "The Resend inbound webhook (built in Day 14) checks both the current `tenant_settings.inbound_email_token` and this table" — `processResendEvent` does no such thing. That behaviour is **unimplemented**. See FOUND WHILE READING.

4. **`audit_redact()` matches on key NAME, and `token_hash` would slip through.** `packages/db/src/triggers/audit-log.sql:31-35` redacts `password_hash`, `inbound_email_token`, `token`, `%_secret`, `%_token`. A column called `agent_token_hash` ends in `_hash` and matches **none** of those patterns. Name the column so the existing redaction covers it, or extend the function — the latter is a migration.

5. **Sentry's scrubber has no token pattern.** `apps/web/lib/observability/scrub.ts:37-43` scrubs email, GSTIN, PAN, card and phone. Nothing else. A token passed into `reportError`'s open-ended `context: Record<string, unknown>` (`apps/web/lib/actions/wrap.ts:89,97`) reaches Sentry **unredacted**. Acceptance criterion 7 therefore cannot be satisfied by any existing safety net — see OD-5.

6. **`CLIENT_CONTEXT.md:30-31` says "TallyPrime Silver"; F.148's notes say "multi-user and CLOUD HOSTED".** Silver is the single-user edition. The notes' claim that the operational-fragility objection "largely dissolves" rests entirely on multi-user cloud hosting. Unreconciled — see B-1.

### Absences, each by affirmative enumeration (CLAUDE.md §11.1 ruling 7)

- **The workspace is exactly six packages** — `apps/web`, `apps/workers`, `packages/db`, `packages/schemas`, `packages/tax`, `packages/design-tokens` (complete `{apps,packages}/*/package.json` glob, against `pnpm-workspace.yaml`'s `apps/*` + `packages/*`). **There is no agent package.** This row creates a seventh workspace member or something outside the workspace — see OD-1.
- **No Tally configuration exists.** `.env.example` read in full (70 lines): the complete integration set is Database, Auth, Resend, Sentry, Better Stack, App URL, DO Spaces (commented, deferred), Axiom. No Tally host, no port, no agent token.
- **No bundler or packager in any first-party `package.json`.** `rg` for `esbuild|rollup|webpack|\bpkg\b|nexe|caxa|experimental-sea` over tracked `**/package.json` returns nothing; root `package.json` (25 scripts, 14 devDeps) and `apps/workers/package.json` (13 deps, 7 devDeps) were both read in full. Bears directly on OD-2.
- **One first-party Windows artifact exists**, and it establishes nothing about a client VPS: `scripts/preflight.ps1` is a 7-line PowerShell wrapper that shells to `node preflight.mjs` "so Windows and POSIX share one impl".

---

## B-1 — REPORTED BLOCKER: acceptance criterion 1 is not satisfiable from this repository

Spec §8.1 requires the fetch "demonstrated against a real TallyPrime rather than a mock", and says an unreachable Tally "is a blocker to report, not to work around". **I tested whether that criterion is satisfiable and it is not, on the repository's own evidence.**

- Maharudra Agencies are a **prospect, not the pilot tenant** (`docs/CLIENT_CONTEXT.md:29`).
- Every Tally artifact in the repo is **static**: five screenshots in `docs/client-evidence/` (`CLIENT_CONTEXT.md:44-50`) and three tax invoices cited on F.148's notes. No host, no port, no credential, no licence, no test instance, no VPN detail.
- No Tally configuration exists (`.env.example`, read in full).
- No Tally code exists (workspace enumerated above).
- The edition is contradicted (premise-check item 6).

**Per the spec's own instruction this is reported, not worked around.** The operator must either supply access or re-scope the row. Pending that, here is what the row **can** and **cannot** honestly claim:

| Reachable with a mock / no Tally                                     | NOT reachable without a real TallyPrime                                                                                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion 2 (per-tenant token isolation)                             | **Criterion 1 entirely**                                                                                                                                                                                  |
| Criterion 3 (RLS-enforced connection)                                | The _integration_ half of criterion 4 — in particular F.148's own case, "port 9000 may answer while no company is loaded". **Nobody here has observed that behaviour.** A mock asserts our guess about it |
| Criterion 6 (no inbound), as restated                                | Criterion 5's "survives a restart **of Tally**"                                                                                                                                                           |
| Criterion 7 (token in no sink), as restated                          | The Tally XML request/response envelope itself. A mock built to the spec proves the spec                                                                                                                  |
| The "our endpoint unreachable" third of criterion 4                  |                                                                                                                                                                                                           |
| Criterion 5's "restart of itself" and "restart of the network to us" |                                                                                                                                                                                                           |

**The line, stated so the closeout cannot blur it:** a mock-passing suite must never report criterion 1 as met. That is precisely DEV.138's signature — a passing result that could not have detected the thing the check exists for.

> ### RULED 2026-10-03 — SPLIT DELIVERY, BEHIND A NAMED GATE
>
> Build, verify and merge the transport/token/scoping half against an
> explicitly-labelled mock. Every Tally-facing criterion sits behind **Gate T** in
> the amended `docs/F148_AGENT_SPEC.md` §8 and stays open until a real instance is
> reached, **so a mock-passing suite cannot report criterion 1 as met.** They are
> not re-written to be passable with a fixture.
>
> **AND RESOLVE THE EDITION CONTRADICTION FIRST. A precondition, not a parallel
> task — filed as F.187.** `CLIENT_CONTEXT.md:30-31` says TallyPrime **Silver**,
> single-user; this row's notes say **multi-user and cloud hosted**, and the whole
> dissolution of the operational-fragility objection rests on the second. The
> operator: **if Silver is right the design holds but its justification changes,
> and that belongs on the row before anyone builds to it.** A desktop single-user
> Tally is offline whenever the machine is off or the company is closed — which
> changes what "the sync is working" means, what the heartbeat must report, and
> whether a multi-hour gap is an alarm or a Tuesday. **Recommendation:** split delivery. Build, verify and merge the transport/token/scoping half against an explicitly-labelled mock; hold every Tally-facing criterion behind a named gate that stays open until a real instance is reachable. Do not close the row on the mock.

---

## OPEN DECISIONS — OD-1 … OD-6. The operator settles these before Day 56.

**OD-1 — Where does the agent's code live?** The workspace is exactly six packages.

- _(a)_ A seventh workspace package (`apps/agent`). Shares tooling, CI, lint and `pnpm -r test`; but it lands inside a monorepo whose deploy model copies the whole repo, and it drags the agent into the three required status checks.
- _(b)_ A separate repository. Clean release boundary and nothing of ours ships to their VPS by accident; but new CI, and `pnpm test`/`check:floors` no longer see it.
- _(c)_ Inside `apps/workers`. Cheapest; but `apps/workers/Dockerfile:73` exposes no port and that image is **ours** — the agent runs on **theirs**. Conflates two deployment targets.
- **Recommendation: (b)**, decided jointly with OD-2. Must be settled before a single file is created; it is not reversible cheaply.

> ### RULED 2026-10-03 — (b), A SEPARATE REPOSITORY
>
> The operator: **"a client VPS must never receive a copy of this monorepo, and
> the read path shares no code with it."** The mechanism is on the record —
> `apps/workers` installs by copying the whole monorepo and running
> `pnpm install --frozen-lockfile` (`apps/workers/Dockerfile:64-66`) and consumes
> workspace packages **as source** (`:20-21`), which applied to a client machine
> places the full Dealerlink source, web app included, on their VPS. The workspace
> stays at six packages and gains no seventh.

**OD-2 — Language and runtime (spec §9 question 3).** The operator asked for packaging and maintenance on a **Windows VPS**, not for the obvious answer. **Obvious is not a reason, and here it is also weak:** the read path shares **no code** with the monorepo — it speaks HTTPS to us and XML to Tally — so choosing Node buys _familiarity only_, not reuse. And none of this repo's packaging transfers: the workers process runs **TypeScript source through `tsx`** (`apps/workers/package.json:7`, `Dockerfile:18-21`), consumes workspace packages **as source** (`Dockerfile:20-21`), builds `dist/` only as a typecheck (`Dockerfile:68-71`), and installs by copying the whole monorepo and running `pnpm install --frozen-lockfile` (`Dockerfile:64-66`). **That model must not touch a client VPS** — it would place the full Dealerlink source, including the web app, on their machine.

**What I can establish from the repository:** Node 20 is the pinned runtime (`Dockerfile:22`, `@types/node ^20.17.0`); there is **no bundler or packager** anywhere in first-party `package.json` files (enumerated above); the only Windows affordance is a dev-facing `.ps1` shim.

**What I cannot establish, and will not assert:** how Node is installed on their Windows VPS; how any candidate registers as a service that survives reboot; whether a single-file build of this code works; whether a Go, Rust or .NET toolchain is available to whoever maintains it; what MSI/installer tooling exists. **I have no Bash and no network — none of these is checkable from this repository, and I am not going to reason from training data as though it were checked.** Candidates to cover (Node — packaged _how?_; a single compiled binary in Go or Rust; .NET; a Windows-native option) must be priced by someone who can execute, against four questions: install, run-as-service-after-reboot, **upgrade when we cannot deploy to their machine**, and who maintains it.

- **Recommendation:** do not decide this from the chair. Make OD-2 a short spike with a named owner who can run a Windows box, and treat the **upgrade path** as the deciding criterion — it is the one that cannot be retrofitted and the one F.148's notes insist must exist "from day one".

> ### RULED 2026-10-03 — SPIKE, and its first question is whether Windows exists at all
>
> **Establish the environment before scoping the spike.** Measured: the
> devcontainer is Linux, and **all four CI jobs run `ubuntu-latest` —
> `git grep -ni windows -- .github/` returns nothing.** The operator is on a Mac
> with a Linux container, and **the client's VPS is the only Windows box in
> reach.**
>
> **The gap is narrower than "none available", and the distinction scopes the
> spike.** `windows-latest` is a standard GitHub-hosted runner and this repo
> already runs Actions, so an **ephemeral** Windows box is obtainable by adding a
> job — packaging, install and a single-file build can be answered there. (Not
> verified: this account's entitlement or billing for Windows minutes. One look at
> the billing page settles it.) **What has no home is a PERSISTENT box**, and that
> is where the deciding criterion lives — reboot survival, and an upgrade applied
> in situ. **Filed as F.189, scoped to the persistent half**, as a blocker on
> F.148's DELIVERY half and not on its build half.
>
> **THE DECIDING CRITERION IS THE UPGRADE PATH**, stated so the spike cannot
> drift onto developer convenience. The operator's expectation, recorded as
> something the spike **tests rather than inherits**: **a single compiled binary
> over Node — "replacing one file is tractable when you cannot deploy to the
> machine, a directory tree plus a runtime dependency is not."** Node stays a
> candidate and must be priced as one. What it may not do is win for being the
> language the rest of the repo is written in, which buys familiarity only.

**OD-3 — The fourth way to establish scope (spec §9 question 1, and it is bigger than §3's three paragraphs).** The operator's instruction stands: resolve the tenant from the token, use the RLS-enforced connection, not `adminDb`. **That is decided and the prompt does not reopen it.** What I tested is _which existing non-session pattern that follows_, and the honest answer is **none, because the path is two patterns joined and the join is new**:

- **Data access — the pg-boss job fits exactly.** `apps/workers/src/jobs/render-pdf.ts:138-139` calls `withTenant(payload.tenantId, …)` on RLS-enforced `db`. Follow this, verbatim in shape. But note the trust anchor differs: that `tenantId` was written into the payload by an authenticated `tenantAction` on **our** infrastructure. It supplies nothing for the resolution step.
- **The seeds are not an auth pattern at all.** `packages/db/src/seeds/index.ts:146` raw-`set_config`s a `tenantId` the seed itself just created.
- **Resolution — only Lucia has the shape, and it uses `adminDb`.** `apps/web/lib/auth/lucia.ts:12` builds the session adapter on `adminDb`; `client.ts:94-95` names "Lucia session validation" as a sanctioned `adminDb` use. Resolving an opaque credential to a principal is **necessarily unscoped** — you cannot scope a lookup by the thing the lookup returns.
- **The one existing machine-caller precedent does the forbidden thing.** The Resend webhook uses `adminDb` throughout and declines to scope (`resend-webhook.ts:166-167`). §3 is right to forbid it; it is also the only machine-caller scoping pattern that exists.

**And here is the obstacle §3 does not mention.** If the token table carries `tenant_id`, `packages/db/tests/rls.test.ts:108-128` requires RLS enabled, forced and a `tenant_isolation` policy — at which point **the resolution lookup cannot read that table through `db` at all**, because `app.tenant_id` is not yet known. So "use the RLS-enforced connection, not `adminDb`" is satisfiable for the **data** and \*structurally unsatisfiable for the **resolution\*** step. The spec does not distinguish them. **A fourth way is needed, and I am not inventing it.** What it must satisfy:

1. exactly one tenant per token, enforced **by the DB** (the `inbound_email_token` partial unique index is the in-repo precedent);
2. the unscoped step reads **one table, one column, returns one tenant id** — no joins, and it returns no tenant data of any kind;
3. a failed resolution yields **no tenant**, and fails closed (the `HEALTH_TOKEN` precedent, `health/route.ts:249-255`);
4. it is demonstrated by a cross-tenant attempt **that could have succeeded** (DEV.138).
   Options for the operator: _(i)_ a narrow `adminDb` lookup, the Lucia precedent — in-repo, but puts a BYPASSRLS query on a publicly reachable route; _(ii)_ a `SECURITY DEFINER` SQL function taking a token hash and returning a tenant id — privilege stays in the DB, no `adminDb` in app code, but it is new DB surface and therefore §10.1; _(iii)_ a token table without `tenant_id` — dodges the RLS enumeration and violates CLAUDE.md §4. **Recommendation: (i) for this row**, with rule 2 written into the code as a comment and enforced by review, and _(ii)_ raised as the better long-term shape to settle **before F.178** puts a write path behind the same resolution.

   > ### RULED 2026-10-03 — (i) NOW, `SECURITY DEFINER` BEFORE F.178
   >
   > **The finding is accepted; the spec was wrong, not the finding.** The
   > operator: "my §3 conflated two problems: resolution and data access."
   >
   > - **Data access is unchanged — RLS-enforced, never `adminDb`.**
   > - **Only the bootstrap lookup is exempt, and it must be the narrowest
   >   possible: one table, one lookup, returning only a tenant id.**
   > - `SECURITY DEFINER` is the better long-term shape, **to be settled before
   >   F.178** puts a write path behind the same resolution.
   >
   > `docs/F148_AGENT_SPEC.md` §3 is amended to state the two steps separately,
   > "rather than leaving it reading as though one rule covered both". The
   > invariant that keeps the exemption honest is written in: it is **one
   > statement wide**, and `rg -n adminDb` over the agent's paths must return
   > exactly one site.

**OD-4 — Does the token require a migration? Almost certainly yes, and therefore STOP.** There is no column for it: `tenant_settings` carries `inboundEmailToken` and nothing agent-related, and `.env.example` has no agent token. A **per-tenant**, revocable, hashed, read-scoped credential with an installation identity cannot live in an environment variable — that is what makes it different from `HEALTH_TOKEN`. So this needs a new table or new columns, plus an RLS `.sql`, plus an explicit audit-trigger stanza. **This prompt contains no DDL and the day must not write any before authorisation** (CLAUDE.md §10.1). Present the shape and wait. Decide in the same breath: _(a)_ new `agent_tokens` table (installation identity, issued/revoked timestamps, last-seen — room for F.178's write scope) versus _(b)_ columns on `tenant_settings` (cheaper, no installation identity, and §4's "scoped to the read path … structural rather than remembered" becomes hard). **Recommendation: (a)**, because §4 asks for the read/write scope split to be structural _now_ and (b) cannot carry it.

> ### RULED 2026-10-03 — (a), `agent_tokens` as its own table. STOP IS RIGHT
>
> Columns on `tenant_settings` cannot carry an installation identity or a
> per-installation revocation, and §4 requires the read/write scope split to be
> **structural now** rather than remembered when F.178 lands.
>
> **The DDL is PRESENTED FOR REVIEW AND NOT WRITTEN.** The presentation states
> explicitly, rather than by implication: the `tenant_id` + RLS policy pair
> (`ENABLE` + `FORCE` + `tenant_isolation USING/WITH CHECK app_current_tenant()`,
> with `packages/db/src/rls/inbound-token-history.sql` as the template); the
> **explicit `audit_trg` stanza**, because `rls.test.ts` derives its population
> from `pg_class` and covers a new table automatically **while nothing enumerates
> audit triggers** (F.168); whether the column name lets `audit_redact()` catch it,
> since `%_token` matches and `*_token_hash` does **not** (F.184); and that the
> token is stored **hashed** — the opposite of `inbound_email_token`, which is
> `text()` and shown in the admin UI.

**OD-5 — How is "the token appears in no log, no error report, no structured context" actually enforced?** Nothing existing catches it: `scrub.ts:37-43` has no token pattern, `reportError`'s context is an open `Record<string, unknown>` (`wrap.ts:89`), and `audit_redact` would miss a `*_hash` column (premise-check item 4). Options: _(a)_ never put it in, proven by a test over named sinks with a positive control; _(b)_ also add a token pattern to `scrub.ts` — **note it has a byte-copy twin at `apps/workers/src/observability/scrub.ts` (`scrub.ts:12`), so an edit to one only is the F.108 fork hazard**. **Recommendation: (a) for this row**, and file (b) rather than fold it in (CLAUDE.md §11.2).

> ### RULED 2026-10-03 — (a) for this row; (b) filed as F.184
>
> Criterion 7 is enforced by never putting the token in a sink, proven by a test
> over the named sinks **with a positive control that goes red when a line
> deliberately logs it.**
>
> **And the reason the `scrub.ts` fork is the dangerous kind, recorded on F.184:
> a scrubber that works in one process and not the other FAILS SILENTLY, in the
> one direction nobody checks.** A forked view-builder diverges and someone sees
> a wrong figure. A forked scrubber diverges and the only observable is a secret
> sitting in Sentry — which is precisely where someone goes looking for the cause
> of the incident that the credential caused.

**OD-6 — Which host does the agent call, and does the endpoint join the middleware exclusion list?** `apps/web/middleware.ts:107`'s matcher explicitly excludes `api/health` and `api/webhooks` — the latter because it is "signature-verified, not session-gated, so tenant-scope middleware must not touch it" (`:104-105`). A new `/api/agent/*` route falls **inside** the matcher. It would not be redirected (`isProtectedAppPath`/`isAdminPath` do not match it, `:39-45`), but it would get host-derived scope resolution it must not depend on. Decide: _(a)_ add `api/agent` to the matcher exclusion, following the webhook's stated reasoning exactly; _(b)_ leave it in and ignore the headers. Also decide whether the agent calls `app.dealerlink.in` or the tenant subdomain `<slug>.dealerlink.in` — **if the latter, the host becomes a second tenant signal and OD-3's "the token names the tenant" invariant acquires a competitor.** **Recommendation: (a), and the agent calls the non-tenant app host**, so the token is the single source of tenant identity.

> ### RULED 2026-10-03 — (a), and the agent calls the non-tenant app host
>
> The operator: **"a host-derived tenant signal competing with the token is the
> ambiguity OD-3 just removed."**
>
> **And the draft's own weakest claim is now verified.** It flagged this reasoning
> as unchecked because it had not read `apps/web/lib/tenant/resolve.ts`. Read in
> full, 117 lines, and it holds — with a sharper mechanism than the draft had:
>
> - `resolveRequestScope(host, queryParam)` is **string-only, no DB access**.
> - **`app` is a member of `RESERVED_SUBDOMAINS`** alongside `admin` and `www`
>   (`resolve.ts:20`), so **`app.dealerlink.in` resolves to `{ kind: 'operator' }`
>   and carries no tenant signal at all** (`:71-79`).
> - `<slug>.dealerlink.in` resolves to `{ kind: 'tenant', slug }` from the
>   leftmost label (`:74-78`) — that is the competing signal, and calling the
>   non-tenant host **removes** it rather than ignoring it.
> - An **unknown host falls through to `{ kind: 'operator' }`** (`:82`), so the
>   `*.ondigitalocean.app` URLs `pnpm merge-status` already uses are
>   tenant-signal-free too.
>
> The matcher exclusion follows the webhook's stated reasoning verbatim
> (`apps/web/middleware.ts:103-105`).

### A seventh item, which is a conflict rather than a decision

**The row's notes and the spec's scope contradict each other on the upgrade path.** F.148's notes: "**WE CANNOT DEPLOY A FIX** — there is no `deploy_on_push` for someone else's VPS, so an upgrade path and a version report have to exist **from day one** rather than being added when the first bug lands." The spec §7 puts "Installation packaging beyond what is needed to run it once on their VPS" **out of scope**. Those cannot both bind. Flagging, not resolving — note that a **version report** is cheap and is squarely inside §6's self-reporting requirement, while an **upgrade mechanism** is the expensive half and is what §7 excludes. Operator to rule.

> ### RULED 2026-10-03 — THE NOTES WIN. The operator calls it their own error
>
> **"A component on someone else's machine that cannot be updated is a
> liability."** The §7 bullet is removed and **both halves are IN SCOPE** — the
> version report, and an upgrade mechanism. It does not have to be elegant on day
> one; it has to exist, so the first bug is a deployment rather than a site visit.
> `docs/F148_AGENT_SPEC.md` §7 is amended and §8 gains criterion 8 for the version
> report.
>
> **This is the one ruling that makes the row larger. Price it before Day 56.**

### Spec §9's four, triaged

| §9                                       | Status                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — which scoping pattern                | **Partly answered by reading** (two patterns, join is new) → the remaining choice is **OD-3**                                                             |
| 2 — is `inbound_email_token` a precedent | **ANSWERED by the code. Do not re-ask it.** Premise-check item 3                                                                                          |
| 3 — language and runtime                 | **Genuinely open → OD-2**                                                                                                                                 |
| 4 — is a real TallyPrime reachable       | **Genuinely open, and it is a blocker → B-1**                                                                                                             |
| —                                        | **Fifth and sixth surfaced here: OD-1 (where the code lives) and OD-6 (host + middleware).** OD-1 is the one that must be answered before any file exists |

---

## Phase A — the work

### A.0 — The reports, and the blocker. Day 56. No code.

Produce written answers to OD-1…OD-6 and B-1 and **stop**. §3 and §4 both say "report before building", and §9 says "Report; do not decide". A.1 does not start until the operator has ruled.

### A.1 — The endpoint and the token (Days 56–57). Gated on OD-3, OD-4, OD-6.

Files: a new route under `apps/web/app/api/`, a token-resolution module, `apps/web/middleware.ts` (matcher only, per OD-6).

- **Reuse, do not re-derive:** `secretEquals` and the `Bearer`-parse from `apps/web/app/api/health/route.ts:240-259`, including its fail-closed posture and the reason the comparison runs over digests (`:234-236`). If a shared helper is the right move, say so and ask — it is a refactor of a protected-adjacent public route.
- Resolution follows the OD-3 ruling; **data access is `withTenant(tenantId, …)` on `db`**, in the `render-pdf.ts:138-139` shape.
- Rate-limit the route. `apps/web/lib/rate-limit.ts` is the existing instrument (`health/route.ts:295` is the call shape). **Note it "soft-fails open" (`rate-limit.ts:29`)** — that is correct for rate limiting and **must not** be the posture of the auth check.
- Unauthenticated and bad-token responses: match `sentry-test`'s disclosure reasoning (`:22`) — decide and state whether the agent endpoint 404s or 401s, and why. Do not leave it to the framework's default.
- **No DDL until OD-4 is authorised.**

### A.2 — The Tally XML read (Days 57–58)

The agent posts an export request to `localhost:9000` and parses ledgers and stock items out of the reply. **Everything here is unverified against a real TallyPrime (B-1)** — so write the parser against an explicitly-labelled fixture, and mark in the code that the envelope is our reading of the spec rather than an observed response.

### A.3 — The three states, and they must be distinguishable (Day 58)

§6 asks which existing outbound caller draws the "not answering" vs "answered with nothing" distinction best. **I checked both, and the answer is the health route, not the email client:**

- **Follow `apps/web/app/api/health/route.ts:26`** — `CheckStatus = 'ok' | 'degraded' | 'down' | 'skipped'`, with _not configured_ (`:126`), _network failure_ (`:156-158`, carries `error`), _answered badly_ (`:155`, carries `httpStatus`) and _answered in a way we accept for a named reason_ (`:144-153`) as four distinct outcomes.
- **Do not follow `apps/workers/src/email/resend-client.ts:137-143`**, which collapses a network-level failure into `EmailSendError('RATE_LIMITED')`. It is retryable-by-intent and loses exactly the distinction §6 asks for.

### A.4 — Self-reporting outbound (Days 58–59)

Last successful Tally contact, last successful contact with us, agent version. **If this needs a table, that is OD-4's migration and the same STOP applies.** Check whether `docs/LOGGING.md`'s existing streams already have a home for it before proposing a new one.

### A.5 — Staleness and the re-fetch diff (Days 59–60)

Record the fetch time with the data (§5). A re-fetch **diffs rather than replaces**, and a ledger that disappeared between fetches is surfaced, not silently dropped — this is the contract **F.11 consumes**, so define it as an interface F.11 can code against. **No file-import bootstrap**, ruled out explicitly on both rows.

### A.6 — Run it once on their VPS (Days 60–61). Gated on OD-2 and the §7 conflict.

Service install, restart survival, backoff-and-stop, local log that never contains the token. Scope per the operator's ruling on the upgrade-path conflict.

### What this day does NOT do

- No write path, no idempotency key, no outbox, no unknown-outcome path, no conflict handling, no ordering — **F.178**
- No ledger mapping, no voucher construction, no product-name matching — **F.11**, **F.12**, **F.13**
- No historical Swipe extraction — **F.179**, placeholder, deliberately not investigated
- **No file-import bootstrap for the masters**, ruled out on both F.148 and F.11
- No change to `packages/tax`, no money column, no RLS policy edit, no `adminDb` widening beyond an OD-3-authorised resolution step
- No fix to the unimplemented inbound-token grace check, and no fix to `scrub.ts` — both **filed**, per CLAUDE.md §11.2
- No `doctl apps update`. `.do/app.yaml:68-69` states it: "DECLARED HERE, NOT APPLIED … which is the operator's (DEV.64) and is denied to the build agent"

---

## Phase B — verification

**Must stay green, each a command:**

- `pnpm typecheck`, `pnpm lint`, `pnpm build`
- `pnpm test` — in particular `packages/db/tests/rls.test.ts` (which picks up a new `tenant_id` table automatically, `:108`), `packages/db/tests/audit.test.ts`, `apps/web/app/api/health/route.test.ts`, and `packages/tax/tests/*` **unchanged**
- `pnpm verify` / CI `e2e`, including the protected `critical-path.spec.ts`
- `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check`, `pnpm check:floors`
- All three required checks: `checks`, `test`, `e2e`

**New coverage, modelled on the F.176 matrix** (`apps/web/app/api/health/route.test.ts`) — which is the right template for three reasons the day should copy deliberately: it asserts forbidden strings against the **serialised body, not parsed fields** (`:15-18, 76-77`), it covers **no token / wrong token / secret unset / correct token** (`:71, 87, 94, 102`), and its fourth test is a **positive control** that proves the negative three could have failed (`:102-115`).

1. The token matrix: absent, malformed, revoked, valid.
2. **Cross-tenant isolation with a positive control** — see criterion 2 below.
3. The three states of A.3, each asserted distinct.
4. Token-in-no-sink, over named sinks, with a control.
5. RLS and an **explicit audit-trigger assertion** for any new table — `rls.test.ts` covers RLS automatically and does **not** cover the audit trigger; there is no enumeration test over `audit_trg`.
6. One verify spec under `apps/web/tests/e2e/` per `docs/BUILD_PROMPT_TEMPLATE.md:259-276`. Share the test token through a constant, following `apps/web/tests/e2e/health-token.ts:10-21`, whose comment states why a literal in two places drifts and why the drift "would look exactly like the endpoint withholding correctly".

---

## Phase C — closeout

Per `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" (C1–C10), in full. Unusual for this day:

- **C5 does not close F.148** if B-1 is unresolved. Say which criteria are met, which are blocked, and against what.
- **C6 must carry B-1 verbatim**, the mock/integration line, and every filed-not-fixed item (the unimplemented inbound-token grace check; `scrub.ts`'s missing token pattern and its byte-copy twin; `HEALTH_TOKEN` absent from `.env.example`; the Silver-vs-cloud-hosted contradiction).
- **C6b — no unearned precision.** Do not write "the agent fetches from Tally" if it fetched from a fixture.
- `scripts/suite-floors.json`: floors are a **minimum**, so adding tests cannot break `check:floors`. Raise the floor deliberately if you want the new tests protected — and **never lower one to get green** (`scripts/check-suite-floors.mjs:107`, CLAUDE.md §11.1 ruling 1).
- **C7a** — `verifier` before the PR; a FAIL stops the day.
- **C8** — merge is a production deploy; authority is the operator's.

---

## ACCEPTANCE CRITERIA — restated to be measurable, with what decides each

Three of the spec's seven are not usable as written. Restated:

1. **BLOCKED — see B-1.** As written ("against a real TallyPrime rather than a mock") this is not satisfiable from anything in the repository. _Decided by:_ a demonstration against a real instance, which does not exist yet. **Not re-written to be passable** — that would be weakening a gate to clear it.
2. **Spec criterion 2 is latently unsatisfiable as written, and the reason is instructive.** It asks to "present tenant A's token against tenant B's data" — but if the design is correct and the tenant derives _solely_ from the token, **the request has no field in which to name tenant B**, so the attack the criterion describes cannot be expressed. Restated as three parts: _(a)_ a request bearing tenant A's token returns only tenant A's rows — asserted by seeding a distinguishable row in tenant B and asserting its absence from the serialised response; _(b)_ if the request shape carries any tenant-ish parameter at all (id, slug, company name), supplying B's while holding A's token **fails closed** rather than silently serving either; _(c)_ **the positive control** — removing the scope makes (a) go red. _Decided by:_ a new DB-backed test under `packages/db/tests/` or `apps/web`, in `pnpm test`; (c) decided by deleting the scope locally and observing red.
3. Data access runs through `withTenant` on RLS-enforced `db`; the **only** unscoped statement in the path is the OD-3-authorised resolution, it reads one table and one column, performs no join, and returns nothing but a tenant id. _Decided by:_ review of the route and resolution module against the OD-3 ruling, plus `rg -n 'adminDb' <agent paths>` returning only that one site.
4. Tally-unreachable, Tally-answered-empty and our-endpoint-unreachable are three distinguishable states. _Decided by:_ a test per state asserting a distinct classification, following `health/route.ts:26`'s four-state model. **Mark explicitly which of the three were exercised against a fixture rather than a real Tally** (B-1).
5. Restart survival. _Decided by:_ an executed demonstration per case, with the output recorded. "Of itself" and "of the network to us" are reachable now; **"of Tally" is blocked by B-1** and must be reported as unproven, not argued.
6. **"No inbound connection exists in either direction" is not measurable as written** — it is an unbounded negative over a program and its deployment. Restated: _(a)_ the agent opens **no listening socket** — established by an affirmative enumeration of its own source tree (it is new and small, so a complete read is genuinely cheap) showing no `listen`/`createServer`/`bind` call, **plus** an executed check of listening sockets in the running process; _(b)_ no Dealerlink-side code holds a tenant-network address as a request target; _(c)_ the DO app spec declares no new route into their network. _Decided by:_ (a) the enumeration + the executed socket check, (b) review of the two application `fetch(` sites plus any added, (c) `git diff main -- .do/`.
7. **"Appears in no log, no error report and no structured context" is not measurable without named sinks.** Restated: with a known sentinel token value, the string appears in **none** of — the agent's local log file, the `reportError` → Sentry path (`wrap.ts:97`), `audit_log` (via `audit_redact`, `audit-log.sql:31-35`), the Axiom `trackEvent` payload, and the pino stdout stream — **and** the assertion goes red when a line deliberately logs the token. _Decided by:_ a sink-by-sink test with that positive control. Note it cannot lean on `scrub.ts`, which has no token pattern (OD-5).
8. `packages/tax` untouched. _Decided by:_ `git diff --stat main -- packages/tax` prints nothing.
9. `pnpm check:paths`, `check:ids`, `plan:check`, `check:floors` all exit 0. _Decided by:_ exit codes, **not output** (DEV.138's shared rule: "CHECK EXIT CODES, NOT OUTPUT").

**Criteria checked against each other.** 1 and 4/5 interact: 4 and 5 are _partly_ satisfiable with a fixture while 1 is not satisfiable at all, so the closeout must report them at different confidence — and 4's fixture half must not be read as discharging 1. **3 and the OD-3 obstacle are jointly unsatisfiable under the spec's literal wording** ("the RLS-enforced connection, not `adminDb`") if the token table carries `tenant_id`, because the resolution lookup cannot run under RLS; criterion 3 as restated resolves this, and if the operator picks OD-3 option (iii) it becomes unsatisfiable again against CLAUDE.md §4. 2(c), 6(a) and 7's control are all the same instrument — a negative with a demonstrated failure mode — and none of the three is evidence without it.

---

## STOP AND ASK (CLAUDE.md §10.1)

1. **OD-4's migration.** Any token table or column, its RLS `.sql`, its audit stanza, any extension of `audit_redact()`. **No DDL in this prompt and none written before authorisation.**
2. **OD-3's resolution step** — it is a deliberate, narrow `adminDb`/BYPASSRLS use on a publicly reachable route. §10.1 names RLS and `adminDb`.
3. **B-1** — report it and wait. Do not substitute a mock and close the row.
4. **OD-1 and OD-2** — where the code lives and what it is written in. Both must precede the first file.
5. **The §7-versus-notes conflict** on the upgrade path and version report.
6. **Whether any of this warrants a new ADR.** An outbound-only agent on third-party infrastructure, and a machine-caller auth path, both look like ADR material. Writing or superseding an ADR is §10.1.
7. **Any `.do/app.yaml` value** — declared in the repo, applied only by the operator (`.do/app.yaml:68-69`, DEV.64).
8. **Merge and deploy.** `main` carries `deploy_on_push: true` on both apps.

---

## FOUND WHILE READING — to be FILED as rows, none folded into this day (CLAUDE.md §11.2)

**ALL FILED 2026-10-03 as F.183 … F.187, plus F.188 for the audit's line-citation drift. None is this day's work.**

1. **The inbound-token grace window is unimplemented** while `inbound-token-history.ts:8-11` asserts it works. Operators rotate tokens on the stated promise that old BCC addresses keep working for 7 days; they do not. Rotation writes history that nothing reads.
2. **`scrub.ts` has no token/secret pattern** (`:37-43`), and `reportError` takes an open `Record<string, unknown>` (`wrap.ts:89`) — a secret in an error context reaches Sentry unredacted. Plus the byte-copy twin at `apps/workers/src/observability/scrub.ts` (`scrub.ts:12`).
3. **`HEALTH_TOKEN` is absent from `.env.example`** though F.176 shipped it and it is declared in both `.do/` specs. Enumerated: it appears in 12 files, and `.env.example` is not one of them.
4. **`resend-client.ts:137-143` classifies a network failure as `RATE_LIMITED`** — convenient for retry, but it destroys exactly the unreachable-vs-answered distinction F.148 §6 requires.
5. **`CLIENT_CONTEXT.md:30-31` "TallyPrime Silver" versus F.148's "multi-user and CLOUD HOSTED."** One of them is wrong and the row's risk assessment rests on it.

---

## WHAT THE DRAFTER DID NOT READ

`docs/STAGE_F_BUILD_v3.md` (§6/§7/§9 — it used CLAUDE.md §10.1's restatement of the protected-surface list instead; **a builder should not assume §9 holds no further protected surface relevant here**). `docs/RUNBOOKS.md` (so no R-number is cited for an install runbook). `docs/LOGGING.md` (so A.4's heartbeat may already have a home there, unchecked). `DECISIONS.md`/the ADR set beyond grep hits. The Lucia session-validation path beyond `lucia.ts:1,12`. `apps/web/lib/tenant/resolve.ts` (so **OD-6's middleware reasoning is unverified**). The pg-boss enqueue path and `apps/web/lib/queue/client.ts`. `critical-path.spec.ts`. The BRD. The five `docs/client-evidence/` images. Any Tally protocol documentation (none is in the repo).

**Drafter's own confidence:** high on the existence findings, the premise corrections and B-1; high that the draft is not startable as-is; **medium on OD-2 deliberately**, because the packaging facts that should decide it are not establishable from this repository; medium on OD-6 (unread `resolve.ts`); **low on anything about the Tally XML envelope itself** — nothing in this repository describes it.
