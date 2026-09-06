# PHASE_2_PLAN.md — v2

> **Supersedes v1.** Rewritten after client evidence (Maharudra Agencies,
> Swipe + TallyPrime Silver screenshots, Sep 2026).
>
> **Three changes from v1:**
>
> 1. Nothing external gates anything. GSP and payment-gateway work moved to
>    SP3 and run behind commercial procurement started on day 0.
> 2. Multi-rate GST handling is now the top of SP1. It is the client's stated
>    pain **and an open defect in Dealerlink**.
> 3. Tier 4 and #7 become **separately licensed paid plugins**, not core.
>    That requires an entitlement layer that does not exist yet.

---

## 0. What the client evidence proved

### Finding 1 — mixed-rate invoices collapse into one Tally ledger

Screenshot 5 (`MA/26-27/1079`) is the proof:

| Item                           | Qty | Amount         | Rate |
| ------------------------------ | --- | -------------- | ---- |
| Premier NDCR TOPCON G12R 615wp | 1   | ₹8,917.50      | 5%   |
| PEDLER LB SWITCH-40A           | 4   | ₹3,712.00      | 18%  |
|                                |     | **₹12,629.50** |      |

Tally shows a single `SGST - OUTPUT` of **₹557.02**. That is
`8,917.50 × 2.5%` + `3,712.00 × 9%` = `222.94 + 334.08` — two rates summed
into one ledger line. Screenshot 4 shows the ledger structure this breaks:
`SALE @ 5% - CENTRAL`, `SALE @ 5% - LOCAL`, `SALES @ 18% - CENTRAL`,
`SALES @ 18% - LOCAL`. Those four ledgers cannot be reconciled from a
collapsed posting.

The same voucher reads `Syncronized: No` and `Provide e-Invoice details: No`.

**This is the single most valuable requirement in the whole engagement.** It is
concrete, provable, and no competitor is solving it for them.

### Finding 2 — Dealerlink has the same defect

`BUILD_PROMPTS.md` Day 10 specifies the document tax block as _"Either:
CGST @ X% + SGST @ X% (intra-state) OR IGST @ X%"_ — **single-rate per
document**. There is no HSN/SAC-wise summary table. A quotation combining a
5% panel and an 18% earthing kit renders incorrectly today.

Swipe's own preview (screenshot 2) handles this correctly: separate
`CGST 2.5% / SGST 2.5%` and `CGST 9.0% / SGST 9.0%` lines plus a two-row
HSN/SAC table. **In a side-by-side demo today, Dealerlink loses this
comparison.** SP1.1 fixes it.

### Finding 3 — do not claim Swipe lacks Tally sync

Swipe's navigation shows Tally Sync, E-Invoices, E-way Bills and Credit
Notes. The accurate and stronger claim: _their Tally sync runs and still
destroys the rate-wise breakup._

### Finding 4 — negative stock (proposal ammunition, no build)

Screenshot 3 shows `Stock: -84.00 NOS` in red while a PFI for 36 units is
being raised. Swipe permits invoicing against stock it does not have.
Dealerlink's `confirmOrder` blocks this with `InsufficientInventoryError`
naming the short product. Demo this.

### Finding 5 — the serial workflow needs a design decision, not just a feature

The client wants serials captured **at invoice time by barcode scanner**,
flowing back into inventory. Dealerlink today auto-reserves serials FIFO at
**order confirmation** and picks them at **dispatch**. These are different
models. See SP2.1 — this needs an ADR before code.

> **Open question for the client:** screenshot 5 shows a Tally voucher with no
> serial numbers visible. Confirm whether they want serials (a) printed on the
> invoice line description as Swipe does in screenshot 1, (b) carried into the
> Tally voucher, or (c) both.

---

## 1. Sequencing principles (v2)

1. **No external dependency blocks internal work.** GSP contract and payment
   gateway KYC start day 0 as commercial tracks and land in SP3. Everything in
   SP0–SP2 is buildable with what you have today.
2. **Security first, not last.** `F-1` (Next.js 14.2.18, CVE-2025-29927
   auth bypass, mitigated only by layout-based auth) gets more expensive to
   remediate with every sub-phase of new code stacked on it, and no client
   deployment should happen on it. Moved from v1's SP3 to SP0. It costs 2–3
   days now and more later.
3. **Client-pain features precede parity features.** Multi-rate GST and the
   Tally ledger mapping are why they would switch. Price lists and payment
   links are why they would not object.
4. **Paid plugins last, and behind an entitlement layer.**

