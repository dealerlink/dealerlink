# Stage C — Validation Prompts

Stage C runs from May 21 to May 27, 2026. Goal: validate the Stage B build is production-ready, deploy staging environment, close the two known feature gaps, security + performance audit, and prepare for Stage D production deploy.

**Pilot target:** Production live Wednesday, June 3, 2026.
**Staging available to pilot:** Monday, May 25, 2026 (after C.2 wraps — DONE).

## Schedule

| Day           | Date       | Focus                                                        | Status      |
| ------------- | ---------- | ------------------------------------------------------------ | ----------- |
| C.0           | May 21-22  | Staging deploy + DNS + SSL + DEV.63 architectural correction | ✅ Done     |
| Doc hygiene   | May 23     | STAGE_C_HANDOFF, ADR-013, CLAUDE.md cleanup                  | ✅ Done     |
| C.1           | May 23     | Force-password-change (closes DEV.56)                        | ✅ Done     |
| C.2           | May 24     | State code normalization (closes DEV.33)                     | ✅ Done     |
| **C.3**       | **May 25** | **Pilot staging handoff + UX walkthrough**                   | **Current** |
| C.4           | May 26     | Security audit                                               | ⏳          |
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

---

## Stage C Day C.3 — Pilot Staging Handoff + UX Walkthrough (Current — Monday May 25)

**Goal:** Prepare and execute pilot handoff. Generate pilot-facing onboarding artifacts. Operator (you) does 2-hour walkthrough. Pilot evaluates staging over the day. Findings captured for C.4-C.5 prioritization.

**This is a different kind of day.** Most of the work is yours, not Claude Code's. Claude Code's role is generating the handoff artifacts upfront.

**Estimated time:** ~30 min Claude Code + ~2 hours your walkthrough + pilot's own time + ~30 min evening triage.

**Deliverable:** Pilot has staging access with credentials, onboarding guide, evaluation checklist. UX findings doc populated. Day-end triage classifies findings into pilot-blocker vs nice-to-have vs post-pilot.

### Prompt for Claude Code

````
You are preparing the pilot handoff artifacts for Stage C Day C.3 of the Dealerlink build. Stage C Day C.2 (state normalization) completed yesterday (commits e886a37..f98d3d1). Today's work is mostly the operator's (UX walkthrough, pilot communication). Your job is generating the handoff documents upfront so the operator can execute the day cleanly.

PRELIMINARY:
P.1. `pnpm preflight` confirms green.
P.2. Read docs/STAGING_ENV.md — current staging environment documentation
P.3. Read apps/web/tests/e2e/helpers.ts — SEEDED_USERS constant for credentials reference
P.4. Read docs/USER_MANUAL.md — sections 1-2 from Stage B Day 18 stub
P.5. Read docs/WORKFLOWS.md — the workflow reference operators need
P.6. Read DEVIATIONS.md — note any "known limitation" deviations that pilot should be told about upfront (DEV.15 inline base64 logo, DEV.45 dispatch seed pre-stamps if surfaced, etc.)

PRIMARY REFERENCES:
1. docs/STAGING_ENV.md (staging env state)
2. docs/USER_MANUAL.md (operator-facing manual stub)
3. docs/WORKFLOWS.md (the canonical workflow doc)
4. apps/web/tests/e2e/helpers.ts (SEEDED_USERS — credentials source of truth)
5. STAGE_C_HANDOFF.md (Stage C progress + carried-forward items)

==========================================================
TRACK A — PILOT HANDOFF ARTIFACTS (CHUNKED — 3 chunks)
==========================================================

CHUNK C3a — Pilot onboarding guide
---------------------------------

A1.1. Create docs/PILOT_ONBOARDING.md — the document the pilot customer reads first.

Structure:

