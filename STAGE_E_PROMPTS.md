# Stage E — Pilot Launch Prompts

Stage E launches the first real pilot customer (UMA TRADING COMPANY) on production. Pilot live target: today.

## Pilot Details (validated)

| Field             | Value                                                       | Validation                    |
| ----------------- | ----------------------------------------------------------- | ----------------------------- |
| Legal name        | UMA TRADING COMPANY                                         | ✅                            |
| Slug              | umatrading                                                  | ✅ valid format, not reserved |
| GSTIN             | 27ADOPA1874B1ZT                                             | ✅ 15-char, state code 27     |
| State             | Maharashtra                                                 | ✅ matches GSTIN code 27      |
| Address           | SHOP NO 6, K B MISTRY COMPLEX, 80 FOOTI ROAD, DHULE, 424001 | ✅                            |
| Admin name        | Akhshay Mittal                                              | ✅                            |
| Admin email       | info.umatrading@gmail.com (lowercase-normalized)            | ✅                            |
| Entity type       | Proprietorship (PAN 4th char = P)                           | Noted                         |
| Logo / T&C / bank | Not provided — optional, add post-launch                    | Deferred                      |

**Critical check passed:** GSTIN state code 27 = Maharashtra = declared state. Tax engine will compute correctly (intra-MH = CGST+SGST; other states = IGST).

## Approach (confirmed flow)

Known: tenant creation auto-sends the welcome email with the temp password (ADR-010 / C.1). No need to re-verify. The flow:

1. **Operator creates the real tenant** — system auto-sends welcome email (login URL + temp password) to info.umatrading@gmail.com
2. **Claude Code validates** the provisioned tenant (subdomain SSL, tax config, admin account, tenant empty)
3. **Build the starting guide** — getting-started document tailored to umatrading's first session (self-serve, non-technical)
4. **Send the starting guide separately** — operator emails it to the pilot as a follow-up to the auto-sent welcome

This is go-live. The pilot (Akhshay Mittal) receives the welcome email immediately on creation, then the starting guide separately.

## Schedule

| Day     | Focus                                                           | Status      |
| ------- | --------------------------------------------------------------- | ----------- |
| **E.1** | **Provision real tenant (go-live) + validate + starting guide** | **Current** |
| E.2     | First-day monitoring + post-launch follow-up                    | ⏳          |

---

## Stage E Day E.1 — Provision + Validate + Starting Guide (Current)

**Goal:** Provision the real UMA TRADING COMPANY tenant on production (which auto-sends the welcome email), validate everything is correct, build the self-serve starting guide, and prepare it for the operator to send separately. This is go-live.

**Estimated time:** 2-2.5 hours

**Deliverable:** umatrading.dealerlink.in live with valid SSL; welcome email auto-sent to the pilot; tenant validated (tax, empty, admin account); PILOT_GETTING_STARTED.md built and ready for the operator to send as a follow-up email.

### Prompt for Claude Code

