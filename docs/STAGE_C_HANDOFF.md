# Stage C Handoff — Dealerlink Phase 1

> **Audience.** The engineer(s) picking up Dealerlink for Stage C
> (Internal Validation) who did **not** live through the 18-day Stage B
> build. This document explains what was built, what works, what was
> deliberately left for later, and how to validate it — and, where it
> matters, **why** each decision was made.
>
> **Companion documents:** `PROJECT_PLAN.md` (the canonical tracker),
> `DECISIONS.md` (13 ADRs), `DEVIATIONS.md` (67 build deviations),
> `CLAUDE.md` (implementation guide), `docs/RUNBOOKS.md` (operator
> procedures), `docs/TESTING.md`, `docs/DEPLOYMENT.md`, `docs/PDF_PIPELINE.md`,
> `docs/STAGING_ENV.md`.

---

## 0. Stage C Progress (Living)

> This section tracks **Stage C (Internal Validation) as it happens**. It is
> the living counterpart to the Stage-B-closeout content below (§1 onward),
> which is frozen at the `stage-b-complete` tag.

| Day | Task                                   | Status  | Date       |
| --- | -------------------------------------- | ------- | ---------- |
| C.0 | Staging deploy                         | ✅      | 2026-05-22 |
| C.1 | Force-password-change (closes DEV.56)  | ⏳ next | —          |
| C.2 | State normalization (closes DEV.33)    | ⏳      | —          |
| C.3 | Pilot staging handoff + UX walkthrough | ⏳      | 2026-05-24 |
| C.4 | Security audit                         | ⏳      | 2026-05-25 |
| C.5 | Performance test + Stage D handoff     | ⏳      | 2026-05-26 |

### C.0 — Staging deploy ✅ (2026-05-22)

**Key wins**

- `staging.dealerlink.in` live with Let's Encrypt SSL on the apex **and** the
  `demo.` + `sample.` tenant subdomains.
- All **four PDF paths** working end-to-end (quotation, PI, payment receipt,
  dispatch note) — each a genuine fresh render in the workers component.
- Chromium cold-start mitigated: **eager-warm** at worker boot + **120s** render
  timeout + **45-min** idle-recycle window.
- **~$30/month** staging spend (web `basic-xs` + workers `basic-xxs` + Managed
  PG 16 `db-s-1vcpu-1gb`, all BLR1).

**Key bugs caught (DEV.57–DEV.67)**

- **Six deployment bugs (DEV.57–DEV.62):** managed-PG role ALTER, staging
  bootstrap scripts, pg-boss TLS chain validation, apex-domain config for the
  `staging.` prefix, connection-pool caps, and the big one — the db client
  created a brand-new pool on every access in production (DEV.62).
- **DEV.63 — architectural correction.** PDF rendering was never actually
  running in the workers process: the Day-10 `spawnPdfRender()` bridge launched
  Chromium inside the **web** container. Rendering now routes through the
  pg-boss `render-pdf` queue, and the workers component gains a Chromium
  Dockerfile. **13 PDF call sites across 9 actions refactored.** Promoted to
  **ADR-013** — this is now a structural constraint, not just a bug fix.
- **DEV.64** — the repo `.do/app.yaml` is documentation, not the deployed spec;
  every edit must be applied via `doctl apps update --spec` (merged into the
  live spec to preserve secrets) or the change is illusory.
- **DEV.65–DEV.67** — cold-start mitigations: corepack → `npm install -g pnpm`
  in the Dockerfile (DEV.65), render timeout 60s → 120s + a safe non-blocking
  eager-warm (DEV.66), idle-recycle 10m → 45m (DEV.67).

---

## 1. Stage B Summary

**Stage B — the feature build — is complete: 18 of 18 days, all on time.**