```markdown
# Welcome to Dealerlink Staging

## What This Is

Dealerlink is a multi-tenant distributor CRM built for B2B sales operations.
You're evaluating Phase 1 in our staging environment before production launch
on June 3, 2026.

## How to Access

URL: https://demo.staging.dealerlink.in
Or alternative: https://staging.dealerlink.in/?tenant=demo

(If you have trouble with the subdomain, the ?tenant=demo URL is a backup.)

## Your Login Credentials

| Role | Email | Initial Password | What You'll See |
|---|---|---|---|
| Admin | admin@demo.test | password123 | Full access — every workflow |
| Sales | sales@demo.test | password123 | Pipeline + quotations + dealers |
| Accounts | accounts@demo.test | password123 | Payments + receipts + reports |
| Dispatch | dispatch@demo.test | password123 | Inventory + dispatch + delivery |

Log in with any of these to see the system from that role's perspective.
We recommend starting with the Admin role to see everything, then trying
the role-specific views.

## What's Loaded for You

The demo tenant comes pre-loaded with realistic distributor data:
- ~24 sample dealers across 7 Indian states
- ~30 products (solar panels, inverters, accessories)
- ~30 deals across the 9-stage pipeline
- ~15 quotations in various states
- ~12 confirmed orders with inventory reservations
- ~15 recorded payments with allocations
- ~8 dispatches with serial-number tracking
- ~30 days of activity across all modules

You can create your own data on top of this — anything you create stays
in the demo tenant and won't interfere with anyone else's evaluation.

## Suggested Evaluation Path (45-60 minutes)

Step 1 — Dashboard tour (5 min)
- Log in as admin@demo.test
- Note the dashboard widgets: pipeline value, overdue payments, recent
  activity, low-stock alerts
- Click around the sidebar: Pipeline, Dealers, Catalog, Inventory,
  Quotations, PIs, Orders, Payments, Dispatch, Reports

Step 2 — A complete quotation flow (15 min)
- Go to Pipeline, find a deal in 'qualification' or 'needs_analysis'
- Open it, create a quotation against it
- Add 2-3 line items from the product catalog
- Notice the live tax preview (CGST/SGST for intra-state, IGST for inter-state)
- Apply a discount, watch the totals update
- Save as draft
- Open the draft, send it (the email gets queued — see "About Email" below)
- Download the PDF — verify it looks professional, numbers are correct

Step 3 — Convert quotation to PI to order (10 min)
- Mark a 'sent' quotation as 'accepted'
- Convert it to a Performa Invoice
- Notice the Ship-To option (try changing it to a dealer in a different
  state — watch the tax recompute)
- Send the PI, then confirm it
- Verify an Order was auto-created and inventory items moved to 'reserved'

Step 4 — Record a payment (10 min)
- Switch to accounts@demo.test
- Go to Payments, record a new payment for the order you just confirmed
- Verify it, mark as cleared
- Allocate the full amount to the order
- Confirm the order's payment status flipped to 'paid'

Step 5 — Dispatch (10 min)
- Switch to dispatch@demo.test
- Go to Dispatch, create a new dispatch from a confirmed paid order
- Pick the reserved serial numbers
- Fill in vehicle + transporter info
- Mark as delivered later
- Verify the order's fulfillment status updated

Step 6 — Reports (5 min)
- Switch back to admin@demo.test
- Open each report: Sales Summary, Outstanding, Inventory Valuation, GST Summary
- Try CSV download on one of them

## Known Limitations (Phase 1)

These are by design — they're either Phase 2 features or production-only:

- **Email send is queued, not delivered**: On staging, emails get queued in
  the system but don't actually send. You'll see "Queued" status on every
  send action. Production will deliver real emails via Resend.

- **PDF first render of the day is slow**: First PDF after the server has
  been idle for ~45 minutes can take 30-60 seconds. After that, PDFs render
  in 3-5 seconds. We're sizing the production infrastructure to eliminate
  this delay.

- **State display**: We show full state names (e.g., "Maharashtra") on
  screens and stored 2-letter codes (e.g., "MH") in the database. This is
  standard for Indian GST compliance.

- **Mobile responsive**: The current UI is desktop-optimized. Mobile-friendly
  views are Phase 2.

- **GST Returns export**: We capture all the data needed for GSTR-1 filing,
  but the direct export to the GST portal is Phase 2.

- **E-way bill integration**: We capture e-way bill numbers manually today.
  Auto-generation against the GSTN API is Phase 2.

## What We're Asking You to Evaluate

We want your reaction on:
1. **Does the data make sense?** Do the numbers add up the way you'd expect?
2. **Is the workflow natural?** Can you complete a full quotation→order→payment
   →dispatch cycle without getting lost?
3. **Does anything feel wrong?** Wrong terminology, confusing flows, missing
   information you'd need.
4. **What's missing?** Anything you'd absolutely need for your daily operations
   that you don't see.

## How to Send Feedback

Reply to the onboarding email with your findings. Don't worry about format —
"Step 3 felt slow" and "I couldn't find where to do X" are both useful.

For anything urgent (the system is broken, you can't log in), email directly
or call.

## What Happens Next

- Today (May 25): You evaluate; we triage findings end-of-day
- May 26-27: We act on critical findings + complete security/performance audits
- May 28-31: We move to production environment
- June 1-2: Final dry run + your training session
- June 3: Production go-live with your real data

Looking forward to your feedback.
````

A1.2. Update docs/STAGING_ENV.md with the C.2 changes:

- Reflect migration 16 applied
- Reflect three-party PI accessibility
- Reflect /dealers/[id] and /catalog/[id] crash fixes (DEV.72)

COMMIT C3a: `docs(pilot): onboarding guide for staging handoff`

## CHUNK C3b — UX findings template + pilot communication

A2.1. Create docs/UX_FINDINGS.md — the document YOU (operator) populate during your 2-hour walkthrough:

```markdown
# UX Findings — Pre-Pilot Walkthrough

