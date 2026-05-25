# Dealerlink — Security Audit (Stage C, Day C.4)

> **Date:** 2026-05-25
> **Auditor:** Claude Code (read-only review; no application code changed during the audit)
> **Scope:** Pre-pilot security posture of the Dealerlink monorepo at `main` (Stage C).
> **Companion docs:** `CLAUDE.md` §4–§8, `DECISIONS.md` (ADR-001…013), `DEVIATIONS.md` (DEV.57–72), `docs/LOGGING.md`, `docs/STAGING_ENV.md`.

This audit was produced in **Part 1** of Day C.4 (read-only). Code-level fixes, if
any, are applied in **Part 2** after operator review of these findings. Findings
that are fixed in Part 2 are annotated **FIXED — see commit `<SHA>`** in §10.

---

## Executive Summary

| Severity          | Count | Notes                                                                                                                             |
| ----------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Critical**      | 0     | No finding is critically exploitable in Dealerlink's architecture.                                                                |
| **High**          | 1     | F-1: outdated Next.js bundles CVE-2025-29927 (upstream-Critical) + DoS/SSRF. Exposure reduced by layout-based auth (DEV.68).      |
| **Medium**        | 2     | F-2 (no HTTP security headers), F-3 (no login rate-limit / lockout).                                                              |
| **Low**           | 2     | F-4 (drizzle-orm advisory, not exploitable), F-5 (permissive log-write policies, intentional).                                    |
| **Informational** | 3     | F-6 (RLS-exempt tables by design), F-7 (prod observability/email secrets blank on staging), F-8 (committed test-credentials doc). |

**Pilot verdict:** No finding blocks the guided pilot. Multi-tenant isolation
(RLS), authentication, role enforcement, audit logging, and secrets hygiene are
all sound. The three actionable items before _production_ (Stage D) are, in
order: **F-1** (upgrade Next.js), **F-3** (login rate-limit + lockout),
**F-2** (HTTP security headers).

Detail and the prioritised fix order are in **§10**.

---

## Methodology + Scope

**Method:** Static review of the codebase + configuration, cross-referenced
against `CLAUDE.md`, `DECISIONS.md`, and `DEVIATIONS.md`. Two non-mutating
verifications were run:

- `pnpm --filter @dealerlink/db exec vitest run rls.test.ts` → **19/19 pass**
  (cross-tenant isolation, see §1.4).
- `pnpm audit` / `pnpm audit --prod` + `pnpm audit --json` (dependency CVEs,
  see §7).

A git-history secret scan (`git log -p --all -S …`) and a `.gitignore` review
were performed for §4. No application code was modified.

**In scope:** RLS / multi-tenant isolation, Lucia auth + sessions, role
enforcement, secrets management, input validation + output encoding, audit
logging + observability, dependency CVEs, infrastructure config (DO +
Cloudflare), OWASP Top-10.

**Out of scope (Stage D / Phase 2):** live penetration testing, DAST against the
running staging app, DO/Cloudflare account-level config we cannot read from the
repo, third-party (Resend) posture.

---

## 1. Multi-tenant Isolation (RLS)

Multi-tenancy is enforced at the database layer (CLAUDE.md §4). The application
connects as **`dealerlink_app`** — a `NOSUPERUSER NOBYPASSRLS` role
(`rls/00-app-role.sql`, hardened in DEV.57) — so RLS is always in force at
runtime. Migrations/seeds + the Lucia adapter use the superuser `dealerlink`
role, which bypasses RLS by design.

Every request runs inside `withTenant(tenantId, …)` / `withOperator(userId, …)`
(`packages/db/src/with-tenant.ts`), which `SET LOCAL`s `app.tenant_id`,
`app.user_id`, `app.request_ip/ua`, and `app.read_only` for the transaction. The
policies read `app.tenant_id` via the `app_current_tenant()` helper
(`rls/00-helpers.sql`). `SET LOCAL` is transaction-scoped, so nothing leaks back
to the pooled connection.

All tenant-scoped tables use both `ENABLE` **and** `FORCE ROW LEVEL SECURITY`
(FORCE means even the table owner is subject to the policy) and a
`tenant_isolation` policy with **both** `USING` (read) and `WITH CHECK` (write)
predicates, except where a deliberately-permissive write policy is required for
trusted server-side writers (logs/triggers — see the per-table notes).

### 1.1 Table-by-table status

