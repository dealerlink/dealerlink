# PROJECT_PLAN.md — Dealerlink Phase 1 Tracker

> **Purpose:** Single source-of-truth checklist for the entire Phase 1 journey, from discovery to live tenants. Update statuses as work progresses. Append a dated entry to the changelog at the bottom every time you mark something done.
>
> **How to use:**
>
> - Tick boxes as you complete each task
> - Move parked items to "In progress" when you unpark them
> - Don't delete completed items — they're the project's audit trail
> - When all of a stage's items are ✅, the stage is done
>
> **Companion files:**
>
> - `CLAUDE.md` — implementation guide for Claude Code
> - `DECISIONS.md` — architecture decision records
> - `docs/dealerlink-architecture-v4.html` — visual architecture
> - `docs/Dealerlink Detailed BRD v1.0.docx` — business requirements

---

## Status Legend

| Symbol | Meaning                                         |
| ------ | ----------------------------------------------- |
| ✅     | Done                                            |
| 🔄     | In progress                                     |
| ⏳     | Not started                                     |
| 🅿️     | Parked (will resume later in Phase 1)           |
| ⏭️     | Deferred to Phase 2                             |
| ⚠️     | Blocked (needs decision or external dependency) |

---

## Stage 0 — Discovery & Decisions

| #   | Task                                                         | Status | Date | Notes                                                      |
| --- | ------------------------------------------------------------ | ------ | ---- | ---------------------------------------------------------- |
| 0.1 | BRD authored (12 modules, GST logic, pipeline stages)        | ✅     |      |                                                            |
| 0.2 | Visual design prototype created (12 screens)                 | ✅     |      | Distribyte.html + screens-extra.jsx                        |
| 0.3 | Tech stack evaluated and locked                              | ✅     |      | Next.js + Postgres + Drizzle + Lucia + pg-boss + Puppeteer |
| 0.4 | Architecture diagram created (v4 with observability + audit) | ✅     |      | dealerlink-architecture-v4.html                            |
| 0.5 | 7 platform decisions resolved and logged in DECISIONS.md     | ✅     |      | All defaults accepted                                      |
| 0.6 | Brand naming locked: Dealerlink (dealerlink.in)              | ✅     |      | ADR-008                                                    |
| 0.7 | CLAUDE.md implementation guide finalized (19 sections)       | ✅     |      | Includes engineering standards                             |
| 0.8 | Engineering standards & Definition of Done documented        | ✅     |      | CLAUDE.md §19                                              |

**Stage 0 status: ✅ Complete (8/8)**

---

## Stage A — Foundation Setup

| #    | Task                                                | Status | Date | Notes                                                   |
| ---- | --------------------------------------------------- | ------ | ---- | ------------------------------------------------------- |
| A.1  | GitHub repo `dealerlink` created (private)          | ✅     |      |                                                         |
| A.2  | Local dev environment configured                    | ✅     |      | Node 20, pnpm, Docker, Postgres 16                      |
| A.3  | Repo scaffolded with starter files                  | ✅     |      | .gitignore, docker-compose.yml, .env.example, README.md |
| A.4  | Documentation placed in /docs and CLAUDE.md at root | ✅     |      |                                                         |
| A.5  | Local Postgres running with extensions              | ✅     |      | uuid-ossp, pg_trgm, btree_gin                           |
| A.6  | Initial commit pushed to GitHub                     | ✅     |      |                                                         |
| A.7  | Resend account + API key configured                 | ✅     |      | RESEND_API_KEY in .env.local                            |
| A.8  | Sentry account + DSN configured                     | ✅     |      | dealerlink-web + dealerlink-workers projects            |
| A.9  | .env.local populated with core secrets              | ✅     |      | SESSION_SECRET, RESEND_API_KEY, SENTRY_DSN              |
| A.10 | RESEND_INBOUND_WEBHOOK_SECRET configured            | 🅿️     |      | Parked until Week 3 (when inbound email is wired up)    |

**Stage A status: ✅ Complete (9/10 active items, 1 parked)**

---

## Stage B — The 3.5-Week Build

### Week 1 — Foundation (Days 1–5)