> Operator: [Your name]
> Date: 2026-05-25
> Staging URL: https://demo.staging.dealerlink.in
> Time spent: 2 hours

## Walkthrough Approach

Use the suggested evaluation path from docs/PILOT_ONBOARDING.md as a
baseline. Spend 2 hours doing a real workflow as a distributor would.

## Critical Findings (Pilot-Blocker)

Anything that would make the pilot's evaluation impossible or misleading.

### Finding 1: [Title]

**Page/Flow**:
**What happened**:
**Expected**:
**Actual**:
**Severity**: Critical
**Effort to fix**:

(Add as discovered)

## Important Findings (Should Fix Before Pilot)

UX issues that would create a bad first impression but don't block evaluation.

### Finding 1: [Title]

(Same template)

## Polish (Nice to Have)

Tone, copy, micro-interactions, visual consistency.

### Finding 1: [Title]

(Same template)

## Pilot Notes Channel

Findings from the pilot customer (May 25, evening triage):

(Update after pilot replies)

## Triage Decision

End-of-day classification:

- [ ] Pilot-blocker count:
- [ ] Important count:
- [ ] Polish count:
- [ ] Items to fix in C.4-C.5:
- [ ] Items deferred to post-pilot:
- [ ] Items deferred to Phase 2:

## Outcome

(Fill in at end of day)
```

A2.2. Create a draft email to the pilot customer — save as docs/pilot/welcome-email.md:

```markdown
# Pilot Welcome Email Draft

Subject: Dealerlink staging is ready for your evaluation

Hi [Pilot Name],

As promised, Dealerlink staging is up and ready for you to evaluate.

