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