| #   | Day   | Deliverable                                                                 | Status | Date       | Notes                                                                                                                                                                                                                           |
| --- | ----- | --------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| B.1 | Day 1 | Repo scaffold, design tokens, fonts, base layout (Sidebar + Topbar + Shell) | ✅     | 2026-05-10 | 63 files, commit d364ad7. Two follow-ups carried to Day 2 (R.5, R.6)                                                                                                                                                            |
| B.2 | Day 2 | Drizzle schema (tenant, user, role) + Lucia auth + login screen             | ✅     | 2026-05-11 | Initial commit included Lucia snake_case bug; fixed in 81613de with full audit. 4 similar latent bugs caught and fixed. Prop types widened at boundary.                                                                         |
| B.3 | Day 3 | RLS policies, tenant middleware, audit log triggers, seed scripts           | ✅     | 2026-05-11 | 45 tests passing across 8 tables. Operator impersonation with read-only enforcement. 4 documented deviations, all justified. R.8 closed via ADR-009.                                                                            |     |
| B.4 | Day 4 | Tenant provisioning admin app (admin.dealerlink.in route group)             | ✅     | 2026-05-11 | 75 tests, 6 runbooks, cascade-delete audit bug fixed. 4 documented deviations, all tracked. Commit 62c568b.                                                                                                                     |     |
| B.5 | Day 5 | Dealer Master CRUD + Product Catalog + Inventory schema                     | ✅     | 2026-05-11 | 112 tests, 37 new. 40 seed rows per tenant. 5 deviations tracked as R.16-R.18. tRPC replaced by Server Components pattern (CLAUDE.md §3 needs update). 5 lint errors caught by pre-commit revealed R.5 only partially resolved. |     |

### Week 2 — Core Operations (Days 6–10)

| #    | Day    | Deliverable                                                  | Status | Date | Notes                              |
| ---- | ------ | ------------------------------------------------------------ | ------ | ---- | ---------------------------------- |
| B.6  | Day 6  | Inventory bulk procurement, serial entry, status transitions | ⏳     |      |                                    |
| B.7  | Day 7  | Sales Pipeline 9-stage kanban with dnd-kit                   | ⏳     |      |                                    |
| B.8  | Day 8  | Quotation Builder UI + line items                            | ⏳     |      |                                    |
| B.9  | Day 9  | GST tax engine in packages/tax/ + live preview integration   | ⏳     |      | High-risk module — test thoroughly |
| B.10 | Day 10 | PDF rendering pipeline + Puppeteer worker setup              | ⏳     |      |                                    |

### Week 3 — Order Lifecycle (Days 11–15)

| #    | Day    | Deliverable                                                        | Status | Date | Notes                                       |
| ---- | ------ | ------------------------------------------------------------------ | ------ | ---- | ------------------------------------------- |
| B.11 | Day 11 | PI generation + Order creation from accepted quote                 | ⏳     |      |                                             |
| B.12 | Day 12 | Payment tracking + status transitions                              | ⏳     |      |                                             |
| B.13 | Day 13 | Dispatch flow (pick serials, generate LR, tax invoice)             | ⏳     |      |                                             |
| B.14 | Day 14 | Email log + Resend integration (outbound + inbound webhooks)       | ⏳     |      | Generate RESEND_INBOUND_WEBHOOK_SECRET here |
| B.15 | Day 15 | Reports (Pipeline Health, Inventory Status, Payments, GST Summary) | ⏳     |      |                                             |

### Half Week 4 — Polish (Days 16–18)

| #    | Day    | Deliverable                                                | Status | Date | Notes |
| ---- | ------ | ---------------------------------------------------------- | ------ | ---- | ----- |
| B.16 | Day 16 | Settings, user management, notifications                   | ⏳     |      |       |
| B.17 | Day 17 | Observability wiring (Sentry, Better Stack /health, Axiom) | ⏳     |      |       |
| B.18 | Day 18 | E2E tests for primary workflows + deploy to staging        | ⏳     |      |       |

**Stage B status: ⏳ Not started (0/18)**

---

## Stage C — Internal Validation (Week 5)