**Access**: https://demo.staging.dealerlink.in
(If the subdomain doesn't load, try https://staging.dealerlink.in/?tenant=demo)

**Login as admin**:

- Email: admin@demo.test
- Password: password123

You can also log in as sales, accounts, or dispatch using the same
password — see the attached onboarding guide for details and a suggested
evaluation path.

The system comes pre-loaded with realistic distributor data so you can
see a full picture. Try creating a quotation, converting it through PI
to an order, recording a payment, and dispatching — about 45 minutes
end-to-end.

A few things to know:

- Emails get queued on staging but don't actually send (production will)
- First PDF of the day takes ~30-60s; subsequent renders are fast
- Mobile views aren't optimized yet; please use a desktop browser

I've attached docs/PILOT_ONBOARDING.md with the full walkthrough.

Send me your findings whenever — even brief notes are helpful. I'll
review and we'll talk through priorities for production launch on June 3.

Thanks for taking the time on this.

[Your name]
```

A2.3. Create a credentials cheat sheet — docs/pilot/credentials-cheatsheet.md (pilot-facing, mirror of what's in PILOT_ONBOARDING.md but standalone):

```markdown
# Dealerlink Staging Access

**URL**: https://demo.staging.dealerlink.in
**Alternative**: https://staging.dealerlink.in/?tenant=demo

| Role     | Email              | Password    |
| -------- | ------------------ | ----------- |
| Admin    | admin@demo.test    | password123 |
| Sales    | sales@demo.test    | password123 |
| Accounts | accounts@demo.test | password123 |
| Dispatch | dispatch@demo.test | password123 |

For evaluation use only. Don't enter real customer data.
```

COMMIT C3b: `docs(pilot): UX findings template + pilot communication drafts`

## CHUNK C3c — Day closeout

A3.1. Update docs/STAGE_C_HANDOFF.md:

- Mark C.3 prep ✅ in "Stage C Progress (Living)"
- Note: C.3 execution is operator-led; this commit is the prep, not the day's actual work
- Add subsection for "Pilot Findings" that will be populated end-of-day

A3.2. Update PROJECT_PLAN.md:

- Add C.3 prep ✅ entry for 2026-05-25
- Note: C.3 marked complete only after end-of-day triage in UX_FINDINGS.md

A3.3. Quality gates (doc-only, all should pass):

- pnpm preflight
- pnpm typecheck, lint
- Skip test/verify (doc changes don't affect code)

A3.4. Commit + push:

- `docs(pilot): Stage C Day C.3 prep — onboarding guide, UX template, credentials sheet`
- Push to main (auto-deploys to staging — no functional change)

COMMIT C3c: as above

GUARDRAILS (C.3 PREP):

- These are doc-only changes. No code modifications.
- The pilot credentials in PILOT_ONBOARDING.md and credentials-cheatsheet.md use the SEEDED test credentials. Do NOT generate new user accounts or invent passwords.
- The email draft uses placeholder [Pilot Name] and [Your name]. Don't fill these in — operator does that when sending.
- Don't push the onboarding guide as a permanent product doc; it's pilot-specific. Mark it clearly in the file header.
- Don't include any production-only information (real API keys, real customer data, etc.) since this is pre-pilot.

WHEN DONE:

- Print summary, 3 chunk commits
- Confirm: PILOT_ONBOARDING.md exists with evaluation path
- Confirm: UX_FINDINGS.md template created
- Confirm: Email draft + credentials cheat sheet created
- Confirm: STAGE_C_HANDOFF.md and PROJECT_PLAN.md updated
- Tell me the prep is done and the operator can now do the walkthrough + send the email

```

### What the operator (you) does AFTER Claude Code finishes

1. **Read docs/PILOT_ONBOARDING.md** as if you were the pilot customer. Edit anything that feels off.

2. **Send the welcome email** (fill in pilot name + your name, copy onboarding guide content as attachment OR paste URL to the rendered doc).

3. **Do your 2-hour walkthrough**:
   - Open https://demo.staging.dealerlink.in fresh
   - Follow the evaluation path you wrote for the pilot
   - Capture every wart, awkward flow, confusing label
   - Don't try to fix as you go — just note it in docs/UX_FINDINGS.md

4. **Throughout the day**: monitor pilot feedback. Add their findings to UX_FINDINGS.md.

5. **End of day triage** (~30 min):
   - Classify each finding: Critical / Important / Polish
   - Decide what fits in C.4-C.5 vs deferred
   - Update UX_FINDINGS.md "Outcome" section
   - Commit: `docs(pilot): C.3 walkthrough findings + triage`
   - This commit marks C.3 truly complete

### Verification checklist

- [ ] PILOT_ONBOARDING.md exists with evaluation path
- [ ] UX_FINDINGS.md template exists
- [ ] Welcome email draft exists
- [ ] Credentials cheat sheet exists
- [ ] STAGING_ENV.md reflects C.2 state
- [ ] Email sent to pilot customer
- [ ] Your 2-hour walkthrough done; findings captured
- [ ] Pilot's findings captured (if received same day)
- [ ] End-of-day triage classifies findings
- [ ] Final C.3 commit pushed

---

## Stage C Day C.4 — Security Audit (Tuesday May 26)

*Will be added when C.3 closes. RLS verification across tenant-scoped tables, role enforcement audit, secrets inventory, OWASP top-10 for public routes, Sentry PII scrubbing verification, audit log completeness.*

## Stage C Day C.5 — Performance Testing + Stage D Handoff (Wednesday May 27)

*Will be added when C.4 closes. Load test against staging (PDF generation, concurrent dispatches, payment allocations), pg-boss queue depth under load, worker sizing decision per DEV.67, final docs/STAGE_D_HANDOFF.md.*

---

## Stage D — Production Deployment (May 28 - May 31)

*Detailed prompts added at close of Stage C. Provisions production environment, larger instance sizes, real Resend domain + DKIM, production observability DSNs, backup configuration.*

## Stage E — Pilot Launch (June 1 - June 3)

*Detailed prompts added at close of Stage D. Provisions pilot tenant in production, training session, final dry run, go-live June 3.*
```
