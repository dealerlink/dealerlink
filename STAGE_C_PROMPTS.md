# Stage C — Validation Prompts

Stage C runs from May 21 to May 27, 2026. Final day of validation before Stage D production deployment.

**Pilot target:** Production live Wednesday, June 3, 2026.

## Schedule

| Day           | Date       | Focus                                                        | Status      |
| ------------- | ---------- | ------------------------------------------------------------ | ----------- |
| C.0           | May 21-22  | Staging deploy + DNS + SSL + DEV.63 architectural correction | ✅ Done     |
| Doc hygiene   | May 23     | STAGE_C_HANDOFF, ADR-013, CLAUDE.md cleanup                  | ✅ Done     |
| C.1           | May 23     | Force-password-change (closes DEV.56)                        | ✅ Done     |
| C.2           | May 24     | State code normalization (closes DEV.33)                     | ✅ Done     |
| C.3           | May 25     | Pilot staging handoff + UX walkthrough                       | ✅ Done     |
| C.4           | May 26     | Security audit + UX fixes from C.3 triage                    | ✅ Done     |
| **C.5**       | **May 27** | **Performance test + Stage D handoff**                       | **Current** |
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

## Stage C Day C.4 — Security Audit + UX Fixes (✅ Complete — May 26)

**Outcome:** 0 Critical / 1 High / 2 Medium / 3 Low / 3 Informational. No pilot-blockers.

**Shipped:**

- F-2 HTTP security headers (CSP, X-Frame-Options DENY, HSTS, etc.) — verified live on staging
- I-1: Create-Quotation CTA on deal detail page
- I-2: Confirmation dialog on Deactivate dealer button
- I-4: Inventory shortage error names the product + qty
- I-5: /reports/outstanding-receivables → /reports/outstanding redirect
- P-9: formatINR whitespace fix
- C-1: PDF cold-start warm-up copy

**Deferred to Stage D:**

- F-1 (Next.js ≥14.2.35 upgrade) — CVE-2025-29927, architecturally mitigated, needs framework regression window
- F-3 (login rate-limit + account lockout) — bounded for pilot, must-fix for production

Verify 57/57. Staging deployment ACTIVE.

---

## Stage C Day C.5 — Performance Test + Stage D Handoff (Current — Wednesday May 27)

**Goal:** Generate real performance data from staging to drive Stage D production sizing decisions. Produce comprehensive Stage D handoff document so Thursday morning starts with a clear plan.

**Estimated time:** 5-6 hours total. Morning load testing (~3 hours). Afternoon Stage D handoff doc (~2-3 hours).

**Critical principle:** Today's data-driven decisions need to be specific. Vague handoffs ("scale up workers as needed") produce poor production deployments. The output is concrete: "workers basic-xs sufficient up to X PDFs/minute," "DB connection pool of Y handles Z concurrent users," etc.

### Prompt for Claude Code

