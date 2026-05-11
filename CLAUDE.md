# CLAUDE.md — Dealerlink Implementation Guide

> **For Claude Code:** This is your authoritative reference for building Dealerlink. Read this file end-to-end before writing any code. When the BRD and this file conflict, this file wins. When in doubt about a decision, the answer is in here — don't ask, look.

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

---

## 3. Tech Stack — Locked Decisions

These are **not up for debate** during Phase 1. If a library would be a better fit for a specific module, prefer the locked choice for consistency.

### Frontend

| Concern       | Pick                                                 | Notes                                                                   |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Framework     | **Next.js 14** App Router                            | Server Components by default, Client Components only when needed        |
| Language      | **TypeScript strict**                                | `noUncheckedIndexedAccess` enabled                                      |
| Components    | **shadcn/ui**                                        | Copy components into `components/ui/`; restyle to design tokens         |
| Styling       | **Tailwind v3**                                      | All design tokens as CSS variables in `globals.css`                     |
| Fonts         | **Inter** + **IBM Plex Mono** via `next/font`        | Italic Inter replaces Instrument Serif from prototype                   |
| Tables        | **TanStack Table v8** + **TanStack Virtual**         | Virtualize anything > 100 rows                                          |
| Drag-drop     | **dnd-kit**                                          | Pipeline kanban only                                                    |
| Charts        | **Tremor** + custom SVG                              | No Recharts directly. Sparklines/funnel = hand SVG                      |
| Forms         | **react-hook-form** + **Zod**                        | Schemas live in `lib/schemas/` and are imported by both client + server |
| Server cache  | **TanStack Query**                                   | Wrap tRPC; optimistic updates on stage moves                            |
| Client state  | **React Context**                                    | Tweaks panel + sidebar collapse only. **No Zustand.**                   |
| RPC           | **tRPC**                                             | For queries; mutations should prefer Server Actions                     |
| Number format | `Intl.NumberFormat('en-IN')` + `formatINR()` utility | Auto-scale lakh/crore                                                   |

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
| Audit            | Postgres triggers + dedicated log tables | See §7                                                    |

### External & Ops

| Concern              | Pick                                     | Notes                                                                              |
| -------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Hosting              | **DigitalOcean App Platform**, Bangalore | Web app on App Platform; workers on a small Droplet OR same App Platform component |
| File storage         | **DO Spaces**                            | S3-compatible, India region                                                        |
| Email send + receive | **Resend**                               | Webhooks for inbound + delivery                                                    |
| CI/CD                | **GitHub Actions**                       | Auto-deploy `main` to DO App Platform                                              |
| Errors + APM         | **Sentry**                               | Frontend + both Node processes                                                     |
| Uptime               | **Better Stack**                         | Pings `/health` every 30s                                                          |
| Infra metrics        | **DO Monitoring**                        | Built-in, just enable alerts                                                       |
| App logs             | **Axiom**                                | Structured JSON from stdout                                                        |

### Explicitly NOT used in Phase 1

Redis, Meilisearch, Zustand, Auth.js, Recharts, Instrument Serif, Turborepo, Kubernetes, PostHog, Twenty CRM. All have clean migration paths if Phase 2 needs them.

---

## 4. Project Structure

Use **pnpm workspaces** (no Turborepo until builds exceed 2 minutes).

