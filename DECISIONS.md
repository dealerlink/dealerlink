# DECISIONS.md — Dealerlink Architecture Decision Log

> **Purpose:** A chronological record of platform-level decisions, the alternatives considered, and the reasoning. When a future contributor (human or AI) asks "why did we do it this way?", the answer is here.
>
> **Format:** Each decision is an ADR (Architecture Decision Record). Newest at the top. Locked decisions are not revisited unless explicitly reopened with a new ADR.

---

## ADR-011 — Server Components + typed query helpers replace tRPC for reads

**Date:** May 2026 (Day 5)
**Status:** Locked
**Decided by:** Dev
**Supersedes:** CLAUDE.md §3 entry "RPC: tRPC for queries" (now: "Server Components + typed query helpers ... for reads; Server Actions + tenantAction() for writes")

### Decision

Reads in tenant-facing routes are served by **Next.js Server Components** that
call typed query helpers in `apps/web/lib/queries/*`. Writes go through
**Server Actions** wrapped by `tenantAction()` / `operatorAction()`. tRPC is
not used in Phase 1.

### Alternatives considered

- **tRPC** (CLAUDE.md §3 original pick) — adds a router layer that re-creates,
  on the server side, what Server Components already provide for free. Every
  route would build a router, an input schema, a procedure, then await it from
  a Server Component which itself runs on the server. The extra hop has no
  benefit because there is no client-side fetcher to type for tenant pages.
- **Server Components + raw drizzle in `app/`** — works but bleeds DB shape
  into pages and tempts duplication across routes.
- **Server Components + typed query helpers (chosen)** — keeps DB calls inside
  `lib/queries/` modules that import Zod filter schemas from `@dealerlink/schemas`
  and return narrow row types. Pages stay thin; types flow naturally.

### Why this matters

- Removes a layer that paid no rent — every tRPC procedure would have been a
  thin wrapper around an existing query helper, with the same Zod validation
  the Server Action wrappers already enforce.
- The boundary that matters (auth + RLS + audit context) is `tenantAction()`,
  not the transport. RPC was never the multi-tenant gate.
- Client islands that need data still use Server Actions (mutations) or accept
  pre-fetched props from a Server Component parent. TanStack Query is reserved
  for the few client surfaces that genuinely need it (Day 9 quotation builder).

### Consequences

- CLAUDE.md §3 RPC row updated to `Server Components + typed query helpers (lib/queries/) for reads; Server Actions + tenantAction() for writes`.
- No `app/api/trpc/[trpc]` route, no router setup.
- If a Phase 2 mobile/desktop client lands, a thin tRPC (or REST) shim can be
  layered on top of the existing query helpers without disturbing the web app.

---

## ADR-008 — Product Rename to Dealerlink (.in)

**Date:** May 2026
**Status:** Locked
**Decided by:** Product owner
**Supersedes:** Earlier working names "DistroFlow" (BRD draft) and "Distribyte" (interim brand)

### Decision

The product is named **Dealerlink**. The primary domain is **`dealerlink.in`** (Indian ccTLD).

| Surface                  | Value                                  |
| ------------------------ | -------------------------------------- |
| Product name             | Dealerlink                             |
| Primary domain           | `dealerlink.in`                        |
| App URL                  | `https://app.dealerlink.in`            |
| Admin app URL            | `https://admin.dealerlink.in`          |
| Inbound email            | `<slug>+<token>@mail.dealerlink.in`    |
| Tenant subdomain pattern | `<slug>.dealerlink.in`                 |
| Repo                     | `dealerlink`                           |
| Databases                | `dealerlink_prod`, `dealerlink_dev`    |
| Sentry projects          | `dealerlink-web`, `dealerlink-workers` |
| DO Spaces bucket         | `dealerlink-prod`                      |

### Alternatives considered

- **Distribyte** (interim) → previously chosen, then reconsidered in favor of Dealerlink
- **DistroFlow** (original BRD working title) → replaced before Phase 1 build
- **`.com` TLD** → considered but `.in` was chosen to signal India-first market positioning
- **`.co.in`** → less premium feel than `.in`, rejected