| #   | Task                                                                        | Status | Date | Notes                                                          |
| --- | --------------------------------------------------------------------------- | ------ | ---- | -------------------------------------------------------------- |
| C.1 | Provision 2 demo tenants via the admin app                                  | ⏳     |      | Use seed names: Demo Solar Distributors + Sample Industrial Co |
| C.2 | Walk through every workflow as each role (Admin, Sales, Accounts, Dispatch) | ⏳     |      |                                                                |
| C.3 | Generate real GST documents; verify tax math against BRD examples           | ⏳     |      | Cross-check against 3 PO Premier.pdf reference                 |
| C.4 | Test cross-tenant isolation (RLS holds when bypassing UI)                   | ⏳     |      | Critical security test                                         |
| C.5 | Stress test (10K inventory items, 200 deals, 50 PDFs)                       | ⏳     |      |                                                                |
| C.6 | Capture issues, fix critical bugs                                           | ⏳     |      |                                                                |

**Stage C status: ⏳ Not started (0/6)**

---

## Stage D — Production Infrastructure

| #    | Task                                                                             | Status | Date | Notes                             |
| ---- | -------------------------------------------------------------------------------- | ------ | ---- | --------------------------------- |
| D.1  | Buy dealerlink.in domain                                                         | 🅿️     |      | Parked — after build is validated |
| D.2  | Configure wildcard DNS (\*.dealerlink.in + mail.dealerlink.in MX/SPF/DKIM/DMARC) | 🅿️     |      | Parked — after D.1                |
| D.3  | Create DigitalOcean account + provision App Platform                             | ⏳     |      | Bangalore region                  |
| D.4  | Provision DO Managed Postgres (Bangalore region)                                 | ⏳     |      |                                   |
| D.5  | Provision DO Spaces bucket                                                       | ⏳     |      | dealerlink-prod, BLR1             |
| D.6  | Verify Resend domain (mail.dealerlink.in)                                        | ⏳     |      | After D.2                         |
| D.7  | Generate RESEND_INBOUND_WEBHOOK_SECRET and wire endpoint                         | ⏳     |      | Unparks A.10                      |
| D.8  | Create Better Stack account + uptime monitor                                     | ⏳     |      | Free tier                         |
| D.9  | Create Axiom account + log dataset                                               | ⏳     |      | Free tier                         |
| D.10 | Configure GitHub Actions deploy pipeline                                         | ⏳     |      |                                   |
| D.11 | Production environment variables set in DO                                       | ⏳     |      |                                   |
| D.12 | Staging → production cutover                                                     | ⏳     |      |                                   |
| D.13 | First production smoke test (provision 1 test tenant, generate 1 invoice)        | ⏳     |      |                                   |

**Stage D status: ⏳ Not started (0/13, 2 parked)**

---

## Stage E — Launch & Onboarding

| #   | Task                                                            | Status | Date | Notes                                   |
| --- | --------------------------------------------------------------- | ------ | ---- | --------------------------------------- |
| E.1 | Marketing landing page at dealerlink.in (1-pager + access form) | ⏳     |      |                                         |
| E.2 | Identify 3–5 friendly beta tenants                              | ⏳     |      | Solar/electrical/machinery distributors |
| E.3 | Onboard each beta tenant via admin app                          | ⏳     |      |                                         |
| E.4 | Beta feedback collection + iteration sprint                     | ⏳     |      |                                         |
| E.5 | Public launch announcement                                      | ⏳     |      |                                         |
| E.6 | Hypercare period (daily check-ins, 1-week)                      | ⏳     |      |                                         |
| E.7 | Phase 1 retrospective + Phase 2 backlog                         | ⏳     |      |                                         |

**Stage E status: ⏳ Not started (0/7)**

---

## Phase 2 — Deferred Features

These are intentionally deferred. Architecture preserves clean migration paths to each.

