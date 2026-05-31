# Stage D — Production Deployment Prompts

Stage D runs from May 26 to May 31, 2026. Pilot live target: Wednesday, June 3, 2026.

## Schedule

| Day            | Date       | Focus                                                                     | Status      |
| -------------- | ---------- | ------------------------------------------------------------------------- | ----------- |
| D.0            | May 26     | Production environment provisioning                                       | ✅ Done     |
| D.1            | May 27     | Production secrets + Resend + observability                               | ✅ Done     |
| D.1 follow-up  | May 27     | Axiom region + Sentry workers + BetterStack                               | ✅ Done     |
| DNS diagnostic | May 28     | DNS architecture documented + D.3 wildcard plan                           | ✅ Done     |
| D.2            | May 28     | F-1 + F-3 + DEV.64 + DEV.73 + DEV.79                                      | ✅ Done     |
| **D.3**        | **May 29** | **Wildcard SSL + backup rehearsal + single-tenant smoke + pilot dry-run** | **Current** |
| Buffer         | May 30-31  | 2 days of slack                                                           | —           |
| Stage E start  | Jun 1      | Pilot tenant provisioning                                                 | —           |

## Locked Decisions

- Production domain: `app.dealerlink.in` + tenant subdomains `<tenant>.dealerlink.in`
- SSL: DO-managed; wildcard via DO-native (Option A per STAGE_D_HANDOFF §6)
- Sizing: web basic-xs + workers basic-xs + DB Basic 2 GB = ~$54/mo
- Reserved slugs: enforced (DEV.73)

---

## Retrospectives — D.0 through D.2

### D.0 — Production Environment (✅ May 26)

**Commits:** a53ffd9 → 47d70339. DO project + Postgres Basic 2GB + App Platform web+workers basic-xs + dual-role RLS + operator seed + Cloudflare gray-cloud + SSL on app.dealerlink.in. DB firewall locked.

### D.1 — Observability + Email (✅ May 27)

**Commits:** 0d2a34c → 61bedc0. Resend (sending-only), Sentry web+workers, BetterStack, Axiom, DEV.74 health-check patch.

### D.1 Follow-up (✅ May 27)

**Commits:** ced11d7 → 063e2ea. DEV.75 (Axiom EU/US region fix), DEV.76 (BetterStack 3min + Singapore), DEV.77 (Sentry workers verified).

### DNS Architecture Diagnostic (✅ May 28)

**Commit:** 5fbffc0. DEV.78. STAGE_D_HANDOFF §6 rewritten. DO supports native wildcards → D.3 Option A (~30-45 min). Cert issuer = Google Trust Services. Staging has per-tenant single-domain certs (no wildcard).

### D.2 — F-1 + F-3 + DEV.64 + DEV.73 + DEV.79 (✅ May 28)

**Commits:** 0c20952 → aa09192 (6 commits)

- F-1: Next.js 14.2.35 (CVE-2025-29927), 503 unit + 59 verify green
- F-3: login rate-limit + lockout, migration 0016 on both DBs, smoke verified
- DEV.64: Option C sync-spec script + R18 runbook (caught RESEND_FROM_EMAIL drift on first dry-run)
- DEV.73: reserved slug enforcement + 21 tests
- DEV.79: removed @logtail/pino worker-transport (was silently breaking Better Stack log shipping since D.1; surfaced via the Sentry worker.js diagnostic). Pino now stdout-only.

**Operator follow-up still open:** Update RESEND_FROM_EMAIL in .do/app.production.yaml to noreply@dealerlink.in on next spec edit.

---

## Stage D Day D.3 — Wildcard SSL + Backup Rehearsal + Single-Tenant Smoke + Pilot Dry-Run (Current — Friday May 29)

**Goal:** Final production hardening before Stage E pilot. Wildcard SSL so tenant subdomains work. Backup/restore rehearsal so we know recovery works. Single-tenant production smoke validates the full workflow on production infrastructure. Pilot dry-run rehearses the exact Stage E procedure.

