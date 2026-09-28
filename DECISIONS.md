# DECISIONS.md — Dealerlink Architecture Decision Log

> **Purpose:** A chronological record of platform-level decisions, the alternatives considered, and the reasoning. When a future contributor (human or AI) asks "why did we do it this way?", the answer is here.
>
> **Format:** Each decision is an ADR (Architecture Decision Record). Newest at the top. Locked decisions are not revisited unless explicitly reopened with a new ADR.

---

## ADR-014 — Operator read-only tenant view (defense-in-depth, no RLS weakening)

**Date:** 2026-06-10
**Status:** Accepted
**Closes:** DEV.82
**Relates:** ADR-001 (subdomain routing), ADR-002 (operator role), ADR-009 (Zod at Lucia boundary)

### Context

The operator console (`/admin`, ADR-002) had an "Enter workspace" button that
set an impersonation cookie and redirected to the tenant workspace, where the
`(app)` shell renders the tenant's app under a read-only banner. A Stage B Day 3
build wired most of this, and the audit trigger already refuses mutations when
`app.read_only` is set (`withTenant({ readOnly })`).

Two problems remained:

1. **Dead-end in production.** The impersonation cookie was **host-only** (no
   `domain`), so on the cross-host redirect to `<slug>.dealerlink.in` the browser
   did not send it. The operator arrived authenticated (the Lucia session cookie
   IS scoped to `.dealerlink.in`) but with no impersonation cookie → the shell
   bounced operators to `/admin` → middleware bounced `/admin` on a tenant
   subdomain to the tenant login. Net effect: the button dead-ended at a tenant
   login the operator could not use. (It worked in dev only because dev stays on
   one host, `localhost`, with `?tenant=<slug>` routing.)

2. **Read-only rested on a single layer.** `readOnly: true` was set only on the
   **write** path (`tenantAction`). Reads (`lib/queries/* → withTenant(tenantId)`)
   did not arm it, and pg-boss enqueues (PDF/email) run on a **separate
   connection** the audit trigger never sees. So the guarantee was "safe because
   nothing currently writes on the read path / no enqueue currently slips
   through", not safe by construction.

This feature deliberately crosses the tenant-isolation boundary RLS exists to
enforce, so it must be read-only by construction, must never weaken RLS for
normal tenant users, must never use a BYPASSRLS/superuser role, and every access
must be audited.

### Decision

Keep the existing architecture (operator views the real tenant app under a
banner) and make read-only **defense-in-depth, path-independent**:

- **Belt #1 — app layer (deterministic).** `tenantAction` now **refuses every
  action before its body runs** when an impersonation cookie is present
  (returns `READ_ONLY`). This is statement-order-independent and cuts off the
  side channels the DB cannot see — pg-boss PDF/email enqueues run on a separate
  pool, so they must be stopped at the source, not by a later in-transaction
  write tripping.

- **Belt #2 — DB layer (by construction).** `withTenant` issues
  `SET TRANSACTION READ ONLY` (and sets `app.read_only`) whenever read-only is
  forced. Postgres itself then refuses every INSERT/UPDATE/DELETE on **any**
  table — including non-audited / non-RLS tables and any future write path —
  regardless of whether the caller remembered `{ readOnly }`. A **resolver**
  injected by the web app (`setReadOnlyResolver`, registered in
  `instrumentation.ts`) returns true whenever the impersonation cookie is
  present, so EVERY `withTenant` in an impersonated request (reads included) is
  read-only. The resolver can only ADD restriction, never relax it, and returns
  false outside a request (workers/seeds/cron), so it fails safe.

- **Production dead-end fix.** The impersonation cookie is scoped to
  `.dealerlink.in` in production (mirroring the Lucia session cookie) so it
  travels to the tenant subdomain. It remains httpOnly, `secure` in prod, 1-hour
  TTL, and is issued only by `enterImpersonation` (operator-gated).

- **Slug/cookie consistency.** Because the cookie now travels to every tenant
  subdomain, the `(app)` shell requires the resolved subdomain/`?tenant=` slug to
  match the cookie's tenant (the one whose entry was audited); a mismatch
  redirects to `/admin`. Prevents rendering tenant B under a "viewing A" claim.

- **Audit.** Entry (`operator_impersonation_view`) and exit
  (`operator_impersonation_exit`) are written to `access_log` with operator id,
  tenant, IP, UA, timestamp — queryable later. These are append-only audit
  writes via a direct connection (not `withTenant`), so they are intentionally
  exempt from the read-only guard and keep working during a view.