| #     | Feature                                           | Status | Notes                                             |
| ----- | ------------------------------------------------- | ------ | ------------------------------------------------- |
| F2.1  | Self-serve tenant signup                          | ⏭️     | Needs payment integration + abuse prevention      |
| F2.2  | SSO via Google / Microsoft (Lucia)                | ⏭️     | Lucia adapters exist; one-day lift                |
| F2.3  | Multi-currency support                            | ⏭️     | Schema is ready (default_currency column exists)  |
| F2.4  | Per-tenant fiscal year config                     | ⏭️     | Schema is ready (fiscal_year_start column exists) |
| F2.5  | Custom domain per tenant                          | ⏭️     | Enterprise tier feature                           |
| F2.6  | Mobile app (iOS + Android)                        | ⏭️     |                                                   |
| F2.7  | Custom document templates per tenant              | ⏭️     | High engineering cost; GST compliance risk        |
| F2.8  | Meilisearch                                       | ⏭️     | When pg_trgm slows on 100K+ records               |
| F2.9  | Redis                                             | ⏭️     | When job volume exceeds Postgres queue capacity   |
| F2.10 | DOKS / Kubernetes                                 | ⏭️     | When 5+ tenants need scale isolation              |
| F2.11 | PostHog product analytics + session replay        | ⏭️     |                                                   |
| F2.12 | Tenant-specific email server (custom From domain) | ⏭️     |                                                   |

---

## Progress Summary

| Stage                           | Total  | Done   | In Progress | Pending       | % Complete |
| ------------------------------- | ------ | ------ | ----------- | ------------- | ---------- |
| Stage 0 — Discovery & Decisions | 8      | 8      | 0           | 0             | 100%       |
| Stage A — Foundation Setup      | 10     | 9      | 0           | 1 (parked)    | 90%        |
| Stage B — Build (3.5 weeks)     | 18     | 0      | 0           | 18            | 0%         |
| Stage C — Validation            | 6      | 0      | 0           | 6             | 0%         |
| Stage D — Production Infra      | 13     | 0      | 0           | 13 (2 parked) | 0%         |
| Stage E — Launch                | 7      | 0      | 0           | 7             | 0%         |
| **Total**                       | **62** | **17** | **0**       | **45**        | **27%**    |

---

## Critical Path Items

These items, if delayed, push the whole timeline:

| Item                               | Why critical                                                   | Mitigation                                                           |
| ---------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| **B.9 GST tax engine**             | Tax bugs destroy trust across all tenants                      | Test-first development; cross-check against BRD §4 examples          |
| **B.3 RLS policies + tests**       | Multi-tenant data leak is the worst-case bug                   | Mandatory CI test: query as Tenant A, assert zero rows from Tenant B |
| **B.10 PDF pipeline**              | Distinguishing feature; complex (Puppeteer in workers process) | Build as React component first, render path second                   |
| **B.4 Tenant provisioning**        | Without it, no tenant can log in                               | Don't skip to ship faster                                            |
| **D.6 Resend domain verification** | DNS propagation can eat 24+ hours                              | Start D.1–D.2 early in Stage D                                       |

---

## Risks & Open Items