### Why this matters

- The `.in` ccTLD reinforces India-market focus, aligning with Phase 1 GST/INR/en-IN constraints (ADR-004, ADR-005)
- "Dealerlink" describes the value chain (distributor ↔ dealer relationships) more precisely than the prior names
- All previous brand references (Distribyte, DistroFlow) are deprecated; treat as typos and silently correct in any output

### Consequences

- All artifacts (CLAUDE.md, DECISIONS.md, architecture HTML, prototype files, BRD) renamed to use Dealerlink
- DNS, accounts, and infrastructure must be provisioned under `dealerlink.in` (was queued under the prior brand — restart that step)
- Any code, environment variables, database names, or commit messages using the old brand are corrected to Dealerlink
- The "do not propagate the old name" rule from `CLAUDE.md` §0 now covers two prior names: DistroFlow and Distribyte

---

## ADR-007 — Branding Upload Specification

**Date:** May 2026
**Status:** Locked (Phase 1)
**Decided by:** Product owner

### Decision

Tenant logo uploads accept the following:

| Setting                | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Max file size          | 1 MB                                                   |
| Accepted formats       | PNG, SVG, JPG                                          |
| Recommended dimensions | 400×120 px (header use)                                |
| Render targets         | Sidebar, login screen, PDF letterhead, email header    |
| Storage                | DO Spaces, URL persisted in `tenant_settings.logo_url` |

### Alternatives considered

- 2 MB max → unnecessary; logos are small assets, larger files slow PDF gen
- Add WebP → minor size benefit, not worth the format-handling complexity in Phase 1
- Square 200×200 → doesn't suit horizontal sidebar layouts

### Why this matters

Logos render in 4 places, including PDFs that go to government for GST audits. Format and size constraints prevent broken layouts and slow renders.

### Consequences

- Tenants with very wide logos may need to crop/redesign before upload
- SVG support requires DOMPurify sanitization (XSS risk via embedded `<script>`)
- Phase 2 may add per-tenant favicon support (separate field)

---

## ADR-006 — Default Document Templates Are Fixed

**Date:** May 2026
**Status:** Locked (Phase 1)
**Decided by:** Product owner

### Decision

Dealerlink ships default Quotation, Proforma Invoice, and Tax Invoice templates with a **fixed layout**. Tenants can customize:

- Logo
- Header copy (business name, registered address)
- Bank details (footer)
- T&C boilerplate text

Tenants **cannot** edit the document layout, field placement, or structural styling in Phase 1.

### Alternatives considered

- Tenant-editable templates via a WYSIWYG → high engineering cost, GST compliance risk if tenants break required fields
- Choice of 3–4 preset layouts → still complex; defer to Phase 2
- Hand-crafted templates per tenant on onboarding → not scalable

### Why this matters

GST invoices have legal requirements for field placement (HSN code visibility, GSTIN size, signature area). A fixed Dealerlink template guarantees compliance for every tenant. Customization is limited to safe surfaces.

### Consequences

- Onboarding is faster — no template setup per tenant
- Some enterprise prospects will request custom templates → Phase 2 enterprise tier feature
- Template changes happen via a Dealerlink release, not a tenant action

---

## ADR-005 — Currency and Locale Are INR + en-IN

**Date:** May 2026
**Status:** Locked (Phase 1)
**Decided by:** Product owner

### Decision

Phase 1 supports **INR currency only** and **en-IN locale only**. Schema includes:

- `tenant_settings.default_currency` (default `'INR'`)
- `tenant_settings.default_locale` (default `'en-IN'`)

The application reads these as constants in Phase 1 — the columns exist purely to make Phase 2 multi-currency a config flip instead of a migration.

### Alternatives considered

- Multi-currency from day one → ~3–4 days extra work, no current non-INR prospects
- Hardcode without future-ready columns → would require migration in Phase 2, harder rollout

