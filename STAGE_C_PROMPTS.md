# Stage C — Validation Prompts

Stage C runs from May 21 to May 27, 2026. Goal: validate the Stage B build is production-ready, deploy staging environment, close the two known feature gaps, security + performance audit, and prepare for Stage D production deploy.

**Pilot target:** Production live Wednesday, June 3, 2026.

## Schedule

| Day           | Date       | Focus                                                        | Status      |
| ------------- | ---------- | ------------------------------------------------------------ | ----------- |
| C.0           | May 21-22  | Staging deploy + DNS + SSL + DEV.63 architectural correction | ✅ Done     |
| Doc hygiene   | May 23     | STAGE_C_HANDOFF, ADR-013, CLAUDE.md cleanup                  | ✅ Done     |
| C.1           | May 23     | Force-password-change (closes DEV.56)                        | ✅ Done     |
| C.2           | May 24     | State code normalization (closes DEV.33)                     | ✅ Done     |
| C.3           | May 25     | Pilot staging handoff + UX walkthrough                       | ✅ Done     |
| **C.4**       | **May 26** | **Security audit + UX fixes from C.3 triage**                | **Current** |
| C.5           | May 27     | Performance test + Stage D handoff                           | ⏳          |
| Stage D start | May 28     | Production environment provisioning                          | —           |

---

## Stage C Day C.0 — Staging Deploy (✅ Complete — May 21-22)

**Commits:** 10189ab → 55350fb (+ follow-up fixes)

DO Managed Postgres BLR1 + DO App Platform (web basic-xs + workers basic-xxs custom Dockerfile) + Cloudflare DNS + SSL on apex/demo/sample. ~$30/month. All 4 PDF paths functional. Critical-path E2E passing.

11 deviations: DEV.57-67. Key correction: DEV.63 (PDF rendering moved from web→workers via pg-boss queue per CLAUDE.md §7, promoted to ADR-013).

## Doc Hygiene Pass (✅ Complete — May 23)

**Commits:** ad21d3a → 1078826

STAGE_C_HANDOFF evolved; ADR-013 added; CLAUDE.md hosting clarified; PROJECT_PLAN changelog updated.

## Stage C Day C.1 — Force-Password-Change (✅ Complete — May 23)

**Commits:** b3e36e7 → 56c19fd

DEV.56 closed. /change-password route + form + layout enforcement + login redirect. Password policy stricter than prompt suggested (DEV.69). Verify 54/54.

## Stage C Day C.2 — State Code Normalization (✅ Complete — May 24)

**Commits:** e886a37 → f98d3d1

DEV.33 closed. All 6 state columns normalized to ISO 3166-2:IN codes. UI shows names + submits codes. Tax engine parity preserved. Migration 15→16 on staging. 56 verify passing + 1 flaky-retry-passed. Critical-path passes on staging.

Three real bugs surfaced and fixed: DEV.70 (state normalization), DEV.71 (fragile three-party test), DEV.72 (server→client function prop crash, subsumes DEV.56(d)).

## Stage C Day C.3 — Pilot Staging Handoff (✅ Complete — May 25)

**Outcome:** "Substantially ready for pilot. No true pilot-blockers."

- 0 Critical (C-1 PDF 503 downgraded to infra cold-start, not product bug)
- 5 Important (I-1 through I-5)
- 12 Polish (P-1 through P-12)

Pilot confirmed several findings; nothing net new.

Triage:

- **For C.4-C.5:** I-1, I-2, I-4, I-5, P-9
- **Post-pilot:** I-3, P-1, P-2, P-6, P-7, P-8, P-10
- **Phase 2:** P-3, P-11, P-12

---

## Stage C Day C.4 — Security Audit + UX Fixes (Current — Tuesday May 26)

**Goal:** Read-only security audit produces actionable report. Apply 5 UX fixes from C.3 triage that are pre-pilot must-haves. Address C-1 (PDF cold-start UX) with a small mitigation.

**Estimated time:** 5-6 hours total. Morning security audit (~3 hours). Afternoon UX fixes (~2-3 hours).

**Sequence matters:** Security audit FIRST, read-only. Only after audit findings are reviewed do we touch code. This separates auditor and implementer mindset.

### Prompt for Claude Code

