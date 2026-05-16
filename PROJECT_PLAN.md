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

| #   | Task                                                                                              | Status | Date | Notes                                                      |
| --- | ------------------------------------------------------------------------------------------------- | ------ | ---- | ---------------------------------------------------------- |
| 0.1 | BRD authored (12 modules, GST logic, pipeline stages)                                             | ✅     |      |                                                            |
| 0.2 | Visual design prototype created (12 screens)                                                      | ✅     |      | Distribyte.html + screens-extra.jsx                        |
| 0.3 | Tech stack evaluated and locked                                                                   | ✅     |      | Next.js + Postgres + Drizzle + Lucia + pg-boss + Puppeteer |
| 0.4 | Architecture diagram created (v4 with observability + audit)                                      | ✅     |      | dealerlink-architecture-v4.html                            |
| 0.5 | 7 platform decisions resolved and logged in DECISIONS.md                                          | ✅     |      | All defaults accepted                                      |
| 0.6 | Brand naming locked: Dealerlink (dealerlink.in)                                                   | ✅     |      | ADR-008                                                    |
| 0.7 | CLAUDE.md implementation guide finalized (10 sections; 10 deep-dive docs in `docs/` after DEV.28) | ✅     |      | Includes engineering standards                             |
| 0.8 | Engineering standards & Definition of Done documented                                             | ✅     |      | `docs/STANDARDS.md` (moved out of CLAUDE.md in DEV.28)     |

**Stage 0 status: ✅ Complete (8/8)**

---

## Stage A — Foundation Setup

| #    | Task                                                | Status | Date       | Notes                                                                                              |
| ---- | --------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------- |
| A.1  | GitHub repo `dealerlink` created (private)          | ✅     |            |                                                                                                    |
| A.2  | Local dev environment configured                    | ✅     |            | Node 20, pnpm, Docker, Postgres 16                                                                 |
| A.3  | Repo scaffolded with starter files                  | ✅     |            | .gitignore, docker-compose.yml, .env.example, README.md                                            |
| A.4  | Documentation placed in /docs and CLAUDE.md at root | ✅     |            |                                                                                                    |
| A.5  | Local Postgres running with extensions              | ✅     |            | uuid-ossp, pg_trgm, btree_gin                                                                      |
| A.6  | Initial commit pushed to GitHub                     | ✅     |            |                                                                                                    |
| A.7  | Resend account + API key configured                 | ✅     |            | RESEND_API_KEY in .env.local                                                                       |
| A.8  | Sentry account + DSN configured                     | ✅     |            | dealerlink-web + dealerlink-workers projects                                                       |
| A.9  | .env.local populated with core secrets              | ✅     |            | SESSION_SECRET, RESEND_API_KEY, SENTRY_DSN                                                         |
| A.10 | RESEND_INBOUND_WEBHOOK_SECRET configured            | ✅     | 2026-05-16 | ✅ closed by Day 14 — generated, in `.env.local` + documented in `SETUP.md`; inbound webhook wired |

**Stage A status: ✅ Complete (10/10)**

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