```
dealerlink/
├── CLAUDE.md                       ← this file
├── README.md
├── package.json                    ← workspace root
├── pnpm-workspace.yaml
├── .github/workflows/
│   ├── ci.yml                      ← lint + typecheck + test on PR
│   └── deploy.yml                  ← deploy on push to main
├── apps/
│   ├── web/                        ← Next.js app (Process 1)
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (app)/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── pipeline/
│   │   │   │   ├── dealers/
│   │   │   │   ├── catalog/
│   │   │   │   ├── inventory/
│   │   │   │   ├── quotations/
│   │   │   │   ├── orders/
│   │   │   │   ├── payments/
│   │   │   │   ├── dispatch/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   ├── api/
│   │   │   │   ├── trpc/[trpc]/
│   │   │   │   ├── health/         ← used by Better Stack
│   │   │   │   └── webhooks/
│   │   │   │       ├── resend-inbound/
│   │   │   │       └── resend-delivery/
│   │   │   └── globals.css         ← design tokens
│   │   ├── components/
│   │   │   ├── ui/                 ← shadcn primitives, restyled
│   │   │   ├── shell/              ← Sidebar, Topbar, Shell
│   │   │   ├── kpi/
│   │   │   ├── tables/
│   │   │   ├── charts/             ← custom SVG sparkline, funnel, aging
│   │   │   ├── forms/
│   │   │   └── pdf/                ← React components rendered to PDF
│   │   ├── lib/
│   │   │   ├── auth/               ← Lucia config + middleware
│   │   │   ├── trpc/
│   │   │   ├── actions/            ← Server Actions
│   │   │   ├── audit/              ← logging hooks
│   │   │   ├── format/             ← formatINR, formatGSTIN
│   │   │   └── tenant/             ← tenant context helpers
│   │   └── server/
│   │       ├── routers/            ← tRPC routers
│   │       └── modules/            ← business logic per BRD module
│   └── workers/                    ← Puppeteer + pg-boss (Process 2)
│       ├── src/
│       │   ├── index.ts            ← pg-boss bootstrap
│       │   ├── jobs/
│       │   │   ├── render-pdf.ts
│       │   │   ├── send-email.ts
│       │   │   ├── parse-inbound.ts
│       │   │   └── nightly/
│       │   │       ├── low-stock-check.ts
│       │   │       ├── overdue-payments.ts
│       │   │       └── quote-expiry.ts
│       │   └── pdf/                ← Puppeteer launcher + templates
│       └── ecosystem.config.js     ← pm2 config
├── packages/
│   ├── db/                         ← Drizzle schema + migrations
│   │   ├── schema/
│   │   │   ├── tenant.ts
│   │   │   ├── user.ts
│   │   │   ├── dealer.ts
│   │   │   ├── product.ts
│   │   │   ├── inventory.ts
│   │   │   ├── deal.ts
│   │   │   ├── quotation.ts
│   │   │   ├── order.ts
│   │   │   ├── payment.ts
│   │   │   ├── dispatch.ts
│   │   │   ├── email.ts
│   │   │   └── logs/               ← all 6 log tables
│   │   │       ├── audit-log.ts
│   │   │       ├── auth-events.ts
│   │   │       ├── email-delivery.ts
│   │   │       ├── access-log.ts
│   │   │       └── document-log.ts
│   │   ├── migrations/
│   │   ├── seeds/                  ← per BRD §7
│   │   └── rls/                    ← RLS policy SQL
│   ├── schemas/                    ← Zod schemas, shared client + server
│   ├── tax/                        ← GST calculation (CGST/SGST/IGST)
│   └── design-tokens/              ← CSS vars + Tailwind config
└── scripts/
    ├── setup-db.sh
    ├── seed.ts
    └── deploy.sh
```

---

## 5. Design System — The Non-Negotiables

The design prototype (`Dealerlink.html`) is the **visual source of truth**. Match it pixel-perfectly. Aesthetic direction: _quiet precision_ — dense, editorial, instrument-like.

### Tokens (`apps/web/app/globals.css`)

```css
:root {
  --ink: #0b0f1a;
  --ink-2: #1a2030;
  --paper: #f7f7f4;
  --paper-2: #efefea;
  --line: #e3e3dc;
  --line-2: #d5d5cc;
  --mute: #6b7280;
  --mute-2: #94928a;
  --accent: #3730a3; /* deep indigo, primary action */
  --accent-2: #4f46e5;
  --accent-soft: #eef2ff;
  --emerald: #047857;
  --amber: #b45309;
  --rose: #b91c1c;
  --tile: #fbfbf8;
}
```

### Typography rules

- **Inter** for all UI text. Italic for editorial moments (greetings, artboard labels, layer summaries).
- **IBM Plex Mono** for _every_ number, count, currency, ID, timestamp, GSTIN. Always with `font-feature-settings: "tnum", "zero"` (tabular figures).
- Currency display: `₹3.42 Cr`, `₹47.80 L`, `₹14,82,000`. Use `formatINR()` from `lib/format/`. Auto-scale to lakh/crore for values ≥ 1 lakh.
- Editorial italic only for: dashboard greeting, artboard titles, layer summaries, "vs last period" subtitles. Don't sprinkle.

### Component principles

- **Hairline borders, not shadows.** `box-shadow: inset 0 0 0 1px var(--line)` for cards. Drop shadows only for elevated paper (PDF preview pane).
- **6px corner radius** on cards, 4px on chips, 3px on kbd/badges.
- **56px row height** in dense tables. Don't go below 48px.
- **232px sidebar width.** Don't change.
- **Ink (`#0B0F1A`) is the primary action color**, accent (`#3730A3`) is for forward/destructive emphasis. The design avoids primary indigo buttons except for high-stakes actions like "New deal" or "Send quotation".
- **Status dots before chip text:** `<span class="dot s-em"/> Active`. Six states: emerald (em), amber (am), rose (ro), indigo (in), mute (mu), ink.
- **Sparklines and small charts:** hand-rolled SVG. See `Dashboard.KPI` component in prototype.
- **Tremor** for the dashboard's larger funnel + aging charts. Restyle defaults to use design tokens.

