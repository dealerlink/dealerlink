# Pilot Onboarding — Production (Stage E, Day E.1)

> **Audience.** The Dealerlink **operator** running the first real pilot tenant
> onboarding on production (`app.dealerlink.in`), on **Stage E Day E.1**.
>
> **Status.** This procedure was rehearsed end-to-end on production in **Stage D
> Day D.3** (2026-05-31) against a throwaway test tenant (`d3smoketest`, since
> removed). What follows is that rehearsal, rewritten for the **real** pilot.
> Nothing here is theoretical — every step was walked on the live environment.
>
> **Companion docs:** `docs/RUNBOOKS.md` (R1 onboarding, R2–R9 day-to-day,
> R3/R3c lockout/reset), `docs/PRODUCTION_ENV.md` (live infra state),
> `docs/STAGE_D_HANDOFF.md` §9 (pilot provisioning preview),
> `docs/USER_MANUAL.md` (hand to the pilot admin).

---

## 0. What this is and is NOT

- **Is:** the operator-driven steps to stand up the pilot's tenant, hand off
  credentials, and confirm the workspace is correctly configured before the
  pilot starts entering real data.
- **Is NOT:** any code, schema, or infra change. Production is feature-complete
  and hardened (Stage D complete). E.1 is **data entry through the admin app**,
  nothing more. The product is tenant-agnostic — the pilot's identity is all
  configuration (CLAUDE.md §8), no code touches a customer name.

---

## 1. Pre-onboarding checklist (gather BEFORE E.1)

Collect every value below from the pilot **before** the onboarding session.
The onboarding form (R1) requires them; missing values stall the session.

| Field                                   | Notes                                                         | Have it? |
| --------------------------------------- | ------------------------------------------------------------- | -------- |
| Legal business name                     | Must match the GSTIN registration exactly                     | ☐        |
| Display name (brand)                    | Short, friendly; shown in the sidebar/app title               | ☐        |
| Desired slug                            | DNS-safe, lowercase, 3–32 chars; NOT a reserved slug (§2.1)   | ☐        |
| GSTIN                                   | 15-char; format + check digit validated by the form           | ☐        |
| State of registration                   | Drives CGST/SGST vs IGST on every document (ISO code, C.2)    | ☐        |
| Registered address + pincode            | Bill-From on all documents                                    | ☐        |
| Bank details (acct, IFSC, branch, name) | Printed on tax-invoice footer                                 | ☐        |
| Default T&C text (optional)             | Quotation Builder default; can be set later in Settings       | ☐        |
| Logo (optional)                         | PNG/SVG/JPG ≤1 MB, ~400×120 px — set later in Settings        | ☐        |
| Admin user full name                    | The pilot's first admin user                                  | ☐        |
| Admin user **real** email               | Receives the welcome email + temp password; must be reachable | ☐        |

**Security (F-8):** the pilot's real credentials must **never** be committed to
the repo or any file in it (unlike the throwaway `password123` staging seed).
The temporary password is shown once by the form and delivered by email; do not
paste it anywhere persistent.

### 1.1 Pilot tenant specifics (fill in before E.1)

> Operator to complete from the pilot agreement. Left blank here intentionally —
> these are real-customer values and live only in the operator's secure notes,
> not the repo.

| Field         | Value (operator fills, do NOT commit real values) |
| ------------- | ------------------------------------------------- |
| Legal name    | _[gather]_                                        |
| Display name  | _[gather]_                                        |
| Proposed slug | _[gather — verify available + not reserved]_      |
| GSTIN         | _[gather]_                                        |
| State (tax)   | _[gather]_                                        |
| Admin email   | _[gather]_                                        |

---

## 2. Operator creates the pilot tenant

Follows **R1** (onboarding a new tenant). Exact steps:

1. Sign in at **`https://app.dealerlink.in`** as the operator
   (`dealerlink.io@gmail.com`). If you have never rotated the operator password
   since D.0, you will be forced through `/change-password` first (C.1).
2. From the operator dashboard, **Tenants → New tenant**.
3. Fill the form with the §1.1 values. As you type the slug, the form
   live-checks availability **and** rejects reserved slugs (DEV.73). GSTIN is
   format- + check-digit-validated; PAN auto-fills from GSTIN (override only if
   the pilot explicitly says so).
4. Click **Create tenant**.
5. The tenant detail page loads with a **"credentials shown once"** banner:
   admin email, temporary password, login URL (`https://<slug>.dealerlink.in`).
   The welcome email was queued automatically and sends via Resend
   (`noreply@dealerlink.in`).
6. **Do not reload before noting the credentials** — the temp password is shown
   exactly once. Copy them into your secure handoff channel as a backup to the
   email.

### 2.1 Slug rules

- Lowercase alphanumeric + hyphens, 3–32 chars.
- **Reserved** (rejected by `slugSchema`, DEV.73): `admin`, `app`, `www` +
  the infra superset (`mail`, `staging`, `api`, `cdn`, …). Pick a brand slug.
- The slug becomes the permanent tenant subdomain `https://<slug>.dealerlink.in`
  — wildcard SSL (Stage D D.3) means **no per-tenant DNS or cert work** is
  needed; the subdomain serves HTTPS immediately.

---

## 3. Pilot admin receives credentials

