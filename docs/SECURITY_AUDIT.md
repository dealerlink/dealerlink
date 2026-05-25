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

_(populated in chunk C4b)_

## 3. Role + Permission Enforcement

_(populated in chunk C4b)_

## 4. Secrets Management

_(populated in chunk C4b)_

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