```
You are implementing Stage C Day C.5 — the final day of Stage C. C.4 closed yesterday with security audit + 5 UX fixes shipped. Today does two things in sequence:

PART 1 (morning, ~3 hours): Performance + load testing against staging. Produce real data.
PART 2 (afternoon, ~2-3 hours): Generate comprehensive docs/STAGE_D_HANDOFF.md.

PRELIMINARY:
P.1. `pnpm preflight` confirms green.
P.2. Read DEVIATIONS.md focus on DEV.67 — worker sizing flagged for Stage D, decision is today's data-driven call.
P.3. Read DECISIONS.md — particularly ADR-013 (Puppeteer queue isolation).
P.4. Read docs/SECURITY_AUDIT.md — F-1, F-3, and any other findings to carry forward.
P.5. Read docs/STAGE_C_HANDOFF.md — current Carried-Forward section is the seed for Stage D handoff.
P.6. Read CLAUDE.md §3 (stack) + §7 (architecture).
P.7. Read .do/app.yaml — current staging spec.
P.8. Read docs/DEPLOYMENT.md — current runbook.

PRIMARY REFERENCES:
1. DEVIATIONS.md (full list of resolved + deferred)
2. SECURITY_AUDIT.md (F-1, F-3 deferred)
3. STAGE_C_HANDOFF.md (carried-forward seed)
4. .do/app.yaml (staging spec)
5. CLAUDE.md §3 + §7

==========================================================
PART 1 — PERFORMANCE + LOAD TESTING (~3 HOURS)
==========================================================

The point of load testing is to surface real production-shape issues BEFORE production. We need concrete numbers, not vague "looks fine" assertions.

Three load profiles to test, in increasing intensity. Each captures specific metrics. STOP if any test shows unrecoverable degradation; report findings before continuing.

CHUNK C5a — Baseline + light load test
---------------------------------

A1.1. Set up load testing tool. Options (pick whichever Claude Code has cleanest path for):
   - k6 (recommended — easy scripting, JSON output)
   - autocannon (simpler if k6 install is friction)
   - Playwright with parallel workers (use what we have)

A1.2. Create scripts/load-test/baseline.js (or .ts) — captures baseline latency at single-user load:
   - Login as admin@demo.test
   - Navigate dashboard → quotations list → quotation detail → reports
   - Measure p50, p95, p99 latency for each page
   - 5 iterations, capture mean + stddev

A1.3. Capture baseline metrics — record in scripts/load-test/results-baseline.json:
   - Dashboard load: p50, p95, p99 ms
   - Quotations list load: p50, p95, p99 ms
   - Quotation detail load: p50, p95, p99 ms
   - GST summary report load: p50, p95, p99 ms
   - /api/health: p50, p95, p99 ms

A1.4. Create scripts/load-test/light-load.js — 5 concurrent users for 2 minutes:
   - Each user follows the baseline path randomly
   - Captures: total requests, error rate, p95/p99 latency, requests/sec
   - 5 users × 2 min should mimic pilot's first-week realistic load

A1.5. Run light-load against staging:
   - Capture results to scripts/load-test/results-light.json
   - Monitor staging metrics during test:
     - DO App Platform CPU/memory on both web + workers
     - DO Postgres connection count, CPU, queries/sec
     - Sentry: any error spike during test?
     - Axiom: event ingest rate

A1.6. Document findings:
   - Did anything degrade vs baseline?
   - What's the constraint (CPU, memory, DB connections, network)?
   - Are 5 concurrent users comfortable on basic-xs / basic-xxs? Quantify the headroom.

COMMIT C5a: `test(perf): chunk a — baseline + light-load (5 concurrent users)`

CHUNK C5b — PDF generation load test
---------------------------------

The critical question for Stage D worker sizing: how many PDFs/minute can basic-xxs handle?

A2.1. Create scripts/load-test/pdf-load.js — concurrent PDF generation:
   - Login as admin@demo.test
   - Request 10 quotation PDFs in parallel (different quotation IDs)
   - Wait for all to complete
   - Capture: queue depth peak, latency p50/p95/p99 per render, any failures, timeout count
   - Repeat 3 times to test sustained load

A2.2. Run pdf-load against staging:
   - Monitor workers component CPU + memory during test
   - Monitor pg-boss queue (depth, throughput, error rate)
   - Capture all results to scripts/load-test/results-pdf.json

A2.3. Test cold-start scenario explicitly:
   - Wait 50 minutes for workers idle-recycle (or trigger it manually via redeploy)
   - First PDF request after idle: measure latency
   - Second PDF request: measure latency (should be warm)
   - Repeat 3 times for confidence
   - Document the cold-start curve

A2.4. Stress test — find the breaking point:
   - 20 concurrent PDF requests
   - 40 concurrent PDF requests
   - At what concurrency level do requests start timing out (120s timeout)?
   - At what level do we see worker OOM (memory pressure)?
   - Document the upper bound clearly

A2.5. Findings document — scripts/load-test/findings-pdf.md:
   - Steady-state throughput: X PDFs/minute on basic-xxs
   - Cold-start penalty: Y seconds on first render after Z minutes idle
   - Breaking point: W concurrent requests
   - Recommended Stage D sizing: justification based on these numbers
   - Specific recommendation: keep basic-xxs OR upgrade to basic-xs (with cost delta noted)

COMMIT C5b: `test(perf): chunk b — PDF load + cold-start curve + stress test`

CHUNK C5c — Database load + workflow load test
---------------------------------

A3.1. Create scripts/load-test/db-load.js — exercise the connection pool:
   - 10 concurrent users each doing dashboard queries
   - Measure: pool exhaustion threshold, query latency under load, lock contention
   - This tests whether DEV.62 (global pool fix) holds under real concurrency

A3.2. Create scripts/load-test/workflow-load.js — multiple users running through critical-path simultaneously:
   - 3 users, each running a full quotation→PI→order→payment→dispatch flow
   - Stagger by ~5 seconds (mimics real pilot users not perfectly synchronized)
   - Measure: end-to-end flow latency, any cross-user interference, any RLS leaks
   - This tests transaction isolation under concurrent writes

A3.3. Run db-load and workflow-load:
   - Capture results to scripts/load-test/results-db.json + results-workflow.json
   - Monitor DO Postgres: connection count, query queue depth, deadlocks (should be zero)
   - Monitor app logs for RLS errors (should be zero)

A3.4. Findings:
   - Connection pool sufficient for X concurrent users?
   - Query latency degradation under load (acceptable or not)?
   - Any deadlocks or lock contention surfaced?
   - Stage D recommendation: keep basic Postgres OR upgrade

COMMIT C5c: `test(perf): chunk c — DB load + multi-user workflow load`

==========================================================
PART 1 GATE
==========================================================

After committing C5a-C5c, STOP. Print summary:
- Light load: pass/fail with specific numbers
- PDF load: PDFs/min throughput, breaking point, cold-start curve
- DB + workflow: any concerns, recommended sizing

Wait for operator to review before proceeding to Part 2. If results show concerning issues, those become Stage D priorities even ahead of pilot.

==========================================================
PART 2 — STAGE D HANDOFF DOC (~2-3 HOURS)
==========================================================

Resume after operator reviews performance findings. Stage D handoff doc must be self-contained — Thursday morning Claude Code (or human) should be able to start production deploy without re-discovering anything Stage C learned.

CHUNK C5d — STAGE_D_HANDOFF.md generation
---------------------------------

A4.1. Create docs/STAGE_D_HANDOFF.md — structured as a complete runbook for Stage D production deployment.

Required sections:

1. **Production Deployment Overview**
   - Goal: production environment ready for pilot June 3
   - Scope: separate DO project, production-sized infrastructure, real third-party services
   - Out of scope: features (this is infrastructure + observability + hardening)

2. **Production Environment Spec**
   - DO project: dedicated (not shared with staging)
   - Region: BLR1
   - Components (with data-driven sizing from C.5 morning):
     - Web: instance size + count justification
     - Workers: instance size + count justification (the DEV.67 decision)
     - DB: instance size + backup configuration
   - Domain: app.dealerlink.in (recommend) OR alternative — operator to confirm
   - DNS: Cloudflare migration pattern same as staging
   - SSL: Let's Encrypt via DO + Cloudflare gray-cloud

3. **Production Secrets Provisioning Checklist**
   - For each secret: source, format, where stored, rotation policy
   - SENTRY_DSN — create production Sentry project, get DSN
   - BETTERSTACK_SOURCE_TOKEN — create production source, get token
   - AXIOM_TOKEN + AXIOM_DATASET — create production dataset, get token
   - RESEND_API_KEY — verify dealerlink.in domain in Resend, set up DKIM + SPF, get production key
   - LUCIA_SESSION_SECRET — generate fresh 32-byte base64
   - RESEND_INBOUND_WEBHOOK_SECRET — generate fresh
   - DATABASE_URL — from DO Managed Postgres production
   - NEXT_PUBLIC_APP_URL — https://app.dealerlink.in (or chosen domain)
   - All stored in C:\Users\rohit\.dealerlink\production-secrets.txt (gitignored)

4. **Resolved Stage C Findings to Address in Stage D**
   - F-1: Upgrade Next.js to ≥14.2.35 (CVE-2025-29927)
     - Approach: dedicated PR, full regression pass, ship as first commit in Stage D
     - Effort: ~3-4 hours including testing
   - F-3: Login rate-limit + account lockout
     - Approach: extend existing checkRateLimit primitive to login() action
     - Recommended thresholds: 5 attempts / 15 min window, then 30-min lockout
     - Effort: ~2 hours
   - DEV.64: app.yaml ↔ deployed-spec sync workflow
     - Option A: DO's GitHub Action for spec sync
     - Option B: Custom post-push hook
     - Decision needed before first production deploy
   - DEV.67: Worker sizing decision
     - Resolved by today's C.5 data (recorded in section 2 above)

5. **Production Deployment Day-by-Day Plan**
   - Day D.0 (Thursday May 28): DO production environment provisioning + DB + initial deploy
   - Day D.1 (Friday May 29): Production secrets + Resend domain verification + observability stack
   - Day D.2 (Saturday May 30): F-1 (Next.js upgrade) + F-3 (rate limit) + DEV.64 sync workflow
   - Day D.3 (Sunday May 31): Production smoke test + pilot dry run + final validation
   - Buffer: full Stage D has 4 days for ~3 days of work — built-in slack

6. **Production Domain + DNS Plan**
   - Recommend: app.dealerlink.in for the app, api.dealerlink.in NOT needed (no separate API)
   - Pilot tenant subdomain: <pilot-slug>.app.dealerlink.in (decide pilot slug with customer)
   - Operator subdomain: app.dealerlink.in serves operator login
   - Tenant subdomain pattern: <tenant>.app.dealerlink.in
   - Wildcard SSL covers all tenant subdomains

7. **Backup + Recovery Strategy**
   - DO Managed Postgres: enable daily automated backups (7-day retention default)
   - Point-in-time recovery: enabled for production
   - Manual backup before each Stage D migration: pg_dump to local
   - Test recovery: at least once in Stage D, restore to a fresh DB and verify
   - Document RTO + RPO targets (recovery time / recovery point objectives)

8. **Observability Production Configuration**
   - Sentry: production project, performance monitoring at 10% sample rate, errors at 100%
   - BetterStack: production source, alerts on error rate spike + uptime drop
   - Axiom: production dataset, structured logs, 30-day retention
   - DO Monitoring: built-in alerts for CPU > 80%, memory > 80%, disk > 80%
   - PII scrubbing: same beforeSend filters from staging (already verified clean per C.4 audit)

9. **Pilot Tenant Provisioning (Stage E preview)**
   - Operator runs onboarding flow for the actual pilot company
   - Real legal name, GSTIN, address, bank details, T&C
   - First admin user with pilot's real email (force-password-change flow per C.1)
   - Pilot tenant gets <pilot-slug>.app.dealerlink.in subdomain
   - Pre-load: empty (pilot enters their own real data)
   - This happens Day E.1 (June 1), not Stage D

10. **Risk Register**
    - Highest risk: Production-shape bug not surfaced by staging
      - Mitigation: 4 days Stage D + 3 days Stage E buffer
    - Medium risk: Resend domain verification delay (DKIM + SPF can take 24-72 hours)
      - Mitigation: start Resend setup Day D.1 morning, well before pilot launch
    - Medium risk: Cold-start UX on production (DEV.67)
      - Mitigation: today's data drives sizing decision; if basic-xxs insufficient, upgrade now
    - Low risk: Next.js upgrade (F-1) introduces regression
      - Mitigation: dedicated PR, full pnpm verify + critical-path E2E before merging

11. **What NOT to Do in Stage D**
    - Don't add features (Phase 2 work)
    - Don't refactor (no improvements to existing code)
    - Don't change staging environment (keep it as the reference)
    - Don't skip the F-1 upgrade — it's deferred from C.4 specifically for Stage D
    - Don't deploy to production without testing the deploy pipeline first (Day D.0)

COMMIT C5d: `docs(stage-d): handoff document with sizing decisions + deployment plan`

CHUNK C5e — Day closeout
---------------------------------

A5.1. Update PROJECT_PLAN.md:
   - Mark C.5 ✅ with date 2026-05-27
   - Mark Stage C ✅ COMPLETE — all 6 days shipped
   - Add Stage D section header (placeholder for Stage D day entries)

A5.2. Update STAGE_C_HANDOFF.md:
   - Mark C.5 ✅ in Stage C Progress
   - Note: Stage C closes with this commit
   - The "Carried-Forward To Stage D" section now points to STAGE_D_HANDOFF.md as authoritative

A5.3. Update CLAUDE.md "Last reviewed" stamp to 2026-05-27.

A5.4. Tag Stage C close:
```