| Sub-phase           | Content                                                       | Dev-days                |
| ------------------- | ------------------------------------------------------------- | ----------------------- |
| SP0                 | Pre-flight: security, verification, procurement kickoff       | 3–4                     |
| SP1                 | Multi-rate GST, invoice, credit note, Tally export, migration | 39–62                   |
| SP2                 | Serial capture workflow + Swipe parity                        | 20–31                   |
| SP3                 | GSP + gateway dependent (e-invoice, EWB, payment links)       | 18–28                   |
| SP4                 | Hardening: UX defects, documentation                          | 5–8                     |
| SP5                 | Plugin entitlement platform + paid plugins                    | plan only in this phase |
| **Total (SP0–SP4)** |                                                               | **85–133**              |

---

## SP0 — Pre-flight (3–4 d)

| #     | Task                                                                                                                                                                | Effort     | Notes                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| SP0.1 | **Security remediation** — `F-1` Next.js ≥14.2.35, `F-2` CSP + security headers, `F-3` login rate-limit/lockout, `F-4` drizzle-orm                                  | 2–3 d      | Dedicated PR, full `pnpm verify`. Moved up from v1 SP3 |
| SP0.2 | **Verify tax invoice exists** — `PILOT_GETTING_STARTED.md` documents the cycle without an invoice step; `tenant_settings` bank fields reference "every tax invoice" | 0.5 d      | Determines whether SP1.2 is 0 d or 4–6 d               |
| SP0.3 | **Start GSP procurement** (ClearTax / Masters India / Cygnet) — shortlist two, request sandbox credentials                                                          | commercial | Runs in background. Blocks nothing before SP3          |
| SP0.4 | **Start payment gateway onboarding** (Razorpay / Cashfree KYC)                                                                                                      | commercial | Same — background track                                |
| SP0.5 | **Obtain client's Tally chart of accounts** — the four sales ledgers in screenshot 4, plus output tax ledger names, signed off by their CA                          | commercial | Needed by SP1.7, not before                            |

---

## SP1 — Multi-rate GST, invoicing & Tally (39–62 d)

**Goal:** Dealerlink produces a legally and arithmetically correct GST document
set for mixed-rate invoices, and hands Tally postings that land in the right
rate-wise ledgers.

**Exit criterion:** A two-item invoice at 5% and 18% renders a correct
rate-wise and HSN-wise tax summary, exports to TallyPrime, and posts to
`SALE @ 5% - LOCAL` and `SALES @ 18% - LOCAL` with matching rate-wise output
tax ledgers — reconciling to the rupee against the Dealerlink GST report.

### SP1.1 — Multi-rate tax summary _(defect fix — do this first)_ — 5–8 d

- Replace the single-rate document tax block with a **rate-wise summary**:
  one line per distinct rate present (`CGST 2.5%`, `SGST 2.5%`, `CGST 9%`,
  `SGST 9%`, or `IGST 5%` / `IGST 18%`).
- Add the **HSN/SAC-wise summary table**: HSN, taxable value, central rate +
  amount, state rate + amount, total tax — one row per HSN. Match screenshot 2.
- Apply to quotation, PI, invoice and their PDFs, plus on-screen totals.
- Fix `P-7` here (tax rates hidden in saved quotation view) and `P-8`
  (1-decimal tax amounts) — same code path, no reason to defer to SP4.
- **DoD:** a seeded 3-rate document renders correctly on screen and in PDF;
  rate-wise sums equal the document total; parity test extended to assert
  rate-wise totals equal a direct `SUM` over lines.

### SP1.2 — GST tax invoice _(#1)_ — 0 d if exists, else 4–6 d

Numbered tax invoice from a confirmed order, own `document_counters` doc type,
three-party Bill-To / Ship-To block (already stubbed), rate-wise summary from
SP1.1. Money read from stored columns, never recomputed.

### SP1.3 — Serials on invoice document — 1–2 d

Render the reserved/dispatched serial list under each line item, as Swipe does
in screenshot 1 (26 serials under one line). Pure presentation — the serial
data already exists via `dispatch_serials` and `reserved_for_order_id`.

### SP1.4 — Credit note / sales return _(#4)_ — 4–6 d

GST-compliant credit note against an issued invoice, rate-wise, linked to the
existing `returnDispatch` flow. Appears as negative supply in the GST report
and as `CDNR` in GSTR-1.

### SP1.5 — GST report: rate-wise and HSN-wise grouping — 2–3 d

Today's GST Summary groups by `place_of_supply` and intra/inter-state. Add
grouping by **rate** and by **HSN**, because that is the axis their Tally
ledgers are organised on and the axis they will reconcile against.

### SP1.6 — GSTR-1 export _(#9)_ — 5–8 d

JSON in GSTN offline-utility format: B2B, B2CL, CDNR, HSN sections. Figures
already exist; this is format and validation work.

