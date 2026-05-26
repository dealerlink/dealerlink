# Stage D — Production Deployment Prompts

Stage D runs from May 26 to May 31, 2026 (started 2 days ahead of original May 28 plan). Pilot live target: Wednesday, June 3, 2026.

## Schedule

| Day           | Date       | Focus                                                           | Status      |
| ------------- | ---------- | --------------------------------------------------------------- | ----------- |
| D.0           | May 26     | Production environment provisioning + DB + initial deploy       | ✅ Done     |
| **D.1**       | **May 27** | **Production secrets + Resend + observability**                 | **Current** |
| D.2           | May 28     | F-1 (Next.js upgrade) + F-3 (rate limit) + DEV.64 sync workflow | ⏳          |
| D.3           | May 29     | Production smoke + pilot dry run                                | ⏳          |
| Buffer        | May 30-31  | 2 days of slack (gained from D.0 ahead-of-schedule)             | —           |
| Stage E start | Jun 1      | Pilot tenant provisioning                                       | —           |

## Locked Decisions

- Production domain: `app.dealerlink.in` + tenant subdomains `<tenant>.dealerlink.in`
- SSL: Cloudflare DNS-only (gray-cloud) + Let's Encrypt via DO App Platform
- Sizing: web basic-xs + workers basic-xs + DB Basic 2 GB = ~$54/mo
- Reserved slugs: `app`, `www`, `api`, `admin`, `blog`, `docs`, `status`, `mail`, `staging`

---

## Stage D Day D.0 — Production Environment Provisioning (✅ Complete — May 26)

**Commits:** a53ffd9 → 4f2d4ed → 52aa17d → f07b4a7 → 47d70339

**What shipped:**