| #    | Day    | Deliverable                                                  | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------ | ------------------------------------------------------------ | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B.6  | Day 6  | Inventory bulk procurement, serial entry, status transitions | ✅     | 2026-05-11 | 131 tests (19 new). Procurement workflow + state machine + 500 seeded items. Daily automation kit established (preflight, Playwright verify, BUILD_PROMPT_TEMPLATE.md, DEVIATIONS.md). R.5 + R.18 closed; R.16 stays open (DEV.22).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B.7  | Day 7  | Sales Pipeline 9-stage kanban with dnd-kit                   | ✅     | 2026-05-12 | 165 tests (34 new: 25 db deals, 4 client stage-meta parity, 5 verify-day-7). 60 deals seeded (30/tenant) across all 9 stages. State machine with row-locked transitions, high-risk guard with admin-override modal, deal detail + create + dashboard KPIs/funnel. DEV.27 captures the API stream timeout recovery; future complex UI days chunk components per the new rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B.8  | Day 8  | Quotation Builder UI + line items                            | ✅     | 2026-05-15 | 185 tests (20 new: 13 db quotation, 11 web preview, 5 verify-day-8 — net new after recount). Builder UI split across 5 components <250 LOC each per Day 7 lesson. `computeQuotationTotals` is the shared source of truth between client preview and server-side persistence — Day 9 will replace it with `packages/tax`. Revision chain via `parent_quotation_id` self-FK, live inter-state badge, deal auto-advance on send. 15+2 quotations seeded per tenant covering all statuses, mixed GST rates, both discount kinds, and one Rev 1→Rev 3 chain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B.9  | Day 9  | GST tax engine in packages/tax/ + live preview integration   | ✅     | 2026-05-15 | `@dealerlink/tax` is now the authoritative GST engine — pure library, decimal.js only, no I/O/framework deps. `computeTax` does line-level rounding (per-line subtotal + per-line CGST/SGST/IGST rounded to 2dp, document totals are sums of rounded line values), proportional pre-tax discount allocation, full input validation with stable `TaxComputationError` codes. 51 engine tests across 9 suites. Preview helper + `computeTotalsForPersistence` redirected to the engine via thin adapters; `preview.test.ts` (11 tests) passes unchanged as the parity proof. New `quotation-engine-parity.test.ts` re-derives every seeded `QT-` quotation's totals and matches stored values exactly. Parity run surfaced DEV.35 (a Day 8 seed revision-chain bug — discount metadata dropped, since fixed + re-seeded) and DEV.34 (engine state compare is case-sensitive by design). All gates green: typecheck, lint, test (218 total), verify 21/21, build.                                                                                                                                                     |
| B.10 | Day 10 | PDF rendering pipeline + Puppeteer worker setup              | ✅     | 2026-05-15 | Quotation PDF end to end. `apps/workers/src/pdf` — lazy Chromium singleton (idle/100-page/crash recycle; `@sparticuz/chromium` in prod, system Chrome dev fallback), pure `renderPdfFromHtml`. React-on-the-server quotation template (typed props, no `any`; Header/PartyBlock/LineItemsTable/TaxSummary/Footer reused by Day 11 invoice), inline A4 print CSS, Indian amount-in-words + money formatting. Per-line GST recomputed via `@dealerlink/tax` (parity-safe). Immutable `generated_documents` store (RLS + audit; inline base64 per DEV.16). Web actions generate/download/email; render runs as a spawned workers subprocess (DEV.36 — Puppeteer never enters the web build; pg-boss path written for Day 14). DEV.37 (page-number footer via Chromium footerTemplate), DEV.38 (Day 8 seed cross-tenant dealer bug — unqualified RLS-bypassed selects — found by Day 10 render + fixed). 28 new tests (13 amount-in-words, 8 template, 1 render smoke, 3 verify-day-10, +3 prior recount). All gates green: typecheck, lint, test, verify 24/24, build. Sample at `docs/samples/quotation-sample.pdf`. |

### Week 3 — Order Lifecycle (Days 11–15)