### Layouts to copy directly

The 12 screens in the prototype are the spec. When implementing each route, **open the corresponding section of `Dealerlink.html` or `screens-extra.jsx` first**. The class names use Tailwind, so most translate 1:1.

---

## 6. Data Model — Schema Rules

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

---

## 7. Logging Surface — All 8 Streams

These are mandatory. Each has its own table (or external system) and writer pattern.

| #   | Log                                       | Storage  | Written by                                               | Retention                   |
| --- | ----------------------------------------- | -------- | -------------------------------------------------------- | --------------------------- |
| 1   | **Domain audit** (`audit_log`)            | Postgres | Postgres triggers on Order, Payment, Dispatch, Inventory | Forever                     |
| 2   | **Email content** (`email_log`)           | Postgres | Outbound from app, inbound from Resend webhook           | Forever                     |
| 3   | **Auth events** (`auth_events`)           | Postgres | Lucia hooks: login, logout, failed pwd, pwd change       | 1 year                      |
| 4   | **Email delivery** (`email_delivery_log`) | Postgres | Resend webhook handler                                   | 90 days                     |
| 5   | **Sensitive access** (`access_log`)       | Postgres | Next.js middleware on dealer/payment/export routes       | 1 year                      |
| 6   | **Document generation** (`document_log`)  | Postgres | Worker writes after each PDF render                      | Forever (GST audit)         |
| 7   | **App stdout/stderr**                     | Axiom    | `pino` logger piped from both Node processes             | 30 days                     |
| 8   | **Errors**                                | Sentry   | Sentry SDK in both processes                             | 30–90 days (Sentry default) |

### `audit_log` schema

```ts
export const auditLog = pgTable('audit_log', {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(), // 'order' | 'payment' | ...
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(), // 'create' | 'update' | 'delete'
  before: jsonb('before'), // null on create
  after: jsonb('after'), // null on delete
  changedBy: uuid('changed_by'),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
  // ip, user agent for traceability
  ip: text('ip'),
  userAgent: text('user_agent'),
});
```

Implement via Postgres triggers — application code does not write directly. This guarantees no audit gaps if a developer forgets to log.

### `access_log` write pattern

A Next.js middleware at `app/(app)/dealers/[id]/middleware.ts` (or equivalent route handler logic) writes a row when:

- A dealer detail page is viewed
- A payment record is viewed
- A CSV/Excel export is downloaded
- A dispatch is opened

Don't log every page hit — only sensitive surfaces.

### `/health` endpoint contract

```ts
// app/api/health/route.ts
GET /api/health → 200 OK with JSON:
{
  "status": "ok" | "degraded" | "down",
  "checks": {
    "db": { "ok": true, "latencyMs": 12 },
    "queue": { "ok": true, "depth": 3, "oldestJobAgeSeconds": 8 },
    "worker": { "ok": true, "lastHeartbeatSeconds": 4 },
    "inboundEmail": { "ok": true, "lastReceivedSeconds": 1200 }
  },
  "version": "<git-sha>",
  "timestamp": "2026-05-07T..."
}
```

Worker writes a heartbeat to a `worker_heartbeat` row every 30s. Health endpoint checks the timestamp.

---

## 8. GST & Multi-Party Document Logic

This is the highest-risk area for bugs. Follow these rules exactly (BRD §4).

### Three-party model

Every document tracks three distinct parties:

1. **Bill From** — the tenant (Distributor). Pulled from tenant settings.
2. **Bill To** — the Dealer who pays. Selected on the deal.
3. **Ship To** — consignee (may equal Bill To, or be a different end customer).

### Tax calculation rules — `packages/tax/`

```ts
// All tax math lives here. NEVER inline in routes.
export function calculateGST(input: {
  distributorState: IndianState;
  dealerState: IndianState; // Bill To, NOT Ship To
  lineItems: LineItem[];
}): TaxBreakdown;
```

Rules:

- **Inter-state** (distributor state ≠ dealer state): apply **IGST** at full GST rate.
- **Intra-state** (same state): apply **CGST + SGST**, each at half the GST rate.
- **Ship To state does NOT affect tax.** Only Bill To matters.
- **TDS on Purchase**: optional deduction at order level (e.g., 0.1%).
- **Round-off**: applied at grand total, not per line. Handle ±0.99 paise per BRD reference PO.