```
You are implementing Stage E Day E.1 — launching the FIRST REAL PILOT CUSTOMER (UMA TRADING COMPANY) on production. This is real customer data on live production and this IS go-live. Stage D closed (tag stage-d-complete); production is hardened, wildcard SSL works, the onboarding procedure was rehearsed with d3smoketest in D.3.

KNOWN BEHAVIOR (do NOT re-verify): tenant creation AUTO-SENDS the welcome email with the temp password to the admin email (ADR-010 / C.1 flow). When the operator creates the tenant, Akhshay Mittal receives the welcome email immediately.

THE FLOW:
1. Operator creates the real UMA tenant -> system auto-sends welcome email (login URL + temp password) to info.umatrading@gmail.com
2. You validate the provisioned tenant
3. You build the starting guide (PILOT_GETTING_STARTED.md)
4. Operator sends the starting guide separately (you prepare it; operator sends)

The pilot is SELF-SERVE with NO live training. The starting guide must be self-sufficient for a non-technical distributor.

PILOT CUSTOMER:
- Legal name: UMA TRADING COMPANY
- Slug: umatrading (-> umatrading.dealerlink.in)
- GSTIN: 27ADOPA1874B1ZT
- State: Maharashtra (state code 27 — matches GSTIN)
- Address: SHOP NO 6, K B MISTRY COMPLEX, 80 FOOTI ROAD, DHULE, 424001
- Admin name: Akhshay Mittal
- Admin email: info.umatrading@gmail.com (lowercase on storage)
- Logo / T&C / bank: NOT provided — defaults, optional post-launch

PRELIMINARY:
P.1. pnpm preflight green
P.2. Read docs/PILOT_ONBOARDING_PRODUCTION.md — the rehearsed procedure (authoritative)
P.3. Read docs/USER_MANUAL.md — existing user docs; the starting guide builds on/tailors this
P.4. Read the operator-onboarding flow (how operator creates a tenant)
P.5. Read the email normalization logic — confirm email lowercased on creation
P.6. Recall the D.3 d3smoketest walkthrough — what was confusing/non-obvious? Informs the guide.
P.7. Confirm production /api/health green + no existing tenant with slug "umatrading"

==========================================================
STEP 1 — OPERATOR CREATES THE TENANT (go-live)
==========================================================

CHUNK E1a — Pre-create confirmation
---------------------------------

A1.1. Production health: curl https://app.dealerlink.in/api/health -> 200, all green (migrations 17, RLS, resend, queue).

A1.2. Slug availability:
   - No existing tenant with slug "umatrading"
   - Passes reserved-slug check (DEV.73) — not reserved
   - Wildcard SSL covers umatrading.dealerlink.in (*.dealerlink.in, proven D.3)

A1.3. Final detail confirmation with operator BEFORE creating:
   - Show the operator the exact values that will be entered (legal name, slug, GSTIN, state, address, admin name, admin email)
   - Confirm slug spelling "umatrading" (permanent once created)
   - Confirm admin email will be stored lowercase: info.umatrading@gmail.com
   - PAUSE for operator confirmation — this creates the real tenant AND auto-sends the welcome email to the real pilot. One-way action.

CHUNK E1b — Create the tenant
---------------------------------

A1.4. Operator creates the tenant via the production operator-onboarding flow:
   - Login as operator on app.dealerlink.in
   - Legal name: UMA TRADING COMPANY
   - Slug: umatrading
   - GSTIN: 27ADOPA1874B1ZT
   - State: Maharashtra (code 27)
   - Address: SHOP NO 6, K B MISTRY COMPLEX, 80 FOOTI ROAD, DHULE, 424001
   - Admin name: Akhshay Mittal
   - Admin email: info.umatrading@gmail.com (lowercase)
   - Guide the operator through each field
   - On creation: admin user gets must_change_password = true; the system AUTO-SENDS the welcome email with the temp password to info.umatrading@gmail.com

A1.5. Confirm the welcome email was sent:
   - The system sends via Resend (noreply@dealerlink.in)
   - Operator confirms (checks with the pilot, or via Resend dashboard) that the email was dispatched
   - info.umatrading@gmail.com is Gmail — DKIM/SPF/DMARC (D.1) should keep it out of spam; operator confirms delivery (not spam) when able

==========================================================
STEP 2 — CLAUDE CODE VALIDATES
==========================================================

CHUNK E1c — Validate the provisioned tenant
---------------------------------

A2.1. Tenant record correct:
   - Legal name, slug, GSTIN, state all match the pilot details
   - Admin user exists, must_change_password = true, email stored LOWERCASE
   - RLS: tenant data isolated (tenant_id scoping)
   - Tenant is EMPTY — no demo/seed pollution

A2.2. Subdomain + SSL:
   - curl -sI https://umatrading.dealerlink.in/api/health -> 200
   - Valid wildcard SSL
   - Login page loads at umatrading.dealerlink.in

A2.3. Tax config verification (CRITICAL — do NOT skip):
   - Verify the tenant's state (Maharashtra) drives tax correctly
   - If verification requires creating a test quotation: create one, confirm:
     - Ship-to Maharashtra -> CGST + SGST
     - Ship-to another state (e.g., Gujarat) -> IGST
   - CLEAN UP any test data — the pilot's tenant must stay EMPTY for their first login
   - If tax looks wrong, STOP and surface immediately (compounds across every document)

A2.4. Do NOT touch the admin login:
   - Leave the admin account pristine — do NOT log in as Akhshay or consume the temp password
   - His first login must be clean (he just received the temp password by email)
   - Validation is operator/DB-side only, never via the admin's credentials

A2.5. Branding defaults:
   - No logo -> documents fall back to text name (UMA TRADING COMPANY)
   - No T&C -> documents render without T&C section
   - No bank details -> PI/invoice renders without bank section
   - Acceptable for launch

A2.6. Observability:
   - Tenant creation generated audit log entries
   - No Sentry errors from provisioning
   - Tenant activity will be observable (Axiom)

==========================================================
STEP 3 — BUILD THE STARTING GUIDE
==========================================================

CHUNK E1d — Getting-started guide
---------------------------------

A3.1. Create docs/PILOT_GETTING_STARTED.md (tailored to umatrading's first session):
   - Audience: Akhshay Mittal, non-technical, self-serve, no training
   - Base on USER_MANUAL.md but TAILORED to a solar panel distributor's first session
   - Structure (logical first-use order):
     1. First login (you received a temp password by email) + setting your new password
     2. Orienting: what the dashboard shows
     3. Add your first dealer (customer)
     4. Add your first product to the catalog
     5. Set up inventory
     6. Create your first quotation -> send it
     7. Convert to proforma invoice -> order
     8. Record a payment
     9. Create a dispatch
     10. Where to find reports
   - Each step: plain language, what to click, what to expect
   - Use D.3 d3smoketest learnings — whatever was non-obvious, spell out
   - Clear textual navigation ("click X in the left menu"); screenshot placeholders ok
   - Optional branding section: how to add logo, T&C, bank details when ready
   - Reference the login URL: https://umatrading.dealerlink.in

A3.2. Support escalation path (include in the guide):
   - How the pilot reaches the operator when stuck (channel = operator's call: email/WhatsApp/phone)
   - Response-time expectations, what info to include

A3.3. Prepare the cover email for sending the guide separately:
   - A short, warm email the operator sends to info.umatrading@gmail.com as a FOLLOW-UP to the auto-sent welcome
   - Subject + body referencing: "you should have received your login details; here's a guide to get started"
   - Attach or link the starting guide
   - This is content for the OPERATOR to send manually — prepare the text, operator sends

A3.4. Optional async walkthrough aid (operator's call):
   - No live training -> a short Loom-style video or annotated screenshots helps
   - Claude Code can produce a detailed annotated-screenshot SCRIPT the operator records/captures
   - Flag as optional operator follow-up

==========================================================
STEP 4 — CLOSEOUT (operator sends the guide)
==========================================================

CHUNK E1e — Closeout
---------------------------------

A4.1. Operator action — send the starting guide:
   - Operator sends PILOT_GETTING_STARTED.md (as PDF/attachment/link) + the cover email to info.umatrading@gmail.com
   - This is the operator's manual step; Claude Code prepared the content
   - Confirm sent

A4.2. Go-live validation checklist:
   - [ ] Tenant created: UMA TRADING COMPANY / umatrading / 27ADOPA1874B1ZT / Maharashtra
   - [ ] Welcome email auto-sent to info.umatrading@gmail.com (temp password delivered)
   - [ ] umatrading.dealerlink.in resolves with valid SSL
   - [ ] Tax verified (CGST+SGST intra-MH, IGST inter-state), test data cleaned
   - [ ] Admin account: email lowercase, must_change_password, login pristine
   - [ ] Tenant EMPTY
   - [ ] Branding defaults acceptable
   - [ ] Starting guide built + sent separately
   - [ ] No Sentry errors

A4.3. Document:
   - Update PILOT_ONBOARDING_PRODUCTION.md: UMA TRADING COMPANY LIVE (date, slug; NO password in any doc)
   - Commit the starting guide (PILOT_GETTING_STARTED.md) + cover email content — NO password anywhere
   - Update PROJECT_PLAN.md: E.1 complete — pilot live

A4.4. First-day monitoring setup:
   - Confirm Sentry/Axiom/BetterStack alerts route to the operator
   - Note what to watch in the first 24h: login success, first real document generation, any errors specific to the umatrading tenant

A4.5. Closeout:
   - If a code fix was needed (e.g., email normalization), commit separately
   - Push (docs/materials; note any code fix)
   - Print summary

GUARDRAILS (E.1):
- REAL CUSTOMER DATA + REAL GO-LIVE. Creating the tenant auto-sends the welcome email to the real pilot — this is a one-way action. PAUSE for operator confirmation (A1.3) before creating.
- Tenant starts EMPTY — no demo/test pollution. Any tax-test data MUST be cleaned up.
- Do NOT touch the admin login — leave it pristine for Akhshay's clean first login.
- NEVER put the temp password in any committed doc, the starting guide, or logs/Sentry/Axiom. The password lives only in the auto-sent email.
- Email stored LOWERCASE (info.umatrading@gmail.com).
- Slug umatrading is permanent — confirm spelling before creating.
- If GSTIN/state/tax looks off, STOP and surface — tax errors compound across every document.
- The starting guide is for a NON-TECHNICAL self-serve user — plain language, no jargon.

WHEN DONE:
- Print summary
- Confirm: tenant created, welcome email auto-sent to info.umatrading@gmail.com
- Confirm: umatrading.dealerlink.in live with valid SSL
- Confirm: tax verified (CGST+SGST intra-MH, IGST inter-state), test data cleaned
- Confirm: tenant empty, admin login pristine
- Confirm: PILOT_GETTING_STARTED.md built + cover email prepared
- Confirm: starting guide sent separately by operator
- Confirm: first-day monitoring alerts route to operator
- Tell operator the pilot is LIVE and E.2 (first-day monitoring + follow-up) is next
```