### Why this matters

Tax math, number formatting (lakh/crore), and document layouts all assume INR + en-IN today. Pretending to support other currencies risks subtle bugs (e.g., a USD value displaying as ₹).

### Consequences

- Non-Indian prospects are deferred until Phase 2
- Lakh/crore auto-scaling in `formatINR()` is hardcoded; will need a generic `formatCurrency()` for Phase 2
- All tax calculations remain in `packages/tax/` and assume Indian GST rules

---

## ADR-004 — Fiscal Year Hardcoded to Indian (Apr–Mar)

**Date:** May 2026
**Status:** Locked (Phase 1)
**Decided by:** Product owner

### Decision

Phase 1 hardcodes the fiscal year to **April 1 – March 31 (Indian fiscal year)**. Document counter resets and reporting periods follow this calendar.

Schema includes `tenant_settings.fiscal_year_start` (integer month, default `4`) so per-tenant fiscal year is a config flip in Phase 2 — no migration needed.

### Alternatives considered

- Per-tenant fiscal year now → Phase 1 launches India-only, no current need
- Full configurable calendar (custom start day) → over-engineered; almost no business uses non-month-start fiscal years

### Why this matters

Document numbering (`QT-2026-0001`) resets on April 1. Reports (GST Summary, Pipeline Health) aggregate by fiscal year. Hardcoding for Phase 1 keeps the math simple.

### Consequences

- Non-Indian tenants cannot use Dealerlink until Phase 2 (matches Decision 5)
- Schema is ready, so the Phase 2 lift is small (~1 day)

---

## ADR-003 — Inbound Email Subdomain is `mail.dealerlink.in`

**Date:** May 2026
**Status:** Locked (Phase 1)
**Decided by:** Product owner

### Decision

Inbound emails (BCC-to-CRM logging per BRD Module M9) are received at:

```
<tenant-slug>+<random-token>@mail.dealerlink.in
```

Example: `acme+xyz123@mail.dealerlink.in`

DNS records on `mail.dealerlink.in`:

- **MX** → Resend inbound servers
- **SPF, DKIM, DMARC** → Resend-provided values

Each tenant's inbound token is generated at provisioning, stored in `tenant_settings.inbound_email_token`, and is **rotatable** (compromise → regenerate).

### Alternatives considered

- `inbox.dealerlink.in` → equivalent; chose `mail` as more intuitive
- Separate domain (`dealerlink-inbound.com`) → cleaner separation but extra DNS work and brand fragmentation
- Per-tenant subdomain (`acme.mail.dealerlink.in`) → wildcard-of-wildcard DNS complexity, no real benefit

### Why this matters

Inbound email matching needs to:

1. Identify the tenant (from the local-part prefix)
2. Identify the dealer (from the sender address/domain)
3. Be unguessable (the token prevents spam from arbitrary senders polluting tenant inboxes)

### Consequences

- DNS for `mail.dealerlink.in` must be configured before any tenant can use inbound BCC
- If a tenant slug changes, their inbound address changes → trigger a notification + grace period of forwarding from old to new

---

## ADR-002 — Tenant Provisioning via Internal Admin App

**Date:** May 2026
**Status:** Locked (Phase 1)
**Decided by:** Product owner

### Decision

Tenant provisioning in Phase 1 is performed through an **internal admin app at `admin.dealerlink.in`**. Dealerlink staff authenticate with a separate role (`operator`) — one tier above tenant `admin` — and use a provisioning form to:

1. Create the tenant record
2. Set the tenant's slug, legal name, GSTIN, state
3. Create the initial Admin user
4. Trigger a credentials email to that Admin

No SQL provisioning. No CLI scripts. Operators do not have direct database access.

### Alternatives considered

- **CLI script** (`pnpm tenant:create acme`) → faster to build but error-prone (typos go straight to prod), no audit trail
- **Manual SQL** → fastest to ship, worst to maintain, no validation
- **Self-serve signup** → deferred to Phase 2 (needs payment integration, abuse prevention, KYC)