| #    | Day    | Deliverable                                                                        | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------ | ---------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B.11 | Day 11 | PI generation + Order creation from accepted quote                                 | ✅     | 2026-05-16 | Performa Invoice + Order lifecycle end to end. New `performa_invoices`/`orders` (+ lines + status-history) tables with RLS, audit triggers, explicit transition state machines (`pi/transitions.ts`, `orders/transitions.ts`). PI confirmation is one atomic transaction: confirm PI → spawn Order → copy lines → advance deal `po_pending → payment_pending`. Order confirmation reserves serialised inventory FIFO under `SELECT FOR UPDATE`, all-or-nothing with a structured `InsufficientInventoryError` (per-product shortages). **ADR-012**: place of supply corrected to follow Ship-To (IGST Act §10), not Bill-To — CLAUDE.md §5 rewritten (DEV.39); convert-to-PI flow shows a tax-change banner when Ship-To flips IGST↔CGST/SGST. PI list/detail/convert/edit UI + PI PDF (reuses the Day 10 template via a generalised Header; new `performa_invoice` doc type). Order list/detail (tabbed: overview, lines, reservations, history) + confirm-order modal with reservation preview. 10 PIs/tenant seeded (incl. 2 three-party, ≥1 cross-state) + orders + reservations. 19 new db tests (orders.test.ts) + verify-day-11 (3 specs). DEV.40 (draft-PI edit is header-only; lines inherited). All gates green: typecheck, lint, test (150 db), verify 27/27, build.                                                                                                         |
| B.12 | Day 12 | Payment tracking + status transitions                                              | ✅     | 2026-05-16 | Payment recording, allocation, receipts. New `payments`/`payment_allocations` tables (RLS, audit triggers, `payment` document counter). Payment state machine (`payments/transitions.ts`): `pending_verification → verified → cleared → refunded`, `verified → bounced`. Pure `deriveOrderPaymentStatus` + `recomputeOrderPaymentStatus` propagate an order's `paymentStatus` (`unpaid`/`partially_paid`/`paid`) from verified/cleared allocations. Server actions (admin + accounts; refund admin-only) — record, verify, clear, bounce, refund, allocate, deallocate, applyAdvancePayment — all atomic with `SELECT FOR UPDATE` on the payment + affected orders. Bounce/refund reverse allocations and regress order status. Funds-received-then-confirm: a fully-paid pending order auto-reserves + confirms. Day 11 `confirmPi` extended to transfer PI advances onto the spawned order. Payment list/detail/record UI + order **Payments** tab + dashboard widgets (overdue, recent, unallocated). Tax-neutral receipt PDF (`payment-receipt.tsx`, reuses Day 10 Header/PartyBlock/Footer). Overdue tracking via dealer credit period. 15 payments/tenant + 11 orders seeded. 17 new db tests (payments) + 8 propagation + 6 receipt-template + verify-day-12 (4 specs). All gates green: typecheck, lint, test (156 db), verify 31/31, build.                                    |
|      |
| B.13 | Day 13 | Dispatch flow (pick serials, generate LR, tax invoice)                             | ✅     | 2026-05-16 | Dispatch — physical fulfilment. New dispatches / dispatch_lines / dispatch_serials tables (RLS, audit triggers, dispatch document counter); dispatch_serials UNIQUE (tenant_id, inventory_item_id) guarantees a serial is dispatched at most once. Dispatch state machine (dispatch/lifecycle.ts): in_transit → delivered/returned. Inventory transitions extended (dispatchItem/deliverItem/returnItem); order transitions wired for dispatch states + pure deriveOrderFulfillmentStatus. createDispatchDb is atomic — locks the order then every serial FOR UPDATE, validates reserved/owned/product, inserts the dispatch, transitions serials, bumps dispatchedQuantity, recomputes order status, closes a fully-dispatched deal. The mandatory concurrent-dispatch test proves the loser fails SERIAL_ALREADY_DISPATCHED. Server actions: createDispatch (admin+dispatch), markDispatchDelivered (admin+dispatch), returnDispatch (admin-only). Dispatch list/create/detail UI + order Dispatches tab + 3 dashboard widgets. Tax-neutral dispatch-note PDF (dispatch-note.tsx + new SerialsTable, reuses Day 10 Header/PartyBlock/Footer) addressed to the Ship-To consignee. 8 dispatches/tenant seeded (3 delivered, 1 returned, 4 in-transit incl. 2 partial). 13 new db tests + verify-day-13 (5 specs). All gates green: typecheck, lint, test (169 db), verify 36/36, build. |
| B.14 | Day 14 | Email log + Resend integration (outbound + inbound webhooks)                       | ✅     | 2026-05-16 | Async email end to end. Outbound: web `queueEmail` writes a `queued` email_delivery_log row + enqueues a pg-boss `send-email` job; the workers Resend client sends it (classified EmailSendError — rate-limit retried 5×, permanent fails stop), attaches PDFs from generated_documents, flips the row sent/failed, drops the body from meta (R.3). Inline Day-4 send removed (R.13 closed). Inbound: public `/api/webhooks/resend` route, Svix signature verification IS the auth boundary; new `webhook_events` forensic table (no tenant_id, RLS off, unique-on-event-id replay guard); delivered/bounced/opened/clicked/complained events update email_delivery_log. New daily crons: validity-expiry (sent quotations/PIs past valid_until → expired, 02:00 IST) + pdf-cleanup (inline PDFs >30d purged, 03:00 IST). RESEND_INBOUND_WEBHOOK_SECRET generated (A.10 closed). DEV.47 (email log self-auditing — no audit trigger), DEV.48 (webhook processing in web). 21 new tests (8 email handler, 9 webhook, 4 maintenance); verify 37/37. All gates green.                                                                                                                                                                                                                                                                                                                      |
| B.15 | Day 15 | Reports (Sales Summary, Outstanding Receivables, Inventory Valuation, GST Summary) | ✅     | 2026-05-16 | Reports module — read-only. Report query layer (apps/web/lib/reports): pure typed functions returning ReportResult { columns, rows, totals, metadata } driving both the UI table and CSV. 4 reports: Sales Summary (quotations+PIs+orders by month/dealer/product), Outstanding Receivables (orders aged 0-30/31-60/61-90/91+ by dealer/bucket), Inventory Valuation (in-stock at last procurement cost), GST Summary (CGST/SGST/IGST on supplied orders by place of supply). Money READ from stored columns — never recomputed (CLAUDE.md §6); a GST parity test asserts report totals == a direct SUM over orders. CSV export: pure reportToCsv (Indian money, ISO dates, RFC-4180 quoting, UTF-8 BOM); exportReportCsv server action runs query+serialise server-side. Role-gated: admin/accounts all 4, sales 2, dispatch 1 — assertReportAccess (404) + canAccessReport. Dashboard ReportWidgets (top dealer, tax payable, slow-moving). DEV.49 (plain tables not TanStack — aggregates ≤36 rows), DEV.50 (dealer select not typeahead). 21 report tests; verify-day-15 (5 specs). All gates green.                                                                                                                                                                                                                                                                                |

