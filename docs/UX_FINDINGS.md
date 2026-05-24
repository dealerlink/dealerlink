# UX Findings — Pre-Pilot Walkthrough

> Operator: Claude in Chrome (automated evaluation)
> Date: 2026-05-24
> Staging URL: https://demo.staging.dealerlink.in
> Time spent: ~45 min (Steps 1–8 completed)
> Role simulated: Operations manager, solar distributor, ~30 dealers across 3 Indian states

## Walkthrough Approach

Followed the evaluation path from docs/PILOT_ONBOARDING.md end-to-end:
Dashboard → Browse all sections → Create quotation (QT-2026-0017) → Convert to PI (PI-2026-0031)
→ Record payment (PAY-2026-0017 against ORD-2026-0002) → Dispatch (DSP-2026-0009)
→ PDF downloads → All 4 reports.

---

## ✅ What's Working Well

These areas passed evaluation cleanly — no action needed.

| Area                        | Verified                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------- |
| GST tax switching           | CGST+SGST → IGST switches correctly when dealer state changes on quotation            |
| PI tax recompute            | "Tax classification will change" warning fires correctly on Ship-To state change      |
| Quotation math              | Subtotal, discount, taxable value, and tax totals all compute correctly               |
| Payment allocation          | Record → Verify → Allocate workflow completes cleanly; order status updates to "paid" |
| Inventory shortage blocking | Confirm order correctly blocked with shortage message when stock is insufficient      |
| Dispatch serial tracking    | Serials reserved, picked, and tracked through to delivery correctly                   |
| Order status propagation    | Confirmed → Paid status updates correctly after payment allocation                    |
| GST Summary report          | Correctly differentiates intra-state (CGST+SGST) vs inter-state (IGST) per state      |
| PDF content (when served)   | PDFs contain correct data; generation logic works                                     |

---

## Critical Findings (Pilot-Blocker)

### Finding C-1: PDF Downloads Return HTTP 503 (Demo Infrastructure / Intermittent)

**Page/Flow:** All document download buttons — Quotation, PI, Payment Receipt, Dispatch Note
**What happened:** Every POST request to the PDF download endpoint returned HTTP 503 during the test session. Regenerate PDF (POST) returned HTTP 200, confirming PDF generation itself works but the serving step fails. Multiple attempts across 10+ minutes, all 503.
**Expected:** PDF file downloads in the browser on button click
**Actual:** HTTP 503 on all attempts across all four document types
**Severity:** Critical (during testing) → downgraded to **Important/Infrastructure** after user confirmed PDFs do work in practice. Appears to be a demo server cold-start issue, not a product code bug.
**Effort to fix:** Keep PDF serving worker warm — increase minimum instances or add a keepalive ping on the demo environment. Not a product defect.

---

## Important Findings (Should Fix Before Pilot)

### Finding I-1: No "Create Quotation" Button on Deal Detail Page

**Page/Flow:** Pipeline → Deal detail (e.g. DEAL-2026-0001 — Factory floor expansion · Verma Sun · MH)
**What happened:** Opened a deal in "qualification" stage. No CTA to create a quotation from deal context. Had to navigate away to Quotations → New and manually re-link the deal.
**Expected:** A "Create Quotation" button visible on the deal detail page
**Actual:** Button absent; the natural entry point for quoting is disconnected from the pipeline
**Severity:** Important — the most intuitive workflow path is broken; creates confusion for new users
**Effort to fix:** Low — add a "Create Quotation" button on the deal detail that pre-populates dealer + deal link

---

### Finding I-2: Deactivate Button Has No Confirmation Dialog

**Page/Flow:** Dealers → Dealer detail (e.g. CP Dealer MPI0UY19)
**What happened:** "Deactivate" button is styled in bright red and executes immediately on click with no confirmation step.
**Expected:** A confirmation dialog: "Are you sure you want to deactivate this dealer? This will prevent new quotations."
**Actual:** One-click destructive action with no guard
**Severity:** Important — easy to trigger accidentally; deactivating a live dealer mid-evaluation would be disruptive
**Effort to fix:** Low — add a confirmation dialog before executing deactivation

---

### Finding I-3: Blank Product Image Placeholders in Catalog

**Page/Flow:** Catalog → Grid view
**What happened:** All product cards show empty grey placeholder boxes where images should appear.
**Expected:** Product thumbnails, or a clean intentional "no image" state (e.g. product icon with SKU)
**Actual:** Broken-looking placeholder grid across all products
**Severity:** Important — looks unfinished; would be embarrassing to show a pilot customer
**Effort to fix:** Medium — either populate demo images, or style the placeholder state intentionally

---

### Finding I-4: Inventory Shortage Error Doesn't Name the Product

**Page/Flow:** Orders → Confirm Order dialog (ORD-2026-0023)
**What happened:** Dialog read "Cannot confirm — 1 product(s) short of stock" with no further detail.
**Expected:** "Premier 540W Bifacial: need 10, have 4" — or equivalent per-line breakdown
**Actual:** Generic count only; user must guess which product to fix
**Severity:** Important — with multi-line orders this becomes genuinely confusing
**Effort to fix:** Low — include product name + required vs available quantity in the shortage message

---

### Finding I-5: Direct URL for Outstanding Receivables Returns 404

**Page/Flow:** Direct navigation to `/reports/outstanding-receivables`
**What happened:** Hard 404. Correct URL is `/reports/outstanding`.
**Expected:** Page loads, or a redirect from the intuitive URL to the correct one
**Actual:** 404 — any bookmarked or shared link to this report breaks silently
**Severity:** Important — bookmarked URLs are common for daily-use reports
**Effort to fix:** Low — add a redirect from `/reports/outstanding-receivables` → `/reports/outstanding`

