# CLAUDE.md — Dealerlink Implementation Guide

> Last reviewed: 2026-05-27 — Stage C COMPLETE (6/6, tagged `stage-c-complete`); staging live + validated + load-tested. Next: Stage D (production infra) — see `docs/STAGE_D_HANDOFF.md`.

> **For Claude Code:** This is your authoritative reference for building Dealerlink. Read this file end-to-end before writing any code. When the BRD and this file conflict, this file wins. When in doubt about a decision, the answer is in here — don't ask, look.

## Reading Order

For most tasks, this file alone is sufficient. For specific deep dives, see:

- `docs/STRUCTURE.md` — full monorepo layout and folder structure
- `docs/DESIGN_SYSTEM.md` — design tokens, typography, component rules
- `docs/LOGGING.md` — 8-stream logging surface with schemas and retention
- `docs/PDF_PIPELINE.md` — Puppeteer pipeline (read this for Day 10 onwards)
- `docs/WORKFLOWS.md` — pipeline stages, inventory transitions, dispatch, inbound email
- `docs/TESTING.md` — testing approach with concrete patterns
- `docs/SEED_DATA.md` — seeding volumes per BRD §7
- `docs/DEPLOYMENT.md` — DigitalOcean App Platform setup
- `docs/BUILD_TIMELINE.md` — 18-day Stage B plan
- `docs/STANDARDS.md` — coding standards, security checklist, Definition of Done

Files in `docs/` that already existed (`DECISIONS.md`, `BUILD_PROMPTS.md`, etc.) are unchanged.

---

## 0. Brand Naming — One Rule (Read First)

**The product is named Dealerlink. Not Distribyte. Not DistroFlow.**

The product has been through naming iterations: the original BRD draft used "DistroFlow" as a working title; an interim brand was "Distribyte"; the final brand is **Dealerlink**, with primary domain **`dealerlink.in`** (Indian ccTLD, signalling India-first positioning).

Use Dealerlink everywhere — code, comments, copy, commit messages, file names, environment variables, database names, email templates, PDF letterheads, error messages, and any UI text.

If you encounter "DistroFlow" or "Distribyte" anywhere in the BRD, prototype files (`Distribyte.html`, `Distribyte-print.html`, `tweaks-panel.jsx`), or other source documents, **treat both as typos for Dealerlink. Do not propagate either.** Silently correct in any output, including when transcribing UI text from the prototype into production code.

### Quick reference

| Surface                  | Value                                                      |
| ------------------------ | ---------------------------------------------------------- |
| Product name             | **Dealerlink**                                             |
| Domain                   | `dealerlink.in`                                            |
| Repo                     | `dealerlink`                                               |
| Database (prod)          | `dealerlink_prod`                                          |
| Database (dev)           | `dealerlink_dev`                                           |
| Inbound email domain     | `mail.dealerlink.in`                                       |
| Default app URL          | `https://app.dealerlink.in`                                |
| Tenant subdomain pattern | `<tenant-slug>.dealerlink.in` (e.g., `demo.dealerlink.in`) |
| Sentry project           | `dealerlink-web`, `dealerlink-workers`                     |
| Spaces bucket            | `dealerlink-prod`                                          |

If anything else becomes inconsistent (logo, marketing copy, support email, internal tool names), flag it — don't silently re-introduce the old name.

---

## 1. Project at a Glance