35 tables exist (all `pgTable` definitions in `packages/db/src/schema/*`). Every
table that holds tenant-owned data has `tenant_id` + RLS + a policy. The four
RLS-exempt tables are exempt by design and verified (§1.2).

| #   | Table                             | `tenant_id`      | RLS enabled + forced | Policy (USING / WITH CHECK)         | Policy file                 |
| --- | --------------------------------- | ---------------- | -------------------- | ----------------------------------- | --------------------------- |
| 1   | `tenant_settings`                 | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `tenant-settings.sql`       |
| 2   | `users`                           | ⚪ nullable (op) | ✅ / ✅              | CASE: NULL→`tenant_id IS NULL`      | `users.sql`                 |
| 3   | `document_counters`               | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `document-counters.sql`     |
| 4   | `audit_log`                       | ✅ NOT NULL      | ✅ / ✅              | read-scoped; permissive INSERT      | `audit-log.sql`             |
| 5   | `auth_events`                     | ⚪ nullable      | ✅ / ✅              | CASE read; permissive INSERT        | `auth-events.sql`           |
| 6   | `access_log`                      | ✅ NOT NULL      | ✅ / ✅              | read-scoped; permissive INSERT      | `access-log.sql`            |
| 7   | `email_delivery_log`              | ⚪ nullable      | ✅ / ✅              | CASE read; permissive INSERT/UPDATE | `email-delivery-log.sql`    |
| 8   | `inbound_token_history`           | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `inbound-token-history.sql` |
| 9   | `dealers`                         | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `dealers.sql`               |
| 10  | `products`                        | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `products.sql`              |
| 11  | `procurements`                    | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `inventory.sql`             |
| 12  | `procurement_items`               | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `inventory.sql`             |
| 13  | `inventory_items`                 | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `inventory.sql`             |
| 14  | `deals`                           | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `deals.sql`                 |
| 15  | `deal_products`                   | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `deals.sql`                 |
| 16  | `deal_stage_history`              | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `deals.sql`                 |
| 17  | `quotations`                      | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `quotations.sql`            |
| 18  | `quotation_lines`                 | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `quotations.sql`            |
| 19  | `quotation_status_history`        | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `quotations.sql`            |
| 20  | `performa_invoices`               | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `performa-invoices.sql`     |
| 21  | `performa_invoice_lines`          | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `performa-invoices.sql`     |
| 22  | `performa_invoice_status_history` | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `performa-invoices.sql`     |
| 23  | `orders`                          | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `orders.sql`                |
| 24  | `order_lines`                     | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `orders.sql`                |
| 25  | `order_status_history`            | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `orders.sql`                |
| 26  | `payments`                        | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `payments.sql`              |
| 27  | `payment_allocations`             | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `payments.sql`              |
| 28  | `dispatches`                      | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `dispatch.sql`              |
| 29  | `dispatch_lines`                  | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `dispatch.sql`              |
| 30  | `dispatch_serials`                | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `dispatch.sql`              |
| 31  | `generated_documents`             | ✅ NOT NULL      | ✅ / ✅              | `= app_current_tenant()` / same     | `generated-documents.sql`   |
| 32  | `tenants`                         | — (root)         | ❌ by design         | n/a — see §1.2                      | — (rls.test.ts asserts off) |
| 33  | `sessions`                        | — (Lucia)        | ❌ by design         | n/a — PK lookup only, §1.2          | — (rls.test.ts asserts off) |
| 34  | `webhook_events`                  | — (pre-tenant)   | ❌ explicitly        | n/a — operator forensic, §1.2       | `webhook-events.sql`        |
| 35  | `rate_limit`                      | — (global infra) | ❌ by design         | n/a — no tenant data, §1.2          | — (no tenant column)        |

**Result: every table with `tenant_id` has RLS enabled + forced and a policy. No gaps.**

### 1.2 RLS-exempt tables (intentional, verified)

- **`tenants`** — the root table; it _is_ the tenant, so it has no `tenant_id`.
  Operators legitimately need cross-tenant reads (the admin app lists all
  tenants), and tenant resolution by slug must read `tenants` _before_ a tenant
  context exists (chicken-and-egg). `rls.test.ts` asserts `relrowsecurity =
false`. Mutations are audited by the `audit_trg` trigger.
- **`sessions`** — Lucia's session store, looked up by primary-key id (an opaque
  random token; no enumeration risk). The Lucia adapter uses the superuser
  client (`lucia.ts`); session validation must resolve the user _before_ a
  tenant context is known. `rls.test.ts` asserts `relrowsecurity = false`.