- DO project `dealerlink-production` (5ca8a796) — separate from staging
- DO Managed Postgres `dealerlink-production-db` (6e0f1d36) — PG 16, Basic 2 GB, BLR1
- DO App Platform `d8a25cb8` — web (basic-xs) + workers (basic-xs custom Dockerfile)
- Dual-role RLS — dealerlink_app is LOGIN NOSUPERUSER NOBYPASSRLS; RLS forced on tenant tables
- Operator seeded — dealerlink.io@gmail.com, must_change_password=true, login verified
- Cloudflare DNS — `app` CNAME → DO origin (gray-cloud)
- SSL active on app.dealerlink.in (Let's Encrypt via DO)
- DB firewall locked to App Platform UUID
- /api/health 200 green on production

**Open items handed to D.1:**

- DO Spaces bucket `dealerlink-prod` (deferred per scoping)
- Wildcard SSL on `*.dealerlink.in` (deferred to D.3; needs DNS-01 strategy decision)
- All third-party observability (Sentry/BetterStack/Axiom) still placeholder
- Resend domain not yet verified

**Open finding from D.0:**

- DEV.73 — tenant creation doesn't reject reserved slugs (app/www/admin). Slotted for D.2.

---

## Stage D Day D.1 — Production Secrets + Resend + Observability (Current — Wednesday May 27)

**Goal:** Wire all production third-party services (Resend, Sentry, BetterStack, Axiom) and verify /api/health shows everything green. Resend domain verification starts FIRST because DKIM/SPF/DMARC propagation can take 24-72 hours.

**Estimated time:** 3-4 hours active work, plus DNS propagation in background.

**Deliverable:** Production /api/health shows all third-party checks green (Resend ok, not skipped). Test event reaches Sentry. Test log reaches Axiom. BetterStack uptime monitor configured. DKIM/SPF/DMARC records propagating.

### Prompt for Claude Code

```
You are implementing Stage D Day D.1 of the Dealerlink build. Stage D Day D.0 closed yesterday (commits a53ffd9..47d70339). Production environment is live at app.dealerlink.in with operator-only access. All third-party observability + email is currently placeholder; today wires the real services.

CRITICAL TIME-SENSITIVE ITEM:
Resend domain verification has DKIM/SPF/DMARC propagation that can take 24-72 hours. This must be Chunk 1 of today. Everything else (Sentry, BetterStack, Axiom) fits around the propagation wait.

PRELIMINARY:
P.1. `pnpm preflight` confirms green.
P.2. Read docs/STAGE_D_HANDOFF.md §3 — production secrets checklist.
P.3. Read docs/PRODUCTION_ENV.md — current production state.
P.4. Read CLAUDE.md §3 — observability stack (Sentry + BetterStack + Axiom).
P.5. Read apps/web/instrumentation.ts + sentry config — how Sentry is wired.
P.6. Read apps/workers/src/observability.ts — workers observability wiring.
P.7. Read /production-secrets.txt at C:\Users\rohit\.dealerlink\ — current placeholder values.

PRIMARY REFERENCES:
1. docs/STAGE_D_HANDOFF.md (authoritative scope)
2. Resend docs: https://resend.com/docs/dashboard/domains
3. Sentry docs: https://docs.sentry.io/product/projects/
4. BetterStack docs: https://betterstack.com/docs/logs/start/
5. Axiom docs: https://axiom.co/docs/getting-started

==========================================================
TRACK A — PRODUCTION OBSERVABILITY + EMAIL (CHUNKED — 4 chunks)
==========================================================

CHUNK D1a — Resend domain verification (FIRST — start propagation)
---------------------------------

A1.1. Create Resend production setup:
   - Operator (you) needs to: Sign in to Resend → Domains → Add Domain
   - Domain: dealerlink.in
   - Show me the DNS records Resend asks for (SPF, DKIM x2-3, DMARC)
   - Capture them so I can verify they're correct before pasting into Cloudflare

A1.2. Add DNS records in Cloudflare for Resend verification:
   - SPF: TXT record `dealerlink.in` → `v=spf1 include:_spf.resend.com ~all`
     - If existing SPF record exists (from earlier email setup), MERGE not duplicate
     - Multiple SPF records cause email delivery failure
   - DKIM: TXT records as Resend specifies (typically 2-3 records like `resend._domainkey.dealerlink.in`)
   - DMARC: TXT record `_dmarc.dealerlink.in` → `v=DMARC1; p=quarantine; rua=mailto:dmarc@dealerlink.in; pct=100`
     - Start with p=quarantine (not p=reject) for first 30 days; tighten post-pilot
   - All proxy: DNS only (gray cloud) — these are DNS records, not HTTP traffic

A1.3. Generate production Resend API key:
   - In Resend dashboard: API Keys → Create API Key
   - Name: dealerlink-production
   - Scope: Full access OR sending only (your call; sending-only is safer)
   - Capture key — save to /production-secrets.txt as RESEND_API_KEY
   - DO NOT reuse staging's key

A1.4. Verify Resend domain status:
   - Resend shows "Pending" → "Verified" once DNS propagates
   - Can take 5 minutes (if DNS is fast) up to 72 hours
   - Don't block on verification — proceed with other chunks while it propagates
   - Periodically check status throughout the day

A1.5. Update production secrets in DO App Platform:
   - Add RESEND_API_KEY to web AND workers components
   - DO NOT redeploy yet — env var changes auto-trigger redeploy; wait until D1c when all secrets ready

A1.6. Document Resend setup:
   - Update docs/PRODUCTION_ENV.md with Resend domain status + when verified
   - Note expected from-address: noreply@dealerlink.in (or similar — confirm)

COMMIT D1a: `chore(prod): chunk a — Resend domain verification + DNS records propagating`

CHUNK D1b — Sentry production project
---------------------------------

A2.1. Create production Sentry project(s):
   - Operator (you) needs to: Sign in to Sentry → Create New Project
   - Project 1: dealerlink-web-production
     - Platform: Next.js
     - Alert Frequency: On every new issue
   - Project 2: dealerlink-workers-production
     - Platform: Node.js
     - Alert Frequency: On every new issue
   - These are SEPARATE from any staging Sentry projects (clean prod/staging separation)
   - Capture the DSN for each — save to /production-secrets.txt

A2.2. Configure Sentry settings:
   - Performance monitoring: 10% trace sample rate (per STAGE_D_HANDOFF.md §8)
   - Error capture: 100%
   - PII scrubbing: verify default scrubbers + ensure password fields are scrubbed (per C.4 audit)
   - Release tracking: optional now, enable post-pilot

A2.3. Set up Sentry alerts:
   - Critical: any new issue with severity=error
   - Warning: spike in event rate (>50 events/min)
   - Email destination: operator email (dealerlink.io@gmail.com)
   - For now, just alert on errors; refine post-pilot based on real noise

A2.4. Add SENTRY_DSN env vars to DO App Platform:
   - Web component: SENTRY_DSN = <web-project-dsn>
   - Workers component: SENTRY_DSN = <workers-project-dsn>
   - DO NOT redeploy yet — batch with other env vars in D1c

A2.5. Plan a Sentry smoke test for D1c:
   - After all env vars wired + redeploy: trigger a known error
   - Verify error appears in Sentry production project
   - Verify PII scrubbed (no password values, no email contents in stack traces)

COMMIT D1b: `chore(prod): chunk b — Sentry production projects + DSN env vars`

CHUNK D1c — BetterStack + Axiom + env var batch + redeploy
---------------------------------

A3.1. Create production BetterStack source:
   - Operator (you) needs to: Sign in to BetterStack → Sources → Create
   - Source type: HTTP / Node.js
   - Name: dealerlink-production
   - Capture the source token — save to /production-secrets.txt as BETTERSTACK_SOURCE_TOKEN

A3.2. Configure BetterStack uptime monitor:
   - Add monitor: https://app.dealerlink.in/api/health
   - Check interval: 30 seconds
   - Alert if down for: 2 consecutive failures
   - Alert destinations: operator email + optionally SMS
   - This is the production health canary

A3.3. Create production Axiom dataset:
   - Operator (you) needs to: Sign in to Axiom → Datasets → New Dataset
   - Name: dealerlink-production
   - Retention: 30 days (per STAGE_D_HANDOFF.md §8)
   - Generate API token: Settings → API Tokens → New
   - Capture token — save to /production-secrets.txt as AXIOM_TOKEN
   - AXIOM_DATASET = dealerlink-production

A3.4. Generate fresh RESEND_INBOUND_WEBHOOK_SECRET if not done in D.0:
   - Should be fresh (NOT reused from staging)
   - 32-byte base64
   - Save to /production-secrets.txt
   - Configure Resend inbound webhook URL (in Resend dashboard) to point at:
     https://app.dealerlink.in/api/webhooks/resend-inbound
     - With the secret in the X-Resend-Webhook-Signature header
     - Only enable AFTER all env vars wired + redeployed

A3.5. Batch update DO App Platform env vars (all at once, single redeploy):
   - Get current live spec: `doctl apps spec get <prod-app-id> > /tmp/prod-spec-current.yaml`
   - In a copy, update env vars (preserve all existing encrypted secrets):
     - SENTRY_DSN (web + workers — different DSNs per component)
     - BETTERSTACK_SOURCE_TOKEN (web + workers)
     - AXIOM_TOKEN (web + workers)
     - AXIOM_DATASET = dealerlink-production
     - RESEND_API_KEY
     - RESEND_INBOUND_WEBHOOK_SECRET
   - Apply: `doctl apps update <prod-app-id> --spec /tmp/prod-spec-updated.yaml`
   - Monitor deployment to ACTIVE

A3.6. Verify post-deploy:
   - /api/health on production — all checks should now be green (not skipped)
   - Specifically: resend status=ok (was skipped before)
   - Sentry, BetterStack, Axiom checks may not show in /health directly — verify next steps

COMMIT D1c: `chore(prod): chunk c — BetterStack + Axiom + batch env var update`

CHUNK D1d — Verification + DO Spaces + closeout
---------------------------------

A4.1. Sentry smoke test:
   - Trigger a deliberate test error from web (e.g., curl a known-broken endpoint or use a test page)
   - Verify the error appears in dealerlink-web-production Sentry project within ~30 seconds
   - Trigger an error from workers (could be a malformed job payload, etc.)
   - Verify in dealerlink-workers-production Sentry project
   - If errors don't appear: debug DSN configuration

A4.2. BetterStack smoke test:
   - Verify uptime monitor shows "Up" for app.dealerlink.in/api/health
   - Manually trigger a log via the production app (e.g., perform an operator action)
   - Verify log appears in BetterStack dashboard within ~30 seconds

A4.3. Axiom smoke test:
   - Verify Axiom dataset is receiving events
   - Perform an action that generates a structured log event (operator action)
   - Query Axiom for the event within ~30 seconds
   - If not appearing: check AXIOM_TOKEN + dataset name

A4.4. Resend domain status check:
   - Check Resend dashboard
   - If verified: proceed to A4.5
   - If still pending: document the current state + when last checked + estimated propagation completion
   - The Resend webhook smoke test can defer to D.3 if domain isn't verified yet

A4.5. Send a test email (only if Resend verified):
   - Use a test endpoint OR perform an operator action that sends email
   - Recipient: operator email
   - Subject: "[TEST] Production email smoke check"
   - Verify delivered (check inbox, not spam)
   - If lands in spam: SPF/DKIM/DMARC config issue; investigate

A4.6. Create DO Spaces bucket for production:
   - Bucket name: dealerlink-prod
   - Region: BLR1 (Bangalore)
   - File listing: Restrict (private)
   - CDN: Disabled for now (enable post-pilot if needed)
   - Generate Spaces access key + secret
   - Save to /production-secrets.txt as SPACES_ACCESS_KEY + SPACES_SECRET_KEY + SPACES_BUCKET
   - Add to DO App Platform env vars (workers component only — web doesn't need Spaces yet)
   - This is the persistent storage for generated PDFs (per STAGE_D_HANDOFF.md §3)

A4.7. Document everything:
   - Update docs/PRODUCTION_ENV.md:
     - Resend status (verified or pending)
     - Sentry projects + DSNs (locations, not values)
     - BetterStack source + uptime monitor URL
     - Axiom dataset
     - DO Spaces bucket
   - Update docs/STAGE_D_HANDOFF.md:
     - Mark D.1 ✅ in progress section
     - Note: Resend status (verified now or pending)
     - Update §3 (secrets checklist) — mark all rows complete

A4.8. Update SECURITY_AUDIT.md:
   - Add note: production observability now configured per audit recommendations
   - PII scrubbing verified working on production (test event check)

A4.9. Closeout:
   - pnpm preflight green (local dev unchanged)
   - PROJECT_PLAN.md: mark D.1 ✅ with date 2026-05-27
   - Final commit: `feat(stage-d): Day D.1 complete — Resend + Sentry + BetterStack + Axiom + Spaces wired`
   - Push to main (auto-deploys staging — production has its own spec, no impact)

A4.10. Post-deploy verification:
   - One last /api/health on production — all green
   - Confirm no errors in Sentry from the smoke tests
   - Confirm BetterStack uptime monitor green
   - Document any deferred items (e.g., Resend pending) in STAGE_D_HANDOFF.md carried-forward

COMMIT D1d: `chore(prod): D.1 closeout — verification + DO Spaces + docs`

==========================================================
GUARDRAILS (STAGE D DAY D.1)
==========================================================

- Resend domain verification is the CRITICAL TIME-SENSITIVE ITEM. Start D1a FIRST. Don't reorder.
- DNS propagation is unpredictable. If Resend is still pending end-of-day, that's acceptable — D.3 can wait for it. Just document the state.
- All production secrets are FRESH. Do NOT reuse staging's: LUCIA_SESSION_SECRET, RESEND_INBOUND_WEBHOOK_SECRET, Sentry DSN, BetterStack token, Axiom token, Resend API key. Different environments = different secrets.
- DKIM/SPF/DMARC records: if existing SPF exists, MERGE not duplicate. Multiple SPF records cause email delivery failure (silent at first, then catastrophic).
- DMARC starts at p=quarantine, NOT p=reject. Reject is harsh; quarantine for first 30 days lets bad config surface without bouncing legitimate email.
- DO Spaces bucket is for production PDFs (persistent storage). Not the same bucket as staging.
- Batch env var changes (D1c) — single doctl apps update, single redeploy. Multiple updates = multiple redeploys = wasted time + more spec-drift risk.
- Smoke tests in D1d must actually verify deliverability. "Service shows configured" is not the same as "service works."
- If anything looks wrong (Sentry not receiving, Axiom silent, Resend not verifying), STOP and investigate before declaring done. Production observability that doesn't work is worse than no observability — false confidence.

WHEN DONE:
- Print summary, 4 chunk commits
- Confirm: /api/health all green (resend=ok, not skipped)
- Confirm: Sentry receives smoke test errors
- Confirm: BetterStack uptime monitor active
- Confirm: Axiom receives smoke test logs
- Confirm: Resend status (verified or still propagating — document either way)
- Confirm: DO Spaces bucket created
- Tell me Stage D Day D.1 is complete and Day D.2 (F-1 + F-3 + DEV.64) is next
```

### Verification checklist (operator)

#### Resend

- [ ] dealerlink.in domain added to Resend
- [ ] DKIM, SPF, DMARC records in Cloudflare
- [ ] Resend shows "Verified" (or documented if still pending)
- [ ] Test email delivered (if verified)
- [ ] Resend API key in production env vars

#### Sentry

- [ ] dealerlink-web-production project exists
- [ ] dealerlink-workers-production project exists
- [ ] DSNs configured in DO App Platform
- [ ] Test error from web appears in web project
- [ ] Test error from workers appears in workers project
- [ ] PII scrubbing verified (passwords not in stack traces)

#### BetterStack

- [ ] Production source created
- [ ] Uptime monitor for app.dealerlink.in/api/health configured
- [ ] Monitor shows "Up"
- [ ] Test log delivered to dashboard

#### Axiom

- [ ] Production dataset created
- [ ] Token + dataset in DO env vars
- [ ] Test event delivered to dataset

#### DO Spaces

- [ ] dealerlink-prod bucket created in BLR1
- [ ] Access key + secret in production env vars (workers component)
- [ ] Bucket privacy: restricted (not public)

#### Documentation

- [ ] PRODUCTION_ENV.md updated with all service states
- [ ] STAGE_D_HANDOFF.md D.1 marked ✅
- [ ] /production-secrets.txt has all real values (no placeholders)
- [ ] PROJECT_PLAN.md D.1 ✅

---

## Stage D Day D.2 — F-1 + F-3 + DEV.64 (Thursday May 28)

_Will be added when D.1 closes. Next.js upgrade to ≥14.2.35 (CVE-2025-29927, full regression pass). Login rate limit + account lockout (F-3). app.yaml → live spec sync workflow (DEV.64). DEV.73 reserved-slug enforcement._

## Stage D Day D.3 — Production Smoke + Pilot Dry Run (Friday May 29)

_Will be added when D.2 closes. Provision a test tenant on production. Full critical-path E2E on production. PDF + email + observability all exercised end-to-end. Document pilot tenant creation procedure for Stage E._

---

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts added at close of Stage D._