### When tax recalculates

- Live, on every line item change in Quotation Builder (debounce 150ms).
- On dealer change (state may change → CGST↔IGST flip).
- On product change (HSN/GST rate may differ).

The recalc happens in a **pure function** in `packages/tax/`. UI never duplicates this logic. Tests must cover at least: same-state, different-state, mixed GST rates in one quotation, TDS toggle, rounding edge cases.

---

## 9. PDF Pipeline

### Single React component, two render paths

The same `<QuotationDocument />` component (under `apps/web/components/pdf/`) is used for:

1. **Live preview** in the Quotation Builder — rendered as React in an iframe at A4 dimensions (380px scaled width).
2. **Final PDF** — rendered by Puppeteer in the worker process.

This guarantees preview ≡ final, eliminating the entire class of "looks different on PDF" bugs.

### Worker render flow

```
Server Action → enqueue 'render-pdf' job → pg-boss → workers/jobs/render-pdf.ts
  → Puppeteer launches Chromium (warm pool of 1)
  → navigate to /internal/render/quotation/:id (auth via signed token)
  → page.pdf({ format: 'A4', printBackground: true })
  → upload to DO Spaces
  → write document_log row
  → mark job complete
```

### Puppeteer constraints

- Concurrency: **1 render at a time** in Phase 1 (`pg-boss` queue concurrency = 1 for the `render-pdf` channel).
- Restart Chromium every **100 renders** to contain memory leaks.
- Maximum render time: 30 seconds. Fail and retry up to 3 times.
- Always launch with `--no-sandbox --disable-dev-shm-usage` flags for Droplet compatibility.

---

## 10. Auth & Roles (BRD §2)

### Lucia setup

- Email + password only in Phase 1 (no SSO).
- Sessions stored in Postgres (`sessions` table, written by Lucia adapter).
- Argon2 for password hashing.
- Session lifetime: 30 days, with refresh on activity.
- Password policy: min 8 chars, 1 uppercase, 1 number, 1 special.

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

1. The caller is authenticated and has one of `allowedRoles` (or is an operator currently impersonating a tenant — see §11).
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

## 11. Critical Workflows to Get Right

### Stage progression (BRD §3.4)

The 9 pipeline stages have specific transition rules. Some are automatic, some manual:

| From → To              | Trigger                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| 3 (Quotation Sent)     | Auto-stamped when quotation email is sent successfully (Resend delivery webhook) |
| 6 (Payment Pending)    | Auto on order confirmation                                                       |
| 7 (Ready for Dispatch) | Auto when payment status = Paid (or per credit terms)                            |
| 8 (Dispatched)         | Auto when dispatch record is created with LR                                     |
| 9 (Closed)             | Auto when delivery is confirmed; or manual with Lost reason                      |

**High-risk dealers** (Risk Level = High) cannot move past stage 4 (Negotiation) without an Admin override. Enforce server-side.

### Inventory reservation flow

```
Order confirmed
  → reserve N units from In Stock pool, FIFO by procurement date
  → status: In Stock → Reserved
  → Dealer + Order linked on inventory item
Order cancelled before dispatch
  → status: Reserved → In Stock (only allowed transition that's "backward")
Dispatch created
  → picked serials must match reserved quantity exactly (block on mismatch)
  → status: Reserved → Dispatched (atomically with dispatch record)
Delivery confirmed
  → status: Dispatched → Delivered
```

All transitions are guarded by Postgres row locks (`SELECT ... FOR UPDATE`) inside transactions. No optimistic concurrency for inventory — the cost of a wrongly-allocated panel is too high.

### Inbound email logging

Distributors BCC a unique tenant email address (e.g., `<tenant-slug>+<token>@mail.dealerlink.in`). Resend Inbound webhook posts the parsed email to `/api/webhooks/resend-inbound`. Handler:

1. Verify Resend signature.
2. Match tenant by recipient address suffix.
3. Match dealer by sender domain or sender email.
4. Insert into `email_log` with direction = 'inbound'.
5. If no dealer match, insert with `dealer_id = null` and flag for admin review.

### Operator impersonation flow

Per ADR-002 operators provision tenants and occasionally need to look inside one to debug. Day 3 ships a controlled, read-only impersonation flow:

1. Operator visits `/admin/tenants/[id]` and clicks **Enter tenant workspace**.
2. The Server Action sets the `dealerlink_impersonation` cookie (httpOnly, 1-hour TTL) to the tenant id, records an `access_log` row with `action='operator_impersonation_view'`, and redirects to the tenant workspace (`?tenant=<slug>` in dev, `<slug>.dealerlink.in` in prod).
3. The `(app)` layout reads the cookie and renders an **ImpersonationBanner** at the top of every page so the operator never forgets the context.
4. Every `tenantAction` invocation while the cookie is present runs `withTenant(tenantId, fn, { readOnly: true })`. The audit trigger raises `42501 'read-only context'` on any INSERT/UPDATE/DELETE.
5. Clicking **Exit impersonation** in the banner clears the cookie and sends the operator back to `/admin`.

Tenant users never see the banner and never run in read-only mode — the cookie is set only by `enterImpersonation()` which requires the `operator` role.

---

## 12. Testing Approach

| Layer            | Tool                                 | What to test                                                                                 |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Unit             | **Vitest**                           | Tax math (`packages/tax/`), `formatINR`, GSTIN validation, Zod schemas                       |
| Integration      | **Vitest + testcontainers-postgres** | Database operations against a real Postgres with RLS active                                  |
| E2E              | **Playwright**                       | Login → create deal → generate quote → confirm order → dispatch (one happy path per persona) |
| Component visual | Optional, **Chromatic** Phase 2      | —                                                                                            |

**Coverage targets:** 90%+ on `packages/tax/`, 70%+ on Server Actions, smoke E2E for each role's primary workflow.

**RLS test pattern** is mandatory: for every table, write a test that asserts a query as Tenant A cannot see Tenant B's data. This catches the entire class of multi-tenant data leak bugs.

---

## 13. Sample Data (BRD §7)

Seed scripts live in `packages/db/seeds/`. Required volumes:

- 2 tenants for development and isolation testing:
  - **`Demo Solar Distributors`** (primary seed tenant, based in Maharashtra) — exercises intra-state CGST+SGST tax paths
  - **`Sample Industrial Co`** (secondary seed tenant, based in Karnataka) — exercises a different vertical's custom fields and provides cross-tenant RLS isolation testing
- 8 users (4 per tenant): 1 Admin + 2 Sales + 1 Accounts + 1 Dispatch
- 3 manufacturers: Premier Energies, Adani Solar, Vikram Solar
- 20 product SKUs (real wattages 400W–650W, TOPCon/Bifacial/Mono, real HSN codes)
- 20 dealers across MH, AS, KA, TN, GJ, UP, RJ — varied Type/Category/Risk
- ~500 inventory items with serial numbers
- 30 deals across all 9 pipeline stages
- 15 quotations (Draft/Sent/Accepted)
- 20 orders with mixed payment + dispatch status
- 30 payments
- 10 completed dispatches
- 50 email log entries

Use **Faker** for names/addresses. Use **real HSN codes** and **real GST rates** (5%, 12%, 18%, 28%) to ensure tax math demos work. The primary seed tenant (Demo Solar Distributors) is in **Maharashtra** — make sure some of its dealers are in MH (intra-state, CGST+SGST) and some are out of state (IGST) for demo coverage of both tax paths. The secondary seed tenant (Sample Industrial Co) is in a different state (Karnataka) to exercise cross-tenant isolation tests. **Both seed tenants are illustrative — neither represents a real customer; real tenants are onboarded through the standard provisioning flow.**

---

## 14. Deployment

### Local dev

```bash
pnpm install
pnpm db:up            # docker-compose with postgres
pnpm db:migrate
pnpm db:seed
pnpm dev              # runs apps/web
pnpm dev:workers      # in another terminal
```

### Production (DO App Platform)

- `apps/web` → DO App Platform service (1 GB / 1 vCPU initially)
- `apps/workers` → second component on same App Platform OR separate $6 Droplet with pm2
- Postgres → DO Managed Postgres ($15 tier)
- Migrations run automatically on deploy via `predeploy` hook
- Environment variables managed in DO dashboard; never commit `.env` files

### Required env vars

```
DATABASE_URL=
DATABASE_DIRECT_URL=          # for migrations (bypass connection pool)
SESSION_SECRET=
RESEND_API_KEY=
RESEND_INBOUND_WEBHOOK_SECRET=
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_BUCKET=
DO_SPACES_REGION=blr1
SENTRY_DSN=
AXIOM_TOKEN=
AXIOM_DATASET=dealerlink
NEXT_PUBLIC_APP_URL=
```

---

## 15. What NOT to Do

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
- ❌ Don't render PDFs on the web process — always queue to the workers process.
- ❌ Don't use HTML `<form>` tags inside React components in a way that conflicts with Server Actions' expectations — follow Next.js patterns.
- ❌ Don't add new external services without first checking if Postgres can do the job.