RLS is untouched: normal tenant users have no impersonation cookie, so neither
belt engages for them, and tenant-to-tenant isolation is unchanged. No
BYPASSRLS/superuser role powers the view — reads run through `dealerlink_app`
(NOBYPASSRLS) scoped by `app.tenant_id`, exactly like a tenant user.

### Consequences

Positive:

- Read-only is true by construction: a future "last-viewed" / counter / async
  job added on the read path cannot write during a view, even if the author
  never routes through `tenantAction`.
- Two independent belts: the app refusal and the Postgres read-only transaction
  each suffice alone; a missed code path on one is caught by the other.
- The operator sees exactly what the tenant sees (best for support), under a
  persistent read-only banner.

Tradeoffs:

- All `tenantActions` are refused during a view, including PDF/email generation.
  This is deliberate: generating a document enqueues a job and writes
  `generated_documents` — a state mutation. The operator views on-screen instead.
- Write buttons remain visible in the tenant app and surface a read-only error
  when clicked, rather than being hidden. Server refusal is the security
  boundary; hiding is cosmetic (a future UX nicety).

### Rejected alternatives

1. **Dedicated operator read-only "inspector" pages (Design 2).** Safe by
   construction (no write paths exist) but discards the working flow and adds a
   large parallel read-only UI to build and maintain. The two-belt approach
   reaches the same guarantee without the rebuild.
2. **Time-boxed signed read-only token (Design 3).** More machinery; the 1-hour
   httpOnly cookie already time-boxes access. Overkill for a support use case.
3. **A BYPASSRLS/read-only DB role for the view.** Rejected — would route tenant
   reads through a role outside the RLS model. The view uses the normal
   `dealerlink_app` role + `app.tenant_id`, so RLS still scopes every read.

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

## ADR-012 — Place of supply uses Ship-To, not Bill-To

### Context

CLAUDE.md §5 originally simplified GST classification to "Ship-To state does NOT affect tax — only Bill-To matters." That held through Days 1–8 because a quotation has exactly **one** dealer: there is no separate Ship-To, so Bill-To and the place of supply are the same row.

Day 11 introduced the three-party document (PI / Order) with a Bill-To dealer and a potentially **different** Ship-To dealer. The simplification then became wrong: under the IGST Act 2017 **§10**, the place of supply for goods is where delivery to the recipient is completed — the Ship-To location — and place of supply, not the payer's address, decides IGST vs CGST+SGST.

### Decision

**Place of supply = the Ship-To dealer's state.** Tax classification is decided by `tenant_state` vs `place_of_supply`, where `place_of_supply` is sourced as:

- **Quotations** — `dealer.state`. A quotation has no distinct Ship-To, so its single dealer is effectively both Bill-To and Ship-To. Behaviour unchanged from Day 8/9.
- **PIs, Orders, Tax Invoices, Dispatch Notes** — the **Ship-To dealer's state**. Bill-To state never enters the tax decision.

The `@dealerlink/tax` engine already takes an opaque `placeOfSupply` string, so no engine change was needed — only the callers feeding it the right state. CLAUDE.md §5 was rewritten; DEV.39 records the correction.

### Alternatives considered

- **Keep Bill-To-only** — contradicts Indian GST law; would misclassify every three-party PI/Order and break GST-return filing in Phase 2.
- **Make it a tenant setting** — unnecessary; §10 is statute, not tenant policy.

### Why this matters