### Verification checklist (operator)

#### Provisioning (go-live)

- [ ] Final details confirmed before creation (slug spelling, GSTIN, state)
- [ ] Tenant created: UMA TRADING COMPANY / umatrading / 27ADOPA1874B1ZT / Maharashtra
- [ ] Welcome email auto-sent to info.umatrading@gmail.com (temp password delivered)
- [ ] Welcome email delivered (not spam) — confirm when able

#### Validation

- [ ] umatrading.dealerlink.in resolves with valid SSL
- [ ] Tax: CGST+SGST intra-MH, IGST inter-state (verified, test data cleaned)
- [ ] Admin account: email lowercase, must_change_password, login pristine
- [ ] Tenant EMPTY
- [ ] Branding defaults acceptable
- [ ] No Sentry errors

#### Starting guide

- [ ] PILOT_GETTING_STARTED.md complete, tailored, non-technical
- [ ] Cover email content prepared
- [ ] Support escalation path included
- [ ] Operator sent the guide separately to info.umatrading@gmail.com
- [ ] (Optional) async walkthrough aid flagged

#### Closeout

- [ ] PILOT_ONBOARDING_PRODUCTION.md updated (pilot live, no password)
- [ ] First-day monitoring alerts confirmed routing to operator

---

## Stage E Day E.2 — First-Day Monitoring + Follow-Up (next)

_Watch the pilot's first real usage. Confirm Akhshay logged in successfully + changed his password. Watch for errors specific to the umatrading tenant (Sentry/Axiom). Confirm first real documents generate correctly (when the pilot creates them). Check in with the pilot on any blockers. Address the optional branding (logo/T&C/bank) when the pilot is ready. This is the careful watch period as a real customer begins using the system._
