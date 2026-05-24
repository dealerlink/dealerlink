<!--
  PILOT-SPECIFIC DOCUMENT — NOT a permanent product doc.

  This guide is written for the Stage C pilot preview on the *staging*
  environment (May 2026). It references staging URLs, seeded test credentials,
  and a time-bound launch schedule. Do not ship it as product documentation and
  do not reuse it verbatim for production onboarding — the production user-facing
  manual is docs/USER_MANUAL.md. Retire or archive this file after the pilot.
-->

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

| Role     | Email              | Initial Password | What You'll See                 |
| -------- | ------------------ | ---------------- | ------------------------------- |
| Admin    | admin@demo.test    | password123      | Full access — every workflow    |
| Sales    | sales@demo.test    | password123      | Pipeline + quotations + dealers |
| Accounts | accounts@demo.test | password123      | Payments + receipts + reports   |
| Dispatch | dispatch@demo.test | password123      | Inventory + dispatch + delivery |

Log in with any of these to see the system from that role's perspective.
We recommend starting with the Admin role to see everything, then trying
the role-specific views.

## What's Loaded for You

The demo tenant comes pre-loaded with realistic distributor data:

- ~20 sample dealers across 7 Indian states
- ~20 products (solar panels, inverters, accessories)
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