| Item                          | Value                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| Build window                  | Day 1 (2026-05-10) → Day 18 (2026-05-16)                                   |
| Days delivered                | 18 / 18                                                                    |
| Commit range (Stage B)        | `d364ad7` (Day 1 scaffold) → `stage-b-complete` tag                        |
| Architecture Decision Records | 12 — ADR-001 … ADR-012, all locked (`DECISIONS.md`)                        |
| Documented deviations         | 56 (`DEVIATIONS.md`) — see §3 for the carried-forward subset               |
| Unit / integration tests      | see `PROJECT_PLAN.md` "Final Stage B numbers" (run with `pnpm test`)       |
| Playwright verify specs       | 53 / 53 green (`pnpm verify`) — 51 daily verify specs + 2 new Day-18 specs |

**The two new Day-18 specs:**

- `critical-path.spec.ts` — a single 27-step test that drives the **entire**
  distributor workflow (dealer → product → procurement → deal → quotation →
  PI → order → payment → dispatch → delivery → reports) across all four
  tenant roles. This is the build's end-to-end smoke test.
- `operator-onboarding.spec.ts` — closes **R.12**: an operator provisions a
  brand-new tenant and that tenant's admin signs in.

**Bugs the critical-path E2E caught (and Day 18 fixed):** see `DEVIATIONS.md`
DEV.56 — the procurement page requested an out-of-range product limit
(crashed the page), and serial submission mis-bound a SQL array parameter
(serial entry always failed). Both were latent since Day 6 because no test
had ever driven those screens end to end. Both are now fixed and covered.

---

## 2. What's Working

Every Phase-1 module is built, tested, and exercised end to end by the
critical-path E2E:

| Capability                                    | Status | Notes                                                                           |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Auth (Lucia, sessions in Postgres)            | ✅     | Email + password; 4 tenant roles + operator                                     |
| Multi-tenant routing + RLS isolation          | ✅     | Subdomain routing; RLS on every table incl. log tables                          |
| Operator admin app (tenant provisioning)      | ✅     | `admin.dealerlink.in`; R.12 E2E now covers it                                   |
| Dealer master + product catalog               | ✅     | CRUD, bulk CSV import, `pg_trgm` search                                         |
| Inventory + procurement + serials             | ✅     | Procure → confirm → serial entry → received → in-stock                          |
| Sales pipeline (9-stage kanban)               | ✅     | dnd-kit board, high-risk dealer guard, auto-transitions                         |
| Quotations + GST tax engine                   | ✅     | `packages/tax` is the authoritative engine; live preview                        |
| PDF rendering (Puppeteer in workers)          | ✅     | Quotation / PI / receipt / dispatch-note templates                              |
| Performa Invoices + Orders (3-party)          | ✅     | Place-of-supply follows Ship-To (ADR-012)                                       |
| Payments + allocations + receipts             | ✅     | Lifecycle, allocation, funds-received auto-confirm, overdue track               |
| Dispatch + serial pick + fulfilment           | ✅     | Atomic, concurrency-safe; delivery / return                                     |
| Async email + Resend webhooks                 | ✅     | pg-boss `send-email`; Svix-verified inbound; daily crons                        |
| Reports (4 reports + CSV export)              | ✅     | Role-gated; money read from stored columns                                      |
| Observability (Sentry / Better Stack / Axiom) | ✅     | PII scrubbing, structured logs, typed events, enriched `/health`                |
| Staging environment                           | ✅     | Live at `staging.dealerlink.in` (2026-05-22) — web + workers + Managed PG, BLR1 |

---

## 3. What's Deferred to Stage C / Phase 2

Distilled from the 56 entries in `DEVIATIONS.md`. These are intentional —
none blocks Stage B closing — but each is a real follow-up.

### Should be addressed in Stage C