---

## 16. Locked Platform Decisions

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
| Notification preferences             | `tenant_settings.notification_prefs` (JSONB) | Notification engine          |

---

## 17. Implementation Order (Suggested 3.5-Week Plan)

### Week 1 — Foundation

- Day 1: Repo setup, design tokens, font loading, `globals.css`, base layout (Sidebar + Topbar + Shell)
- Day 2: Drizzle schema for tenant, user, role + Lucia auth + login screen (Aurora theme)
- Day 3: RLS policies, tenant middleware, audit log triggers, seed scripts skeleton
- Day 4: Dealer Master CRUD (list + detail + create/edit) — first real module, sets the pattern
- Day 5: Product Catalog + Inventory schema and basic list views

### Week 2 — Core Operations

- Day 6: Inventory bulk procurement, serial entry, status transitions
- Day 7: Sales Pipeline — 9-stage kanban with dnd-kit
- Day 8: Quotation Builder UI + line items
- Day 9: GST calculation in `packages/tax/` + live preview integration
- Day 10: PDF rendering pipeline + Puppeteer worker setup

### Week 3 — Order Lifecycle

- Day 11: PI generation, Order creation from accepted quote
- Day 12: Payment tracking, status transitions
- Day 13: Dispatch flow — pick serials, generate LR, tax invoice
- Day 14: Email log, Resend integration (outbound + inbound webhooks)
- Day 15: Reports (Pipeline Health, Inventory Status, Payment Outstanding, GST Summary)

### Half Week 4 — Polish & Ship

- Day 16: Settings, user management, notifications
- Day 17: Observability wiring (Sentry, Better Stack, Axiom, /health)
- Day 18: E2E tests for primary workflows, deploy to staging

This is aggressive. Cut features, not quality, if behind schedule. **Inventory and GST are non-negotiable.** Reports can ship as MVP.

---

## 18. When You're Stuck

In priority order:

1. **Re-read the relevant BRD module section.** The answer is probably there.
2. **Open the design prototype** for the screen you're working on. Match it.
3. **Check this file** for the locked decision.
4. **Ask the user.** Don't invent.

Never invent business rules. Tax calculations, stage transitions, role permissions, and document numbering are specified — follow them exactly.

---

## 19. Engineering Standards & Definition of Done

This section closes the practical gaps between "code that runs" and "code that ships". Treat it as a checklist, not background reading.

### 19.1 Coding Standards

**Naming**

- **Files:** `kebab-case.ts` for everything (components, modules, utilities). Exception: Next.js convention files (`page.tsx`, `layout.tsx`, `route.ts`) follow Next.js rules.
- **Components:** `PascalCase` for component names, `kebab-case` for filenames. Component `<DealerTable />` lives in `dealer-table.tsx`.
- **Variables / functions:** `camelCase`. Booleans prefixed with `is`, `has`, `can`, `should`.
- **Constants:** `SCREAMING_SNAKE_CASE` only for true module-level constants. Inline values stay camelCase.
- **Types & interfaces:** `PascalCase`. Prefer `type` over `interface` unless declaration merging is needed. **No `I` prefix.**
- **Database:** `snake_case` for table and column names. Drizzle schema uses `camelCase` in TS, mapped to `snake_case` in DB.

**File organization**

- **No barrel files** (`index.ts` re-exports) except at package public boundaries (e.g., `packages/tax/index.ts`). They break tree-shaking and slow IDE indexing.
- **One component per file.** Co-locate small helpers in the same file only if they're not used elsewhere.
- **Imports order:** (1) React/Next, (2) third-party, (3) `@/` internal, (4) relative. Use ESLint `import/order` rule with auto-fix.

**Error handling**

- **Server Actions and tRPC procedures** return discriminated union results: `{ ok: true, data } | { ok: false, error: AppError }`. Never throw across the network boundary except for genuinely unexpected errors (which Sentry catches).
- **Define `AppError` once** in `lib/errors.ts` with codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`. UI maps codes to user-facing messages.
- **Always `await` promises.** No floating promises. ESLint `no-floating-promises` enabled.
- **Catch and rethrow with context** when wrapping external SDK calls (Resend, Spaces, Puppeteer): `throw new AppError('INTERNAL', 'Failed to upload PDF', { cause: err })`.

**TypeScript**

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **No `any`.** Use `unknown` then narrow. ESLint `no-explicit-any` enabled as error.
- **No `as` casts** except for `as const` and narrowing after a runtime check (e.g., Zod parse). Never `as SomeType` to silence the compiler.
- **Zod schemas first**, types derived via `z.infer`. Don't write a TS type and a Zod schema for the same shape.

**Comments**

- Comment **why**, not **what**. The code says what.
- **JSDoc on public package exports** (`packages/tax/`, `packages/db/`, `packages/schemas/`).
- **`// TODO(yourname):`** with a note. Naked `// TODO` is banned — ESLint rule.

