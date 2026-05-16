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

## PI + Order lifecycle (Day 11)

A Performa Invoice (PI) and an Order continue the deal past an accepted quotation.

```
Quotation (accepted)
  ──convert──▶ PI (draft) ──send──▶ PI (sent) ──confirm──▶ PI (confirmed, immutable)
                  │                     │                        │
              (cancel, admin)     (cancel, admin)          spawns Order (pending)
                                                                  │
   Order (pending) ──confirm──▶ Order (confirmed)  ··· dispatch (Day 13) ···
                  └────────────── cancel (admin) ──────────────┘
```

### PI state machine — `packages/db/src/pi/transitions.ts`

`draft → sent → confirmed`; `draft`/`sent → cancelled`. `confirmed` and `cancelled` are terminal. `transitionPi()` row-locks the PI, validates the move, stamps the matching timestamp, and writes a `performa_invoice_status_history` row.

- **`draft`** — the only editable status (`updatePi`; lines inherited from the source quotation per DEV.40).
- **`sent`** — `sentAt` stamped; the PI PDF is rendered and a queued `email_delivery_log` row is written (Resend send lands Day 14, R.13).
- **`confirmed`** — immutable. Confirmation is the build's most choreographed action — see below.
- **`cancelled`** — admin only, reason captured.

### Order state machine — `packages/db/src/orders/transitions.ts`

`pending → confirmed → partially_dispatched / fully_dispatched → delivered → closed`; any of `pending`/`confirmed → cancelled`. Day 11 wires `pending → confirmed` and `* → cancelled`; the dispatch transitions land Day 13. Order **fulfilment status** and **payment status** (`unpaid` / `partially_paid` / `paid`) are orthogonal dimensions.

### Place of supply (ADR-012)

A PI/Order captures `place_of_supply` = the **Ship-To dealer's state**. Converting a quotation with a different Ship-To, or editing a PI's Ship-To, recomputes tax via `@dealerlink/tax` — IGST↔CGST/SGST can flip relative to the originating quotation. The convert-to-PI screen shows an explicit banner when this happens.

### PI confirmation — one atomic transaction

`confirmPi` (`apps/web/lib/actions/pi/status-transitions.ts`) does, all-or-nothing:

1. `transitionPi` the PI `sent → confirmed`.
2. Allocate an order number (`document_counters`, doc type `order`) and insert the Order (`pending`).
3. Copy PI lines 1:1 into `order_lines`.
4. Advance the linked deal `po_pending → payment_pending` (auto-triggered; an invalid transition or high-risk guard is swallowed — the PI confirmation still stands; any other failure rolls everything back).
5. Write status-history rows.

### Order confirmation — inventory reservation

`confirmOrder` reserves serialised inventory for every line via `reserveInventoryForOrder` (`packages/db/src/orders/reserve.ts`):

- FIFO by `procurement_date`, `SELECT … FOR UPDATE` on the picked serials so competing confirmations serialise on the row lock.
- All-or-nothing: if any line is short, `InsufficientInventoryError` (carrying the per-product shortage list) rolls the whole transaction back — no partial reservation survives.
- Each reserved serial moves `in_stock → reserved` (`reserved_for_order_id` + `reserved_for_dealer_id` set); `order_lines.reserved_quantity` is updated.
- Cancelling an order (`cancelOrder`, admin) calls `releaseInventoryForOrder` — every `reserved` serial returns to `in_stock` — and nudges the deal back `payment_pending → po_pending`.

## Payments (Day 12)

### Payment lifecycle — `packages/db/src/payments/transitions.ts`

A payment is money received from a dealer (the **Bill-To** party — receipts always go to whoever pays, CLAUDE.md §6). Receipts are **tax-neutral** documents: no GST breakdown, no place of supply.

`pending_verification → verified → cleared → refunded`; `verified → bounced`. Forbidden by construction: `pending_verification → cleared` (verify first), anything `→ pending_verification`, `cleared → bounced`. `bounced` and `refunded` are terminal.

- **`pending_verification`** — recorded, not yet confirmed by accounts. No allocations possible.
- **`verified`** — accounts confirmed receipt; allocations may be made.
- **`cleared`** — cheque cleared / bank receipt confirmed; allocations final.
- **`bounced`** — `verified → bounced` (admin + accounts), reason captured. **Reverses every allocation.**
- **`refunded`** — `cleared → refunded` (admin only), reason captured. **Reverses every allocation.**

Role rule: payments are **admin + accounts** only — `sales` never sees the cash side. `refund` is **admin only**. Enforced server-side via `tenantAction`.

### Allocation + order paymentStatus propagation

A payment is allocated against orders (and PI advances) via `payment_allocations` rows. `payments.allocated_amount` is a denormalised mirror of `SUM(payment_allocations.amount)`; the unallocated remainder is a floating **advance**.

