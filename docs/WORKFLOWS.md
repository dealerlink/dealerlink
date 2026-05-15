# Critical Workflows to Get Right

> **Scope:** Pipeline stage transitions, inventory reservation flow, inbound email handler, operator impersonation. Back to [CLAUDE.md](../CLAUDE.md).

## Stage progression (BRD §3.4)

The 9 pipeline stages have specific transition rules. Some are automatic, some manual:

| From → To              | Trigger                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| 3 (Quotation Sent)     | Auto-stamped when quotation email is sent successfully (Resend delivery webhook) |
| 6 (Payment Pending)    | Auto on order confirmation                                                       |
| 7 (Ready for Dispatch) | Auto when payment status = Paid (or per credit terms)                            |
| 8 (Dispatched)         | Auto when dispatch record is created with LR                                     |
| 9 (Closed)             | Auto when delivery is confirmed; or manual with Lost reason                      |

**High-risk dealers** (Risk Level = High) cannot move past stage 4 (Negotiation) without an Admin override. Enforce server-side.

## Inventory reservation flow

```
Order confirmed
  → reserve N units from In Stock pool, FIFO by procurement date
  → status: In Stock → Reserved
  → Dealer + Order linked on inventory item
Order cancelled before dispatch
  → status: Reserved → In Stock (only allowed transition that's "backward")
Dispatch created
  → picked serials must match reserved quantity exactly (block on mismatch)
  → status: Reserved → Dispatched (atomically with dispatch record)
Delivery confirmed
  → status: Dispatched → Delivered
```

All transitions are guarded by Postgres row locks (`SELECT ... FOR UPDATE`) inside transactions. No optimistic concurrency for inventory — the cost of a wrongly-allocated panel is too high.

## Inbound email logging

Distributors BCC a unique tenant email address (e.g., `<tenant-slug>+<token>@mail.dealerlink.in`). Resend Inbound webhook posts the parsed email to `/api/webhooks/resend-inbound`. Handler:

1. Verify Resend signature.
2. Match tenant by recipient address suffix.
3. Match dealer by sender domain or sender email.
4. Insert into `email_log` with direction = 'inbound'.
5. If no dealer match, insert with `dealer_id = null` and flag for admin review.

## Operator impersonation flow

Per ADR-002 operators provision tenants and occasionally need to look inside one to debug. Day 3 ships a controlled, read-only impersonation flow:

1. Operator visits `/admin/tenants/[id]` and clicks **Enter tenant workspace**.
2. The Server Action sets the `dealerlink_impersonation` cookie (httpOnly, 1-hour TTL) to the tenant id, records an `access_log` row with `action='operator_impersonation_view'`, and redirects to the tenant workspace (`?tenant=<slug>` in dev, `<slug>.dealerlink.in` in prod).
3. The `(app)` layout reads the cookie and renders an **ImpersonationBanner** at the top of every page so the operator never forgets the context.
4. Every `tenantAction` invocation while the cookie is present runs `withTenant(tenantId, fn, { readOnly: true })`. The audit trigger raises `42501 'read-only context'` on any INSERT/UPDATE/DELETE.
5. Clicking **Exit impersonation** in the banner clears the cookie and sends the operator back to `/admin`.

Tenant users never see the banner and never run in read-only mode — the cookie is set only by `enterImpersonation()` which requires the `operator` role.

## Quotation lifecycle (Day 8)

A quotation moves through six statuses:

```
draft  ──Send──▶  sent  ──Accept──▶ accepted
                       ──Reject──▶ rejected
                       ──Expire──▶ expired
                       ──Revise──▶ (parent → superseded, new revision in draft)
```

- **`draft`** — the only editable status. Sales can edit their own drafts; admin can edit any.
- **`sent`** — `sentAt` and `sentVia` are stamped. If the quotation is linked to a deal in `needs_analysis`, the deal auto-advances to `quotation_sent` (this is the same transition the Resend webhook will fire in Day 14).
- **`accepted` / `rejected`** — terminal until revised. `rejected` requires a reason.
- **`expired`** — set by the validity-expiry sweep (`sweepExpiredQuotationsForTenant`) when `valid_until` is in the past and status is still `sent`. A manual `markQuotationExpired` exists for admin overrides.
- **`superseded`** — created by `reviseQuotation`. The new revision inherits the parent's `quote_number` but bumps `revision` (`QT-2026-0042` Rev 1 → Rev 2). Lines + commercials are copied; the new row opens in `draft` so the user can adjust before re-sending. The parent flips to `superseded` atomically.

### Tax engine contract (Day 9 readiness)

The schema captures every input the tax engine will need at line creation, never to be recomputed:

- `quotation_lines.gst_rate` — copied from `products.gst_rate` when the line is added. Day 9 reads this column directly; the product master can change later without altering already-issued quotations.
- `quotation_lines.hsn_code` — same snapshot rule.
- `quotations.tenant_state_at_issue` — captured from `tenant_settings.state` at creation so tenants relocating mid-fiscal-year do not retroactively change prior quotations.
- `quotations.place_of_supply` — defaults from `dealer.state` at creation, overridable for ship-to-elsewhere scenarios.

Discount is applied **before tax** in Phase 1 (BRD §4). The discount is distributed proportionally across lines so each line's tax base is its own discounted gross — this is required to correctly tax quotations with mixed GST rates.

The live preview helper (`apps/web/lib/quotation/preview.ts → computeQuotationTotals`) and the server-side persistence helper (`apps/web/lib/actions/quotations/helpers.ts → computeTotalsForPersistence`) call the same pure function. Day 9 swaps the implementation for `packages/tax` while preserving the call shape.