### SP1.7 — Tally export with rate-wise ledger mapping _(#6)_ — 7–10 d

**The feature this client is buying.** One-way XML export of sales vouchers,
party masters and ledgers.

- Each invoice line maps to a sales ledger derived from
  `(GST rate × supply type)` — the four-ledger structure in screenshot 4,
  extensible to any rate/type combination the tenant configures.
- Output tax posts to rate-wise tax ledgers, never a single collapsed
  `CGST - OUTPUT`.
- Ledger names are **tenant-configurable**, since every distributor's CA names
  them differently. Do not hardcode.
- Round-off ledger handled (screenshot 5 shows `ROUND OFFS 0.46`).
- **DoD:** a month of mixed-rate vouchers imports into a real TallyPrime Silver
  instance with zero manual entry, zero duplicate ledgers, and a Group Summary
  matching screenshot 4's structure. Re-export of an imported period is
  detected, not duplicated.

### SP1.8 — Vendor bill export _(#14)_ — 3–5 d

Purchase vouchers from procurement, same mapping layer as SP1.7. _Kept here
rather than SP2 — it shares the entire ledger mapping and costs almost nothing
alongside it._

### SP1.9 — Data migration _(#5)_ — 5–8 d

Importers for dealers, products, stock with serials, open orders. Extends the
existing spreadsheet bulk-import pattern. Dry-run validation report, idempotent
re-run, rejected-row CSV.

### SP1.10 — Opening balance import _(#8)_ — 3–4 d

Receivables and stock valuation at cutover, so aging is correct from day one.
**DoD:** migrated aging report matches the client's Tally outstanding exactly.

---

## SP2 — Serial capture workflow & parity (20–31 d)

**Goal:** Close the client's second stated pain and remove remaining Swipe
objections.

### SP2.1 — Serial capture ADR _(design, blocks SP2.2–2.3)_ — 1 d

Dealerlink reserves serials **automatically, FIFO, at order confirmation** and
picks them at **dispatch**. The client wants to **scan actual serials at
invoice time**, with inventory updating from the scan. Decide:

- Does scanning at invoice **replace** the FIFO-reserved serials with the
  scanned ones (reconciling any difference), or does invoicing become the
  reservation point for scan-mode tenants?
- What happens when a scanned serial is reserved for a _different_ order?
- Is scan-mode a per-tenant setting, or the new default?

Get this wrong and the serial state machine — currently protected by
`FOR UPDATE` locks and the concurrent-dispatch test — becomes inconsistent.

### SP2.2 — Serial bulk import at procurement — 4–6 d

Import serials from a supplier document (CSV/XLSX first; PDF parsing only if
the client supplies real samples). Today they are pasted one per line, which
does not scale to 500-unit consignments.
**DoD:** 500 serials imported with duplicate rejection identical to the paste
path; rejected-row report.

### SP2.3 — Barcode scan-to-assign on invoice — 6–9 d

Scanner input assigns serials to invoice lines; inventory status updates in the
same transaction. USB HID scanner (keyboard emulation) is the low-risk path and
needs no mobile work.
**DoD:** 100 serials scanned in under 3 minutes; scanning an already-dispatched
or wrong-order serial fails cleanly; concurrent-scan test mirrors the existing
concurrent-dispatch test.

### SP2.4 — Mobile-responsive / PWA _(#11)_ — 6–10 d

Quotation entry, order lookup and dispatch confirmation on a 390px viewport.
PWA, not native. Also unlocks phone-camera scanning as a later option.

### SP2.5 — Dealer price lists _(#13)_ — 4–6 d

Per-dealer or per-tier pricing replacing the single catalog selling price.
Override still allowed and audited.

---

## SP3 — Externally dependent compliance (18–28 d)

Runs when SP0.3 and SP0.4 land. **Nothing in SP1 or SP2 waits on this.**