- **`webhook_events`** — inbound Resend webhooks arrive before any tenant context
  is known. Operator-only forensic data, written by the Node webhook route with
  the BYPASSRLS (admin) client. RLS is **explicitly** `DISABLE`d in
  `webhook-events.sql` so the posture is auditable.
- **`rate_limit`** — global, per-`(scope:key)` counter table with no tenant data.
  No `tenant_id` column; RLS would be meaningless.

### 1.3 RLS bypass surface (`adminDb`) audit

`adminDb` is the superuser (BYPASSRLS) Drizzle client. It is exported from
`@dealerlink/db` and used only in server-only contexts:

- **Lucia adapter** (`apps/web/lib/auth/lucia.ts`) — session/user lookup by PK
  before tenant context exists. Documented; no cross-tenant exposure because
  only the matching user is returned to the validated session.
- **`/api/health`** (`app/api/health/route.ts`) — read-only metadata checks
  (`SELECT 1`, migration count, trigger presence, RLS flags, queue depth). No
  tenant data is read or returned.
- **Resend webhook processing** (`lib/email/resend-webhook.ts`) — correlates by
  globally-unique `provider_message_id`; writes `webhook_events`
  (non-tenant) and updates the matched `email_delivery_log` row. The match key
  is unguessable and provider-issued, so there is no cross-tenant selection by a
  caller-supplied value.
- **Tenant resolution / operator app reads** (`lib/tenant/context.ts`,
  `app/admin/*`) — `tenants` reads (non-RLS table) and, where a tenant context
  is needed, an explicit `SET LOCAL app.tenant_id` precedes the scoped query
  (e.g. `getTenantContext` sets the GUC before reading `tenant_settings`).

**Finding:** No `adminDb` use reads or writes tenant-scoped rows _without_ either
(a) operating only on non-tenant tables, or (b) re-establishing tenant context
first. All tenant-facing reads/writes flow through `withTenant`/`tenantAction`,
which bind `app.tenant_id`. ✅ No bypass finding.

The operator-impersonation path is additionally **read-only**: `tenantAction`
sets `readOnly: true` for impersonating operators, and the `audit_log_writer()`
trigger `RAISE`s `42501` on any INSERT/UPDATE/DELETE when `app.read_only` is set
(`triggers/audit-log.sql`). Covered by `packages/db/tests/impersonation.test.ts`.

### 1.4 Cross-tenant query test (confirmed)

A comprehensive cross-tenant isolation suite already exists at
`packages/db/tests/rls.test.ts`. It connects as `dealerlink_app` (NOBYPASSRLS)
and, scoped to tenant A (demo), attempts to read/update/delete tenant B (sample)
rows. The representative case the C.4 brief asks for:

```ts
// session scoped to demo attempts to read sample's users
await asTenant(demoId, (tx) => tx.select({ email: users.email }).from(users));
// → returns ONLY @demo.test users; never @sample.test  (RLS filters the read)

// demo attempts to mutate a sample row
await asTenant(demoId, (tx) =>
  tx.execute(sql`UPDATE users SET full_name='Hijacked' WHERE email='admin@sample.test'`),
);
// → 0 rows affected (the target row is invisible under RLS; no mutation occurs)
```

**Expected behaviour:** RLS makes the other tenant's rows invisible, so reads
return zero cross-tenant rows and DML affects zero rows (no error, no data
change). The suite also asserts the metadata posture (`tenants`/`sessions` RLS
off; the six core tables on+forced).

**Result (run 2026-05-25):** `19 passed (19)` — confirmed. No data was mutated
(the suite cleans up its own probe rows). Cross-tenant reads and writes are
blocked exactly as specified. ✅

---

## 2. Authentication + Session Management

Auth is **Lucia v3**, session-based, sessions stored in Postgres
(`apps/web/lib/auth/*`). Email + password only in Phase 1 (no SSO), per CLAUDE.md §6.

### 2.1 Session cookie security (`lib/auth/lucia.ts`)

| Attribute    | Value                                                                | Assessment                                                                |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Name         | `dealerlink_session`                                                 | —                                                                         |
| **HttpOnly** | Lucia default (not overridden) → **on**                              | ✅ JS cannot read the cookie                                              |
| **Secure**   | `process.env.NODE_ENV === 'production'`                              | ✅ on in prod/staging; off on localhost (expected)                        |
| **SameSite** | `lax`                                                                | ✅ appropriate — blocks cross-site POST CSRF while allowing top-level nav |
| **Domain**   | `.dealerlink.in` in production (cross-subdomain session per ADR-001) | ✅ scoped to the brand apex; required for operator subdomain hop          |
| Path         | `/`                                                                  | —                                                                         |