Misclassifying inter/intra-state misstates the tax on the invoice — a compliance defect. The three-party scenario (a Maharashtra distributor billing a Maharashtra dealer but shipping to that dealer's Karnataka site) is common in distribution and must classify as inter-state IGST.

### Consequences

- A PI/Order can carry a **different tax classification than its originating quotation** when Ship-To differs in state from the quotation's dealer. The convert-to-PI flow surfaces this with an explicit banner.
- `place_of_supply` is recomputed whenever Ship-To changes (convert, PI edit).
- Quotations are unaffected — they have no separate Ship-To.
- Supersedes the "Ship-To does not affect tax" sentence in the pre-Day-11 CLAUDE.md §5.

---

## ADR-015 — PDF rendering is in-process Typst; Chromium is removed

**Date:** 2026-09-13
**Status:** Accepted
**Supersedes:** ADR-013 (which remains, and is still the correct record of why
the queue exists)
**Closes:** DEV.89, F.32
**Implements:** F.38

### Context

ADR-013 put Chromium behind the pg-boss queue and gave the workers component a
custom Dockerfile carrying fourteen shared libraries. That decision was right and
is not being reversed: **the queue survives this ADR unchanged.** What changed is
what runs inside the job.

Three properties the Chromium pipeline could not provide, each of which cost real
time before it was named:

1. **Byte-stable output.** Chromium stamps `/CreationDate` and `/ModDate` from
   the wall clock and numbers tagged-PDF structure elements from a per-browser-
   process counter. Two renders of the same document differ (DEV.125). Without
   byte stability there is no snapshot test, and PDF verification falls back to
   image diffing.
2. **A hermetic render.** Every render fetched Google Fonts over the network,
   _inside the render_. If Google were unreachable, Chromium fell through to
   system fonts and produced a differently typeset legal document with no error.
   The requested fonts never arrived anyway — every Chromium-rendered reference
   is set in Liberation Sans via that fallback.
3. **One binary across three architectures.** `@sparticuz/chromium` ships x86-64
   only; the devcontainer is arm64. DEV.89 records the divergence and the
   `PUPPETEER_EXECUTABLE_PATH` gating it forced.

### Decision

**Render with Typst, in-process, inside the same `render-pdf` job.**

- pg-boss, the queue, the job payload, `generated_documents` and the web Server
  Action's polling contract are **unchanged**. ADR-013's isolation argument still
  holds; it simply no longer needs a browser to isolate.
- Templates are Typst source in `apps/workers/src/templates-typst/`, sharing one
  `_lib/chrome.typ`. The performa invoice imports the quotation body rather than
  copying it.
- **Fonts are vendored** (`src/pdf/fonts/`) and the renderer passes
  `--ignore-system-fonts`. No network in the render path, and identical
  typography on every architecture.
- **`SOURCE_DATE_EPOCH` is derived from the document**, by the renderer, not by
  an env var a harness happens to set. A value pinned only in tests would make
  the snapshots prove a property production lacks.
- **The Typst binary is pinned by version and sha256, per architecture**, in
  three places that must agree: `scripts/install-typst.mjs`,
  `apps/workers/Dockerfile`, and CI. Removing one binary divergence is not worth
  much if it introduces another.
- `apps/workers/Dockerfile` becomes a plain Node image plus that binary. The
  fourteen Chromium libraries, `fonts-liberation` and the emoji font are gone.

### Why Typst and not @react-pdf/renderer

Recorded here so the decision is reconstructible without the plan document, and
because the evidence is specific rather than a matter of taste:

- **react-pdf issue #3168** — ₹ (U+20B9) renders as the character `1` in the
  default fonts. On a currency document that is not a visible failure; it is a
  _plausible wrong character_. A dealer files ITC against these numbers.
- **react-pdf issue #3047** — text rendered with fonts registered via
  `Font.register` is parsed as garbled symbols by PDF parsers while looking
  correct in a viewer.

Those two interact badly: a custom font is mandatory to get ₹ at all, and
registering one compromises text extraction. Byte-stable snapshots are also
unavailable there, so verification would have fallen back to image diffing —
slower, more brittle, and a worse story than Typst for roughly one day less work.

The Day 25 spike verified the four blocking properties before any template was
written: ₹ renders **and** survives extraction; `counter(page)` gives real
"Page X of Y"; output is byte-identical across two renders; and 500 serials break
cleanly with a repeating header.

### Consequences

**Gained.** Snapshot tests on all four document paths, asserting on the footer
and the dates rather than around them. Renders at 57–125ms (median 66ms) against
Chromium's 60–90s cold launch. Peak RSS 119.6 MB against the 512 MB that
OOM-restarted the worker (DEV.67). No network dependency inside a render. One
statically-linked binary instead of fourteen shared libraries.

**Lost.** HTML/CSS as the template language, and with it the ability to preview a
document in a browser. Typst is a smaller ecosystem than Chromium, and its layout
engine is not contractually stable across versions — hence the version pin, which
is load-bearing rather than hygienic: the reference baseline was captured from
the Chromium pipeline immediately before deletion and **cannot be regenerated**.

**Unresolved.** The 500-serial stress case breaks one chip row later than
Chromium did (224+276 against 217+283). Identical serials, identical order, two
pages either way. Verified stable across five renders; recorded in
`docs/TYPST_DIFF.md` rather than tuned away.

**Not done here.** `apps/workers` is not collapsed into `apps/web`. The original
work order proposed it once rendering was in-process, and it remains correct and
separate — it is a change to the deployment topology, not to the renderer.

## ADR-013 — Puppeteer rendering is queue-isolated to workers component

**Date:** 2026-05-22
**Status:** SUPERSEDED by ADR-015 (2026-09-13) — Chromium was replaced by
in-process Typst. **The queue isolation this ADR established was NOT reversed**:
pg-boss, the `render-pdf` job and the polling contract are unchanged. What this
record still explains, and ADR-015 does not repeat, is why PDF rendering left the
web process in the first place — a `libnss3.so` failure on the App Platform Node
buildpack that only appeared in staging.
**Closes:** DEV.63

### Context

Stage B Day 10 (DEV.36) introduced PDF generation with the intent of running
Chromium in the workers component per CLAUDE.md §7 line 336
("Don't render PDFs on the web process — always queue to the workers process").
However, the actual implementation used a subprocess-spawn pattern (spawnPdfRender)
that kept Chromium running inside the web process. This drift was latent through
Stage B because local development shares the host machine — both processes had
access to all system libraries.

Stage C Day C.0 staging deployment surfaced this as a `libnss3.so: cannot open
shared object file` error when the web process tried to launch Chromium on DO
App Platform's Node buildpack image (which lacks Chromium runtime libraries).

### Decision

All PDF generation routes through pg-boss `render-pdf` queue. Architecture:

- Web action enqueues a `render-pdf` job with documentType, documentId, tenantId
- Workers component processes the job via Puppeteer + @sparticuz/chromium
- Workers component runs from a custom Dockerfile (`apps/workers/Dockerfile`)
  that installs Chromium runtime dependencies (libnss3, libatk-bridge2.0-0,
  libdrm2, libgbm1, libxkbcommon0, libpango-1.0-0, libgtk-3-0, libasound2,
  libxcomposite1, libxdamage1, libxrandr2, libxshmfence1, libxss1, libxtst6,
  fonts-liberation, fonts-noto-color-emoji)
- Workers writes the generated PDF to the `generated_documents` table
- Web action polls `generated_documents` row (default 120s timeout, configurable
  via PDF_RENDER_TIMEOUT_MS)
- User-perceived experience remains synchronous: click → spinner → PDF download

Implementation guards:

- The web process MUST NOT import `puppeteer-core` or `@sparticuz/chromium`
- The workers process is the sole owner of Chromium lifecycle
- Eager-warm at worker boot extracts Chromium binary (~3-4s) without blocking
  consumer registration (PDF_EAGER_WARM env var, default true)
- Idle-recycle window: 45 minutes (was 10 minutes; widened in DEV.67)
- Per-100-pages recycle remains as a backstop against Puppeteer memory drift

### Consequences

Positive:

- Web bundle stays slim (~50MB, no Chromium binary)
- Workers can scale independently for PDF-heavy workloads
- Failures in PDF rendering cannot crash the web app
- Web component runs on standard Node buildpack (cheap, simple)
- Memory profile per component matches its actual workload

Tradeoffs:

- PDF generation has ~1-3s additional latency vs in-process synchronous (acceptable
  for distributor UX; warm renders measure 3-5s steady state on basic-xxs)
- Transient ~1-2 min post-deploy window where Chromium launch contends for 512MB
  with the outgoing container during rolling deploys
- Worker boot time includes the eager-warm extraction (~3-4s)
- Additional database I/O (polling generated_documents) — measured at <5% of total
  PDF generation time

### Rejected Alternatives

1. **Dockerize the web component with Chromium**: Rejected. Violates CLAUDE.md §7
   line 336. Adds 170MB to web bundle. Doubles memory footprint. Slows web
   cold-starts. Would lock in technical debt permanently.

2. **Browserless.io (managed PDF service)**: Deferred to Phase 2. The cost
   ($25-50/month) and external dependency are real considerations, but current
   volume doesn't justify the trade-off. Re-evaluate in Phase 2 if operational
   overhead grows.

3. **@sparticuz/chromium-min with manual dependency layer**: Rejected. Fragile
   approach (DO base images can change), maintenance burden, no architectural
   benefit over the Dockerfile approach.

### Related Deviations

- DEV.36 (superseded): Original Day 10 subprocess-spawn pattern
- DEV.63 (resolved): Architectural correction that closed the gap
- DEV.64 (resolved): .do/app.yaml ↔ deployed-spec sync workflow
- DEV.65 (resolved): corepack signature check failure → switched to npm install -g pnpm
- DEV.66 (resolved): Cold-start timeout adjustment (60s → 120s)
- DEV.67 (resolved): Idle-recycle widened to 45m; worker sizing flagged for Stage D

## ADR-016 — Place of supply follows the delivery arrangement: §10(1)(a) ship-to, §10(1)(b) bill-to

**Date:** 2026-09-27
**Status:** Accepted
**Supersedes:** ADR-012 (which remains, and is still the correct record of the case
it reasoned about)
**Implements:** F.5a
**Related:** F.112 (the onboarding observation that surfaced the distinction), F.132
(`placeOfSupplyOverride`), F.134 (seed reproducibility)

### Context

ADR-012 established that place of supply for goods is the **ship-to** location and
not the payer's address, correcting a Bill-To-only simplification that had been
harmless while a quotation carried exactly one dealer. That decision was right, and
it is not being reversed.

What ADR-012 did not distinguish is **which** §10 sub-clause it was applying. Read
in full, it cites "the IGST Act 2017 **§10**" generically, and its worked example
is "a Maharashtra distributor billing a Maharashtra dealer but shipping to **that
dealer's** Karnataka site". That is one dealer with two sites — the §10(1)(a) case,
where goods are delivered to the recipient and the place of supply is where delivery
ends. ADR-012 is correct about it.

§10(1)(b) is a different arrangement with a different answer. Where goods are
delivered to someone **on the direction of a third person**, the place of supply is
that third person's principal place of business — so it derives from the **bill-to**
party, not the ship-to one. Both arrangements occur in any real dealer network, and
which one applies is a fact about the individual transaction. A distributor shipping
to a dealer's own warehouse and a distributor shipping to a dealer's customer on that
dealer's instruction are doing different things, and the statute taxes them
differently.

So the gap ADR-012 left is not an error in its reasoning; it is a case it never
reached. "ADR-012 was wrong" is the wrong summary and would mislead the next reader.

### Decision

**Place of supply derives from the party that the document's recorded delivery
arrangement selects.**

- **§10(1)(a)** — goods delivered to the recipient → the **ship-to** state.
- **§10(1)(b)** — goods delivered to a third party on the recipient's direction →
  the **bill-to** state.

The selecting condition is the arrangement, recorded **per document** in
`performa_invoices.delivery_arrangement` and `orders.delivery_arrangement`. The rule
itself is one pure function, `resolvePlaceOfSupply` in `packages/tax`, beside
`isInterState` and for the same reason: it is a statutory classification rather than
a caller's convenience, and CLAUDE.md §5 says tax rules are never inlined in routes.

**It is not a tenant setting.** ADR-012 rejected that option on the ground that §10
is statute and not tenant policy, and that rejection stands unchanged — with more
force now, not less, because the arrangement varies between two documents issued by
the same tenant on the same day.

**Quotations are unaffected.** A quotation has one dealer, so the parties cannot
differ, the question cannot arise, and place of supply remains `dealer.state`. The
column exists only on the two tables where a distinct ship-to and a stored place of
supply both exist.

**Orders copy the arrangement forward from the PI; they never re-derive it.** Like
`tenant_state_at_issue` and `place_of_supply` beside it, this is an at-issue
snapshot. Re-deriving on confirmation would read dealer states that may have moved
since the PI was issued, and an order that stored a place of supply without the
arrangement that selected it would print a tax type whose justification it does not
carry.

#### (a) is the default, and that is load-bearing rather than convenient

`NULL`, absent, and any unrecognised value all resolve to (a). `NULL` specifically
means _the parties were the same, so the question could not arise and was never
asked_ — which is why the column is nullable rather than `NOT NULL DEFAULT 's10_1_a'`.
A default would assert on the record that somebody determined the arrangement for
every single-party document in the corpus, which nobody did.

This is what makes "no existing document reclassifies" a measured fact rather than an
intention. F.5a's baseline census, taken on a clean reseed before any change:
**all eight** differing-party documents in the seeded corpus — 6 of 68 PIs and 2 of
48 orders — carry `place_of_supply` equal to the **ship-to** state. The corpus is
uniformly arrangement (a). Defaulting to (a) therefore reproduces every stored
classification exactly, and the migration writes to no existing column at all. The
post-change census confirmed it: **0 of 162 rows moved.**

#### Where an override is present, the override wins

> "Where placeOfSupplyOverride is set, it wins. The override names a place of supply
> directly; the arrangement only selects which party's state to derive one from. A
> derivation cannot overrule a value that was stated. Any document where both are
> present must be treated as a data-quality finding, not a precedence question — no
> UI sets the override, so its presence alongside an arrangement means something
> wrote it that should not have."

That precedence is applied by the **callers**, not inside `resolvePlaceOfSupply`,
because the callers are the only place that sees both. Putting it in the resolver
would mean a pure function silently ignoring one of its own arguments. `F.132` is
filed to revisit the override itself, which is now formally authoritative while being
settable by no user interface.

#### The stored values name the statute, not the party

The two values are **`'s10_1_a'` and `'s10_1_b'`**, not `'ship_to'` and `'bill_to'`.

The alternative will look more readable to the next reader, and it was not taken.
A value named for its **effect** restates the derivation inside the data, so
correcting the derivation later would silently turn every stored row into a false
record of what was determined — the rows would claim a party was chosen when what
was actually recorded was a transaction type. A **clause reference cannot drift from
the statute it cites**: if the mapping from clause to party ever changes, the stored
rows stay true and only the function changes.

This is the same principle as `tenant_state_at_issue` snapshotting the tax engine's
**input** rather than its conclusion, and it is the same reason F.99 exists: a
document that stores a conclusion without the input that produced it cannot be
audited, and cannot be corrected without guessing what it meant.

### Alternatives considered

- **Leave ADR-012's single rule in place and treat §10(1)(b) as out of scope.**
  Rejected: the arrangement is not exotic. Any dealer network does both, and the
  cost of getting it wrong is a misstated tax on an issued invoice.
- **Ask the client which arrangement they use and implement only that one.** This was
  the original plan and was abandoned deliberately: the distinction is
  **per-document**, not per-tenant, so there is no single answer to ask for. What
  survives of the question is F.112, an onboarding observation.
- **Make the arrangement a tenant setting.** Rejected for ADR-012's own reason.
- **Backfill an explicit arrangement onto existing rows.** Rejected, and this is the
  most important rejection in this ADR. Every read path derives the tax type from the
  stored `place_of_supply`, so rewriting that column changes the tax type printed on
  documents that have **already been issued** — the F.99 failure mode with statutory
  consequences attached. The migration adds two nullable columns and two CHECK
  constraints and writes to nothing.
- **A `pgEnum` instead of `text` + CHECK.** Both need a migration to change, the
  codebase already mixes the two, and the `dispatches_status_chk` precedent is the
  closer one. `NULL` also passes an `IN` check, which is what lets the nullable
  column above be expressed without inventing a third "unknown" member.

### What is still unverified, stated plainly

**The statutory reading in this ADR is the operator's and the model's. It has not
been reviewed by a chartered accountant.** That is the same caveat
`docs/GST_RATE_MODEL_AUDIT.md` carries, and it is repeated here rather than assumed
because an ADR is exactly the document a later reader will treat as settled.

Specifically unverified: that §10(1)(b) is the correct clause for the
bill-to/ship-to arrangement as this product models it; and that a Goa-billed,
Maharashtra-shipped supply classifies the way F.112 describes. F.112 remains open as
an onboarding observation — on migration, Dealerlink may compute IGST where a
client's current system computed CGST + SGST, and they will report it as a bug on
day one. Nothing in this ADR resolves that; it makes the two readings expressible,
which is what was missing.

### Consequences

- A PI or order can classify differently from the quotation it descends from, for
  two reasons now rather than one: a ship-to in another state, **or** a §10(1)(b)
  arrangement. The convert and edit forms surface the classification from the server.
- `place_of_supply` is re-derived when ship-to changes **or** when the arrangement
  changes. Both are draft-only edits.
- The arrangement is asked **only** when ship-to and bill-to differ. When they match
  it is stored as `NULL`, because there is nothing to decide.
- `packages/tax` gained one file and one export and nothing else. `computeTax` still
  receives an opaque state string, exactly as ADR-012 described.
- The invariant that `place_of_supply` equals the state its own arrangement selects
  is now asserted for every seeded PI and order — the first test of it on this
  project (`packages/db/tests/place-of-supply-invariant.test.ts`). F.105's audit had
  recorded that nothing asserted it.
- **Not yet proven:** that the tax-type LABEL is correct on a rendered page under
  (b). The classification is proven; the rendering of it is F.131. A gap stated is a
  different object from a gap omitted.

---

_This log is append-only. Locked decisions are not edited; if a decision changes, write a new ADR that supersedes the old one._