| Item                                  | Source         | What's needed                                                                                                                                                                                                                           |
| ------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **State-code normalization**          | DEV.30, DEV.33 | `tenant_settings.state`, `dealers.state`, `quotations.*` store full state names ("Maharashtra") not 2-letter codes. Add a lookup, migrate rows, tighten the CHECK constraint. Blocks Phase-2 GST Returns API. **🔄 In progress — C.2.** |
| **Force-password-change route**       | DEV.56 (c)     | CLAUDE.md §6 describes a rotation screen gated by `users.must_change_password`. The flag is set + on the session, but **no route ships** — login always lands on `/dashboard`. Build the rotation screen. **🔄 In progress — C.1.**     |
| **Dealer/product detail RSC warning** | DEV.56 (d)     | `/dealers/[id]` and `/catalog/[id]` pass a function prop (`formatINR`) into a Client Component → a non-fatal dev error. Pass strings or move the import.                                                                                |
| **Day-13 seed pre-stamped inventory** | DEV.45         | The Day-13 seed sets ~81 items to `dispatched`/`delivered` without `dispatch_serials` rows. Backfill or scope invariant queries.                                                                                                        |
| **DB-test residue in shared dev DB**  | DEV.31         | Integration tests leave non-seed rows in `dealerlink_dev`. Run DB tests in a rolled-back transaction, or use a disposable DB.                                                                                                           |
| **CSV import per-row error report**   | DEV.20 / R.17  | Atomic imports surface only the first failing row. Add a row identifier.                                                                                                                                                                |

### Deferred to Phase 2 (architecture already supports each)

- **DO Spaces file storage** (DEV.16 / R.15) — logos + PDFs are stored inline
  as base64 today; swap to DO Spaces in Stage D.
- **`@react-email/components`** (DEV.14 / R.14) — email templates are plain
  HTML strings; port when a richer template is needed.
- **TanStack Virtual on long lists** (DEV.18, DEV.22 / R.16) — pagination is
  used instead; virtualize when a tenant's lists genuinely exceed ~10K rows.
- **GST Returns (GSTR-1) API** — the GST Summary report produces the figures;
  the filing-format export is Phase 2 and needs state-code normalization first.
- **E-way bill API integration** — dispatch captures the e-way bill number as
  free text; live API integration is Phase 2.
- **Real-time dashboard updates** — dashboards refresh on page load, not live.
- **Mobile-responsive admin UI** — the layout targets desktop; mobile is Phase 2.
- **Type-aware ESLint rules** (DEV.03) — `no-floating-promises` etc. are not
  wired workspace-wide because of the runtime cost.
- **Shared observability package** (DEV.54) — the PII scrubber + event
  taxonomy are duplicated into `apps/workers`; consolidate if the taxonomy churns.

---

## 4. Stage C Validation Plan

### 4.1 Manual test plan — key workflows

Walk each as the role that owns it (`docs/RUNBOOKS.md` has step-by-step
procedures). The `critical-path.spec.ts` E2E is the automated version of
rows 1–9 and can be read as a script.

1. **Provision** 2 demo tenants via the operator admin app (R1).
2. **Catalog** — add dealers + products, record a procurement with serials.
3. **Pipeline** — create a deal, move it through stages, exercise the
   high-risk dealer override (R9).
4. **Quotation** — build one, verify the live tax math (intra- vs inter-state),
   send it, generate the PDF.
5. **PI + Order** — convert quotation → PI, send, confirm; confirm the order.
6. **Payment** — record, verify, clear, allocate; check the funds-received
   auto-confirm path.
7. **Dispatch** — pick serials, create a dispatch, mark delivered; try a return.
8. **Reports** — run all 4, export CSV, cross-check GST totals.
9. **Email** — confirm queued sends land, check delivery webhooks.
10. **Roles** — repeat key screens as each of Admin / Sales / Accounts /
    Dispatch; confirm forbidden actions are blocked server-side, not just hidden.

### 4.2 Performance test plan

- **Seed at volume** — 10K inventory items, 200 deals, 50 generated PDFs
  (PROJECT_PLAN.md C.5).
- **pg-boss queue** — enqueue a burst of `send-email` + `render-pdf` jobs;
  confirm the workers process drains them and recycles Chromium per the
  100-job rule (R.2).
- **DB connection pool** — drive concurrent requests; watch pool saturation
  and the `withTenant` transaction wrapper under load.