| #    | Risk / Open item                                                                                                                                                                                | Owner                                                        | Status                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| R.1  | Prototype files still labeled "Distribyte"; Claude Code must silently rename to "Dealerlink" during implementation                                                                              | Claude Code                                                  | Mitigated via CLAUDE.md §0                               |
| R.2  | Puppeteer memory leaks under bulk PDF generation                                                                                                                                                | Dev                                                          | Mitigated via worker process isolation + 100-job restart |
| R.3  | Postgres storage growth from email body logging                                                                                                                                                 | Dev                                                          | Mitigated by moving large bodies to Spaces in Phase 2    |
| R.4  | First tenant onboarding requires manual provisioning (no self-serve in Phase 1)                                                                                                                 | Operator                                                     | Acceptable; admin app makes it 5 min                     |
| R.5  | **REOPENED** Lint coverage gap: `pnpm lint` only runs on `apps/web`, missing all `packages/*`. Pre-commit hook catches the gap but creates dev-loop divergence. Fix in Day 6 preliminary phase. | Dev                                                          | Day 6                                                    |
| R.6  | ~~tailwind-preset uses Record<string, any>~~                                                                                                                                                    | Resolved in Day 2 Phase 10                                   |
| R.7  | PowerShell ExecutionPolicy blocked pnpm scripts on Windows; resolved with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`                                                                 | Dev                                                          | Resolved — note for any other Windows contributor        |
| R.8  | ~~Lucia DatabaseUserAttributes silently undefined~~                                                                                                                                             | Resolved via ADR-009 (Zod at Lucia boundary)                 |
| R.9  | ~~No integration test for Lucia session contract~~                                                                                                                                              | Resolved — audit + RLS tests collectively cover the contract |
| R.10 | Pattern of unguarded .split/.charAt/.toUpperCase on user/tenant fields keeps recurring. ESLint plugin to detect this could help.                                                                | Dev                                                          | Phase 2 if it recurs                                     |
| R.11 | `tax` workspace has `--passWithNoTests` flag to let root test runner pass. Must be removed when tax engine ships on Day 9.                                                                      | Dev                                                          | Day 9                                                    |
| R.12 | Playwright E2E deferred from Day 4 — operator-onboarding spec must be added on Day 18                                                                                                           | Dev                                                          | Day 18                                                   |
| R.13 | Inline email dispatch from /admin/tenants/new — must be worker-ized when pg-boss bootstraps on Day 14                                                                                           | Dev                                                          | Day 14                                                   |
| R.14 | Plain HTML email template instead of @react-email/components — revisit when 2nd template ships (Day 11 or 13)                                                                                   | Dev                                                          | Day 11/13                                                |
| R.15 | Base64 logo fallback — swap to DO Spaces in Stage D                                                                                                                                             | Dev                                                          | Stage D                                                  |
| R.16 | TanStack Virtual not yet added — needed Day 6 for inventory lists (500+ serials per product)                                                                                                    | Dev                                                          | Day 6                                                    |
| R.17 | Atomic CSV imports don't show per-row error report — error message should identify which row failed                                                                                             | Dev                                                          | Day 7 or 8 polish                                        |
| R.18 | GSTIN empty-string edge case — add DB CHECK constraint `gstin IS NULL OR gstin <> ''`                                                                                                           | Dev                                                          | Day 6                                                    |
| R.19 | Day 5 reported "lint green" but pre-commit hook caught 5 errors in packages/db. Future days' end-of-day verification must use `pnpm lint --max-warnings=0` matching the hook command.           | Dev                                                          | Day 6 (resolved by R.5 fix)                              |

---

## Changelog

Append a dated entry every time you complete a task or change a status.

| Date       | Change                                                                                                                                                                                    | By  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 2026-05-09 | PROJECT_PLAN.md created                                                                                                                                                                   | —   |
| 2026-05-09 | Stage 0 marked complete (8/8)                                                                                                                                                             | —   |
| 2026-05-09 | Stage A marked complete (9/10 active, A.10 parked)                                                                                                                                        | —   |
| 2026-05-10 | B.1 Day 1 complete — 63 files, monorepo + design system + base layout, all 3 quality gates green, commit d364ad7                                                                          | —   |
| 2026-05-10 | PowerShell execution policy fix documented in R.7                                                                                                                                         | —   |
| 2026-05-11 | B.2 Day 2 complete — Drizzle schema, RLS, Lucia auth, login (Aurora), seed (9 users), dashboard greeting. Initial Lucia snake_case bug caught and fixed via audit. Commit 81613de.        | —   |
| 2026-05-11 | B.3 Day 3 complete — tenant middleware, action wrappers, audit redaction, operator impersonation, 45 tests passing. ADR-009 closes R.8.                                                   | —   |
| 2026-05-11 | B.4 Day 4 complete — operator admin app, tenant CRUD, user management, inbound token rotation, welcome email pipeline. Cascade-delete audit-trigger bug fixed in passing. Commit 62c568b. | —   |
| 2026-05-11 | B.5 Day 5 complete — Dealer Master + Product Catalog + Inventory schema. 112 tests, 5 deviations tracked. tRPC replaced by Server Components pattern.                                     | —   |
| 2026-05-11 | Lint coverage gap discovered post-commit; pre-commit hook caught 5 errors `pnpm lint` missed. R.5 reopened.                                                                               | —   |
| 2026-05-11 | END OF WEEK 1 — Foundation + 3 business modules shipped. 5/18 build days complete. On track.                                                                                              | —   |
|            |                                                                                                                                                                                           |     |

---

_This plan is the canonical project tracker. When in doubt about what's done or what's next, this file wins._