- **Primary:** the welcome email (Resend, from `noreply@dealerlink.in`) lands in
  the admin's inbox with the temp password + login link. **Tell the pilot to
  check spam** on first send (new sending domain reputation).
- **Backup:** the credentials shown once on the tenant detail page, handed off
  via your secure channel (encrypted DM / Bitwarden share).
- If the email never arrives: **R6** (re-queue stuck welcome email) or **R3**
  (reset password → fresh temp password + email).

---

## 4. Pilot first-login + password change

1. Pilot opens `https://<slug>.dealerlink.in` and signs in with their email +
   the temporary password.
2. They are **forced** to `/change-password` (C.1 / ADR-010 force-rotation) —
   the temp password is single-use. They set a password meeting the §6 policy
   (≥8 chars, 1 uppercase, 1 number, 1 special; live strength meter + checklist).
3. On success they land on the tenant **dashboard** (empty — no seed data).
4. The operator never sees the pilot's chosen password; only the one-time temp.

---

## 5. Initial data setup guidance (pilot enters their own data)

Production ships with **no seed** — the pilot enters their real data. Suggested
order (hand them `docs/USER_MANUAL.md`):

1. **Settings** — confirm legal name, GSTIN, state, bank details, address;
   upload logo; set default T&C, quote validity, credit period, low-stock
   threshold. (Logo/branding optional but recommended before issuing documents.)
2. **Dealers** — add their dealers (or bulk import via **R7**, admin-only, ≤500
   rows/batch).
3. **Catalog** — add products with HSN + GST rate ({0,5,12,18,28}).
4. **Inventory** — procure stock + record serials (R-procurement).
5. Then the live workflow: deal → quotation → PI → order → payment → dispatch.

---

## 6. Validation checklist (operator confirms before go-live)

Operator verifies the tenant is correctly configured:

- ☐ `https://<slug>.dealerlink.in` serves HTTPS with a valid cert (wildcard).
- ☐ Login works; force-password-change fired on first login and cleared after.
- ☐ Settings show the correct legal name, GSTIN, **state** (tax classification
  depends on it), bank details, address.
- ☐ A test quotation computes tax correctly (intra-state → CGST+SGST; a Ship-To
  in another state → IGST) — sanity-check one document.
- ☐ A PDF renders (quotation/PI) — confirms the queue-based render path works
  for this tenant on production.
- ☐ The welcome email was delivered (not bounced; check `email_delivery_log` /
  the delivery dashboard, R11).
- ☐ No errors for this tenant in Sentry during setup.

---

## 7. Go-live confirmation

- All §6 boxes ticked.
- Pilot admin can sign in, navigate, and create a document unaided.
- Operator records the go-live date and the tenant slug in the project tracker
  (`PROJECT_PLAN.md` Stage E).
- Hand the pilot the support contact + `docs/USER_MANUAL.md`.

---

## 8. Rollback / abort procedure

If onboarding goes wrong (wrong GSTIN baked into early documents, wrong slug,
pilot pulls out), reset cleanly. **There is no in-app hard-delete of a tenant**
(RLS + FK references make a UI cascade-delete unsafe in Phase 1). Options, in
order of preference:

1. **Correct in place.** Most mistakes are fixable from the admin app: identity
   (legal name, display name, **slug**), compliance (GSTIN, PAN, state),
   address, bank — all editable on the tenant detail page (`update-tenant.ts`).
   A slug change re-points the subdomain (wildcard SSL covers any slug, so no
   DNS work). Documents already issued keep their snapshotted values by design.
2. **Reset the admin user.** R3 (password reset) re-mints the temp password and
   re-forces rotation if the pilot fumbled first login.
3. **Deactivate the tenant** (if the pilot must be stood down without deleting
   the audit trail). See the cleanup procedure proven in D.3:
   `docs/PRODUCTION_ENV.md` → "Removing / deactivating a tenant". This sets the
   tenant inactive so it can no longer be used, while RLS keeps its data
   isolated and intact for audit.
4. **Fresh start.** If the slug itself is wrong and documents have been issued,
   deactivate the bad tenant and provision a **new** tenant with the correct
   slug. Do not reuse a slug that already has issued documents.

> **Pre-onboarding safety net:** before E.1, the production DB has daily backups
>
> - PITR (proven in D.3, `docs/DISASTER_RECOVERY.md`). A botched onboarding is
>   recoverable to a point-in-time within the backup window if in-app correction
>   isn't enough — but in-app correction (option 1) is almost always sufficient.

---

## 9. Stage E readiness checklist (from Stage D D.3)

The infrastructure prerequisites for E.1, all confirmed in Stage D:

- ☐ Wildcard `*.dealerlink.in` SSL working (D.3 PART 1) — any pilot slug serves
  HTTPS with no per-tenant cert work.
- ☐ Backup/restore proven; RTO/RPO documented (D.3 PART 2,
  `docs/DISASTER_RECOVERY.md`).
- ☐ Full workflow validated on production end-to-end (D.3 PART 3).
- ☐ Production email delivery confirmed via Resend (D.3 PART 3).
- ☐ This onboarding procedure documented + rehearsed (D.3 PART 4 — this doc).
- ☐ **Operator action before E.1:** pilot company details gathered (§1.1).