- **List pages** — confirm pagination holds up on the largest lists
  (inventory, orders) and decide if TanStack Virtual is now warranted (R.16).

### 4.3 Security review checklist

- **RLS audit** — for every tenant-owned table, query as Tenant A and assert
  zero Tenant B rows; confirm the policy exists and `tenant_id` is indexed.
- **Role enforcement audit** — for every `tenantAction` / `operatorAction`,
  confirm `allowedRoles` is correct and that the UI hiding a button is never
  the only guard.
- **Operator impersonation** — confirm read-only enforcement (the audit
  trigger raises `42501` on any write while impersonating).
- **Secrets review** — no secrets in the repo; all via env vars; confirm the
  Sentry PII scrubber covers email/phone/GSTIN/PAN/card.
- **Webhook auth** — confirm the Resend webhook rejects bad Svix signatures
  and logs them to `webhook_events`.
- Run `/security-review` on the branch before Stage D.

### 4.4 Data migration plan (dev seed → staging)

- Stand up a clean staging Postgres (Stage D, DO Managed Postgres).
- Run migrations (`pnpm db:migrate`); do **not** run the dev seed in staging.
- Provision real tenants via the operator admin app (R1).
- Import real dealers/products via bulk CSV import (R7).
- Record opening inventory via procurements.
- Normalize state codes (DEV.33) **before** real GST documents are issued.

---

## 5. Known Risks for Stage D (Production)

| Risk                         | Detail                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pod sizing**               | The dev build runs comfortably; budget ~1 GB RAM per App Platform pod and validate the workers (Puppeteer/Chromium) process headroom under PDF load.                |
| **Observability DSNs**       | Sentry, Better Stack and Axiom run as graceful no-ops without credentials. Production DSNs/tokens must be provisioned and set as env vars (Stage D).                |
| **DNS + SSL**                | `dealerlink.in` plus wildcard `*.dealerlink.in` for per-tenant subdomains needs wildcard DNS + wildcard SSL. DNS propagation can take 24h+ — start early (D.1–D.2). |
| **Postgres backups**         | DO Managed Postgres backup schedule + a tested restore procedure must be set up before real tenant data lands.                                                      |
| **Resend domain**            | `mail.dealerlink.in` needs domain verification + SPF/DKIM/DMARC, and the inbound webhook endpoint + signing secret wired (R10).                                     |
| **State-code debt (DEV.33)** | Must be resolved before GST-return integration; see §3.                                                                                                             |

---

## 6. Quick-Reference Operational Runbooks

All in `docs/RUNBOOKS.md`:

- **R1** Onboard a new tenant · **R2** Add a user · **R3** Reset a password
- **R4** Rotate the inbound email token · **R5** Enter a tenant workspace
  (operator) · **R6** Re-queue a stuck welcome email
- **R7** Bulk-import dealers · **R8** Update product GST rates · **R9** Move a
  deal past the high-risk guard
- Quotation → PI → order → payment → dispatch procedures (R? series)
- **R10** Resend webhook setup · **R11** Investigate a bounce · **R12** Email
  stuck in `sending`
- **R13–R15** Reports procedures · **R16** Observability alert thresholds

---

## 7. Test Account Credentials (Stage C testers)

These are **dev-seed credentials only**. Production has no seed — real
accounts are created through the operator admin app. Source of truth:
`apps/web/tests/e2e/helpers.ts` (`SEEDED_USERS`).

| Tenant | Role     | Email                      | Password      |
| ------ | -------- | -------------------------- | ------------- |
| demo   | Admin    | `admin@demo.test`          | `password123` |
| demo   | Sales    | `sales@demo.test`          | `password123` |
| demo   | Accounts | `accounts@demo.test`       | `password123` |
| demo   | Dispatch | `dispatch@demo.test`       | `password123` |
| sample | Admin    | `admin@sample.test`        | `password123` |
| sample | Sales    | `sales@sample.test`        | `password123` |
| sample | Accounts | `accounts@sample.test`     | `password123` |
| sample | Dispatch | `dispatch@sample.test`     | `password123` |
| —      | Operator | `operator@dealerlink.test` | `password123` |