| #     | Item                                                                                                                                                                    | Effort | Gate                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| SP3.1 | **E-invoice / IRN** _(#2)_ — queued via pg-boss, invoice marked `irn_pending`, retry with backoff, IRP downtime never blocks invoicing, 24-hour cancellation, QR on PDF | 8–12 d | GSP contract                        |
| SP3.2 | **E-way bill** _(#3)_ — auto-generate on dispatch, Part-B vehicle update, extension and cancellation; today's free-text field becomes manual fallback                   | 5–8 d  | GSP contract, SP3.1 (shared client) |
| SP3.3 | **Payment links / UPI** _(#12)_ — link on invoice, webhook-verified payment lands as `verified`, no double allocation on replay                                         | 5–8 d  | Gateway KYC                         |

---

## SP4 — Hardening & documentation (5–8 d)

| #     | Item                                                                                                                                                        | Effort |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| SP4.1 | Remaining `UX_FINDINGS` defects: `P-10` "coming soon" placeholder, `P-11` Sales Summary group-by, `P-12` linked-deal reset, plus cosmetic `P-4`/`P-5`/`P-6` | 2–3 d  |
| SP4.2 | `USER_MANUAL.md` sections 3–10 — required for client team training, which the proposal sells                                                                | 3–5 d  |

_`P-7` and `P-8` moved to SP1.1; `F-1`–`F-4` moved to SP0._

---

## SP5 — Paid plugins (plan only in this phase)

**Deliverable now:** `docs/PLUGIN_ROADMAP.md` + an ADR. **No plugin code.**

### The entitlement layer must exist first — 5–8 d, not yet scoped anywhere

"Plugin" now means **separately licensed, separately priced, not in the base
package**. A feature flag is not enough. Before any plugin ships:

- `plugins` registry + `tenant_entitlements` table (tenant, plugin, status,
  activated/expires, billing reference)
- Server-side gate on every plugin route, tRPC procedure and Server Action —
  UI hiding is not enforcement
- Plugin-owned tables, migrations and RLS policies on the core deploy path
- Core extension points (serial lifecycle events, order status hooks) so
  plugins never touch core tables directly
- Graceful degradation when an entitlement lapses: data retained, read-only,
  never deleted
- Admin surface to activate/deactivate per tenant, and an audit trail of it

Write this ADR before the roadmap document — it determines whether each item
below is even buildable as a plugin.

### Plugin candidates (document, do not build)

| Plugin                      | Contents                                                                   | Effort     | Notes                                                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warranty & Traceability** | #15 end-customer entity (3–5 d) + #16 warranty registry and RMA (10–15 d)  | 13–20 d    | The genuine moat. Zoho markets serial tracking as _enabling_ warranty claims but does not operationalise a claims process. Note: #15 may belong in core, not the plugin — decide in the ADR    |
| **Dealer Portal**           | #17 dealer self-service: own orders, outstanding, dispatch status, reorder | 12–18 d    | Highest defensibility per rupee — makes the dealer a user. Needs external auth scope; the security model is the hard part, not the UI                                                          |
| **Tally Live Sync**         | #7 two-way sync via Tally XML/ODBC gateway + on-premise agent              | 15–25 d ⚠️ | Parked. High operational fragility — their Tally must be running and reachable. **Only revisit if SP1.7's one-way export proves insufficient in practice.** For this client it likely will not |
| **Solar Compliance**        | ALMM / DCR / BIS metadata on product and serial                            | 2–3 d      | Cheap, deeply vertical, no horizontal competitor will maintain it. Small enough that it could ship in SP2 as core instead — decide commercially                                                |

---

## Risks

| Risk                                                | Impact                                  | Mitigation                                                                                                             |
| --------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tally ledger names differ per client CA             | SP1.7 rework per deployment             | Ledger mapping is tenant-configurable by design, not hardcoded                                                         |
| SP2.1 ADR resolves against current serial model     | SP2.3 grows; serial state machine churn | Do the ADR before any SP2 code; keep the concurrent-dispatch test as the invariant                                     |
| GSP contract slips                                  | SP3 only — SP1/SP2 unaffected           | Structural, by design in v2. Shortlist two providers                                                                   |
| Client expects live Tally sync, gets one-way export | Trust damage at handover                | State one-way export explicitly in the proposal. Their stated pain is duplicate ledgers and typos, which export solves |
| PDF serial rendering for 500-unit invoices          | Page-count blowout, Puppeteer timeouts  | Test at 500 serials in SP1.3; consider an annexure page                                                                |

---

## Proposal implications

Update the client proposal to say:

- **Live at go-live:** pipeline, quotations, PI, orders, serial-tracked
  inventory, **stock reservation with hard block on shortfall** (their second
  pain, already built — and Swipe currently permits `-84.00 NOS`), credit
  control, dispatch, payments, reports.
- **Delivered in SP1:** correct multi-rate and HSN-wise GST on every document,
  tax invoice, credit note, GSTR-1, and **Tally export that posts to their
  four rate-wise sales ledgers** — the specific failure demonstrated in
  screenshot 5.
- **Delivered in SP2:** serial import at procurement, barcode scan-to-assign at
  invoice with inventory update.
- **Delivered in SP3:** e-invoice, e-way bill, payment links.
- **Available as paid add-ons, priced separately:** warranty and traceability,
  dealer portal, live Tally sync.
- **Never claim** Swipe lacks Tally sync. Claim, with the arithmetic, that
  their sync collapses ₹222.94 + ₹334.08 into one ledger line.