git tag -a stage-c-complete -m "Stage C complete — staging deployed + validated + Stage D handoff ready"
git push --tags

```

A5.5. Final commit summary message:
```

feat(stage-c): Stage C complete — 6/6 days shipped

- C.0: Staging deploy (DO + DNS + SSL)
- C.1: Force-password-change (DEV.56 closed)
- C.2: State normalization (DEV.33 closed)
- C.3: Pilot staging handoff + UX walkthrough
- C.4: Security audit + 5 UX fixes + HTTP security headers
- C.5: Performance test + Stage D handoff

Pilot live target: Wednesday June 3, 2026.

```

A5.6. Push to main + push tags.

A5.7. Final verification:
- Tag stage-c-complete exists locally and on origin
- STAGE_D_HANDOFF.md exists and is comprehensive
- All gates green: preflight, typecheck, lint, test, verify

COMMIT C5e: `chore: Stage C close — tag stage-c-complete`

GUARDRAILS (C.5):

- Part 1 is empirical. Numbers come from real measurements, not assumptions. If a result surprises you, run it again before recording.
- Part 1 includes intentional STOP at the gate. Don't write Stage D handoff until performance findings reviewed.
- Don't make Stage D decisions today that should be made during Stage D (e.g., specific Sentry alert thresholds — those land in Stage D as deployment proceeds).
- The STAGE_D_HANDOFF.md should be readable Thursday morning by someone who hasn't been in this conversation. Self-contained.
- Don't tag stage-c-complete until all gates green AND STAGE_D_HANDOFF.md committed.

WHEN DONE (final):
- Print summary
- Confirm: stage-c-complete tag pushed
- Confirm: STAGE_D_HANDOFF.md committed
- Confirm: Stage C marked ✅ in PROJECT_PLAN.md
- Tell me Stage C is officially closed and Stage D is cleared to start tomorrow morning
```

### Verification checklist (operator)

#### Part 1 (after C5a-C5c)

- [ ] Baseline latency captured for 4 page types
- [ ] Light-load test results documented (5 concurrent users, 2 min)
- [ ] PDF load test: throughput, cold-start curve, breaking point all measured
- [ ] DB + workflow load tests show no deadlocks, no RLS leaks
- [ ] Stage D worker sizing recommendation is data-driven, not guess
- [ ] Operator reviews findings before approving Part 2

#### Part 2 (after C5d-C5e)

- [ ] STAGE_D_HANDOFF.md has all 11 sections
- [ ] Production sizing decision concretely justified
- [ ] F-1 + F-3 explicit work items with effort estimates
- [ ] Stage D day-by-day plan (D.0 through D.3)
- [ ] Risk register acknowledges real risks with mitigations
- [ ] PROJECT_PLAN.md marks Stage C ✅ COMPLETE
- [ ] Tag stage-c-complete pushed to origin
- [ ] All gates green

---

## Stage D — Production Deployment (May 28 - May 31)

_Detailed prompts added at close of Stage C. STAGE_D_HANDOFF.md is the authoritative scope document._

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts added at close of Stage D._