In dev, reach a tenant workspace with `?tenant=<slug>` (e.g.
`/login?tenant=demo`); in production each tenant has its own subdomain.

---

## 8. Running the Project (new contributor)

A fresh clone reaches a working app with:

```
pnpm install
pnpm playwright:install        # one-time: Chromium for the verify suite
docker compose up -d           # local Postgres 16
pnpm db:migrate && pnpm db:seed
pnpm preflight                 # confirms env, DB, migrations
pnpm dev                       # web on :3000  (pnpm dev:all adds workers)
```

`pnpm verify` runs the full Playwright suite; `pnpm test` runs unit +
integration tests. See `docs/STRUCTURE.md` for the monorepo layout and
`SETUP.md` for prerequisites (Node 20, the Chromium one-time install).

---

## 9. Carried-Forward To Stage D (learned from C.0)

C.0 stood up staging early — the staging slice of the Stage D deployment doc.
Bringing it up surfaced the concrete decisions and provisioning that
**production** will need. These are **previews for Stage D**, not Stage C work;
`docs/DEPLOYMENT.md` is the source of truth as it is updated, and §5 above lists
the matching production risks.

- **Production secrets provisioning** — Sentry DSN, Better Stack source token,
  Axiom token, and the Resend domain + API key are all **placeholders** on
  staging today (each service degrades to a no-op without them). Production
  needs real values set as env vars.
- **Real Resend domain verification** — `mail.dealerlink.in` needs domain
  verification + DKIM/SPF/DMARC, plus the inbound webhook endpoint + signing
  secret wired. Staging sends from `onboarding@resend.dev` with no inbound.
- **Production observability stack provisioning** — stand up the production
  Sentry / Better Stack / Axiom projects and wire their DSNs/tokens (today they
  are env-var placeholders that no-op).
- **Production DB sizing decision** — basic tier (`db-s-1vcpu-1gb`,
  `max_connections=25`) vs a professional tier. Staging hit connection-pool
  exhaustion on the basic tier (DEV.61/62); production must either run a bigger
  tier or add a connection pooler (PgBouncer — mind the pg-boss LISTEN/NOTIFY +
  advisory-lock caveat from DEV.61).
- **Worker instance sizing decision** — `basic-xxs` (512 MB, shared vCPU) vs
  `basic-xs`. Flagged in DEV.66/67: cold Chromium launch is slow on `basic-xxs`,
  and the 120s timeout + 45-min recycle are mitigations, not fixes. Decide using
  the recycle-frequency logs (`PDF: Chromium recycled — reason… | uptime…`) from
  the pilot.
- **Backup strategy for DO Managed Postgres** — a backup schedule + a tested
  restore procedure before real tenant data lands.
- **Production DNS** — decide `app.dealerlink.in` vs the naked `dealerlink.in`
  apex **before** Stage D. Staging uses the `staging.` prefix.
- **Production tenant subdomain SSL strategy** — staging enumerates each tenant
  subdomain for an HTTP-01 cert (no wildcard, because DNS is on Cloudflare and
  DO needs DNS-01 for wildcards). Production needs a real wildcard SSL strategy
  (a Cloudflare origin cert / proxied, or DO-managed DNS).
- **`app.yaml` ↔ deployed-spec sync workflow** — DEV.64: the repo `.do/app.yaml`
  is documentation; the live spec is what deploys. The current process (manual
  `doctl apps update --spec`, merged into the live spec to preserve secrets) is
  brittle. Script it as a post-push CI step (or DO's GitHub Action) for Stage D.
- **Migration of staging deployment learnings** — `docs/DEPLOYMENT.md` was
  updated during C.0 and is the source; production setup should follow it.

---

_Stage B closed 2026-05-16 · handoff prepared on Day 18 · frozen at the
`stage-b-complete` git tag. · Stage C progress (§0) is maintained live —
last updated 2026-05-23 (C.0 complete)._