### Half Week 4 — Polish (Days 16–18)

| #    | Day    | Deliverable                                                         | Status | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------ | ------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B.16 | Day 16 | Polish pass — empty/loading/error states, accessibility, micro-copy | ✅     | 2026-05-16 | Polish pass (Settings module deferred). Shared state components (app/\_components): EmptyState (no-data vs filtered-out copy), LoadingSkeleton + ListLoading (table-shaped, no layout shift), ErrorState (friendly, no internals leaked). app/(app)/error.tsx page boundary + reportError shim (Day-17 Sentry hook). loading.tsx for 8 list routes; EmptyState retrofitted across every list page. Accessibility: skip-to-content link + &lt;main&gt; landmark, focus rings, axe gate (0 serious/critical, WCAG 2 A+AA) on dashboard/dealers list+detail/quotation builder/order detail — fixed icon-link/select/textarea labels, --mute darkened for 4.5:1 contrast. Branded not-found.tsx, per-page document titles (%s · Dealerlink template), favicon + apple icon. DEV.51 (axe as the a11y gate, not Lighthouse CLI). 7 component tests; verify-day-16 (8 specs). All gates green. |
| B.17 | Day 17 | Observability wiring (Sentry, Better Stack /health, Axiom)          | ⏳     |            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B.18 | Day 18 | E2E tests for primary workflows + deploy to staging                 | ⏳     |            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Stage B status: 🔄 In progress (14/18)**

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

