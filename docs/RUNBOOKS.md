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

---

## R7 — Bulk importing dealers from a legacy system

**When to use:** A newly-onboarded tenant has hundreds of existing dealer records in an older CRM (Tally, Zoho, an Excel sheet) and wants them in Dealerlink without re-typing.

**Time:** ~5 minutes per batch of up to 500 rows.

**Prerequisites:** You (or the tenant admin) are signed in as a tenant admin. Per Day 5 guardrails, only the **admin** role can bulk-import; sales cannot.

**Steps:**

1. Sign in to the tenant workspace as an admin user.
2. Navigate to **Dealers** in the sidebar, then click **Bulk import**.
3. Click **Load template** to populate the textarea with the canonical column order:
   `legalName, displayName, gstin, pan, state, city, pincode, type, category, riskLevel, email, phone, creditLimit, creditPeriodDays, discountPercent, tags`.
4. Paste your source CSV, replacing the template body but keeping the header row. Required columns: `legalName`, `displayName`. Anything missing falls back to schema defaults (`type=retailer`, `category=B`, `riskLevel=low`).
5. Click **Preview**. The first 10 rows are shown for visual sanity check. Confirm:
   - GSTINs look right (15 chars, valid format)
   - States are spelled correctly (the dealer state controls CGST/SGST vs IGST decisions on quotes)
   - Tag values are comma-quoted (`"premium,strategic"`) since plain commas would be field separators
6. Click **Confirm import (atomic)**.
7. The whole batch goes in a single transaction. If any row fails validation or hits a GSTIN conflict against existing dealers, the entire import rolls back and the error message identifies the first offender. Fix the source CSV and retry — partial imports are forbidden by design.

**On success:** Each dealer is assigned a sequential `dealer_code` (`DL-000xxx`) from the tenant's counter. The audit log records a `create` row per dealer attributed to your user.

**Sizing:** The Server Action enforces a 500-row max per batch. For larger migrations (1,000+ dealers), split the source CSV into chunks. Don't try to bypass — the cap exists to keep the transaction short enough not to hold row locks during peak hours.

---

## R8 — Updating product GST rates after a tax change

**When to use:** The GST Council changes the rate on a product category (e.g., HSN 8541 panels move from 18% to 12%). Every product affected must be updated before the next quotation is issued.

**Time:** ~10 minutes for a few SKUs; an hour if you need to coordinate across tenants.

**Prerequisites:** You are signed in as a tenant admin. The check constraint on `products.gst_rate` only accepts {0, 5, 12, 18, 28} — anything else is rejected at the DB layer.

**Steps:**

1. Confirm which HSN codes are affected by the rate change (refer to the gazette notification).
2. In the tenant workspace, go to **Catalog**. Filter by **Category** or use the search bar to find affected SKUs (e.g., search "TOPCon" for panels in that subcategory).
3. For each product:
   - Click into the detail page.
   - In the **Tax & pricing** section, click **Edit**.
   - Change the **GST rate** dropdown to the new value.
   - Click **Save**. The audit log captures the before/after.
4. **Important:** The change applies to **new** quotations only. Quotations and invoices already in flight are frozen by design — the tax rate at the time of issue is what's billed. Don't try to retroactively re-tax a sent quote.
5. For bulk updates across dozens of SKUs:
   - Export the current catalog (Day 16 feature; for now, use the DB directly).
   - Update the `gst_rate` column in the CSV.
   - Use the **Bulk import** flow only for _new_ products — there is no bulk update in Phase 1. For bulk in-place changes, run a tenant-scoped SQL UPDATE through the admin DB, e.g.:

     ```sql
     -- Run as the admin role; bypasses RLS deliberately for ops work.
     UPDATE products
     SET gst_rate = 12, updated_at = now()
     WHERE tenant_id = '<tenant-id>'
       AND hsn_code LIKE '8541%'
       AND status = 'active';
     ```

     The audit trigger fires per-row and the change is recorded with `app.user_id` if you set the GUC, otherwise as a system update.

**Don't:**

- Don't introduce GST rates outside {0, 5, 12, 18, 28} — the check constraint will reject them. If a new statutory rate is added, that requires a migration.
- Don't update GST rates on `status='discontinued'` products; they shouldn't be selling anyway, and the change muddies the audit trail.

---

## R9 — Moving a deal past the high-risk dealer guard

**When to use:** A salesperson reports that a deal is "stuck" — they can't drag the card past Negotiation on the kanban. The card belongs to a dealer with `risk_level = 'high'`, which BRD §3.4 blocks from moving forward without an admin sign-off.

**Time:** ~30 seconds (modal flow).

**Prerequisites:** You are signed in as a tenant **admin** (not sales). Sales users see the same modal but can only acknowledge it, not override.

**Steps:**

1. Open `/pipeline` in the tenant workspace.
2. Drag the affected card from its current column (likely Negotiation) onto the next column (Verbal commit, PO pending, etc.). The drop registers as usual.
3. The **High-risk dealer — Override required** modal appears, identifying the deal, the dealer, and the target stage.
4. Type a one-line reason in the **Override reason** textarea. Examples that survive a compliance review: "Verbal commit verified with CFO on 2026-05-12", "Bank guarantee on file", "Existing AR balance cleared this week". The reason persists on the `deal_stage_history` row.
5. Click **Override & move**.

The card lands in the destination column and the history row is marked `overridden = true` with the reason. Re-running the move later will need a fresh reason — overrides do not persist as a per-deal "trust" flag.

**Don't:**

- Don't override without a reason that names the mitigating fact. The override row is what compliance reads if the deal eventually goes bad.
- Don't try to bypass the modal by editing the database directly — `deal_stage_history` writes happen inside the same transaction as the stage update, and skipping the modal also skips the history row.
- Don't change the dealer's `risk_level` to medium just to make the modal go away. If the risk has genuinely improved, update the risk level from the dealer detail page (which is itself audited); the kanban will then stop firing the guard for future moves.

**Reverse transitions:** Admins can drag a card _backwards_ one stage (e.g., "Verbal commit" → "Negotiation") if the dealer pulled out of a commit. Sales users cannot. Reverse moves never trigger the high-risk modal because they reduce risk exposure rather than increase it.

**Closing as lost:** Any deal at any stage can be dragged into **Closed** — but if the close status is 'lost', the action requires a `lostReason` selection (and admin override modal does _not_ gate lost-closures for high-risk dealers). Lost is always permitted because it removes the deal from the active pipeline.
