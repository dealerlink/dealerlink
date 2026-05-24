# Claude in Chrome — Dealerlink Staging Demo Walkthrough

**Purpose:** Have Claude in Chrome walk through Dealerlink staging as a distributor evaluating the product. Captures friction points, broken flows, confusing labels — things the builder of the system habituates past but evaluators notice.

**Estimated time:** 30-45 minutes.

**Output:** Findings captured in the conversation transcript, mapped to UX_FINDINGS.md categories (Critical / Important / Polish).

---

## Prompt to Paste in Claude in Chrome

```
You're evaluating Dealerlink, a B2B distributor CRM, as if you were a
prospective customer (a solar panel distributor in India) doing a 30-minute
evaluation before committing to use it. You haven't seen this product
before. Your job: complete a realistic workflow and report what you
observe.

ACCESS:
URL: https://demo.staging.dealerlink.in
Alternative URL if subdomain doesn't load: https://staging.dealerlink.in/?tenant=demo
Login as admin: admin@demo.test / password123

WHO YOU ARE:
You're an operations manager at a solar distributor with ~30 dealers across
3 Indian states. You handle ~5 quotations and ~3 dispatches per day. You're
evaluating whether this system could replace your current spreadsheet-based
workflow.

WHAT TO EVALUATE:
You're looking at three things — be specific in observations:

1. CLARITY — Can you figure out what to do without asking? Are labels
   meaningful? Are workflows discoverable from the navigation?

2. CORRECTNESS — Does the data look right? Do totals add up? Are
   inter-state vs intra-state tax classifications correct? Do PDFs
   look professional?

3. POLISH — Anything broken, ugly, confusing, or surprising? Anything
   you'd be embarrassed to show a customer?

WALKTHROUGH (~30-45 min):

Step 1 — Dashboard tour (3-5 min)
Log in. Look at the dashboard. What do you see? Is the layout clear?
Do the widgets help you understand what's going on? Note anything
confusing about the navigation sidebar.

Step 2 — Browse existing data (5-7 min)
Click through these in the sidebar and note your impressions:
- Pipeline (kanban board with deal stages)
- Dealers (list of customers)
- Catalog (products you sell)
- Quotations (recent quotes — note variety of statuses)
- Performa Invoices (PIs from confirmed quotes)
- Orders (PI conversions)
- Payments (recorded transactions)
- Dispatch (shipments with serial tracking)
- Reports (4 reports: sales, outstanding, inventory, GST)

For each: does the list view show what you'd want at a glance? Are
filters and search useful? Are the columns the right ones?

Step 3 — Create a new quotation (10 min)
Go to Pipeline. Find a deal in 'qualification' or 'needs_analysis' stage.
Open it. From there, create a new quotation. Add 2-3 line items from the
catalog. Watch the tax preview — try changing the Ship-To dealer to one
in a different state and observe how CGST/SGST → IGST switches.

Apply a discount. Watch totals update. Save as draft. Mark as sent.
Then mark as accepted.

Step 4 — Convert to PI to Order (5 min)
Convert the accepted quotation to a Performa Invoice. Try changing the
Ship-To dealer — does the tax recompute correctly? Confirm the PI.

Verify an Order was auto-created. Check that inventory items moved to
"reserved" status.

Step 5 — Record a payment (5 min)
Go to Payments. Record a new payment against the order. Verify it.
Allocate the full amount. Check the order's payment status updated.

Step 6 — Dispatch (5 min)
Go to Dispatch. Create a new dispatch from the confirmed paid order.
Pick the reserved serial numbers. Fill in transport details. Mark as
delivered.

Step 7 — Generate PDFs (3-5 min)
Try downloading these PDFs:
- The quotation you created
- The PI
- The payment receipt
- The dispatch note

Check: do they look professional? Are numbers correct? Are state names
displayed properly?

Step 8 — Reports (3-5 min)
Open each of the 4 reports. Try the CSV download on one. Does the data
match what you'd expect?

WHAT TO REPORT (in your transcript):

For each finding, use this format:

FINDING [severity: critical / important / polish]
Page/Flow: <where this happened>
What I observed: <neutral description>
Why it matters: <distributor's perspective>
Suggested fix: <if obvious>

EXAMPLE:
FINDING [polish]
Page/Flow: Dashboard
What I observed: "Pipeline value" widget shows ₹45,32,000 but the
unit label is small and grey, making the number hard to scan at a
glance.
Why it matters: This is the first number a manager sees. Should be
unmissable.
Suggested fix: Increase label contrast; consider larger number sizing.

SEVERITY GUIDE:
- Critical: breaks a workflow, shows wrong data, prevents the user
  from completing what they came to do
- Important: works but creates a bad first impression, would be
  embarrassing in front of a customer
- Polish: cosmetic, minor copy, micro-interactions

CONSTRAINTS:
- DO NOT enter real customer data — this is a test environment
- DO NOT change account settings, share documents, or modify any
  permission/sharing settings
- DO NOT delete any data
- If the system asks for payment details, credit cards, or any sensitive
  info, STOP and report — that would be a bug
- If you see a PDF taking 30-60 seconds to generate, that's a known
  cold-start issue (mentioned in the onboarding doc) — note it but
  don't flag as new

BEFORE STARTING:
Take a screenshot of the login page. After login, take a screenshot
of the dashboard. Periodically screenshot interesting friction points.

START WHEN READY. Report findings as you go, then give a summary at
the end.
```

---

## How to Use This

### Option 1 — Run before your walkthrough (recommended)

1. Open Claude in Chrome (extension)
2. Paste the prompt above
3. Watch for ~30-45 min (or grab coffee; check in periodically)
4. Read the findings transcript
5. Then do your own walkthrough, using Claude's findings as a starting point

This catches stuff you'd habituate past as the builder. Your walkthrough then focuses on judgment calls (is this Critical or Important?) instead of navigation.

### Option 2 — Run in parallel with your walkthrough

You walk through on one machine; Claude walks through on another. Compare findings end-of-day. Two perspectives.

### Option 3 — Run after your walkthrough

Have Claude validate your findings. If Claude hits the same friction points, those are real. If Claude doesn't see them, they may be operator-specific.

I recommend Option 1.

## What to Expect

Claude in Chrome won't catch everything a human evaluator would (it doesn't have business context, doesn't know what a distributor actually does, can't judge "this would embarrass me"). But it'll catch:

- Broken pages, error boundaries, 404s
- Forms that don't validate properly
- Tables that misalign
- Buttons that look like they should work but don't
- Tooltip / label / copy issues
- Slow load times (will note explicitly)
- Inconsistent styling across pages
- Missing empty states

It won't catch:

- Business-logic correctness (you have to verify totals manually)
- Cultural / industry-specific tone issues
- "Would a real distributor want this feature?" questions

## After Claude in Chrome Finishes

Take findings transcript → copy/paste into docs/UX_FINDINGS.md under appropriate severity sections. Then do your own walkthrough to:

- Validate Claude's findings (is "Critical" actually critical?)
- Add findings Claude missed (business logic, industry-specific)
- Reclassify if needed