| #    | Risk / Open item                                                                                                                 | Owner                                                                                                    | Status                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| R.1  | Prototype files still labeled "Distribyte"; Claude Code must silently rename to "Dealerlink" during implementation               | Claude Code                                                                                              | Mitigated via CLAUDE.md §0                               |
| R.2  | Puppeteer memory leaks under bulk PDF generation                                                                                 | Dev                                                                                                      | Mitigated via worker process isolation + 100-job restart |
| R.3  | Postgres storage growth from email body logging                                                                                  | Dev                                                                                                      | Mitigated by moving large bodies to Spaces in Phase 2    |
| R.4  | First tenant onboarding requires manual provisioning (no self-serve in Phase 1)                                                  | Operator                                                                                                 | Acceptable; admin app makes it 5 min                     |
| R.5  | ~~Lint coverage gap: `pnpm lint` only ran on `apps/web`~~                                                                        | Resolved Day 6: every workspace defines a `lint` script; `pnpm -r lint` now uniform with pre-commit hook |
| R.6  | ~~tailwind-preset uses Record<string, any>~~                                                                                     | Resolved in Day 2 Phase 10                                                                               |
| R.7  | PowerShell ExecutionPolicy blocked pnpm scripts on Windows; resolved with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`  | Dev                                                                                                      | Resolved — note for any other Windows contributor        |
| R.8  | ~~Lucia DatabaseUserAttributes silently undefined~~                                                                              | Resolved via ADR-009 (Zod at Lucia boundary)                                                             |
| R.9  | ~~No integration test for Lucia session contract~~                                                                               | Resolved — audit + RLS tests collectively cover the contract                                             |
| R.10 | Pattern of unguarded .split/.charAt/.toUpperCase on user/tenant fields keeps recurring. ESLint plugin to detect this could help. | Dev                                                                                                      | Phase 2 if it recurs                                     |
| R.11 | ~~`tax` workspace has `--passWithNoTests` flag to let root test runner pass. Must be removed when tax engine ships on Day 9.~~   | Resolved — Day 9 — flag removed; `packages/tax` now has 51 engine tests                                  | —                                                        |
| R.12 | Playwright E2E deferred from Day 4 — operator-onboarding spec must be added on Day 18                                            | Dev                                                                                                      | Day 18                                                   |
| R.13 | ~~Inline email dispatch from /admin/tenants/new — must be worker-ized when pg-boss bootstraps on Day 14~~                        | Resolved Day 14 — all email goes through `queueEmail` → pg-boss `send-email` worker; inline send removed | —                                                        |
| R.14 | Plain HTML email template instead of @react-email/components — revisit when 2nd template ships (Day 11 or 13)                    | Dev                                                                                                      | Day 11/13                                                |
| R.15 | Base64 logo fallback — swap to DO Spaces in Stage D                                                                              | Dev                                                                                                      | Stage D                                                  |
| R.16 | TanStack Virtual not yet added — needed Day 6 for inventory lists (500+ serials per product)                                     | Dev                                                                                                      | Day 6                                                    |
| R.17 | Atomic CSV imports don't show per-row error report — error message should identify which row failed                              | Dev                                                                                                      | Day 7 or 8 polish                                        |
| R.18 | ~~GSTIN empty-string edge case~~                                                                                                 | Resolved Day 6: `dealers_gstin_not_empty_chk` CHECK + integration test                                   |
| R.19 | ~~Day 5 lint-vs-hook divergence~~                                                                                                | Resolved Day 6 via R.5 fix                                                                               |

---

## Changelog

Append a dated entry every time you complete a task or change a status.

| Date       | Change                                                                                                                                                                                                                                                 | By  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| 2026-05-09 | PROJECT_PLAN.md created                                                                                                                                                                                                                                | —   |
| 2026-05-09 | Stage 0 marked complete (8/8)                                                                                                                                                                                                                          | —   |
| 2026-05-09 | Stage A marked complete (9/10 active, A.10 parked)                                                                                                                                                                                                     | —   |
| 2026-05-10 | B.1 Day 1 complete — 63 files, monorepo + design system + base layout, all 3 quality gates green, commit d364ad7                                                                                                                                       | —   |
| 2026-05-10 | PowerShell execution policy fix documented in R.7                                                                                                                                                                                                      | —   |
| 2026-05-11 | B.2 Day 2 complete — Drizzle schema, RLS, Lucia auth, login (Aurora), seed (9 users), dashboard greeting. Initial Lucia snake_case bug caught and fixed via audit. Commit 81613de.                                                                     | —   |
| 2026-05-11 | B.3 Day 3 complete — tenant middleware, action wrappers, audit redaction, operator impersonation, 45 tests passing. ADR-009 closes R.8.                                                                                                                | —   |
| 2026-05-11 | B.4 Day 4 complete — operator admin app, tenant CRUD, user management, inbound token rotation, welcome email pipeline. Cascade-delete audit-trigger bug fixed in passing. Commit 62c568b.                                                              | —   |
| 2026-05-11 | B.5 Day 5 complete — Dealer Master + Product Catalog + Inventory schema. 112 tests, 5 deviations tracked. tRPC replaced by Server Components pattern.                                                                                                  | —   |
| 2026-05-11 | Lint coverage gap discovered post-commit; pre-commit hook caught 5 errors `pnpm lint` missed. R.5 reopened.                                                                                                                                            | —   |
| 2026-05-11 | END OF WEEK 1 — Foundation + 3 business modules shipped. 5/18 build days complete. On track.                                                                                                                                                           | —   |
| 2026-05-11 | R.5 closed — `lint` script added to every code-bearing workspace; `pnpm lint` runs `pnpm -r lint`, identical scope to pre-commit hook                                                                                                                  | —   |
| 2026-05-11 | B.6 Day 6 complete — procurement workflow, serial entry, inventory state machine (in_stock → reserved → dispatched → delivered with row locks), 500 seeded items per tenant, 19 new tests                                                              | —   |
| 2026-05-11 | Daily automation kit shipped — preflight script, Playwright verify specs (days 1–6), BUILD_PROMPT_TEMPLATE.md, DEVIATIONS.md backfilled                                                                                                                | —   |
| 2026-05-12 | B.7 Day 7 complete — Sales Pipeline kanban with dnd-kit, 9-stage state machine, high-risk dealer guard, deal detail + create, dashboard pipeline widgets, 60 seeded deals, 165 tests                                                                   | —   |
| 2026-05-12 | DEV.28 — CLAUDE.md size refactor: split 10 sections into focused `docs/*.md` files, slimmed from 62.8k → 29.8k chars (52% reduction). Sections renumbered §0–§9. No code change.                                                                       | —   |
| 2026-05-16 | B.14 Day 14 complete — async email (pg-boss `send-email` worker + Resend client), inbound webhook with Svix signature verification, `webhook_events` table, validity-expiry + pdf-cleanup daily crons. R.13 + A.10 closed. DEV.47/48. 4 chunk commits. | —   |

---

_This plan is the canonical project tracker. When in doubt about what's done or what's next, this file wins._
