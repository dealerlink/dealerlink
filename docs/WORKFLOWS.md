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