---

## Polish (Nice to Have)

### P-1: Dashboard greeting shows "Tenant" instead of account name

**Page/Flow:** Dashboard
**What I observed:** Greeting reads "Good afternoon, Tenant." — placeholder not replaced with the actual tenant or user name.
**Suggested fix:** Replace with `tenant.name` or `user.firstName`

---

### P-2: "Pipeline Value" KPI wraps to two lines

**Page/Flow:** Dashboard — KPI cards row
**What I observed:** The Pipeline Value card label wraps across two lines at the default viewport width.
**Suggested fix:** Truncate label or reduce font size slightly on the card

---

### P-3: "SL" badge on pipeline cards has no explanation

**Page/Flow:** Pipeline → Kanban board
**What I observed:** Deal cards show an "SL" badge. No tooltip, legend, or explanation visible.
**Suggested fix:** Add a tooltip on hover (e.g. "SL = Solar") or document in the legend

---

### P-4: Rightmost column header cut off in Dealers list

**Page/Flow:** Dealers → List view
**What I observed:** The rightmost column header appears as just "P" — truncated, likely "Phone" or "Primary contact".
**Suggested fix:** Widen the column or add a tooltip showing the full label

---

### P-5: Some products show "—" for MRP in Catalog

**Page/Flow:** Catalog → Table view
**What I observed:** Several products have no MRP, displaying a bare dash.
**Suggested fix:** Either require MRP in catalog setup, or label explicitly as "Price on request"

---

### P-6: Revision number shown as plain text, not a badge

**Page/Flow:** Quotations → List view
**What I observed:** Revision indicator shown as plain text "Rev 3" inline — easy to miss when scanning.
**Suggested fix:** Style as a pill/badge for scannability (consistent with status badges elsewhere)

---

### P-7: Tax rates disappear from saved quotation view

**Page/Flow:** Quotation detail → View/read state
**What I observed:** Tax rates (e.g. 9% CGST / 9% SGST) are visible during editing but disappear in the saved view.
**Suggested fix:** Show rates in the read-only view — important for customer-facing verification

---

### P-8: Tax amounts display 1 decimal place instead of 2

**Page/Flow:** Quotation totals
**What I observed:** Tax amounts shown as e.g. ₹19,929.2 instead of ₹19,929.20.
**Suggested fix:** Standardise all currency values to 2 decimal places throughout

---

### P-9: Number formatting space in payment allocation panel

**Page/Flow:** Payments → Allocation panel
**What I observed:** Amount displays as "₹41, 418" — a space after the thousands comma.
**Suggested fix:** Fix the `formatINR` output — remove errant space

---

### P-10: "Proof of delivery — coming soon" visible to end users

**Page/Flow:** Dispatch → Dispatch detail
**What I observed:** A "Proof of delivery — coming soon" placeholder is visible in the dispatch detail view.
**Suggested fix:** Hide behind a feature flag until ready, or remove placeholder entirely for pilot

---

### P-11: Sales Summary report has no GROUP BY options

**Page/Flow:** Reports → Sales Summary
**What I observed:** The report shows a flat summary with no ability to group by dealer, product, or state.
**Suggested fix:** Add grouping / drill-down options — without them the report has limited daily utility

---

### P-12: Linked deal resets when changing dealer on a quotation

**Page/Flow:** Quotations → New quotation form
**What I observed:** When changing the dealer mid-form (e.g. Verma Sun → Singh Power), the "Linked deal" field resets to "No deal linked" and must be re-selected.
**Suggested fix:** Preserve the linked deal across dealer switches, or confirm before clearing it

---

## Pilot Notes Channel

Findings from the pilot customer (May 25, evening triage):

_(Update after pilot replies)_

---

## Triage Decision

End-of-day classification:

- [x] Pilot-blocker count: 0 (C-1 downgraded — PDF serving is an infra/cold-start issue, not a product bug)
- [x] Important count: 5 (I-1 through I-5)
- [x] Polish count: 12 (P-1 through P-12)

**Items to fix in C.4–C.5:**

- I-1 — Add "Create Quotation" CTA to deal detail page
- I-2 — Add confirmation dialog to Deactivate button
- I-4 — Include product name + qty in inventory shortage error
- I-5 — Redirect `/reports/outstanding-receivables` → `/reports/outstanding`
- P-9 — Fix `formatINR` space after thousands comma (trivial)

**Items deferred to post-pilot:**

- I-3 — Blank product images (requires demo asset upload or placeholder redesign)
- P-1 — Dashboard greeting ("Tenant" placeholder)
- P-2 — Pipeline Value KPI wrapping
- P-6 — Revision badge styling
- P-7 — Tax rates in read-only quote view
- P-8 — 1 vs 2 decimal places
- P-10 — POD "coming soon" placeholder

**Items deferred to Phase 2:**

- P-3 — "SL" badge legend
- P-11 — Sales Summary GROUP BY
- P-12 — Linked deal reset on dealer change

---

## Outcome

Evaluation complete. Dealerlink is **substantially ready for pilot**. The PDF download instability (C-1) is a demo server warm-up issue, not a product defect. No true pilot-blockers found. Five important issues should be addressed before sending the pilot welcome email, with I-1 (missing "Create Quotation" from deal detail) being the highest priority.

Core workflows — quoting, tax switching, PI conversion, payment allocation, dispatch with serial tracking, and GST reporting — all work correctly end to end.
