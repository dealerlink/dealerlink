# Dealerlink Runbooks

Short, operator-facing procedures for actions that ship with the admin app. Each runbook should be doable in a few minutes by an on-call operator with no engineering support.

---

## R1 — Onboarding a new tenant

**When to use:** A new distributor has signed an agreement and is ready to start using Dealerlink. Until Phase 2 ships self-serve signup (ADR-002), every tenant is provisioned here.

**Time:** ~2 minutes.

**Prerequisites:** You are signed in as a platform operator. You have the tenant's:

- Legal business name (matches the GSTIN registration)
- Display name (what they want shown in the sidebar — usually a shorter, friendlier form)
- Desired slug (DNS-safe; lowercase, alphanumeric + hyphens, 3–32 chars)
- GSTIN
- State of registration (drives CGST/SGST vs IGST on every invoice)
- Registered address + pincode
- Bank account details (printed on tax invoices)
- The initial admin user's full name + email

**Steps:**

1. Sign in at `admin.dealerlink.in` (or `localhost:3000/admin` in dev).
2. Click **New tenant** from the Overview or Tenants list.
3. Fill the form. As you type the slug, the form live-checks availability. GSTIN is validated for both format _and_ check digit; if it's rejected, double-check you copied it correctly. PAN auto-fills from the GSTIN — only override if the tenant explicitly says so.
4. Click **Create tenant**.
5. You'll be redirected to the tenant detail page with a green "credentials shown once" banner displaying the admin email, temporary password, and login URL.
6. Copy the credentials into your secure handoff channel (encrypted DM, Bitwarden share, whatever your team uses) **or** rely on the welcome email which was queued automatically.
7. The admin user can log in and will be forced to rotate the password on first sign-in.

**If it fails:**

- _"Slug is already in use"_ → pick a different slug. Slugs are global; if your tenant insists on a specific value already taken, contact engineering.
- _"GSTIN format or check digit is invalid"_ → re-verify the GSTIN with the tenant. If they insist their GSTIN is correct, get an engineer to inspect — the validator implements the standard mod-36 algorithm, so a false negative is rare but possible.
- _"Internal error"_ → check the email_delivery_log table; the transaction may have committed but the email enqueue failed. Re-trigger via the operator dashboard.

---

## R2 — Adding a user to an existing tenant

**When to use:** A tenant admin asks for a teammate to be added. (Phase 2 will let tenant admins do this themselves; until then it goes through operators.)

**Time:** <1 minute per user.

**Steps:**

1. Open the tenant's detail page in the admin app.
2. Click **Users**.
3. Click **Add user**.
4. Pick the right role:
   - **admin** — full tenant control
   - **sales** — pipeline, dealers, quotations, orders
   - **accounts** — payments, invoices, financial reports
   - **dispatch** — confirmed orders, inventory picks, LR docs
5. Submit.
6. Credentials display once — share via the welcome email or your secure handoff channel.

---

## R3 — Resetting a user's password

**When to use:** A tenant user is locked out, forgot their password, or you suspect their account is compromised.

**Time:** <1 minute.

**Steps:**

1. Tenant detail → **Users**.
2. Find the user; click the key icon in their row.
3. Confirm. All of their active sessions are immediately invalidated, a new temporary password is generated, and a reset email is queued.
4. Share the new credentials with them out-of-band or wait for the email.

**Side effects:**

- The user is signed out everywhere.
- `users.must_change_password` is set, so the first login lands on the rotation screen.
- The action is recorded in `audit_log`.

---

## R4 — Rotating the inbound email token

**When to use:** The tenant's inbound BCC address is compromised (e.g., leaked in a public document) or they request a fresh one.

**Time:** <30 seconds, plus the 7-day grace window.

**Steps:**

1. Tenant detail → scroll to **Inbound email token**.
2. Click **Regenerate**, read the warning, confirm.
3. The new address (`<slug>+<new-token>@mail.dealerlink.in`) is active immediately.
4. The old address keeps working for 7 days, then expires.
5. Tell the tenant to update their BCC instructions within the grace window. The history is shown on the same page.

---

## R5 — Entering a tenant workspace as an operator

**When to use:** Debugging a tenant-reported issue or investigating an incident.

**Read-only:** Yes. The DB-level read-only enforcement (Day 3) blocks every mutation while the impersonation cookie is set; the audit trigger raises `42501` on any INSERT/UPDATE/DELETE. Every page view is recorded in `access_log` with `action='operator_impersonation_view'`.

**Time:** <30 seconds.

**Steps:**

1. Tenant detail → **Enter workspace**.
2. You'll be redirected to the tenant subdomain (or `?tenant=<slug>` in dev).
3. The orange impersonation banner appears at the top of every page — don't ignore it.
4. Click **Exit impersonation** in the banner to return to `/admin`.

**Don't:**

- Don't try to "fix" a tenant's data by impersonating. Mutations are blocked; if they weren't, you'd be writing data under your own user_id but in the tenant's scope — a confusing audit trail.
- Don't share impersonation screenshots externally; they contain tenant PII.

---

## R6 — Re-queueing a stuck welcome email

**When to use:** The welcome email never arrived; the tenant detail page shows a row in `email_delivery_log` stuck on `status='failed'`.

**Time:** depends on the root cause.

**Steps:**

1. Inspect the row: `SELECT * FROM email_delivery_log WHERE tenant_id = '<id>' ORDER BY queued_at DESC LIMIT 5;`
2. Check `error_message`. Common causes:
   - Resend API key missing or invalid (`error_message` mentions auth)
   - Recipient bounced (configure correct email and re-issue)
   - Provider downtime
3. If transient, flip `status` back to `queued` and the next dispatch pulse (operator-triggered from `/admin` or a future pg-boss tick) will retry. The `meta.attempts` counter caps at 3.
4. For repeated failures, fall back to R3 (reset password and hand off credentials manually).