`allocatePayment` (`apps/web/lib/actions/payments/`) is atomic: it locks the payment `SELECT … FOR UPDATE`, rejects over-allocation (`SUM(new) + allocated ≤ amount`) and per-order over-allocation, inserts the rows, updates the denormalised total, then recomputes each affected order's `paymentStatus` via `recomputeOrderPaymentStatus`. An order's `paymentStatus` is derived from the sum of allocations from payments in `verified`/`cleared` status: `unpaid` / `partially_paid` / `paid` (over-allocation clamps to `paid`).

**Funds-received-then-confirm:** when an allocation makes a `pending` order fully `paid`, `tryAutoConfirmOrder` reserves inventory and advances it `pending → confirmed`. Best-effort — an inventory shortfall leaves the order `pending` rather than rolling back the money.

**Bounce / refund** reverse every allocation of the payment (rows deleted, `allocated_amount` zeroed) and recompute each affected order — orders may regress `paid → partially_paid → unpaid`.

### Advance-on-PI transfer

A payment may be allocated against a draft/sent PI as an **advance** (`applyAdvancePayment`). When that PI is later confirmed, `confirmPi` transfers the advance allocation onto the spawned order (`performa_invoice_id → order_id`) inside its existing atomic transaction, recomputes the new order's `paymentStatus`, and auto-confirms it if the advance fully covers the order.

### Overdue tracking

An order is **overdue** when `paymentStatus` is `unpaid`/`partially_paid` and `orderDate + creditPeriodDays` (dealer credit period, falling back to `tenant_settings.default_credit_period`) is in the past. Surfaced by `getOverdueOrders` and the dashboard "Overdue payments" widget.

## Dispatch (Day 13)

Dispatch is the physical-fulfilment day — serialised inventory leaves the
warehouse against a confirmed order. A **dispatch note is tax-neutral** (it is
not a tax invoice — that is a Phase 2 module) and is addressed to the
**Ship-To** dealer, the consignee (CLAUDE.md §6).

### Dispatch state machine — `packages/db/src/dispatch/lifecycle.ts`

```
in_transit ─deliver─▶ delivered
     └────return────▶ returned
```

`in_transit` is the only state a dispatch is created in. Both transitions are
terminal; a delivered/returned dispatch is immutable.

### Inventory + order state changes

A serial moves `reserved → dispatched → delivered` as its dispatch progresses;
a returned dispatch routes it `dispatched → returned → in_stock` (clearing both
the dispatch reference and `reserved_for_order_id`, so the serial is fully free
stock again). The order's fulfilment status is **derived**, never set directly —
`deriveOrderFulfillmentStatus(tx, orderId)` examines the order lines'
`dispatchedQuantity` against the ordered quantity plus every dispatch's status:

- no units dispatched → `confirmed`
- some units dispatched → `partially_dispatched`
- all units dispatched → `fully_dispatched`
- all dispatched **and** every live dispatch delivered → `delivered`

A returned dispatch decrements `order_lines.dispatchedQuantity`, so the order
can legitimately regress (`fully_dispatched → partially_dispatched`, or
`partially_dispatched → confirmed`).

### createDispatch — one atomic transaction

`createDispatchDb` (Server Action `createDispatch`, admin + dispatch) does all
of the following inside one transaction; any failure rolls everything back, so
a serial is never half-dispatched and no orphan dispatch row survives:

1. `SELECT … FOR UPDATE` on the order; it must be `confirmed` or
   `partially_dispatched`.
2. `SELECT … FOR UPDATE` on every picked serial; each must be `reserved`, owned
   by this order (`reserved_for_order_id`), this tenant, and the right product.
3. Reject a per-line dispatch quantity that exceeds `ordered − dispatched`.
4. Allocate the `DSP-2026-NNNN` number, insert the dispatch + lines + serials.
5. Transition each serial `reserved → dispatched`, bump
   `order_lines.dispatchedQuantity`.
6. Recompute + transition the order status; close a linked deal if the order
   becomes `fully_dispatched`.

**Concurrency:** two operators dispatching the same serials serialise on the
order row lock; the loser re-reads the now-`dispatched` serial and fails with
`SERIAL_ALREADY_DISPATCHED`. The `dispatch_serials` `UNIQUE (tenant_id,
inventory_item_id)` constraint is the final backstop. Proven by the mandatory
concurrent-dispatch test in `packages/db/tests/dispatch.test.ts`.

### Delivery + return

`markDispatchDelivered` (admin + dispatch) moves every serial to `delivered`,
captures who signed (`deliveredAcknowledgedBy`), and advances the order to
`delivered` once all its dispatches are in. `returnDispatch` (admin only) sends
every serial back to warehouse stock, decrements `dispatchedQuantity`, and
recomputes the (possibly regressed) order status.
