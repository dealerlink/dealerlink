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

## R3a — A user forgot the password they set themselves

**When to use:** A user already rotated their temporary password (so the welcome email's password no longer works) and has now forgotten the password they chose.

**Time:** <1 minute.

**Steps:**

1. This is the **same operation as R3** — there is no separate "forgot password" self-service flow in Phase 1.
2. Operator: Tenant detail → **Users** → key icon on the user's row → confirm. (A tenant admin requests this through their operator.)
3. The user's sessions are invalidated, a fresh temporary password is generated, `users.must_change_password` is set, and a reset email is queued.
4. The user signs in with the new temporary password and is forced through the rotation screen (see "First login experience" in `docs/WORKFLOWS.md`) to set a new password of their own.

**Note:** Operators never see or store the user's chosen password — only the one-time temporary password they hand off. A self-service "forgot password" email link is a Phase 2 item (ADR-010 rejected magic-links for Phase 1).

---

## R3b — Disabling force-password-change for testing (dev only)

**When to use:** A local/dev test needs a user that logs straight into the app without the rotation screen. **Never do this in production** — it defeats the single-use guarantee on temporary credentials.

**Time:** <30 seconds.

**Steps:**

1. Confirm you are pointed at the **dev** database (`dealerlink_dev`), not staging/production.
2. Clear the flag directly:
   ```sql
   UPDATE users SET must_change_password = false WHERE email = '<user-email>';
   ```
   (Seed users already have `must_change_password = false`; this is only for users created via the provisioning flow during a test.)
3. The user's next login lands on `/dashboard` (or `/admin`) directly.

**Why this is dev-only:** in production the flag is a one-way trapdoor — it starts `true` for provisioned/reset users and is cleared only by a successful password change. Manually clearing it would let a temporary password become a permanent one. Production operators have no direct DB access (ADR-002); the supported reset path is R3.

---

## R3c — Clearing a login lockout (F-3 — Stage D D.2)

**When to use:** A legitimate user has been locked out by the F-3 cumulative-failure threshold — typically after a string of typo'd password attempts hits 10 failures inside the 30-minute window. The 30-min lock will auto-expire on its own; this runbook is the manual override for "the user is staring at the login screen now and needs back in."

**Time:** <30 seconds.

**How to confirm it's actually a lockout** (vs a wrong password / a forgotten password):

1. Tail `auth_events` for the user's email and look at the most-recent `login_failed` row's `metadata`:
   - `locked_out` — every attempt this window is being rejected before password verify because `users.lockout_until > now`.
   - `bad_password:locked` — the failure that **fired** the lockout (10th cumulative failure). Subsequent rows will be `locked_out`.
   - `rate_limited:<email>` — the short 5/15-min window cap, not the long lockout. **Auto-clears** when the window rolls (≤15 min); usually waiting is the right answer.
   - `bad_password` — they just have the wrong password. Use R3 (password reset), not R3c.

**Steps (production):** operators do not have direct DB access (ADR-002). To clear a real lockout in production, **use R3 (password reset)** — it invalidates the user's sessions, mints a fresh temporary password, and clears the lockout state implicitly via the `users.failed_login_attempts` / `users.lockout_until` columns being reset alongside the password hash on the audit-trigger UPDATE. Two birds, one runbook.

**Steps (dev / direct DB only — never production):**

1. Confirm you are pointed at the **dev** database.
2. Clear the lockout state directly:
   ```sql
   UPDATE users
   SET failed_login_attempts = 0, lockout_until = NULL
   WHERE email = '<user-email>';
   ```
3. The user's next attempt skips the lockout gate and goes straight to password verify.

**Why the short-window rate limit has no runbook:** it is a 15-minute fixed window in `rate_limit`; an operator-driven `DELETE FROM rate_limit WHERE key = 'login:<email>'` works but is rarely worth it (window rolls naturally in ≤15 min, and any failed attempt while waiting just re-arms the gate). R3 reset is the universal "get them back in now" path.

**Audit trail:** the lockout fire, every rejected attempt under it, and the clear are all in `auth_events`. The `users` UPDATE that fires the lockout (and the UPDATE that clears it on success or via R3) is in `audit_log` via the trigger on `users`.

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
3. If transient, flip `status` back to `queued` and re-enqueue a `send-email` job for the row id — the pg-boss worker (Day 14) picks it up. A transient `RATE_LIMITED` failure is already retried automatically (retryLimit=5, exponential backoff); a row only reaches `failed` on a permanent error.
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

---

## R? — Re-generating a quotation PDF after edits

**When to use:** A quotation was edited (or revised) after its PDF was already generated, and the operator/sales user needs the PDF to reflect the current data.

**Time:** ~10 seconds.

**Background:** Every PDF render produces a **new immutable `generated_documents` row** — old renders are never mutated or deleted (they stay for audit). The "Download PDF" button always serves the **latest** row. So a stale PDF is simply a sign that no render has run since the last edit.

**Steps:**

1. Open the quotation at `/quotations/<id>` in the tenant workspace.
2. If a PDF has been generated before, the page shows **Last generated: DD-MMM HH:MM** and an admin-only **Regenerate PDF** button.
3. Click **Regenerate PDF** (admin) and confirm. A fresh render runs; on success the page shows "PDF regenerated." and the timestamp updates.
4. Click **Download PDF** to retrieve the new copy. Sales/Accounts users who only see "Download PDF" can also force a fresh copy by asking an admin to regenerate — Download itself serves the most recent render and only generates on first-ever request.

**Notes:**

- The render runs in the workers process (Puppeteer). It is spawned as a one-shot subprocess by the web action (Phase 1 — DEV.36); from Day 14 it moves to the pg-boss `render-pdf` queue.
- A `draft → sent` transition auto-generates the PDF, so a freshly-sent quotation already has a current render.
- If a render fails ("Could not generate the PDF…"), check that the workers Chromium is available — see `docs/PDF_PIPELINE.md`.

---

## R? — Converting a quotation to a Performa Invoice

**When to use:** A dealer has accepted a quotation and you need to issue a Performa Invoice (PI) — the priced document the buyer confirms before an order is placed.

**Time:** ~1 minute.

**Background:** A PI can only be created from an **accepted** quotation. The PI snapshots the quotation's line items; you may redirect the Ship-To and adjust validity / terms before sending. Place of supply follows the **Ship-To** dealer (ADR-012), so a Ship-To in a different state can change the tax (IGST ↔ CGST/SGST).

**Steps:**

1. Open the accepted quotation at `/quotations/<id>`.
2. Click **Convert to PI**.
3. (Optional) Pick a different **Ship-To** dealer. If the new Ship-To sits in another state, a banner shows the tax classification change — confirm this is intended.
4. (Optional) Adjust **Valid until**, terms, and internal notes.
5. Click **Create draft PI** — you land on the new PI (`draft`).
6. Review, then **Send** the PI. Sending renders the PI PDF and queues it for delivery (Resend send lands Day 14).

**Notes:**

- A draft PI is editable (`Edit`) for Ship-To / validity / terms / notes; line items are inherited from the quotation (DEV.40).
- A quotation can be converted more than once (e.g. to re-issue) — each conversion is an independent PI.

## R? — Confirming an order with the inventory check

**When to use:** A buyer has agreed to a sent PI and you are ready to commit stock.

**Time:** ~1 minute.

**Background:** Confirming a **PI** atomically creates an **Order** (`pending`) and advances the linked deal to _Payment Pending_. Confirming the **Order** then reserves serialised inventory FIFO — this is the step that earmarks physical stock.

**Steps:**

1. Open the sent PI at `/pi/<id>` and click **Confirm PI**. An order is created; follow **View order ORD-…**.
2. On the order (`pending`), click **Confirm order**. A modal previews, per line, how many serials will be reserved.
3. If every line shows **reserve N**, click **Confirm & reserve** — the serials move to `reserved` and the order becomes `confirmed`.
4. If a line shows **N short**, the order cannot be confirmed. Procure more stock for the short product(s) (see the procurement runbook), then retry.

**Notes:**

- Reservation is all-or-nothing — a shortage on any line blocks the whole order; nothing is partially reserved.
- Reserved serials appear on the order's **Inventory reservations** tab.

## R? — Cancelling an order and releasing reservations

**When to use:** A confirmed or pending order must be withdrawn before dispatch.

**Time:** ~1 minute.

**Background:** Cancellation is **admin only**. It releases every serial reserved for the order back to `in_stock` and nudges the linked deal back from _Payment Pending_ to _PO Pending_.

**Steps:**

1. Open the order at `/orders/<id>` (status must be `pending` or `confirmed`).
2. Click **Cancel order**, enter a reason, and confirm.
3. The order moves to `cancelled`; the page reports how many reservations were released.

**Notes:**

- Once an order is dispatched it can no longer be cancelled here — that becomes a returns process (Day 13+).
- To withdraw before an order exists, cancel the PI instead (`Cancel PI`, admin) — a confirmed PI cannot be cancelled; cancel its order.

## R? — Recording a payment

**When to use:** A dealer has paid — by bank transfer, cheque, UPI, cash or card — and the receipt must be logged.

**Time:** ~1 minute.

**Background:** Recording is **admin + accounts** only. The payment starts in `pending_verification`; it cannot be allocated until an accountant verifies it.

**Steps:**

1. Go to `/payments` and click **Record payment** (or use **Record payment** on an order's **Payments** tab).
2. Pick the paying dealer, enter the amount, method, reference (txn / cheque no.), received date, and optional bank-deposit details.
3. Submit — you land on the new payment at `/payments/<id>`, status `pending verification`.
4. Click **Verify** once the receipt is confirmed. To finalise a cheque/bank receipt, click **Mark cleared**.

## R? — Allocating a payment (or an advance) to an order

**When to use:** A verified/cleared payment must be applied against the dealer's outstanding orders.

**Time:** ~1 minute.

**Background:** Allocation drives the order's payment status. Allocating a payment that fully covers a `pending` order auto-confirms it (reserves inventory). A payment may also be applied to a draft/sent PI as an advance — that advance transfers onto the order when the PI is confirmed.

**Steps:**

1. Open the payment at `/payments/<id>` (status must be `verified` or `cleared`).
2. Click **Allocate** — the panel lists the dealer's outstanding orders with their balances.
3. Enter an amount against one or more orders and submit. The total cannot exceed the payment's unallocated balance, and no order can be over-allocated.
4. Affected orders' payment status updates immediately (`unpaid → partially_paid → paid`).

**Notes:**

- An unallocated remainder is a floating **advance balance** — held as dealer credit until applied.
- Use **Remove** on an allocation row to undo a mistake (recomputes the order's status).

## R? — Reversing a bounced cheque

**When to use:** A cheque that was recorded and verified has bounced.

**Time:** ~1 minute.

**Background:** Reversing is **admin + accounts** only and atomic — it deletes every allocation of the payment and recomputes each affected order. Orders may regress from `paid`/`partially_paid` back toward `unpaid`.

**Steps:**

1. Open the payment at `/payments/<id>` (status must be `verified`).
2. Click **Mark bounced**, enter the reason (e.g. "cheque returned — insufficient funds"), and confirm.
3. The payment moves to `bounced`; its allocations are reversed.

## R? — Refunding a payment

**When to use:** A cleared payment must be returned to the dealer (e.g. duplicate payment, cancelled order).

**Time:** ~1 minute.

**Background:** Refunding is **admin only** and, like a bounce, reverses every allocation.

**Steps:**

1. Open the payment at `/payments/<id>` (status must be `cleared`).
2. Click **Refund**, enter the reason, and confirm.
3. The payment moves to `refunded`; its allocations are reversed and affected orders recomputed.

## R? — Creating a dispatch

1. **Dispatch** → **+ New dispatch** (admin or dispatch role).
2. Pick a confirmed (or partially-dispatched) order from the list — only orders
   with reserved inventory still to ship appear.
3. For each line, tick the serial numbers leaving the warehouse, or use
   **Select up to remaining**. The selected count is the dispatched quantity;
   it cannot exceed `ordered − already-dispatched`.
4. Fill the logistics block (vehicle, transporter, docket, driver, e-way bill).
5. **Create dispatch** — the order advances to `partially_dispatched` or
   `fully_dispatched`, the picked serials become `dispatched`, and you land on
   the dispatch note.
6. **Download dispatch note** for the driver, or **Email to consignee** to
   queue it to the Ship-To dealer.

If two people dispatch the same serials at once, exactly one succeeds — the
other fails cleanly with a "serial already dispatched" error. Nothing is left
half-done.

## R? — Marking a dispatch delivered

1. Open the dispatch (status `in transit`).
2. **Mark delivered** → enter who received the goods → **Confirm delivery**.
3. Every serial becomes `delivered`. When all of the order's dispatches are
   delivered, the order itself advances to `delivered`.

## R? — Returning a dispatched order

1. Open the dispatch (status `in transit`) as an **admin**.
2. **Return** → enter the reason → **Confirm return**.
3. Every serial goes back to warehouse stock (`in_stock`, reservation cleared),
   the order line dispatched quantities are decremented, and the order's
   fulfilment status is recomputed — it may regress (e.g. `fully_dispatched →
partially_dispatched`). Re-reserving the freed serials for that order is a
   fresh confirmation step.

## R? — Handling a partial dispatch

An order does not have to ship in one go. Dispatch fewer serials than the line
quantity and the order sits at `partially_dispatched` with the balance shown as
**remaining**. Raise a second dispatch later for the rest from the same order —
the order detail **Dispatches** tab tracks every dispatch and the
units-dispatched roll-up. The order reaches `fully_dispatched` only when the
last unit ships.

---

## R10 — Setting up the Resend webhook in production

**When to use:** First production deploy, or after the inbound webhook stops
receiving delivery/bounce events.

**Steps:**

1. In the Resend dashboard → **Webhooks** → **Add Endpoint**.
2. Endpoint URL: `https://app.dealerlink.in/api/webhooks/resend`.
3. Subscribe to the email events: `email.sent`, `email.delivered`,
   `email.bounced`, `email.complained`, `email.opened`, `email.clicked`,
   `email.delivery_delayed`, `email.failed`.
4. Copy the **Signing Secret** Resend generates into the
   `RESEND_INBOUND_WEBHOOK_SECRET` env var (DO dashboard → web component).
   Redeploy so the value takes effect.
5. Verify: use Resend's "Send test event" — a `webhook_events` row should
   appear with `signature_verified = true` and `processed_at` set.
6. If test events are rejected (400), the secret in DO does not match the one
   Resend shows — re-copy it. Every rejection is logged to `webhook_events`
   with `signature_verified = false` for forensics.

---

## R11 — Investigating an email bounce

**When to use:** A dealer reports they never received a quotation / receipt,
or the delivery dashboard shows a `bounced` row.

**Steps:**

1. Find the row:
   `SELECT status, bounced_type, bounced_reason, last_event_at FROM email_delivery_log WHERE recipient = '<email>' ORDER BY queued_at DESC LIMIT 5;`
2. `bounced_type = 'hard'` → the address is permanently undeliverable
   (mailbox does not exist, domain invalid). Correct the dealer's email in
   the Dealer master and re-send the document.
3. `bounced_type = 'soft'` → transient (mailbox full, greylisting). Re-send
   later; it often clears on its own.
4. `status = 'complained'` → the recipient marked the mail as spam. Do NOT
   keep emailing that address — confirm the contact out of band.
5. Cross-check `webhook_events` for the raw Resend payload if `bounced_reason`
   is not specific enough.

---

## R12 — Why is an email stuck in `sending`?

**When to use:** An `email_delivery_log` row has been at `status='sending'`
for more than a few minutes.

**Steps:**

1. `sending` means the worker started the Resend call but never recorded a
   terminal state — almost always because the **workers process crashed or
   was restarted mid-send**.
2. Check the workers process is up (`pm2 status` / DO component health) and
   review its logs around the row's `queued_at`.
3. The pg-boss job is retried automatically if it was still in flight. If the
   job is genuinely lost, re-enqueue a `send-email` job for the row id; the
   handler is idempotent — a row already `sent`/`delivered` is skipped, so a
   re-run never double-sends.
4. Standing invariant check (also good as a monitoring query):
   `SELECT status, COUNT(*) FROM email_delivery_log WHERE queued_at < now() - interval '1 hour' AND status IN ('queued','sending') GROUP BY status;`
   — expect 0 rows on a healthy system.

---

## R13 — Pulling a sales summary for a sales-review meeting

**When to use:** Preparing numbers for a periodic sales review.

**Steps:**

1. Open **Reports → Sales Summary** (admin, accounts or sales role).
2. Set the **From / To** dates to the review period. The default is the
   current Indian fiscal year (Apr 1 – Mar 31).
3. Choose **Group by**: `month` for a trend, `dealer` for account ranking,
   `product` for mix. Optionally narrow by dealer or document status.
4. The totals row at the bottom is the period roll-up; **Avg deal size** is
   `total ÷ document count`.
5. **Download CSV** for the deck — it opens cleanly in Excel/Sheets with
   Indian number formatting preserved.

## R14 — Generating the GST summary at month-end

**When to use:** Month- or quarter-end GST reconciliation; the base figures
for a GSTR-1 filing (the actual GSTR-1 JSON export is Phase 2).

**Steps:**

1. Open **Reports → GST Summary** (admin or accounts).
2. Pick the **Fiscal quarter** (Q1 Apr–Jun … Q4 Jan–Mar). Optionally filter to
   intra- or inter-state supplies.
3. Each row is one place of supply: taxable amount, CGST, SGST, IGST — read
   straight from the orders' stored tax columns. Only supplied orders
   (`confirmed` / dispatched / `delivered`) are counted; `pending` orders are
   not supplies.
4. The totals row is what carries to the return. Cross-check against the
   invariant query in the verification checklist if anything looks off.
5. Download the CSV for the filing working papers.

## R15 — Investigating a discrepancy between two reports

**When to use:** Two reports (or a report vs. a module screen) disagree.

**Steps:**

1. **Reports never recompute money** — they read stored columns. So a
   discrepancy is either (a) a filter/scope difference or (b) genuinely
   inconsistent stored data.
2. Check scope first: Sales Summary counts quotations + PIs + orders (a deal
   appears up to three times); GST Summary counts only supplied orders;
   Outstanding counts only `unpaid` / `partially_paid` orders. Different
   denominators are expected.
3. For a GST figure that looks wrong, run the parity query:
   `SELECT SUM(cgst_amount), SUM(sgst_amount), SUM(igst_amount) FROM orders WHERE status IN ('confirmed','partially_dispatched','fully_dispatched','delivered') AND order_date BETWEEN <from> AND <to>;`
   It must equal the GST Summary totals. If it does, the report is correct and
   the other surface is wrong.
4. If stored columns themselves are inconsistent with the tax engine, that is
   a Day 9/11 bug — record it in DEVIATIONS and fix at the source. Reports
   surface drift; they do not paper over it.

## R16 — Observability alert thresholds

Day 17 wired Sentry, Better Stack, and Axiom. The alert rules below are
configured in each tool's UI. Routing destinations (`#____` Slack channels /
email lists) are placeholders — fill them in during the Stage E launch.

### Sentry — errors

| Alert            | Condition                                        | Route   |
| ---------------- | ------------------------------------------------ | ------- |
| Error spike      | error events > **5/min** (project, 5-min window) | `#____` |
| New issue        | a never-seen-before issue appears in production  | `#____` |
| Workers job fail | any event tagged `job.type` (workers project)    | `#____` |

To confirm Sentry is live post-deploy, hit `/api/internal/sentry-test` as an
operator — it throws on demand and the error must appear in Sentry within a
minute.

### Better Stack — uptime + logs

| Alert           | Condition                                             | Route   |
| --------------- | ----------------------------------------------------- | ------- |
| Uptime down     | `/health` returns `5xx` for **3 minutes** (3 strikes) | `#____` |
| Uptime degraded | `/health` body `status` = `degraded` for 10 minutes   | `#____` |
| Log error rate  | `level >= error` log lines > 20/min                   | `#____` |

`/health` returns `503` only when a critical component is `down`; `degraded`
still answers `200`, so the 5xx rule fires on genuine outages only. See
`docs/DEPLOYMENT.md` for the uptime-monitor configuration.

### DO Monitoring — infrastructure

| Alert  | Condition                             | Route   |
| ------ | ------------------------------------- | ------- |
| CPU    | > **80%** sustained for **5 minutes** | `#____` |
| Memory | > **90%**                             | `#____` |
| Disk   | > 85% on the managed Postgres volume  | `#____` |

### Axiom — business-event anomalies

| Alert           | Condition                                                    | Route   |
| --------------- | ------------------------------------------------------------ | ------- |
| Payment bounces | `payment.bounced` > **5%** of `payment.recorded` (last hour) | `#____` |
| Email bounces   | `email.bounced` > 10% of `email.sent` (last hour)            | `#____` |
| Login failures  | a sustained drop in `user.logged_in` (possible auth outage)  | `#____` |

These are analytics-derived alerts — they complement, never replace, the
`audit_log` forensic trail.

---

## R17 — Production DB migration from operator workstation (whitelist-migrate-remove)

**When to use:** a schema migration (`packages/db/migrations/*.sql`) must land on the production DB. Deploy_on_push rebuilds the app from `main` but does NOT run migrations — DEV.64 / the DEPLOYMENT.md \"Required env vars\" note. The migration runner connects from the operator's workstation, but the production DB firewall is locked down (D.0) to `type: app` for the production app's UUID only. So the operator must (a) whitelist their public IP, (b) run the migration, (c) **remove the rule**. Leaving the IP whitelisted shrinks the lockdown's security value and is the runbook's single non-negotiable.

**Time:** ~5 minutes including verification + cleanup.

**Pre-flight:**

- Git tree clean; the migration SQL is in `packages/db/migrations/`.
- `pnpm preflight` green; the migration file is generated + reviewed (`drizzle-kit generate` for schema-derived; hand-written for RLS/data fixes).
- Staging has been migrated FIRST and verified (any column-error or
  RLS drift surfaces there).
- Production cluster ID known: `doctl databases list` → look for
  `dealerlink-production-db`. As of D.2: `6e0f1d36-d651-44d0-a062-ddf82e844812`.

**Steps (PowerShell on operator workstation):**

```powershell
# 1. Resolve current public IP — DON'T hardcode; ISPs rotate.
$myIp = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content.Trim()
Write-Output "My IP: $myIp"

# 2. Snapshot the firewall BEFORE the append (you want this to compare on cleanup).
$clusterId = "6e0f1d36-d651-44d0-a062-ddf82e844812"   # dealerlink-production-db
doctl databases firewalls list $clusterId

# 3. Append the IP rule.
doctl databases firewalls append $clusterId --rule "ip_addr:$myIp"

# 4. Re-list and grab the NEW rule's UUID (the `ip_addr` row that wasn't there before).
doctl databases firewalls list $clusterId
$ruleUuid = "<paste-the-ip_addr-rule-uuid-from-step-4>"

# 5. Set $env:DATABASE_DIRECT_URL to the production doadmin connection string
#    (from C:\Users\rohit\.dealerlink\production-secrets.txt) and run the migration.
$prodUrl = (Get-Content "C:\Users\rohit\.dealerlink\production-secrets.txt" `
  | Select-String "^DATABASE_DIRECT_URL=").Line -replace "^DATABASE_DIRECT_URL=", ""
$env:DATABASE_DIRECT_URL = $prodUrl
pnpm --filter "@dealerlink/db" db:migrate   # expect "Migrations + RLS + triggers applied."

# 6. Verify (use packages/db/scripts/verify-0016.mjs as a template; adapt for the
#    column / RLS / migration-version checks the migration actually needs).
#    Confirm via the deployed app too:
Invoke-RestMethod https://app.dealerlink.in/api/health
# expect status:ok, migrations.applied = N (your new count)

# 7. REMOVE the IP rule. Use the --uuid flag, NOT positional args — DEV.??:
#    `doctl databases firewalls remove <cluster> <uuid>` errors with
#    "command contains unsupported arguments"; the working form is --uuid.
doctl databases firewalls remove $clusterId --uuid $ruleUuid

# 8. Verify cleanup — the ONLY rule remaining must be type=app, value=<prod-app-uuid>.
#    If `ip_addr` still appears, retry step 7.
doctl databases firewalls list $clusterId

# 9. Clear the env var so future shell commands don't accidentally target prod.
Remove-Item Env:\DATABASE_DIRECT_URL
```

**Expected migration output noise (HARMLESS):**

DO Managed Postgres replies with a long block of `WARNING: no privileges were
granted for "uuid_nil"` etc. when the `rls/*` scripts attempt broad GRANTs on
extension-owned functions (uuid-ossp, btree_gin, pg_trgm). `doadmin` cannot
GRANT on those — the warning is the documented refusal. **Migration still
succeeds**; the `✓ Migrations + RLS + triggers applied.` line at the end is
the authoritative success signal.

**Failure / abort conditions:**

- **Migration fails** → STOP. Do not remove the firewall rule yet — you may
  need it for a retry. Re-read the SQL and the migrate output; fix forward
  (don't `DROP COLUMN` on a half-applied migration).
- **`/api/health` reports `migrations: degraded` (count mismatch)** → the
  migration ran but the deployed app's `EXPECTED_MIGRATIONS` constant
  (`apps/web/app/api/health/route.ts`) is stale. Code patch needed; not a
  rollback signal.
- **You forgot step 7 and walked away** → the production DB is open to a
  rotated public IP. Run `doctl databases firewalls list $clusterId` from
  any machine to see the leftover rule and remove it.

**Why this is operator-only (not automated):** every step is hard to reverse
on its own (migrations) or has audit / security implications (firewall
mutations). Automating either invites the kind of silent-blanking failure
mode DEV.64 documents for spec sync. R17 keeps the human in the loop.

---

## R18 — Deploying an App Platform spec change (DEV.64 sync)

**When to use:** you edited `.do/app.yaml` (staging) or
`.do/app.production.yaml` (production) and need the change to actually take
effect. Pushing to `main` rebuilds the app's source code but does NOT
re-read the committed YAML — DO stores its own copy of the spec (DEV.64).
Without this runbook the repo file silently drifts from what's deployed.

**Time:** ~2 minutes for a no-op verify; ~3-5 min including a real deploy
cycle.

**Pre-flight:**

- Git tree clean (the spec change is committed).
- `doctl auth list` shows an authenticated context.
- You know which environment: `staging` or `production`.

**Steps:**

```powershell
# Verify-only (recommended first run after any spec edit):
pnpm sync-spec:staging      # answer 'n' at the prompt
pnpm sync-spec:production   # answer 'n' at the prompt
```

What the script does (`scripts/sync-app-spec.mjs`):

1. `doctl apps spec get $APP_ID` — pulls the live YAML.
2. Parses live + committed YAMLs into JS objects.
3. **Merges:** starts from the LIVE spec (preserves DO-derived fields
   like `ingress:`), overlays committed services/workers/databases/
   domains, and pulls each SECRET env value out of live so encrypted
   `EV[...]` blobs survive.
4. **Aborts** if any SECRET is declared in committed but absent from
   live (would otherwise ship a blank into production).
5. **Shows the diff** between live and merged with `EV[...]` redacted,
   so you see exactly what will change.
6. Prompts `apply? [y/N]`. Answer `n` to abort with no side effects.
7. On `y`: `doctl apps update $APP_ID --spec <merged-tempfile>` and polls
   the deployment phase until ACTIVE (30s interval, 15 min cap).

**Reading the diff:**

- Lines about `build_command` wrapping at 80 chars are cosmetic — yaml
  library and doctl wrap at slightly different columns. Ignore unless
  the line content itself changed.
- Lines with `value:` changes on non-SECRET env vars are real — that's
  the kind of drift the script exists to surface. **The operator
  decides** which side of the drift is correct: usually update the
  committed yaml to match live (if live was changed via the dashboard
  or a prior manual `doctl update`), or run this script to push the
  committed value to live.
- Lines under `ingress:` should never appear — DO derives ingress from
  the services list; the merge preserves it from live.

**Cosmetic `doctl apps update` exit-1 (DEV.80):** `doctl apps update` can exit
**1 while the update actually succeeded** — it prints `Notice: App updated ...`
and then its table renderer chokes on a column it doesn't recognise on the
update path (historically `Error: unknown column "ActiveDeployment.Phase"`).
The app **was** updated. The sync script now (a) omits that column from its
`--format` and (b) treats a `Notice: App updated` line as success even on a
non-zero exit, logging a `⚠ … treating as success` warning. If you ever run
`doctl apps update` by hand and see this, **don't re-apply** — verify the live
spec took with `doctl apps spec get <app-id>` (and `/api/health`) before
assuming failure.

**Failure / abort conditions:**

- **Missing SECRET in live, declared in committed** → the script
  exits 2 with the missing-key list and instructions for the three
  remediation paths (DO dashboard, `staging-app-render-spec.mjs`, or
  remove the declaration from committed).
- **`doctl apps update` fails** (genuinely — no `Notice: App updated`) → the
  deployment did NOT start. Re-read
  the error (typically a YAML structural issue or a permissions
  problem). The live spec is unchanged.
- **Deploy reaches ERROR/FAILED/CANCELED** during the poll → DO's build
  or deploy pipeline failed; check `doctl apps logs $APP_ID --type build`
  or the DO dashboard for the cause. The previous deployment stays
  ACTIVE (DO rolling-deploy behavior).

**Why this is operator-driven and NOT a GitHub Action (Option A rejected
in D.2):** the merge step preserving 16 encrypted secret values across
every spec push is exactly the kind of single-bug-catastrophic primitive
that should keep a human gate. The eyes-on diff before apply is the whole
value proposition; automating it away regresses the design.

---

## R19 — Wildcard `*.dealerlink.in` cert renewal / re-verification

**When to use:** the wildcard cert stops serving on tenant subdomains, or DO
emails a domain/cert notice for `*.dealerlink.in`. Set up in Stage D D.3 via
**Option A — DO-managed native wildcard** (STAGE_D_HANDOFF §6): the base domain
`dealerlink.in` is registered on the production app as `type: ALIAS`,
`wildcard: true`, which mints a `*.dealerlink.in` + `dealerlink.in` cert.

**How it actually validated (D.3, 2026-05-31):** DO verified domain ownership
via the **gray-cloud `*` CNAME** (`* → dealerlink-production-8treh.ondigitalocean.app`)
— **no TXT challenge was required** ("Path A / CNAME validation"). Confirmed
cert: SAN `*.dealerlink.in, dealerlink.in`, CN `dealerlink.in`, issuer
**Let's Encrypt E8**, 90-day (`app.dealerlink.in`'s separate PRIMARY cert is
Google Trust Services — different cert, unaffected).

**Renewal — fully automatic, normally zero-touch:**

- The 90-day cert **auto-renews**. Because validation rides the `*` CNAME (not
  a rotating TXT token), there is **no recurring manual step** as long as that
  CNAME stays in Cloudflare. This is the happy path — expect to do nothing.
- The only thing that breaks renewal is removing/repointing the `*` CNAME or
  the domain falling out of the app spec. Keep both in place.

**If the wildcard cert ever stops serving (recovery):**

1. Confirm DNS is intact in Cloudflare: `*` CNAME →
   `dealerlink-production-8treh.ondigitalocean.app`, **gray-cloud (DNS-only)**.
   Re-add it if missing.
2. Confirm the domain is still on the app spec
   (`doctl apps spec get d8a25cb8-… | grep -A2 'domain: dealerlink.in'` → should
   show `type: ALIAS`, `wildcard: true`). Re-apply via `pnpm sync-spec:production`
   (R18) if it drifted out.
3. If DO now asks for TXT verification (it may, if CNAME validation ever fails):
   DO dashboard → app → **Settings → Domains** → `dealerlink.in` → **Use TXT
   records to verify**, add the shown TXT in Cloudflare (gray-cloud, never
   proxied), wait 5–15 min for re-verification.
4. Confirm SSL serves on any subdomain:
   ```
   echo | openssl s_client -connect <anyslug>.dealerlink.in:443 \
     -servername <anyslug>.dealerlink.in 2>/dev/null \
     | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
   ```
   Expect SAN `*.dealerlink.in, dealerlink.in`, fresh dates.

**Don't:**

- Don't proxy (orange-cloud) the `*` CNAME — app traffic is already
  Cloudflare-fronted by DO (DEV.78); double-proxying is the rejected Option C.
- Don't delete + re-add the domain to "fix" a renewal — that re-triggers a full
  verification + cert issuance cycle and can blank tenant SSL for minutes.
- Don't touch the apex `dealerlink.in` A record (→ 2.57.91.91, marketing). The
  `wildcard: true` ALIAS attaches the wildcard cert to the app **without**
  claiming apex traffic; the apex stays on the marketing site.

**If a future renewal genuinely fails** and TXT re-verification doesn't fix it:
fall back to **Option B** (self-managed acme.sh DNS-01 + custom cert upload) per
STAGE_D_HANDOFF §6 — needs a Cloudflare API token with DNS-edit scope. ~2–3 h;
only if Option A is genuinely broken.

---

## R20 — Production DB disaster recovery (restore from backup)

**When to use:** the production database is lost, corrupted, or a destructive
change must be rolled back beyond what in-app correction can fix. Proven by the
D.3 restore rehearsal (`docs/DISASTER_RECOVERY.md`). **RTO target ≤ 1 h, RPO ≤
24 h (≤ minutes with PITR).**

**Prerequisites:** `doctl` authenticated; the production cluster id
(`6e0f1d36-d651-44d0-a062-ddf82e844812`); the production secrets file
(`C:\Users\rohit\.dealerlink\production-secrets.txt`).

**Steps:**

```powershell
# 1. (Optional) confirm what backups exist + their timestamps.
doctl databases backups 6e0f1d36-d651-44d0-a062-ddf82e844812

# 2. Restore to a NEW cluster — latest backup (omit timestamp) or PITR
#    (supply --restore-from-timestamp "<UTC>" inside the backup window).
#    NEVER an in-place restore — `create` always makes a new cluster.
doctl databases create dealerlink-production-restore `
  --engine pg --version 16 --region blr1 --size db-s-1vcpu-2gb --num-nodes 1 `
  --restore-from-cluster-name dealerlink-production-db `
  --wait   # blocks until online (~several minutes)

# 3. Verify the restored data BEFORE cutting over: connect as doadmin to the
#    dealerlink_production DB on the new cluster and check migration count (17),
#    the operator user, and core-table row counts. (D.3 used a throwaway
#    verify-restore.mjs; adapt verify-0016.mjs as a template.)

# 4. Re-create the app role on the restored cluster if needed, then re-point
#    the app: update DATABASE_URL (app role) + DATABASE_DIRECT_URL (doadmin)
#    in .do/app.production.yaml's live spec to the NEW cluster's connection
#    strings and apply via R18:
pnpm sync-spec:production    # review diff, confirm, applies + redeploys

# 5. Confirm the app is healthy on the new DB.
Invoke-RestMethod https://app.dealerlink.in/api/health
# expect status:ok, db.status:ok, migrations.applied:17, rls.status:ok

# 6. Lock the new cluster's firewall to the app (mirror the original):
doctl databases firewalls append <new-cluster-id> --rule "app:d8a25cb8-e4cb-4035-8413-6baab72398cd"
#    then remove the default-open / any temporary IP rule (see R17).

# 7. Once stable, retire the old/corrupted cluster (only after a full
#    confidence window — keep it for forensics if the cause is unknown).
```

**Notes:**

- **DNS/SSL are unaffected** — the app hostname doesn't change, only its DB
  connection strings. No Cloudflare / cert work in a DB recovery.
- The restored cluster carries **all** databases + roles from the source
  (`dealerlink_production`, `dealerlink_app`, `doadmin`), so RLS is intact —
  but the app role's password may need re-setting (see the D.0 bootstrap
  `finalize` phase in `docs/PRODUCTION_ENV.md`) if the connection string's
  password doesn't match.
- **Don't leave restore clusters running** — each is a full billable cluster.
  Destroy throwaway/superseded clusters (`doctl databases delete <id>`).

---