**Estimated time:** 4-5 hours

- Wildcard SSL: 30-45 min (Option A) OR 2-3 hours (Option B fallback)
- Backup rehearsal: 1 hour
- Single-tenant smoke: 1-2 hours
- Pilot dry-run procedure doc: 1 hour

**This is the last validation gate before real pilot data touches production.**

### Prompt for Claude Code

```
You are implementing Stage D Day D.3 — the final day of Stage D. D.2 closed yesterday (6 commits, F-1/F-3/DEV.64/DEV.73/DEV.79 all live). Today does four things in sequence:

PART 1 (~30-45 min): Wildcard SSL for *.dealerlink.in (Option A per STAGE_D_HANDOFF §6)
PART 2 (~1 hour): Backup + restore rehearsal
PART 3 (~1-2 hours): Single-tenant production smoke (create test tenant, full workflow, delete)
PART 4 (~1 hour): Pilot dry-run procedure documentation for Stage E

Each part is independent. PART 1 has an operator gate (DNS TXT record). PART 3 creates + deletes a temporary tenant — careful cleanup required.

PRELIMINARY:
P.1. pnpm preflight green
P.2. Read STAGE_D_HANDOFF.md §6 — the D.3 Wildcard SSL Handoff Plan (Option A/B/C evaluation)
P.3. Read DEVIATIONS.md — current count is DEV.79; new entries start at DEV.80
P.4. Read docs/RUNBOOKS.md — R17 (migration), R18 (spec sync); D.3 may add R19+
P.5. Read PRODUCTION_ENV.md — current production state
P.6. Read the operator-onboarding flow (apps/web — how tenants get created) — PART 3 + 4 exercise this

PRIMARY REFERENCES:
1. STAGE_D_HANDOFF.md §6 (wildcard SSL plan)
2. DO App Platform domain docs (wildcard custom domains)
3. operator-onboarding flow (tenant creation)
4. critical-path E2E spec (the workflow PART 3 validates)

==========================================================
PART 1 — WILDCARD SSL (Option A — DO-native, ~30-45 min)
==========================================================

CHUNK D3a — Add wildcard domain to DO + DNS verification
---------------------------------

A1.1. Add *.dealerlink.in as a custom domain in DO App Platform:
   - Via doctl OR DO dashboard
   - Add domain: *.dealerlink.in to the production app (d8a25cb8)
   - DO will require DNS verification — it shows a TXT record to add

A1.2. OPERATOR GATE — DNS TXT record:
   - DO displays a TXT record (e.g., _acme-challenge or DO-specific verification)
   - SHOW me the exact TXT record name + value
   - I (operator) add it in Cloudflare (gray-cloud, DNS only)
   - PAUSE here — wait for operator confirmation that the TXT record is added

A1.3. Add wildcard CNAME in Cloudflare:
   - CNAME: * → dealerlink-production-8treh.ondigitalocean.app
   - Proxy: DNS only (gray-cloud) — consistent with app record
   - This makes <anything>.dealerlink.in resolve to the production app
   - VERIFY existing records (app, staging, *.staging, apex, www) unchanged

A1.4. Wait for DO to verify + issue wildcard cert:
   - DO validates the TXT record (can take 5-15 min)
   - DO issues the wildcard Let's Encrypt/Google Trust cert
   - Poll status: doctl apps get <app-id> — domain shows ACTIVE/verified

A1.5. Verify wildcard SSL works:
   - curl -vI https://test-tenant.dealerlink.in 2>&1 | findstr -i "subject issuer HTTP"
   - Even though test-tenant isn't a real tenant, the cert should cover it (wildcard)
   - Expect: cert subject *.dealerlink.in OR SAN includes it; HTTP response (may be 404/redirect for non-existent tenant, but SSL handshake succeeds)
   - curl -sI https://app.dealerlink.in/api/health — confirm existing app domain STILL works (didn't break)

A1.6. Document:
   - Update STAGE_D_HANDOFF.md §6: mark wildcard SSL ✅, note the approach used (Option A)
   - Update PRODUCTION_ENV.md: wildcard SSL active
   - Add RUNBOOK R19: "Wildcard cert renewal" — DO auto-renews but needs periodic TXT re-verification (~30-day notice); document the re-verify steps
   - Note the renewal nuance flagged in the diagnostic (DO needs periodic TXT re-verification even though cert auto-renews)

COMMIT D3a: `feat(prod): wildcard SSL for *.dealerlink.in (Option A, DO-native)`

==========================================================
PART 2 — BACKUP + RESTORE REHEARSAL (~1 hour)
==========================================================

CHUNK D3b — Verify backups + rehearse restore
---------------------------------

A2.1. Verify production DB automated backups are enabled:
   - doctl databases backups list <prod-db-cluster-id>
   - DO Managed Postgres includes daily backups (7-day retention default)
   - Confirm backups exist + retention period
   - If not enabled: enable + document

A2.2. Verify point-in-time recovery (PITR):
   - DO Managed Postgres supports PITR within the backup window
   - Confirm it's available for the production cluster
   - Document the recovery window (how far back can we restore)

A2.3. Rehearse a restore (to a NEW cluster, NOT overwriting production):
   - Create a temporary restore-target: fork the production DB to a new cluster from latest backup
   - doctl databases create dealerlink-restore-test --engine pg ... OR use DO's fork-from-backup
   - This creates a SEPARATE cluster — production is untouched
   - Verify the restored cluster has the data (connect, check row counts on a few tables)
   - Confirm migration version matches (should be 17)
   - This proves restore WORKS — the whole point of the rehearsal

A2.4. Document RTO/RPO:
   - RPO (Recovery Point Objective): how much data could we lose = backup frequency (daily) + PITR granularity
   - RTO (Recovery Time Objective): how long to restore = time to provision new cluster + repoint app
   - Document realistic numbers based on the rehearsal timing
   - Add to STAGE_D_HANDOFF.md or a new docs/DISASTER_RECOVERY.md

A2.5. CLEANUP — destroy the restore-test cluster:
   - doctl databases delete dealerlink-restore-test
   - Confirm deletion (don't leave a ~$30/mo orphan cluster)
   - Verify production cluster untouched throughout

A2.6. Document the recovery procedure:
   - RUNBOOK R20: "Production DB disaster recovery" — step-by-step restore from backup
   - Reference the rehearsal that proved it works

COMMIT D3b: `docs(dr): backup verification + restore rehearsal + R20 recovery runbook`

==========================================================
PART 3 — SINGLE-TENANT PRODUCTION SMOKE (~1-2 hours)
==========================================================

This validates the FULL workflow on production infrastructure using a temporary tenant. The pilot's real tenant comes in Stage E; this is the rehearsal.

CHUNK D3c — Create test tenant + full workflow + cleanup
---------------------------------

A3.1. Create a temporary production test tenant via operator-onboarding:
   - Login as operator on app.dealerlink.in
   - Create tenant: "D3 Smoke Test Co" with slug "d3smoketest" (NOT a reserved slug)
   - This exercises the real tenant-creation flow on production
   - Admin user gets temp password + must_change_password=true (per C.1)
   - Tenant subdomain: d3smoketest.dealerlink.in (validates the new wildcard SSL!)

A3.2. Verify wildcard SSL on the real tenant subdomain:
   - curl -sI https://d3smoketest.dealerlink.in/api/health — 200, valid wildcard cert
   - This is the REAL test of PART 1's wildcard SSL — an actual tenant subdomain

A3.3. Complete the tenant admin first-login:
   - Login as the test tenant admin with temp password
   - Forced to /change-password (C.1 flow)
   - Set a password
   - Land on dashboard

A3.4. Run the full workflow as the test tenant:
   - Create a dealer
   - Create a product in catalog
   - Add inventory
   - Create a deal → quotation → send → accept
   - Convert to PI → confirm
   - Verify order created + inventory reserved
   - Record a payment → allocate
   - Create a dispatch → pick serials → mark delivered
   - Generate PDFs at each step (quotation, PI, receipt, dispatch note)
   - Verify each PDF renders (tests the queue-based rendering on production, ADR-013)
   - Check a report (GST summary)

A3.5. Verify production-specific behaviors:
   - PDF generation works (workers basic-xs, eager-warm) — time the renders
   - Email send: does it actually deliver via Resend? (send a quotation, check the configured inbox)
   - State display correct (C.2 normalization)
   - Tax calc correct (intra vs inter-state)
   - Observability: do events reach Sentry/Axiom for this tenant's activity?

A3.6. CLEANUP — remove the test tenant:
   - This is critical: the test tenant must NOT exist when the real pilot launches
   - Operator deletes the tenant (or marks inactive + purges)
   - Document HOW to cleanly remove a tenant (this becomes useful knowledge)
   - Verify: d3smoketest.dealerlink.in no longer serves the tenant
   - Verify: no orphaned data (the tenant's dealers/products/orders gone or archived)
   - NOTE: if hard-delete isn't supported (RLS + FKs make it complex), document the "deactivate + the data stays but is inaccessible" approach
   - The pilot tenant in Stage E should be a FRESH tenant, not reusing this slug

A3.7. Document findings:
   - Did the full workflow work end-to-end on production?
   - Any production-specific issues (latency, PDF cold-start, email delivery)?
   - PDF render times on production workers (basic-xs) — confirms C.5 sizing decision
   - Email actually delivered? (first real email send on production)

COMMIT D3c: `test(prod): single-tenant full-workflow smoke + cleanup procedure`

==========================================================
PART 4 — PILOT DRY-RUN PROCEDURE (~1 hour)
==========================================================

CHUNK D3d — Document the exact Stage E pilot onboarding procedure
---------------------------------

A4.1. Create docs/PILOT_ONBOARDING_PRODUCTION.md:
   - This is the step-by-step procedure for Stage E Day E.1
   - Based on what PART 3 just rehearsed, but for the REAL pilot
   - Sections:
     1. Pre-onboarding checklist (pilot's legal name, GSTIN, address, bank details, T&C, logo)
     2. Operator creates the pilot tenant (exact steps, slug selection)
     3. Pilot admin receives credentials (how — email or manual handoff?)
     4. Pilot first-login + password change walkthrough
     5. Initial data setup guidance (pilot enters their dealers, products)
     6. Validation checklist (operator confirms tenant is correctly configured)
     7. Go-live confirmation

A4.2. Define the pilot tenant specifics (gather from operator):
   - Pilot company legal name: [operator provides]
   - Proposed slug: [operator decides — must not be reserved, must be available]
   - GSTIN, state (for tax calc): [operator provides]
   - This info needed before Stage E Day E.1

A4.3. Document rollback/abort procedure:
   - If pilot onboarding goes wrong, how to cleanly reset
   - Based on PART 3's cleanup learnings

A4.4. Stage E readiness checklist:
   - Wildcard SSL working (PART 1) ✅
   - Backup/restore proven (PART 2) ✅
   - Full workflow validated on production (PART 3) ✅
   - Email delivery confirmed (PART 3) ✅
   - Onboarding procedure documented (this part) ✅
   - Pilot company details gathered: [operator action before E.1]

COMMIT D3d: `docs(pilot): production onboarding procedure for Stage E`

==========================================================
CHUNK D3e — Stage D closeout
==========================================================

A5.1. Verify all gates green:
   - pnpm preflight, typecheck, lint, test, verify
   - Production /api/health green
   - Wildcard SSL active
   - No new Sentry errors from D.3 activity

A5.2. Update STAGE_D_HANDOFF.md:
   - Mark D.3 ✅
   - Mark Stage D COMPLETE
   - All deferred Stage C findings resolved (F-1, F-3) or documented (F-4 through F-9 post-pilot)

A5.3. Update PROJECT_PLAN.md:
   - D.3 ✅ with date 2026-05-29
   - Stage D ✅ COMPLETE
   - Add Stage E section header

A5.4. Update PRODUCTION_ENV.md:
   - Final production state: wildcard SSL, backups verified, workflow validated
   - Ready for Stage E pilot

A5.5. Tag Stage D complete:
   - git tag -a stage-d-complete -m "Stage D complete — production hardened + validated, ready for pilot"
   - git push --tags

A5.6. Final commit:
   - `feat(stage-d): Stage D complete — production ready for pilot launch`
   - Push to main

COMMIT D3e: `chore: Stage D close — tag stage-d-complete`

GUARDRAILS (D.3):
- PART 1 has an operator gate for the DNS TXT record. PAUSE and wait for confirmation. Don't proceed to cert verification until operator confirms TXT added.
- PART 2 restore rehearsal creates a SEPARATE cluster. NEVER restore over production. Destroy the test cluster after (don't leave a $30/mo orphan).
- PART 3 creates a REAL tenant on production. It MUST be cleaned up before Stage E. The pilot launches with a FRESH tenant, not this test one.
- PART 3's email send is the FIRST real production email. Verify it actually delivers (check inbox, including spam).
- Don't reuse the d3smoketest slug for the real pilot.
- If wildcard SSL Option A fails (DO doesn't verify the TXT), fall back to Option B (acme.sh) per STAGE_D_HANDOFF §6 — but surface to operator first, it's a 2-3 hour path vs 30 min.
- Each part commits separately.

WHEN DONE:
- Print summary of all 4 parts
- Confirm: wildcard SSL works on a real tenant subdomain (d3smoketest.dealerlink.in served with valid cert)
- Confirm: backup/restore rehearsal succeeded; test cluster destroyed
- Confirm: full workflow ran end-to-end on production; test tenant cleaned up
- Confirm: first production email delivered
- Confirm: PILOT_ONBOARDING_PRODUCTION.md ready for Stage E
- Confirm: stage-d-complete tag pushed
- Tell operator Stage D is COMPLETE and Stage E (pilot launch) is cleared to start
```