### 19.2 Git Workflow

**Branch naming**

- `feat/<short-slug>` — new feature
- `fix/<short-slug>` — bug fix
- `chore/<short-slug>` — tooling, deps, refactor without behavior change
- `docs/<short-slug>` — docs only
- Examples: `feat/quotation-builder`, `fix/gst-rounding`, `chore/upgrade-drizzle`

**Commit messages — Conventional Commits**

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

- **Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`
- **Scope:** the module or area, e.g., `inventory`, `tax`, `pipeline`, `auth`, `pdf`
- **Examples:**
  - `feat(quotation): add live tax recalc on dealer change`
  - `fix(tax): correct IGST rounding for sub-rupee values`
  - `chore(deps): bump drizzle-orm to 0.30`

**PR rules**

- **One PR per logical change.** No mega-PRs.
- **Squash on merge.** Final commit message is the PR title; PR title follows Conventional Commits.
- **PR description must include:** what changed, why, screenshots if UI, and a checklist (see Definition of Done below).
- **Required CI checks before merge:** lint, typecheck, tests, build. Phase 1 is solo-dev, but the bot enforces.
- **No direct commits to `main`.** Even hotfixes go through a PR.

### 19.3 Security Checklist

Apply to every feature. This is non-negotiable for a CRM that stores GSTINs, financial data, and dealer information.

**Input validation**

- ☐ Every Server Action and tRPC procedure validates input with Zod **before** any business logic.
- ☐ GSTIN format + checksum validated, not just length.
- ☐ Pincode, mobile, email validated with format-specific regex.
- ☐ Numeric inputs (amounts, quantities) bounded with min/max.

**SQL injection**

- ☐ All queries go through Drizzle's parameterized API.
- ☐ Any raw SQL (`sql\`...\``) uses Drizzle's tagged template — **never** string concatenation with user input.
- ☐ No dynamic table or column names from user input. Use an allowlist if needed.

**XSS**

- ☐ React escapes by default — never use `dangerouslySetInnerHTML` with user-derived content.
- ☐ **PDF templates** rendered by Puppeteer: same rule. Email subject lines rendered into HTML must be escaped.
- ☐ Rich text fields (notes, T&Cs) sanitized with **DOMPurify** before storage and again before render.

**CSRF**

- ☐ Next.js Server Actions are CSRF-safe by default (origin check). Don't disable.
- ☐ Webhook endpoints (Resend) verify HMAC signature before processing.

**Auth**