`expires: false` makes the cookie persistent; **session validity is the
server-side source of truth** (the DB row). Lucia's default session lifetime
(**30 days**) applies and is **refreshed on activity** — `getAuthContext` rotates
the cookie when `result.session.fresh` is true (CLAUDE.md §6: "30 days, refresh
on activity"). On an invalid/expired session the cookie is blanked.

> **Minor note (informational):** `loginSchema` accepts a `rememberMe` flag but
> it is not consumed (the cookie is persistent regardless). Cosmetic; no security
> impact. Not a finding.

### 2.2 Password storage (`lib/auth/password.ts`)

Argon2**id** (`algorithm: 2`) with OWASP-recommended minimums: `memoryCost
19_456` KiB, `timeCost 2`, `parallelism 1`. `verifyPassword` swallows verifier
errors and returns `false` (no oracle via exception). ✅ Hash + salt are managed
by argon2; no plaintext is ever stored. ✅

### 2.3 Password policy (`lib/auth/password-policy.ts`, DEV.69)

Implements CLAUDE.md §6 exactly: **min 8 chars, ≥1 uppercase, ≥1 number, ≥1
special**. A _single_ Zod schema (`newPasswordSchema`) is imported by both the
client form and the `changePassword` server action, so client and server cannot
drift. The temp-password generator (`lib/admin/credentials.ts`) produces a value
that satisfies this policy. ✅ Matches spec.

### 2.4 Force-password-change trapdoor (C.1 / DEV.56 / DEV.68) — verified un-bypassable

- **Enforced in both guarded layouts**, before any other routing:
  `app/(app)/layout.tsx:20` and `app/admin/layout.tsx:15` both
  `redirect('/change-password')` when `ctx.user.mustChangePassword` is true (the
  admin layout checks it _before_ the operator role gate).
- **No redirect loop:** `/change-password` lives in the `(auth)` route group,
  which is **not** wrapped by either guarded layout.
- **Entry point covered:** `login()` routes a flagged user to `/change-password`
  on sign-in (`actions.ts:130`).
- **Single-use temp credential:** `changePassword` re-verifies the _current_
  password before accepting a new one, and clears `must_change_password` in the
  **same** `UPDATE` that sets the new hash — the trapdoor can never be left
  half-open. Enforcement is why a hijacked session can't silently re-key.
- Covered by `verify-day-c1.spec.ts` + `operator-onboarding.spec.ts`.

> **F-8 context / informational:** the trapdoor gates _UI navigation_ (layouts),
> not direct Server-Action invocation — `tenantAction`/`operatorAction` check
> role + tenant but not `must_change_password`. The threat model is "force
> rotation of a known temp credential by a cooperative new user," not "stop a
> malicious authenticated user," so this is low-risk and explicitly acknowledged
> in DEV.68. If the threat model tightens, add the flag check to the wrappers.
> Not counted as a distinct finding.

### 2.5 Login rate limiting + account lockout → **F-3 (Medium)**

The `login()` action (`lib/auth/actions.ts`) has **no rate limiting and no
account lockout**. A Postgres-backed limiter (`lib/rate-limit.ts`,
`checkRateLimit`) exists and _is_ wired to `/api/health` (60/min/IP) but is **not
called on login**. There is no lock-after-N-failures mechanism.

- **Mitigating factors:** failed logins are recorded to `auth_events`
  (`login_failed` with reason); the error message is generic
  (`"Invalid email or password."`) for both unknown-user and bad-password, so
  there is **no user-enumeration oracle** ✅; argon2id makes each guess
  expensive; the pilot user set is tiny and trusted.
- **Risk:** online brute-force / credential-stuffing against a known email.
  Acceptable for a guided pilot; **must-fix before production.**
- **Recommendation:** wire `checkRateLimit({ scope: 'login', key: ip+email,
limit ~5–10/15min })` into `login()` and add a soft account-lockout
  (e.g. lock after 10 failures in 15 min, surfaced via `auth_events`). Low
  effort — the limiter primitive already exists.

## 3. Role + Permission Enforcement

Five roles: **operator** (platform), **admin / sales / accounts / dispatch**
(tenant), per CLAUDE.md §6. Enforcement is **server-side and structural**: every
mutation goes through `tenantAction(allowedRoles, schema, fn)` or
`operatorAction(schema, fn)` (`lib/actions/wrap.ts`), which call
`requireRole(...)` **before** opening the `withTenant`/`withOperator`
transaction. Hiding a UI button is never the control.

### 3.1 Guard placement

`requireRole` (`lib/auth/require-role.ts`) throws `UNAUTHORIZED` if unauthenticated,
`FORBIDDEN` if the account is not `active`, and `FORBIDDEN` if the role is not in
the allow-list — all _before_ any DB work. `tenantAction` additionally allows an
**operator** caller **iff** an impersonation cookie is present, and then forces
`readOnly: true` (so impersonating operators can never mutate — enforced again by
the audit trigger, §1.3). ✅

### 3.2 Role matrix (representative; every action verified to declare an allow-list)

All 50+ `export const … = tenantAction(...)` declarations were grepped; **every
one declares an `allowedRoles` array** as its first argument (the type signature
makes omitting it a compile error). Representative mapping, cross-checked against
the BRD matrix in CLAUDE.md §6:

| Capability                                      | Allowed roles              | Example action(s)                                                                                        |
| ----------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| Create / edit dealers                           | admin, sales               | `createDealer`, `updateDealer`                                                                           |
| Dealer commercial terms / (de)activate / import | admin                      | `updateDealerCommercial`, `deactivateDealer`, `bulkImportDealers`                                        |
| Catalog (products) create/edit/import           | admin                      | `bulkImportProducts` (+ create/update)                                                                   |
| Deals / pipeline manage + transition            | admin, sales               | `transitionDealStage`, `addDealProduct`                                                                  |
| Deal reassign                                   | admin                      | `reassignDeal`                                                                                           |
| Quotations create / PDF / email                 | admin, sales               | `createQuotation`, `generateQuotationPdf`                                                                |
| Quotation delete                                | admin                      | `deleteQuotation`                                                                                        |
| PI convert / send / confirm                     | admin, sales               | `convertQuotationToPi`, `sendPi`, `confirmPi`                                                            |
| PI cancel                                       | admin                      | `cancelPi`                                                                                               |
| Order confirm                                   | admin, sales               | `confirmOrder`                                                                                           |
| Order expected-dispatch / cancel                | admin (+ dispatch for ETA) | `updateOrderExpectedDispatch`, `cancelOrder`                                                             |
| Payments record / verify / clear / allocate     | admin, accounts            | `recordPayment`, `allocatePayment`                                                                       |
| Payment refund                                  | admin                      | `refundPayment`                                                                                          |
| Payment receipts (gen/download/send)            | admin, accounts            | `generatePaymentReceipt`, `sendPaymentReceipt`                                                           |
| Procurement create/confirm/finalize/serials     | admin, dispatch            | `createProcurement`, `submitSerials`                                                                     |
| Dispatch create / deliver                       | admin, dispatch            | `createDispatch`, `markDispatchDelivered`                                                                |
| Dispatch return                                 | admin                      | `returnDispatch`                                                                                         |
| Dispatch note PDF (gen/download)                | admin, dispatch, accounts  | `generateDispatchPdf`                                                                                    |
| Tenant provisioning + settings + users          | **operator only**          | `createTenant`, `updateTenant*`, `createTenantUser`, `resetTenantUserPassword`, `regenerateInboundToken` |
| Operator impersonation start/stop               | **operator only**          | `lib/impersonation/actions.ts` (`requireRole(['operator'])`)                                             |

This matches the BRD: **sales** never touches payments/dispatch-ops/user-admin;
**accounts** never edits dealers/pipeline/dispatch ops (read-only on PI/dispatch
PDFs); **dispatch** never touches pricing/payments/dealer master; **admin** has
full tenant scope; **operator** is a separate authentication boundary.

### 3.3 Operator-only actions cannot be called by tenant admins — verified

`operatorAction` calls `requireRole(['operator'])` unconditionally. A tenant
`admin`'s role is `admin`, not `operator`, so every operator action throws
`FORBIDDEN` server-side regardless of UI. Tenant provisioning, tenant-user
management, settings edits, token rotation, and impersonation are all
operator-gated. ✅

### 3.4 Un-wrapped server actions (reviewed — appropriate)

The only `'use server'` functions **not** wrapped are the auth primitives:
`login` (must run pre-auth), `logout` (self-scoped to the caller's session), and
`changePassword` (self-scoped: resolves `getAuthContext` and re-verifies the
current password). Each is correctly self-guarding. ✅ **No finding** — no
mutating tenant action lacks a role guard.

## 4. Secrets Management

### 4.1 Expected secrets (from `.env.example` + `.do/app.yaml`)

| Secret                          | Purpose                                  | Staging status                                    | Prod-ready?  |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------- | ------------ |
| `DATABASE_URL`                  | app role (RLS-enforced) runtime conn     | `type: SECRET`, real value injected               | ✅           |
| `DATABASE_DIRECT_URL`           | superuser — Lucia + pg-boss + migrations | `type: SECRET`, real value injected               | ✅           |
| `SESSION_SECRET`                | session signing                          | `type: SECRET`, real value injected               | ✅           |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Svix verification of inbound webhooks    | `type: SECRET` (web)                              | ✅           |
| `RESEND_API_KEY`                | outbound email                           | **blank** — outbound is a no-op (DEV/STAGING_ENV) | ❌ F-7       |
| `SENTRY_DSN` / `NEXT_PUBLIC_*`  | error reporting                          | **blank** — SDK no-ops (Day 17)                   | ❌ F-7       |
| `BETTERSTACK_SOURCE_TOKEN`      | log shipping                             | **blank** — pino → stdout                         | ❌ F-7       |
| `AXIOM_TOKEN`                   | event analytics                          | **blank** — `trackEvent` → pino                   | ❌ F-7       |
| `DO_SPACES_*`                   | file storage                             | deferred to Stage D (DEV.16, base64 logos)        | ❌ (planned) |

### 4.2 Secrets hygiene — verified

- **No secret values in the repo.** `.do/app.yaml` ships `type: SECRET` envs with
  **no `value:`** (committed blank); real values live in
  `C:\Users\rohit\.dealerlink\staging-secrets.txt` (outside the repo) and are
  injected via `doctl apps update --spec` (DEV.64). ✅
- **`.gitignore`** excludes `.env`, `.env.local`, `.env.*.local` (keeps
  `.env.example`), `secrets/`, `/staging-secrets.txt`, and the rendered spec
  (`.do/app.rendered.yaml`). ✅
- **Git-history scan** (`git log -p --all -S "re_"`, plus regex sweeps for live
  `whsec_…`, `Bearer …`, hex `SESSION_SECRET=`, and non-dev Postgres creds)
  returned **nothing** — only the documented dev placeholders
  (`*_change_me`, `replace_with_…`, `re_xxxx`, `whsec_xxxx`). ✅
- **Server-only discipline:** `RESEND_INBOUND_WEBHOOK_SECRET` carries an explicit
  "NEVER expose via NEXT*PUBLIC*_" note and is never inlined. The only
  `NEXT*PUBLIC*_` vars are the Sentry DSN (public by design), app URL, app domain,
  and Sentry environment/release — none secret. ✅
- **No secret leaks into `audit_log`:** `audit_redact()` redacts `password_hash`,
  `inbound_email_token`, `token`, `%_secret`, `%_token`. The one place a plaintext
  temp password transiently lives (`email_delivery_log.meta`, ADR-010) has **no**
  audit trigger (DEV.47), so it never reaches `audit_log`. ✅

### 4.3 Findings

- **F-7 (Informational):** Sentry / Better Stack / Axiom / outbound-Resend secrets
  are intentionally **blank on staging** and degrade to no-ops (Day 17 contract).
  This is a **production-readiness gap**, not a leak: these must be populated with
  real values before production (Stage D). Tracked.
- **F-8 (Informational):** `docs/pilot/credentials-cheatsheet.md` commits the
  seeded **test** credentials (`password123`). These are public throwaway dev
  credentials, acceptable to commit. **Constraint for Stage E:** the real pilot
  tenant's credentials must **never** be committed.

## 5. Input Validation + Output Encoding

_(populated in chunk C4c)_

## 6. Audit Logging + Observability

_(populated in chunk C4c)_

## 7. Dependency Security

_(populated in chunk C4c)_

## 8. Infrastructure Security (DO + Cloudflare)

_(populated in chunk C4c)_

## 9. OWASP Top 10 Quick Check

_(populated in chunk C4c)_

## 10. Findings Summary + Recommendations

_(populated in chunk C4c)_