```
You are implementing Stage C Day C.4 of the Dealerlink build. C.3 closed yesterday with the outcome: "Substantially ready for pilot. No true pilot-blockers." Today does two things in sequence:

PART 1 (morning, ~3 hours): Read-only security audit. NO code changes. Generate findings report.
PART 2 (afternoon, ~2-3 hours): Apply 5 UX fixes from C.3 triage + address C-1 cold-start UX.

The break between parts is intentional. Stop after PART 1 completes the audit report. Wait for me to review findings before proceeding to PART 2.

PRELIMINARY:
P.1. `pnpm preflight` confirms green.
P.2. Read DEVIATIONS.md DEV.57-72 — Stage C deviations
P.3. Read DECISIONS.md ADR-001 through ADR-013 — all locked decisions
P.4. Read CLAUDE.md §6 (auth + multi-party logic), §7 (architecture)
P.5. Read docs/STAGING_ENV.md — what's deployed
P.6. Read docs/UX_FINDINGS.md — yesterday's triage (I-1 through I-5, P-9 in scope for today)
P.7. Read apps/web/middleware.ts + apps/web/lib/auth/* (Lucia integration)
P.8. Read packages/db/src/rls/* (RLS policies)

PRIMARY REFERENCES:
1. CLAUDE.md §6 + §7
2. DEVIATIONS.md
3. UX_FINDINGS.md triage decisions
4. apps/web/lib/auth/ (auth surface)
5. packages/db/src/schema/* (tables) + packages/db/src/rls/* (policies)

==========================================================
PART 1 — SECURITY AUDIT (READ-ONLY, ~3 HOURS)
==========================================================

DO NOT modify any application code in Part 1. Only generate the audit report. If you find issues that need code fixes, log them in the report; we'll address them in Part 2 or a follow-up.

CHUNK C4a — Security audit report scaffold + RLS verification
---------------------------------

A1.1. Create docs/SECURITY_AUDIT.md with sections:
   - Executive summary (counts: critical / high / medium / low / informational)
   - Methodology + scope
   - 1. Multi-tenant Isolation (RLS)
   - 2. Authentication + Session Management
   - 3. Role + Permission Enforcement
   - 4. Secrets Management
   - 5. Input Validation + Output Encoding
   - 6. Audit Logging + Observability
   - 7. Dependency Security
   - 8. Infrastructure Security (DO + Cloudflare)
   - 9. OWASP Top 10 Quick Check
   - 10. Findings Summary + Recommendations

A1.2. Section 1 — RLS verification:
   - List every table in the schema (use packages/db/src/schema/*)
   - For each table, check:
     - Does it have a tenant_id column?
     - Is RLS enabled (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)?
     - Does it have a policy that restricts to tenant_id = current_setting('app.tenant_id')?
     - Are policies in packages/db/src/rls/ comprehensive?
   - Cross-check: any table with tenant_id MUST have RLS enabled and a policy
   - Document each table's status in a table
   - Flag any gap as a finding (severity: critical if user-facing data, high if internal)

A1.3. RLS bypass surface audit:
   - Search for any use of `BYPASS_RLS` or admin-mode DB clients
   - Verify they only run from server-only contexts (server actions, workers)
   - Verify they always re-establish tenant context before tenant queries
   - Flag any use of bypass that doesn't immediately re-set tenant_id as a finding

A1.4. Cross-tenant query test:
   - Write a sample query that, given a session for tenant A, attempts to read tenant B's data
   - Document expected behavior (RLS rejects) and confirm via local test
   - Do NOT actually mutate data; just confirm the read is blocked
   - Document the test result in the audit report

COMMIT C4a: `docs(security): chunk a — audit scaffold + RLS verification`

CHUNK C4b — Auth + roles + secrets audit
---------------------------------

A2.1. Section 2 — Authentication + Session Management:
   - Lucia session security: HttpOnly cookie? Secure flag in production? SameSite=Lax/Strict?
   - Session expiration: what's the timeout? Idle vs absolute?
   - Password storage: argon2 hash + salt (verify)
   - Password policy: documented in CLAUDE.md §6; verify implementation matches (min 8, 1 upper, 1 number, 1 special per DEV.69)
   - Force-password-change flow (C.1): verify the trapdoor cannot be bypassed
   - Login rate limiting: is there any? If not, log as a finding (low severity for pilot, must address for production)
   - Account lockout: is there any? Same as above

A2.2. Section 3 — Role + Permission Enforcement:
   - Roles defined: operator, admin, sales, accounts, dispatch (per CLAUDE.md §6)
   - For each server action in apps/web/lib/actions/* or app routes:
     - Does it call requireRole() / hasPermission() / equivalent guard?
     - Is the guard before any DB mutation?
     - What role(s) can call this action?
   - Document the role matrix: which roles can do what actions
   - Flag any server action without a role guard as a finding (severity: high)
   - Verify operator-only actions (tenant create, etc.) cannot be called by tenant admins

A2.3. Section 4 — Secrets Management:
   - List every secret expected by the app (cross-ref .env.example + .do/app.yaml)
   - For each: is it actually set on staging? Production-ready or placeholder?
   - Audit log + audit_log for any secret values accidentally written (search for known patterns: API keys, passwords, tokens)
   - Verify nothing in git history contains real secrets (git log + secrets scanner)
   - Verify .gitignore correctly excludes /staging-secrets and similar local files
   - Flag any production-readiness gap as a finding (severity: high, blocks Stage D)

COMMIT C4b: `docs(security): chunk b — auth, roles, secrets audit`

CHUNK C4c — Input validation, audit log, dependencies, OWASP
---------------------------------

A3.1. Section 5 — Input Validation + Output Encoding:
   - Zod schemas on every server action: spot-check 5 random actions
   - SQL injection: Drizzle uses parameterized queries — verify; flag any raw SQL with string concat
   - XSS: React escapes by default; flag any dangerouslySetInnerHTML usage
   - CSRF: Next.js Server Actions have built-in CSRF; verify no custom POST endpoints bypass
   - File upload validation: if any upload endpoints exist, verify file type + size limits
   - HTTP headers: verify CSP, X-Frame-Options, X-Content-Type-Options, etc. in next.config

A3.2. Section 6 — Audit Logging + Observability:
   - audit_log table: is it written via triggers (per CLAUDE.md) or application code?
   - Verify triggers exist for tables that need audit trail (orders, payments, dispatches, user changes)
   - Sentry PII scrubbing: verify beforeSend or scrubbers exclude password fields, email contents, audit_log details
   - Axiom event taxonomy: spot-check that user.password_changed (per C.1) and other security events fire correctly
   - Health endpoint exposure: /api/health should not leak internal info (DB connection details, etc.) — verify

A3.3. Section 7 — Dependency Security:
   - Run `pnpm audit` and capture output
   - Document any high/critical CVEs in dependencies
   - For each: is it exploitable in our usage? (e.g., a dev-only package CVE is lower priority)
   - Recommend update path for production

A3.4. Section 8 — Infrastructure:
   - DO Managed Postgres: TLS enforced? Trusted-sources lockdown active (per C.0)? Backups configured (or noted for Stage D)?
   - DO App Platform: HTTPS-only? Health check timeout reasonable? Logs accessible only to authorized accounts?
   - Cloudflare: gray-cloud DNS-only on staging (per C.0); SSL/TLS mode "Full (strict)"; Always Use HTTPS enabled
   - Resend / observability secrets: verify staging placeholders are clearly marked NOT for production use

A3.5. Section 9 — OWASP Top 10 quick check:
   - A01 Broken Access Control: covered by RLS + role audit above
   - A02 Cryptographic Failures: covered by secrets + auth audit
   - A03 Injection: covered by input validation audit
   - A04 Insecure Design: high-level — does the architecture have known weaknesses?
   - A05 Security Misconfiguration: covered by infrastructure audit
   - A06 Vulnerable Components: covered by dependency audit
   - A07 ID + Auth Failures: covered by auth audit
   - A08 Software/Data Integrity: integrity of migrations + audit log + RLS policies
   - A09 Logging Failures: covered by audit log section
   - A10 SSRF: any server-side fetch calls? (Resend webhook handler, maybe). Verify URL allow-list.
   - One-line summary per item; expand only if a real finding

A3.6. Section 10 — Findings Summary:
   - Aggregate all findings from sections 1-9
   - Sort by severity: critical → high → medium → low → informational
   - For each: title, severity, location, recommendation
   - Highlight which findings block pilot vs which can wait for Stage D
   - Recommend a prioritized fix order

COMMIT C4c: `docs(security): chunk c — validation, audit, dependencies, OWASP`

==========================================================
PART 1 GATE — STOP HERE
==========================================================

After committing C4a-C4c, STOP. Print:
- Path to docs/SECURITY_AUDIT.md
- Executive summary: total findings by severity
- Top 3 findings that need fixing before pilot (if any)
- Any findings that should escalate to ADR-level decisions

Wait for the operator to review the audit report before proceeding to PART 2.

==========================================================
PART 2 — UX FIXES + COLD-START MITIGATION (~2-3 HOURS)
==========================================================

Resume here after operator reviews the security audit. Critical security findings (if any) get fixed first, before the planned UX work.

CHUNK C4d — Critical security fixes (if any)
---------------------------------

If the security audit surfaced any critical findings:
- Each fix is its own commit
- Use the audit report's recommendations as the brief
- After fixes, mark each in SECURITY_AUDIT.md as "FIXED — see commit <SHA>"

If no critical findings, skip C4d entirely and proceed to C4e.

CHUNK C4e — UX fixes from C.3 triage
---------------------------------

Apply the 5 fixes per UX_FINDINGS.md triage. Each finding gets its own commit.

A4.1. Finding I-1: Add "Create Quotation" CTA to deal detail page
   - On apps/web/app/(app)/pipeline/[id]/page.tsx (or wherever deal detail lives)
   - Add button "Create Quotation" that navigates to /quotations/new?deal=<dealId>&dealer=<dealerId>
   - Pre-populate dealer + deal link on the destination form
   - Test: open a seeded deal, click button, verify pre-populated form
   COMMIT: `feat(pipeline): add Create Quotation CTA to deal detail (I-1)`

A4.2. Finding I-2: Confirmation dialog on Deactivate dealer button
   - On the dealer detail page
   - Wrap the deactivate action in an AlertDialog component (shadcn/ui pattern, used elsewhere)
   - Dialog text: "Deactivate <dealer.legal_name>? This will prevent new quotations for this dealer. Existing quotations and orders are unaffected."
   - Confirm button is destructive style; Cancel is the safe default
   - Test: try to deactivate, verify dialog appears, cancel doesn't deactivate, confirm does
   COMMIT: `feat(dealers): confirmation dialog before deactivation (I-2)`

A4.3. Finding I-4: Inventory shortage error names the product
   - In the confirm-order action, when shortage detected, include product name + required + available
   - Error message format: "Cannot confirm — <product_name>: need <qty_needed>, have <qty_available>"
   - If multiple products short, list all in the error
   - Test: try to confirm an order with insufficient stock; verify message names the product
   COMMIT: `feat(orders): name product in inventory shortage error (I-4)`

A4.4. Finding I-5: Redirect /reports/outstanding-receivables → /reports/outstanding
   - In next.config.mjs add redirects() entry
   - 301 permanent redirect
   - Test: navigate to /reports/outstanding-receivables, verify lands on /reports/outstanding
   COMMIT: `feat(reports): redirect outstanding-receivables to outstanding (I-5)`

A4.5. Finding P-9: formatINR space-after-thousands-comma fix
   - In packages/schemas/src/format.ts (or wherever formatINR lives)
   - Fix the space character introduced after thousands comma
   - Add unit test: formatINR(1234567) === "₹12,34,567" (no spaces)
   - Test: load a quotation detail page, verify totals render without space
   COMMIT: `fix(format): remove space after thousands comma in formatINR (P-9)`

CHUNK C4f — Cold-start UX mitigation (addresses C-1 downgrade)
---------------------------------

The PDF 503 issue from C.3 was downgraded as "infra cold-start" rather than a product bug. But the pilot will hit this same scenario their first PDF download. Small product-side mitigation:

A5.1. Add a friendly loading state for the first PDF render after a worker cold start:
   - In the PDF download action (PdfProgress component, wherever it's wired)
   - On first render attempt: if it takes >5 seconds, show: "First PDF takes a moment to prepare while we warm up our document service. Subsequent renders will be instant."
   - On retry: don't show the warm-up message
   - This is a copy change, not a behavior change

A5.2. Verify the 120s timeout from DEV.66 still applies. If somehow it was reduced, restore to 120s.

A5.3. Test: trigger a PDF render after worker idle (cannot easily simulate locally, but verify the message renders correctly when delay is artificially induced).

COMMIT: `feat(pdf): warm-up message on first cold render (mitigates C-1)`

CHUNK C4g — Day closeout
---------------------------------

A6.1. Verify all gates green:
   - pnpm preflight
   - pnpm typecheck, lint, test
   - pnpm verify (56/56 or 57/57 depending on if new spec added)
   - Local smoke: each of the 5 UX fixes manually verified

A6.2. Update PROJECT_PLAN.md:
   - Mark C.4 ✅ with date 2026-05-26
   - Note: security audit complete + 5 UX fixes + cold-start mitigation

A6.3. Update STAGE_C_HANDOFF.md:
   - Mark C.4 ✅ in Stage C Progress section
   - Reference SECURITY_AUDIT.md
   - Update Carried-Forward section: which UX findings remain for post-pilot

A6.4. Update UX_FINDINGS.md:
   - Mark I-1, I-2, I-4, I-5, P-9 as ✅ FIXED with commit SHAs

A6.5. Push to main (auto-deploys to staging).

A6.6. Post-deploy verification:
   - Staging redeploy ACTIVE
   - /api/health green
   - Manual smoke: trigger each of the 5 UX fixes on staging
   - Confirm: PDF download from staging shows warm-up message (or completes fast if worker warm)

COMMIT C4g: `feat(stage-c): Day C.4 complete — security audit + UX fixes + cold-start UX`

GUARDRAILS (C.4):

- Part 1 is read-only. Do not modify application code during Part 1. If you find code-level issues, log them in the audit report; don't fix until Part 2.
- The Part 1 gate is real. Do not proceed to Part 2 until the operator reviews the audit and approves.
- Security findings have priority over UX fixes. If audit surfaces a critical, that ships before any UX fix.
- The 5 UX fixes are scoped narrowly. Don't expand scope to adjacent issues; those go to post-pilot or Phase 2 per yesterday's triage.
- The cold-start UX mitigation is COPY ONLY. No infrastructure changes (no worker resize, no minimum instance count) — those are Stage D decisions per DEV.67.
- Each finding/fix is its own commit. Don't batch.

WHEN DONE (final):
- Print summary: security audit report committed; 5 UX fixes shipped; cold-start UX mitigation shipped
- Confirm: pnpm verify all green
- Confirm: staging redeploy succeeded
- Confirm: I-1, I-2, I-4, I-5, P-9 marked FIXED in UX_FINDINGS.md
- Tell me C.4 is complete and Day C.5 (performance test + Stage D handoff) is next
```