- ☐ Every mutation calls `requireRole([...])` before doing work.
- ☐ Session cookies: `httpOnly`, `secure`, `sameSite: 'lax'`.
- ☐ Password hashing: Argon2id with sane defaults (don't tune unless you know why).
- ☐ Failed login attempts logged to `auth_events`; rate-limited after 5 failures from same IP in 15 min.

**Rate limiting**

- ☐ Login endpoint: 5 attempts / 15 min per IP.
- ☐ `/api/health`: 60 / min per IP (it's public for monitoring, but no need to be unbounded).
- ☐ Webhook endpoints: signature verification is the gate; rate limit as defense-in-depth.
- ☐ Use a simple Postgres-backed rate limiter (`pg-boss` queue overkill for this — use a `rate_limit` table with `(key, window_start, count)`).

**Secrets**

- ☐ Never log API keys, session tokens, or passwords. Sentry, Axiom, and `console.log` all checked.
- ☐ Never commit `.env*` files. Pre-commit hook (`gitleaks`) catches accidental commits.
- ☐ Production secrets only in DO App Platform env vars; never in source.
- ☐ Rotate `SESSION_SECRET` on tenant compromise.

**Multi-tenancy (most critical)**

- ☐ RLS policies present and tested on **every** table — see §6.
- ☐ Tenant context set per request via `SET LOCAL app.tenant_id` inside a transaction.
- ☐ **Cross-tenant data leak test** in CI: query as Tenant A, assert zero rows from Tenant B.
- ☐ Audit log queries also tenant-scoped (admins see only their own tenant's logs).

### 19.4 Performance Budgets

If a feature exceeds these, fix it before merging. These are Phase 1 launch targets — appropriate for the first wave of tenants. Tighten as scale grows.

| Surface                                          | Budget                                     | Measurement                                        |
| ------------------------------------------------ | ------------------------------------------ | -------------------------------------------------- |
| **First Contentful Paint** (logged-in dashboard) | < 1.5s on 4G                               | Lighthouse, real-user via Sentry Performance       |
| **Time to Interactive** (logged-in dashboard)    | < 3s on 4G                                 | Lighthouse                                         |
| **Page bundle size** (per-route JS)              | < 200 KB gzipped                           | Next.js bundle analyzer                            |
| **Inventory list — 10K rows**                    | < 100ms scroll latency                     | TanStack Virtual handles this if used correctly    |
| **Pipeline kanban — 200 deals**                  | < 200ms initial render                     | React profiler                                     |
| **PDF generation — single quote**                | < 5s end-to-end (enqueue → file in Spaces) | `document_log` timestamps                          |
| **DB query p95** (any user-facing query)         | < 100ms                                    | Sentry Performance + Postgres `pg_stat_statements` |
| **DB query p99**                                 | < 500ms                                    | Same                                               |
| **Server Action / tRPC query response**          | < 300ms p95                                | Sentry Performance                                 |
| **Quotation Builder live recalc**                | < 50ms after debounce                      | Manual; React profiler                             |
| **Health endpoint response**                     | < 100ms                                    | Better Stack monitor                               |
| **Worker job pickup latency**                    | < 5s after enqueue                         | pg-boss metrics                                    |

**When you blow a budget:** measure first (don't guess), fix the actual bottleneck, document the trade-off in the PR if you choose to defer.

### 19.5 Definition of Done — Per Module

A module is **not done** until every box is checked. Use this as the PR checklist for each of the 12 BRD modules.

```
## Definition of Done — Module M_ <name>

### Functional
- [ ] All fields from BRD spec implemented with correct types and validations
- [ ] All business rules from BRD enforced server-side (not just UI)
- [ ] CRUD operations: create, read (list + detail), update, delete (or soft-delete)
- [ ] List view supports search, filter, sort, pagination, CSV export
- [ ] Empty states designed (no data, search returns nothing, error)
- [ ] Loading states (skeleton, not spinner) on all async surfaces
- [ ] Error states surface a useful message + recovery action

### Data
- [ ] Drizzle schema with `tenant_id` + standard columns
- [ ] Migration generated and committed
- [ ] RLS policy enabled and tested
- [ ] Seed data for sample tenant per BRD §7

### Security
- [ ] Zod validation on every server input
- [ ] requireRole() on every mutation
- [ ] Audit log fires on create/update/delete (via Postgres trigger)
- [ ] No sensitive data in console / Sentry / Axiom logs

### UI
- [ ] Matches design prototype pixel-perfect (or PR explains the deviation)
- [ ] Mobile responsive down to 375px
- [ ] All numbers use Plex Mono + tabular-nums + formatINR
- [ ] Status pills, action buttons, and dialogs follow design system

### Performance
- [ ] Meets all relevant budgets in §19.4
- [ ] Tables virtualized if > 100 rows possible
- [ ] No N+1 queries (verify in pg_stat_statements)

### Tests
- [ ] Vitest unit tests for utility functions and pure logic
- [ ] Integration test for at least the happy path (create + read)
- [ ] RLS isolation test (Tenant A cannot see Tenant B)
- [ ] Playwright E2E for primary user flow if module is user-facing

### Observability
- [ ] Sensitive routes write to access_log
- [ ] Errors surface meaningful messages to Sentry
- [ ] Health endpoint reflects this module's dependencies if applicable

### Docs
- [ ] CLAUDE.md updated if any architectural decision changed
- [ ] PR description includes screenshots and a "what changed" summary
- [ ] Conventional Commit message
```

### 19.6 Daily Engineering Practice

A short list of habits that keep the codebase healthy.

- **Run `pnpm typecheck` and `pnpm lint` locally before every commit.** A pre-commit hook (Husky + lint-staged) enforces this.
- **Keep PRs under 400 lines of diff** when possible. Large changes split into prep PRs (refactor) + the actual change.
- **Re-read the relevant prototype screen** before implementing it. Memory drifts; the prototype doesn't.
- **Write the test first** for tax math, document numbering, and stage transitions. These are the bug-prone areas.
- **One TODO ages out per week.** Either resolve it or convert to a tracked issue.

---

_Last updated: May 2026 · Architecture v4 · Phase 1 spec_