**Dealerlink** is a multi-tenant B2B distributor CRM SaaS. The launch vertical is solar panel distribution (the BRD's reference industry), with the data model designed to extend to any industry with serialized inventory — electrical equipment, industrial machinery, IT hardware, auto parts, and so on.

The product is **tenant-agnostic by design**. There is no hardcoded customer. Every tenant's identity (legal name, GSTIN, address, branding, logo, document prefixes, fiscal year, default T&Cs, bank details for invoices) lives in the `tenants` and `tenant_settings` tables and is editable from the in-app Settings module. The first onboarded tenant is just data, not code.

- **Phase 1 timeline:** ~3.5 weeks
- **Phase 1 cost target:** ~$40/month operational
- **Tenant model:** self-serve signup deferred to Phase 2; Phase 1 supports admin-provisioned tenants (a Dealerlink operator creates the tenant + initial Admin user, hands off credentials)
- **Companion docs:**
  - `Dealerlink Detailed BRD v1.0.docx` — full business requirements (12 modules, GST logic, pipeline stages)
  - `dealerlink-architecture-v4.html` — visual architecture diagram
  - `Dealerlink.html` + `Dealerlink-print.html` + `screens-extra.jsx` + `tweaks-panel.jsx` — design prototype (12 screens, the visual source of truth)
  - `3 PO Premier.pdf` — sample purchase order; reference format for GST tax invoice layout

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│  01  CLIENT — Next.js 14 App Router (browser)               │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  02  APPLICATION — Process 1 (Node 20)                      │
│      Next.js SSR + Server Actions + tRPC + Lucia + Drizzle  │
└────────────────────────────┬────────────────────────────────┘
                             │ pg-boss enqueue
┌────────────────────────────▼────────────────────────────────┐
│  03  WORKERS — Process 2 (Node 20, pm2-managed)             │
│      Puppeteer · pg-boss runner · email · cron              │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  04  DATA — Postgres 16 (managed)                           │
│      App tables · queue · auth · search · 6 log tables      │
└─────────────────────────────────────────────────────────────┘

  EXTERNAL: Resend (email) · DO Spaces (files) · GitHub Actions (CI)
  OBSERVABILITY: Sentry · Better Stack · DO Monitoring · Axiom
```

**Two processes, one database, three external services, four observability tools.** That's the whole system.

For the full monorepo folder layout see `docs/STRUCTURE.md`.

---

## 3. Tech Stack — Locked Decisions

These are **not up for debate** during Phase 1. If a library would be a better fit for a specific module, prefer the locked choice for consistency.

### Frontend

| Concern       | Pick                                                                                                                     | Notes                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Framework     | **Next.js 14** App Router                                                                                                | Server Components by default, Client Components only when needed                                                 |
| Language      | **TypeScript strict**                                                                                                    | `noUncheckedIndexedAccess` enabled                                                                               |
| Components    | **shadcn/ui**                                                                                                            | Copy components into `components/ui/`; restyle to design tokens                                                  |
| Styling       | **Tailwind v3**                                                                                                          | All design tokens as CSS variables in `globals.css`                                                              |
| Fonts         | **Inter** + **IBM Plex Mono** via `next/font`                                                                            | Italic Inter replaces Instrument Serif from prototype                                                            |
| Tables        | **TanStack Table v8** + **TanStack Virtual**                                                                             | Virtualize anything > 100 rows                                                                                   |
| Drag-drop     | **dnd-kit**                                                                                                              | Pipeline kanban only                                                                                             |
| Charts        | **Tremor** + custom SVG                                                                                                  | No Recharts directly. Sparklines/funnel = hand SVG                                                               |
| Forms         | **react-hook-form** + **Zod**                                                                                            | Schemas live in `lib/schemas/` and are imported by both client + server                                          |
| Server cache  | **TanStack Query**                                                                                                       | Wrap tRPC; optimistic updates on stage moves                                                                     |
| Client state  | **React Context**                                                                                                        | Tweaks panel + sidebar collapse only. **No Zustand.**                                                            |
| RPC           | **Server Components + typed query helpers (`lib/queries/`)** for reads; **Server Actions + `tenantAction()`** for writes | tRPC removed Day 5 — redundant when Server Components do typed queries natively. ADR-011 captures the rationale. |
| Number format | `Intl.NumberFormat('en-IN')` + `formatINR()` utility                                                                     | Auto-scale lakh/crore                                                                                            |

### Backend

| Concern    | Pick                             | Notes                                                  |
| ---------- | -------------------------------- | ------------------------------------------------------ |
| Runtime    | **Node 20**                      | Both processes                                         |
| Auth       | **Lucia v3**                     | Session-based, sessions stored in Postgres             |
| ORM        | **Drizzle**                      | Migrations via `drizzle-kit`                           |
| Validation | **Zod**                          | Same schemas as frontend                               |
| Mutations  | **Next.js Server Actions**       | Default for forms                                      |
| Queries    | **tRPC procedures**              | For dashboards, search, exports                        |
| Job queue  | **pg-boss**                      | Postgres-backed, no Redis                              |
| PDF gen    | **Puppeteer** in workers process | Renders the same React component used for live preview |
| Email      | **Resend** SDK                   | Templates via `react-email`                            |

### Data

| Concern          | Pick                                     | Notes                                                     |
| ---------------- | ---------------------------------------- | --------------------------------------------------------- |
| Database         | **PostgreSQL 16**                        | DO Managed Postgres, Bangalore region                     |
| Tenant isolation | **Row-Level Security (RLS)**             | Every table has `tenant_id` + RLS policy. Non-negotiable. |
| Search           | **`pg_trgm`** + GIN indexes              | Dealer name, GSTIN, serial number                         |
| Audit            | Postgres triggers + dedicated log tables | See `docs/LOGGING.md`                                     |

### External & Ops

| Concern              | Pick                                     | Notes                                                                                                                                          |
| -------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting              | **DigitalOcean App Platform**, Bangalore | Web + workers both on DO App Platform components (BLR1 region). Web: basic-xs (buildpack). Workers: basic-xxs (custom Dockerfile per ADR-013). |
| File storage         | **DO Spaces**                            | S3-compatible, India region                                                                                                                    |
| Email send + receive | **Resend**                               | Webhooks for inbound + delivery                                                                                                                |
| CI/CD                | **GitHub Actions**                       | Auto-deploy `main` to DO App Platform                                                                                                          |
| Errors + APM         | **Sentry**                               | Frontend + both Node processes                                                                                                                 |
| Uptime               | **Better Stack**                         | Pings `/health` every 30s                                                                                                                      |
| Infra metrics        | **DO Monitoring**                        | Built-in, just enable alerts                                                                                                                   |
| App logs             | **Axiom**                                | Structured JSON from stdout                                                                                                                    |

### Explicitly NOT used in Phase 1

Redis, Meilisearch, Zustand, Auth.js, Recharts, Instrument Serif, Turborepo, Kubernetes, PostHog, Twenty CRM. All have clean migration paths if Phase 2 needs them.

---

## 4. Data Model — Schema Rules

### Multi-tenancy is enforced at the database layer

Every table that holds tenant-owned data **must**:

1. Have a `tenant_id UUID NOT NULL` column with FK to `tenants(id)`.
2. Have a Row-Level Security policy:
   ```sql
   ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON <table>
     USING (tenant_id = current_setting('app.tenant_id')::uuid);
   ```
3. Have an index on `tenant_id` (composite indexes start with `tenant_id`).
4. The application sets `app.tenant_id` per request via Drizzle's `execute(sql\`SET LOCAL app.tenant_id = ...\`)` inside a transaction wrapper.

**This applies to log tables too.** A tenant admin must never see another tenant's audit log.

### Standard columns on every entity

```ts
id: uuid().primaryKey().defaultRandom(),
tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
createdAt: timestamp('created_at').notNull().defaultNow(),
createdBy: uuid('created_by').references(() => users.id),
updatedAt: timestamp('updated_at').notNull().defaultNow(),
updatedBy: uuid('updated_by').references(() => users.id),
```

Soft delete only on entities with strong references (Dealer, Product). Use `deleted_at` timestamp; queries filter via Drizzle helper.

### Document numbering (BRD §4.3)

Per-tenant, per-fiscal-year sequential counters with prefixes:

- Quotation: `QT-2026-0001`
- Proforma Invoice: `PI-2026-0001`
- Order: `ORD-2026-0001`
- Tax Invoice: `INV-2026-0001`
- Payment: `PAY-2026-0001`
- Dispatch: `DSP-2026-0001`

Counter resets on **April 1** (Indian fiscal year). Implementation: a `document_counters` table with `(tenant_id, doc_type, fiscal_year, last_value)` and a Postgres function that atomically increments. Don't use sequences — they're not tenant-scoped.

### Inventory serial uniqueness

`UNIQUE (tenant_id, serial_number)` — serial uniqueness is per-tenant, not global.

For the full logging surface (8 streams, schemas, retention) see `docs/LOGGING.md`.

---

## 5. GST & Multi-Party Document Logic

This is the highest-risk area for bugs. Follow these rules exactly (BRD §4).

### Three-party model

Every document tracks three distinct parties:

1. **Bill From** — the tenant (Distributor). Pulled from tenant settings.
2. **Bill To** — the Dealer who pays. Selected on the deal.
3. **Ship To** — consignee (may equal Bill To, or be a different end customer).

### State format — 2-letter ISO 3166-2:IN codes

Every state value — `tenant_settings.state` / `address_state`, `dealers.state`, and the `tenant_state_at_issue` / `place_of_supply` columns on quotations / PIs / orders — is stored as a **2-letter ISO 3166-2:IN code** (`MH`, `KA`, `TN`, …), never a full name. The canonical map + helpers (`getStateName`, `normalizeStateInput`, `formatStateLabel`, `indianStateCodeSchema`) live in `@dealerlink/schemas/states`; UI dropdowns show the full name and submit the code; PDFs/displays render the full name via `getStateName`/`formatStateLabel`. DB CHECK constraints enforce `^[A-Z]{2}$`. Never hardcode a state string. (DEV.33, closed Stage C Day C.2.)

The tax engine still treats state as an **opaque string** — it only needs `tenantState !== placeOfSupply` with a consistent format on both sides; codes simply guarantee that. Example: tenant in `MH` selling to a Ship-To dealer in `KA` → `MH !== KA` → inter-state → **IGST**; same `MH`/`MH` → intra-state → **CGST + SGST**.

### Tax calculation rules — `packages/tax/`

```ts
// All tax math lives here. NEVER inline in routes.
export function calculateGST(input: {
  distributorState: IndianState;
  placeOfSupply: IndianState; // Ship-To for goods per IGST Act §10
  lineItems: LineItem[];
}): TaxBreakdown;
```

Rules:

- **Inter-state** (distributor state ≠ place of supply): apply **IGST** at full GST rate.
- **Intra-state** (same state): apply **CGST + SGST**, each at half the GST rate.
- **Place of supply drives tax — and place of supply is the SHIP-TO location for goods** (IGST Act 2017 §10 — delivery location). Bill-To state does **not** affect tax classification.
  - **Quotations** have a single dealer and no separate Ship-To, so `place_of_supply` = `dealer.state` (the dealer is effectively both Bill-To and Ship-To).
  - **PIs, Orders, Tax Invoices, Dispatch Notes** carry a distinct Ship-To: `place_of_supply` = the **Ship-To dealer's state**. When Ship-To differs from Bill-To and sits in another state, the document can be classified differently (IGST vs CGST/SGST) from its originating quotation.
  - The rationale is recorded in **ADR-012** (`DECISIONS.md`); the original "Bill-To only" simplification was a single-dealer artefact corrected on Day 11.
- **TDS on Purchase**: optional deduction at order level (e.g., 0.1%).
- **Round-off**: applied at grand total, not per line. Handle ±0.99 paise per BRD reference PO.

### When tax recalculates

- Live, on every line item change in Quotation Builder (debounce 150ms).
- On dealer change (state may change → CGST↔IGST flip).
- On **Ship-To change** when converting a quotation to a PI, or editing a PI — a new Ship-To state moves the place of supply and may flip IGST↔CGST/SGST.
- On product change (HSN/GST rate may differ).

The recalc happens in a **pure function** in `packages/tax/`. UI never duplicates this logic. Tests must cover at least: same-state, different-state, mixed GST rates in one quotation, TDS toggle, rounding edge cases.

---

## 6. Auth & Roles (BRD §2)

### Lucia setup

- Email + password only in Phase 1 (no SSO).
- Sessions stored in Postgres (`sessions` table, written by Lucia adapter).
- Argon2 for password hashing.
- Session lifetime: 30 days, with refresh on activity.
- Password policy: min 8 chars, 1 uppercase, 1 number, 1 special.
- `users.must_change_password` (Day 4) gates the login flow: when true, the
  user is forced through a password-rotation screen before reaching the rest
  of the app. Set by operator-driven provisioning + password resets
  (ADR-010). Cleared on successful rotation. Surfaced on the Lucia session
  attributes so client code can route appropriately.
  - **Implementation:** the rotation screen is `apps/web/app/(auth)/change-password/`
    and the server action is `apps/web/lib/auth/change-password.ts`. The
    trapdoor is enforced in `apps/web/app/(app)/layout.tsx` and
    `apps/web/app/admin/layout.tsx` — NOT in `middleware.ts`, because the Edge
    runtime cannot resolve a Lucia session (DEV.68). The login action routes
    flagged users to `/change-password` on sign-in. The §6 password policy
    lives as a shared Zod schema in `apps/web/lib/auth/password-policy.ts`.
    Closed by Stage C Day C.1 (DEV.56).

### Four fixed roles

| Role         | Can                                                                  | Cannot                                                   |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------- |
| **Admin**    | Everything within tenant                                             | (no restrictions within own tenant)                      |
| **Sales**    | Manage dealers, leads, quotations, PIs, orders. Read inventory.      | Create users, modify payments, edit dispatch records     |
| **Accounts** | View orders, manage payments, generate invoices, financial reports   | Edit dealer master, modify pipeline stages, dispatch ops |
| **Dispatch** | View confirmed orders, manage inventory, record serials, generate LR | Edit pricing, payments, dealer data                      |

Permission enforcement: **at the tRPC procedure / Server Action level**, not just in the UI. Use a `requireRole(role[])` middleware. Hiding a button is not security — every mutation is checked server-side.

### Server Action wrapper — `tenantAction` and `operatorAction`

Every tenant-facing Server Action must go through `tenantAction()` from `apps/web/lib/actions/wrap.ts`. The wrapper guarantees, in order:

1. The caller is authenticated and has one of `allowedRoles` (or is an operator currently impersonating a tenant — see `docs/WORKFLOWS.md`).
2. Input is Zod-validated.
3. The action runs inside `withTenant(tenantId, …, { userId, ip, userAgent, readOnly })`, so RLS, the audit trigger, and the read-only enforcement all see the right context.
4. Errors are normalized to `{ ok: false, error: { code, message } }` — never throw across the network boundary.

```ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { dealers } from '@dealerlink/db';
import { tenantAction } from '@/lib/actions/wrap';

export const updateDealerName = tenantAction(
  ['admin', 'sales'],
  z.object({ id: z.string().uuid(), name: z.string().min(2) }),
  async ({ tx, input, auth }) => {
    await tx.update(dealers).set({ name: input.name }).where(eq(dealers.id, input.id));
    return { id: input.id };
  },
);
```

`operatorAction()` is the same pattern for platform-operator routes (no `tenantId` GUC; only `userId`).

### Zod at the Lucia boundary

Per ADR-009, `getUserAttributes` parses the Drizzle row through Zod and throws on drift. Adding a column to `users` requires updating the schema in `lib/auth/lucia.ts`; forgetting causes a loud, traceable error at session validation rather than silent `undefined` values downstream.

---

## 7. What NOT to Do

A short list of mistakes that would meaningfully hurt the project:

- ❌ Don't use Twenty CRM, ERPNext, or any other CRM platform as a foundation. The custom design demands a from-scratch build.
- ❌ Don't add Redis. pg-boss handles the queue.
- ❌ Don't add Zustand. React Context is enough.
- ❌ Don't use Recharts. Tremor + custom SVG.
- ❌ Don't use Instrument Serif. Italic Inter at the same size.
- ❌ Don't skip RLS. Every table, every log table, every time.
- ❌ Don't put tax math anywhere except `packages/tax/`.
- ❌ Don't store email bodies as TEXT columns longer than 1MB — move to Spaces if needed.
- ❌ Don't use Postgres sequences for document numbers — they aren't tenant-scoped.
- ❌ Don't write to `audit_log` from application code — use Postgres triggers.
- ❌ Don't render PDFs on the web process — always queue to the workers process (see ADR-013 for the queue-isolation contract).
- ❌ Don't use HTML `<form>` tags inside React components in a way that conflicts with Server Actions' expectations — follow Next.js patterns.
- ❌ Don't add new external services without first checking if Postgres can do the job.

---

## 8. Locked Platform Decisions

The 7 platform-level decisions below were resolved before Stage 2 began. They are **locked** — do not revisit during the build. The reasoning behind each is captured in `DECISIONS.md` for future reference.

| #   | Decision                       | Locked answer                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tenant routing strategy**    | **Subdomain.** Each tenant accesses their workspace at `<tenant-slug>.dealerlink.in`. Wildcard DNS + wildcard SSL cert. Cookies scoped to `.dealerlink.in` for cross-subdomain session sharing where needed.                                                                                        |
| 2   | **Tenant provisioning flow**   | **Internal admin app** at `admin.dealerlink.in`. Dealerlink operators authenticate with a separate role (`operator`, one tier above tenant `admin`), fill a provisioning form, and the system creates the tenant + initial Admin user + sends them a credentials email. No SQL or CLI provisioning. |
| 3   | **Inbound email subdomain**    | **`mail.dealerlink.in`.** Each tenant receives a unique inbound address: `<tenant-slug>+<random-token>@mail.dealerlink.in`. MX, SPF, DKIM, DMARC point to Resend.                                                                                                                                   |
| 4   | **Fiscal year**                | **Hardcoded to Indian fiscal year (Apr 1 – Mar 31)** for Phase 1. Schema includes `tenant_settings.fiscal_year_start` (default `4` = April) so per-tenant fiscal year is a config flip in Phase 2 — no migration needed.                                                                            |
| 5   | **Currency & locale**          | **INR + en-IN locked** for Phase 1. Schema has `tenant_settings.default_currency` (default `'INR'`) and `tenant_settings.default_locale` (default `'en-IN'`) ready, but the application reads them as constants for now. Multi-currency is a Phase 2 unlock.                                        |
| 6   | **Default document templates** | **Dealerlink ships default Quotation, PI, and Tax Invoice templates.** Layout is fixed (designed once, used by all tenants). Tenant-specific overrides: logo, header copy, T&C text, footer (bank details). Tenants cannot edit the document layout itself in Phase 1.                              |
| 7   | **Branding upload spec**       | Max **1 MB**. Accepted formats: **PNG, SVG, JPG**. Recommended dimensions: **400×120 px** (header use). Renders in: sidebar, login screen, PDF letterhead, email header. Stored in DO Spaces; URL in `tenant_settings.logo_url`.                                                                    |

### Tenant Configuration Surface

Every tenant-specific value lives in `tenants` and `tenant_settings`. **No tenant-specific values in code, env vars, or config files.** This is the contract that makes Dealerlink multi-tenant by design.

| Configurable per tenant              | Stored in                                    | Used by                      |
| ------------------------------------ | -------------------------------------------- | ---------------------------- |
| Legal business name                  | `tenants.legal_name`                         | Invoices, headers, emails    |
| Display name / brand                 | `tenants.display_name`                       | UI sidebar, app title        |
| Tenant slug (subdomain)              | `tenants.slug`                               | Routing, inbound email       |
| GSTIN                                | `tenant_settings.gstin`                      | All tax documents            |
| PAN                                  | `tenant_settings.pan`                        | Auto-derived but overridable |
| Registered address                   | `tenant_settings.address_*`                  | Bill-From on documents       |
| State (for tax calc)                 | `tenant_settings.state`                      | CGST+SGST vs IGST decision   |
| Bank details (account, IFSC, branch) | `tenant_settings.bank_*`                     | Invoice footer               |
| Logo (URL in Spaces)                 | `tenant_settings.logo_url`                   | Sidebar, PDFs, emails        |
| Primary brand color                  | `tenant_settings.primary_color`              | Optional UI accent override  |
| Document prefixes                    | `tenant_settings.doc_prefixes` (JSONB)       | `QT-`, `PI-`, `INV-`, etc.   |
| Fiscal year start month              | `tenant_settings.fiscal_year_start`          | Document counter resets      |
| Default currency                     | `tenant_settings.default_currency`           | Phase 2 multi-currency hook  |
| Default locale                       | `tenant_settings.default_locale`             | Number/date formatting       |
| Default quotation validity (days)    | `tenant_settings.default_quote_validity`     | Quotation Builder default    |
| Default T&C text                     | `tenant_settings.default_terms`              | Quotation Builder default    |
| Default credit period (days)         | `tenant_settings.default_credit_period`      | Order workflow               |
| Low-stock threshold                  | `tenant_settings.low_stock_threshold`        | Inventory alerts             |
| Inbound email token                  | `tenant_settings.inbound_email_token`        | BCC-to-CRM matching          |
| Retired inbound tokens (grace)       | `inbound_token_history` (per-tenant)         | 7-day Resend-webhook grace   |
| Notification preferences             | `tenant_settings.notification_prefs` (JSONB) | Notification engine          |

---

## 9. When You're Stuck

In priority order:

1. **Re-read the relevant BRD module section.** The answer is probably there.
2. **Open the design prototype** for the screen you're working on. Match it.
3. **Check this file** for the locked decision.
4. **Ask the user.** Don't invent.

Never invent business rules. Tax calculations, stage transitions, role permissions, and document numbering are specified — follow them exactly.

---

_Last updated: May 2026 · Architecture v4 · Phase 1 spec_