### Verification checklist (operator)

#### PART 1 — Wildcard SSL

- [ ] \*.dealerlink.in added to DO App Platform
- [ ] DNS TXT verification record added in Cloudflare
- [ ] Wildcard CNAME added (gray-cloud)
- [ ] DO issued wildcard cert (ACTIVE)
- [ ] curl https://test-tenant.dealerlink.in → valid cert
- [ ] app.dealerlink.in still works (not broken)

#### PART 2 — Backup/Restore

- [ ] Production backups confirmed enabled + retention documented
- [ ] PITR availability confirmed
- [ ] Restore rehearsed to separate cluster (data verified)
- [ ] RTO/RPO documented
- [ ] Test cluster destroyed (no orphan cost)
- [ ] R20 recovery runbook written

#### PART 3 — Single-Tenant Smoke

- [ ] Test tenant created via operator-onboarding
- [ ] Wildcard SSL works on d3smoketest.dealerlink.in
- [ ] Full workflow (deal→quote→PI→order→payment→dispatch) works
- [ ] All 4 PDFs generate on production
- [ ] First production email delivered (checked inbox)
- [ ] Observability events reached Sentry/Axiom
- [ ] Test tenant cleaned up (no orphan data)

#### PART 4 — Pilot Dry-Run

- [ ] PILOT_ONBOARDING_PRODUCTION.md created
- [ ] Pilot company details gathered (operator)
- [ ] Stage E readiness checklist complete

#### Closeout

- [ ] All gates green
- [ ] stage-d-complete tag pushed
- [ ] STAGE_D_HANDOFF.md + PROJECT_PLAN.md + PRODUCTION_ENV.md updated

---

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts added at close of Stage D. Provision real pilot tenant, training session, final dry run, go-live June 3._