### Verification checklist (operator)

#### Part 1 (after C4a-C4c)

- [ ] `docs/SECURITY_AUDIT.md` exists with all 10 sections
- [ ] Executive summary shows finding counts by severity
- [ ] RLS verification table covers every tenant-scoped table
- [ ] Role enforcement matrix covers every server action
- [ ] Operator reviews findings before approving Part 2

#### Part 2 (after C4d-C4g)

- [ ] All critical security findings (if any) fixed before UX work
- [ ] I-1 fix: deal detail page shows "Create Quotation" CTA
- [ ] I-2 fix: Deactivate dealer shows confirmation dialog
- [ ] I-4 fix: Order shortage error names product + qty
- [ ] I-5 fix: /reports/outstanding-receivables redirects
- [ ] P-9 fix: formatINR has no space after comma
- [ ] Cold-start UX: warm-up message shows on first slow render

#### Closeout

- [ ] All gates green (preflight, typecheck, lint, test, verify)
- [ ] Staging redeploy successful + smoke verified
- [ ] PROJECT_PLAN.md + STAGE_C_HANDOFF.md + UX_FINDINGS.md updated

---

## Stage C Day C.5 — Performance Testing + Stage D Handoff (Wednesday May 27)

_Will be added when C.4 closes. Load test against staging (PDF generation, concurrent dispatches, payment allocations), pg-boss queue depth under load, worker sizing decision per DEV.67, final docs/STAGE_D_HANDOFF.md._

---

## Stage D — Production Deployment (May 28 - May 31)

_Detailed prompts added at close of Stage C._

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts added at close of Stage D._