### Why this matters

Tenant provisioning is a high-risk operation: a typo creates orphaned data, a duplicate slug breaks routing, a missing GSTIN breaks all tax documents. An admin app with form validation prevents these.

The `operator` role is a **separate authentication boundary** from tenant users — operators never authenticate as tenant users to do their job.

### Consequences

- Admin app is a Week 1 deliverable (not optional)
- All provisioning is audit-logged in a dedicated `provisioning_log` table
- Self-serve signup is a Phase 2 feature; until then, Dealerlink staff manually onboard each tenant

---

## ADR-001 — Tenant Routing via Subdomain

**Date:** May 2026
**Status:** Locked (Phase 1)
**Decided by:** Product owner

### Decision

Each tenant accesses their workspace at `<tenant-slug>.dealerlink.in`. The slug is set at provisioning time, must be DNS-safe (lowercase alphanumeric + hyphens, 3–32 chars), and is unique across the platform.

Infrastructure:

- **Wildcard DNS** record `*.dealerlink.in` pointing to DigitalOcean App Platform
- **Wildcard SSL** certificate (Let's Encrypt via DO App Platform)
- **Cookie scope** `.dealerlink.in` for session sharing where appropriate (e.g., the operator switching between tenant subdomains)

### Alternatives considered

- **Path-based** (`app.dealerlink.in/acme`) → simpler DNS, but tenant boundary is fuzzier; cookies cannot be naturally scoped per-tenant; harder to support custom domains later
- **Custom domain per tenant** (`crm.acme.com`) → enterprise feature; defer to Phase 2 (needs per-tenant SSL provisioning, DNS verification flow)
- **Single domain with tenant header** → bad UX (users can't bookmark per tenant), confusing URLs

### Why this matters

Tenant routing is the foundation of the multi-tenant architecture. The choice affects:

- How requests are routed to tenant context (middleware reads subdomain, sets `app.tenant_id`)
- How SSL is provisioned
- How tenants perceive Dealerlink (a workspace at "their" subdomain feels owned)
- How Phase 2 custom domains will layer on (custom domain → CNAME to tenant subdomain)

### Consequences

- Wildcard DNS + wildcard SSL must be set up before the first tenant can be onboarded
- Tenant slug is a permanent identifier; renaming requires careful migration (URL redirects, inbound email forwarding, document references)
- Local development uses a hosts-file trick or `*.localhost` resolution (modern browsers support this)

---

## ADR-009 — Validate Lucia's `getUserAttributes` payload with Zod

**Date:** 2026-05-11
**Status:** Accepted

### Context

Day 2 shipped a silent bug: Lucia's `getUserAttributes` read snake*case keys (`data.full_name`) from a Drizzle row that returns camelCase (`data.fullName`). Every attribute was `undefined`. The Sidebar crashed several files downstream when it called `.split` on the missing name. TypeScript was happy — the `DatabaseUserAttributes` module declaration matched what we \_expected* the row to look like, not what Drizzle actually returns.

The shape of the row Drizzle returns is a runtime fact, not a compile-time one. Type declarations cannot detect drift between them.

### Decision

Parse the row through a Zod schema inside `getUserAttributes`. On any drift — wrong keys, wrong types, missing fields — throw immediately with a message that names the keys we got. The Lucia auth flow then fails loudly at boot rather than silently propagating undefined values to consumers.

```ts
const userAttributesSchema = z.object({
  tenantId: z.string().uuid().nullable(),
  email: z.string().min(1),
  role: z.enum(['admin', 'sales', 'accounts', 'dispatch', 'operator']),
  fullName: z.string().min(1),
  status: z.enum(['active', 'invited', 'suspended', 'deleted']),
});

getUserAttributes: (data) => {
  const parsed = userAttributesSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `[lucia] DatabaseUserAttributes failed Zod validation. ` +
        `Got keys: ${Object.keys(data).join(',')}. Issues: ${parsed.error.message}`,
    );
  }
  return parsed.data;
};
```

### Why this matters

Any auth-flow boundary that bridges the database to user-facing code is a high-value validation point. Auth bugs aren't just bugs — they can leak data across tenants or hand undefined-shaped user objects to UI components that crash at midnight. Zod here is cheap insurance.

### Alternatives considered

- **Branded types via `as`** → does nothing at runtime; the same class of bug recurs.
- **Drizzle's generated types as the source of truth** → we already use them, but they only tell us what the schema _declares_, not what an adapter actually emits.
- **One integration test that boots a session** → useful, but reactive. The Zod parse catches the bug before any user ever logs in.

### Consequences

- Adding a column to `users` requires a corresponding update to `userAttributesSchema`. Forgetting causes a loud, traceable error rather than silent corruption.
- We have a place to put cross-cutting attribute coercion (lowercasing email, trimming whitespace) if it's ever needed.
- The cost is one Zod parse per session validation — negligible.

---

## ADR-010 — Temporary-password + must-rotate flow for operator-provisioned users

**Date:** 2026-05-11
**Status:** Accepted

### Context

Day 4 ships operator-driven tenant provisioning (ADR-002). When an operator creates a tenant or adds a user, the user has not yet chosen a password — and operators must not learn or store one for them. Two competing constraints:

1. The user has to be able to log in immediately, so we need a credential to hand off.
2. That credential must not become a persistent password that lingers in operator inboxes or password managers.

A magic-link flow would resolve this cleanly but adds a token-validation surface, a 15-minute window mailer, and a new failure mode (expired link). Phase 1 isn't ready to invest in that infrastructure.

### Decision

Operator-provisioned users receive a **12-character temporary password** generated server-side and delivered via the welcome email. The user's row carries `users.must_change_password = true`. The login flow accepts that password once; on the next request, the user is forced through a password-rotation screen before reaching the rest of the app.

The temporary password format is:

- 12 characters
- ≥1 uppercase letter, ≥1 lowercase, ≥1 digit, ≥1 of `!@#$%&*`
- Random alphabet excludes visually-ambiguous glyphs (`I`, `O`, `l`, `0`, `1`)
- Each character drawn from a cryptographically strong source (`crypto.randomInt`)

Generation lives in `apps/web/lib/admin/credentials.ts`. The plaintext value is stored briefly in `email_delivery_log.meta.temporaryPassword` so the worker can render the email; the dispatch helper strips it from `meta` on success. No long-term plaintext copy exists.

### Alternatives considered

- **Magic-link sign-up** (token in URL) → cleaner UX, but adds a token table, an expiry job, and a "link expired — request another" UI surface. Defer to Phase 2.
- **Email a reset URL instead of a password** → equivalent to magic-link with extra steps.
- **OAuth / SSO** → out of scope for Phase 1 (ADR doesn't exist; would require operator decisions on IdPs).
- **Operator picks the password** → operators handle plaintext credentials for every tenant; unacceptable from a least-privilege standpoint.

### Why this matters

Onboarding speed is one of Day 4's success criteria (<2 minutes from operator click to admin logged in). Temporary passwords are the lowest-friction option that doesn't compromise the don't-store-plaintext rule. The `must_change_password` gate ensures the temporary credential is single-use in practice.

### Consequences

- A new boolean column on `users` (`must_change_password`) and a corresponding field on the Lucia user attributes schema (ADR-009).
- The login flow has to render a password-rotation screen when the flag is set; users cannot dismiss it.
- `email_delivery_log.meta` may briefly contain a plaintext password while a delivery is queued. The audit trigger's `%_token` / `password_hash` redaction does not cover it; mitigation is the worker stripping the field on `status='sent'` and the row's RLS scope being limited to its tenant.
- Reset-password flow (Phase 5 in the Day 4 build) uses the same machinery: new temp password, `must_change_password=true`, sessions invalidated, email queued.

---

_This log is append-only. Locked decisions are not edited; if a decision changes, write a new ADR that supersedes the old one._
