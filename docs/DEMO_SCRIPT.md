# DEMO_SCRIPT.md — Dealerlink for Maharudra Agencies

> **Audience:** the owner of Maharudra Agencies (Ponda, Goa) and the ops team who
> run Swipe and TallyPrime every day.
> **Where:** the **`demo` tenant on staging** (`demo.staging.dealerlink.in`).
> Revised 2026-09-26: the `maharudra` tenant is not reachable on staging, so the
> demo runs on the generic demo tenant instead. See "This tenant is fictional"
> directly below before anything else.
> **Length:** about 20 minutes of demo plus questions.
> **Sources:** `docs/CLIENT_CONTEXT.md`, `docs/STAGE_F_BUILD_v3.md` §7,
> `docs/client-evidence/*.png` (cited by **filename**, per CLIENT_CONTEXT §2),
> and the demo-tenant seeds (`packages/db/src/seeds/day5.ts`–`day13.ts`,
> `multi-rate.ts`). Document numbers and figures below were read from the
> **development** database on 2026-09-26 (seeded, and also carrying e2e test
> residue). Staging must be checked
> against them on the day (checklist section A).
>
> This is a **presenter's document**. Lines marked **SAY** are for the room.
> Lines marked **PRESENTER ONLY** are never read aloud and never go on a slide.

---

## This tenant is fictional. Say so before they ask.

**Everything on the `demo` tenant is invented test data:**

- **The company.** "Demo Solar Distributors Pvt Ltd", Andheri East, Mumbai, is
  not a real business. Its GSTIN (`27AABCD1234E1Z8`) and its HDFC account and
  IFSC are placeholders.
- **The dealers.** Iyer Green, Bhat EnerTech, Reddy Solar, Patel Renewables and
  the rest are invented names with invented addresses.
- **The products and prices.** Several products carry **real manufacturers'
  names** (Premier, Adani, Vikram, Havells, Growatt). **The prices are made up.**
  They are not those manufacturers' prices, not market prices, and not
  Maharudra's prices.
- **The GST rates are test settings, not tax statements.** Most panels on this
  tenant are set to **18%**. Maharudra's own invoices bill panels (HSN 85414300)
  at **5%**, and a distributor will notice this immediately. The rates were
  chosen to exercise the software. The seed says so in writing
  (`multi-rate.ts`: "asserts NO statutory rate for any HSN").
- **Some product names are obviously test fixtures**, such as "Day13 Dispatch
  Panel 540W" (it appears in Step 4), "Assay Reference Kit (fixture-only,
  non-solar)" and "F.101 fixture — 12% line". See WHAT NOT TO CLICK.

**Never claim otherwise.** Don't say "this is what a Premier panel costs", "panels
are 18%", or anything that treats a figure on screen as real. If you're asked
about any price, rate or name: "That's test data. The prices and rates are made
up. Your catalogue would carry your own."

**SAY, at login, before the first screen:** "Everything you'll see today is a
test company with made-up dealers, products and prices. Some real brand names
are in there, but the prices and tax rates are invented to exercise the
software. What we're showing you is what the system does, not the numbers."

---

## The argument, in one paragraph

Swipe is a good billing tool, and Maharudra should keep billing in it. The problem
is that Maharudra is no longer only a billing problem. At roughly ₹25 crore in
five months (`2.png`), they are trying to run stock, serials and dealer
commitments through a tool whose job is the invoice. `3.png` shows the result:
a 36-panel proforma raised against `Stock: -84.00 NOS`. Dealerlink runs the sale
**up to the invoice**: quotation, proforma, order, stock reservation, serials,
dispatch. **The demo ends at the order on purpose.** That is where Dealerlink
hands over to Swipe.

## What we are actually asking them to do: run both, for months

**This is the pitch, not a footnote to it.** Maharudra is about 12× over the ₹5
crore e-invoicing threshold (CLIENT_CONTEXT §4). For them, a B2B invoice without
an IRN counts as not issued, and their buyer loses input tax credit. So the
invoice of record has to come from a system that does e-invoicing. **Today that
is Swipe, and it stays Swipe until Dealerlink's e-invoicing ships in Phase 3.**
Dealerlink's own tax invoice (Phase 1) doesn't change that, because an invoice
without an IRN is no use to them.

So the honest offer is **a parallel run measured in months, not weeks**:

- **Dealerlink** holds the sale up to the order: quotation, proforma, stock
  reservation, serials and dispatch.
- **Swipe** keeps doing the invoice, e-invoice, e-way bill and GST returns.

**Name the cost before they do.** During the parallel run there is no link
between the two systems, so every confirmed order is keyed into Swipe again to
raise the invoice. That is double entry on every sale until Phase 3. The case for
paying that cost has to stand on Steps 3 and 4 alone: stock that can't go
negative, and serials you can trace. **Do not sell Phase 1 as the moment they
switch.** It isn't.

**PRESENTER ONLY — the Tally fix probably moves with it.** The ₹557.02 problem
(Q5) is fixed by Dealerlink's one-way Tally export (F.11–F.13). That export
builds vouchers from **Dealerlink's** invoices. While Swipe issues the invoices of
record, it has nothing of record to export from, and exporting alongside Swipe's
sync would post the same sale twice. That is an inference from the export's
design, not a settled decision. Until it is settled, **do not promise the
ledger fix at Phase 1.**

## Never say

- Anything negative about Swipe. Where Swipe is stronger, say so first: it does
  e-invoice (IRN), e-way bill, GST returns and a mobile app, and Dealerlink does
  none of these yet.
- "Swipe can't sync to Tally." **It can, and theirs is switched on.** The accurate
  claim is narrower: on `MA/26-27/1079` their sync puts two tax rates into one
  ledger line (see Q5).
- That Dealerlink's IGST is correct for a Goa bill-to shipping to Maharashtra.
  That question is open with their CA (F.112).
- Anything about Dealerlink's own earlier tax rendering (see the PRESENTER ONLY
  note in Step 1).

---

## Running order, and why this order

| #   | Step                                                            | Demo document                                                      | Why it sits here                                                                                                                                           |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Three rates on one document, with the HSN/SAC table             | **QT-2026-0016** (Iyer Green, MH → MH)                             | **Credibility first.** A document with three rates and three HSN codes that prints correctly. It also sets up the Tally conversation without starting it.  |
| 2   | Switching to an out-of-state dealer flips the tax to IGST, live | A new, unsaved quotation: Iyer Green (MH) → Bhat EnerTech (RJ)     | This is the only live typing in the demo. It happens early, while the room is still reading closely, and it is reversible (nothing is saved).              |
| 3   | Order confirmation blocked on stock                             | The order created from **PI-2026-0004** (Reddy Solar)              | **The emotional peak.** It is the situation in their `3.png` (Swipe saving a proforma against negative stock), but this time the system refuses.           |
| 4   | A serial traced to the dealer                                   | Serial **DSP13-demo-0001** → **DSP-2026-0001** → **ORD-2026-0014** | This answers the question Step 3 raises ("so where did the panels go?"). It walks back from a serial to the order, **so the demo ends on the order page**. |
| —   | ~~Their invoice, reproduced to the rupee~~                      | **None on demo**                                                   | **Dropped.** Only the maharudra tenant carried their figures. See "Removed from the brief" below.                                                          |
| —   | Credit limit refusal                                            | —                                                                  | **Cut. It is not built.** See "Removed from the brief" below.                                                                                              |

End on the ORD-2026-0014 order page from Step 4. Close with: _"This is the point
where you open Swipe and raise the invoice, and that stays true until our
e-invoicing is live. That's months, not weeks. We're asking you to run the two
side by side for that long, because of what you've just seen happen before the
invoice."_

### Which seeded documents actually demonstrate each step

Checked against the seeded data, not assumed. The seed contains no document
that fits Step 3 as it stands, and no matched intra/inter-state pair.

- **Mixed rates (Step 1): QT-2026-0016 is the right one.** It is intra-state
  (MH → MH), has four lines at **5%, 12% and 18%**, three HSN codes with one rate
  each, and no discount. Other mixed-rate documents exist, but each has a
  problem:
  - **QT-2026-0017** (Bhat EnerTech, MH → RJ, 5% + 18%) prints **HSN 85414300 at
    both 18% and 5%**. That is deliberate in the seed, but a distributor will read
    it as a mistake.
  - **QT-2026-0020** is built from products named "F.101 fixture — n% line".
  - **QT-2026-0018 / 0019** are a single 3% "Assay Reference Kit (fixture-only,
    non-solar)".
- **Intra/inter-state pair (Step 2): no seeded pair exists.** The only intra-state
  mixed-rate document is QT-2026-0016 (Iyer Green, MH). The inter-state ones
  (QT-2026-0017, QT-2026-0020) have **different lines**, so putting two of them
  side by side would change the goods as well as the state. The live flip in the
  quotation builder is the only clean pair: same lines, same total, only the
  dealer changes. Use **Iyer Green (Nashik, MH)** → **Bhat EnerTech (Jodhpur,
  RJ)**.
- **Stock block (Step 3): nothing is seeded to fire it. It needs one setup
  click.** No pending order on demo is short of stock. The seeded pending orders
  (ORD-2026-0003 to 0013) are one panel each against stock of about 12. The
  multi-rate orders (ORD-2026-0022/0023) are already confirmed, with nothing
  reserved and zero stock behind them. The one-click setup:
  **PI-2026-0004** (Reddy Solar, Dibrugarh, AS, status _sent_) is for **80 ×
  Premier 450W Bifacial + 10 × Premier 540W Bifacial**. Confirming the PI creates
  a pending order. In the development database, stock was **12 in stock** of
  each product, so the 450W line is short and the 540W line is covered. The
  block only names one product while 540W stock is **at least 10**, so check that
  on staging. The block therefore names
  exactly one product, which is the effect the original script wanted. Do the
  setup the day before (checklist C).
- **Serial trace (Step 4): DSP-2026-0001 works, but it shows a fixture name.** Only
  the Day 13 seed creates dispatches, and every one of them is for the product
  "**Day13 Dispatch Panel 540W**". DSP-2026-0001 is the cleanest: delivered,
  single-party (Patel Renewables is both bill-to and ship-to), 4 serials
  `DSP13-demo-0001`–`0004`, against ORD-2026-0014. Real-named panels have
  delivered stock with **no** dispatch record behind it, so their trace would stop
  at the serial page.

---

## Log in

- **URL:** `https://demo.staging.dealerlink.in/login` (returned 200 on 2026-09-26).
- **User:** `admin@demo.test` / `password123`. These are seeded staging
  credentials (`docs/STAGING_ENV.md`). Admin can reach every screen in the demo
  without switching users.
- **SAY, as you log in:** first the fictional-data line above, then: "In real use
  your sales team, accounts and godown each get their own login. Sales can't
  touch payments, and dispatch can't change a price. For today I'm using one
  login that can see everything."

> 📷 **SCREENSHOT PLACEHOLDER — S0**
> URL: `https://demo.staging.dealerlink.in/dashboard`
> In frame: the sidebar with "Demo Solar Distributors" as the tenant name, and the dashboard.

---

## Step 1 — Three rates, one page, the HSN/SAC table

**Click:** Sidebar **Quotations**, then **QT-2026-0016** (Iyer Green, Nashik),
then **Download PDF**.

**What appears:** a four-line quotation, intra-state (MH → MH):

| Line | Product                        | HSN      | Qty | Rate   | GST | Amount    |
| ---- | ------------------------------ | -------- | --- | ------ | --- | --------- |
| 1    | Havells 40A DC Isolator Switch | 85359090 | 3   | 4,150  | 18% | 12,450.00 |
| 2    | Premier 555W TOPCon Module     | 85414300 | 7   | 13,325 | 5%  | 93,275.00 |
| 3    | Growatt 5kW Hybrid Inverter    | 85044090 | 2   | 41,500 | 12% | 83,000.00 |
| 4    | Adani 585W Mono PERC Module    | 85414300 | 5   | 13,125 | 5%  | 65,625.00 |

Taxable **₹2,54,350.00**, CGST **₹10,073.01**, SGST **₹10,073.01**, total
**₹2,74,496.02**.

**Scroll down. Point at:**

- The totals block, with one CGST/SGST pair per rate. The per-rate figures should
  be CGST/SGST 2.5% ₹3,972.51 each, 6% ₹4,980.00 each and 9% ₹1,120.50 each (the
  checklist confirms these against the render). The PDF prints these **without
  "@"**. The on-screen summary card prints `CGST @ 2.5%`. Both are expected.
- The **"HSN / SAC Summary"** table, with three rows: 85044090 (₹83,000.00),
  85359090 (₹12,450.00) and 85414300 (₹1,58,900.00, both 5% panel lines together).

**SAY:** "Three tax rates on one document. Each rate gets its own line, and each
HSN code gets its own row, with the two panel lines rolled up under one code.
That matters to you because of what happens next, when the sale goes to Tally,
which we'll come to in the questions."

**Be honest about parity.** Swipe's own PFI-2033 preview (`4.png`) already prints
rate-wise lines and an HSN table correctly. **This step is parity, not an
advantage.** It is here so the room trusts the document. The advantage is in
Steps 3 and 4. If the owner says "Swipe does this too", agree: "It does. This is
the part where we have to be as good as Swipe before anything else counts."

**PRESENTER ONLY — the 1 paisa.** An accountant who recomputes the 5% rows will
get 2.5% of ₹1,58,900 = **₹3,972.50** and see **₹3,972.51**. That is because tax
is rounded **per line** (₹2,331.875 → ₹2,331.88 and ₹1,640.625 → ₹1,640.63), and
the seed chose two 5% lines on purpose to exercise exactly this
(`multi-rate.ts`, Chain A). If asked: "we round tax on each line and then add up
the lines, so each line on the page is exact to the paisa. Some systems round the
total instead. Your CA can tell us which one you want." **Don't claim either is
the legal requirement.**

**Don't open QT-2026-0016's PI (PI-2026-0030).** The seed marks it _confirmed_
but never created an order for it, so the page shows a confirmed PI with nothing
downstream.

> 📷 **SCREENSHOT PLACEHOLDER — S1**
> URL: `https://demo.staging.dealerlink.in/quotations` → QT-2026-0016 → Download PDF
> In frame: the four lines, the six tax rows, and the complete HSN/SAC table. Place it beside `4.png`.

> **PRESENTER ONLY.** Before F.3/F.4 (completed 2026-09-20 and 2026-09-24),
> Dealerlink printed a mixed-rate document as a single "CGST " row with no rate.
> That is why this step matters to us, and it is **internal only**
> (STAGE_F_BUILD_v3 §7, Finding 2: "Never appears in a client document"). Do not
> say it, show it or allude to it.

---

## Step 2 — An out-of-state dealer, and the tax flips to IGST

**Click:** Sidebar **Quotations**, then **New quotation** (`/quotations/new`).

1. **Dealer:** choose **Iyer Green · MH**.
2. **Line items:** under "+ Add product…", add **Premier 555W TOPCon Module** and
   set Qty to **10**. Then add **Havells 40A DC Isolator Switch** with Qty **1**.
3. Point at the **Totals** card. The badge reads **`MH → MH · Intra-state`**, and
   the rows show `CGST @ 2.5%` ₹3,331.25, `SGST @ 2.5%` ₹3,331.25, `CGST @ 9%`
   ₹373.50 and `SGST @ 9%` ₹373.50.
4. **Change the Dealer** to **Bhat EnerTech · RJ**.
5. The card recomputes immediately. The badge now reads
   **`MH → RJ · Inter-state`**, and the rows become `IGST @ 5%` ₹6,662.50 and
   `IGST @ 18%` ₹747.00. The total stays **₹1,44,809.50**.
6. Click **Cancel**. **Do not save.**

(These figures assume the builder defaults to the catalogue prices, ₹13,325 and
₹4,150. The checklist confirms this.)

**SAY:** "A dealer registered in Jodhpur, buying and taking delivery there.
Nobody picks CGST or IGST from a dropdown. The system reads both states and
decides. In Swipe that is a choice someone makes on every document."

**Why these two products:** the 5% module and the 18% isolator give one intra-
and one inter-state view with two rates each. They avoid the 18% panels (see
"This tenant is fictional"), and they avoid a total that anyone could match to
a real document.

> 📷 **SCREENSHOT PLACEHOLDER — S2a / S2b**
> URL: `https://demo.staging.dealerlink.in/quotations/new`
> In frame, S2a: the Totals card for Iyer Green, `MH → MH · Intra-state`, four CGST/SGST rows.
> In frame, S2b: the same card after switching to Bhat EnerTech, `MH → RJ · Inter-state`, two IGST rows.

### Deliberately not the Ship-To version

The brief asked for "Ship-To in another state flipping the tax to IGST". The
product can do that: on **Convert to PI** there is a **"Ship to"** dealer picker,
and it raises a **"Tax classification will change"** banner. **Do not demo it.**

A bill-to in the distributor's own state shipping to a site in another state is
**exactly** their PFI-2033 (`4.png`), and they charged CGST + SGST on it. The
question of which classification is correct, and when, belongs to F.5a's two
delivery arrangements and F.112's onboarding note. None of it should be settled
live in front of them. A dealer who is both bill-to and ship-to in Rajasthan is
the uncontested case, so that is what Step 2 shows. If they ask about the split,
go to Q4.

---

## Step 3 — The order that can't be confirmed

**Setup (done the day before, checklist C):** **PI-2026-0004** (Reddy Solar,
Dibrugarh, AS) is confirmed, which creates a **pending** order. On a fresh seed
that order is **ORD-2026-0024**. Staging's counter may be further on (smoke runs
use it too), so write down the real number when you do the setup.

**Click:** Sidebar **Orders**, then that order, then **Confirm order**.

**What appears:** an inline panel, not a pop-up, titled **Confirm ORD-2026-00NN**:

- **Premier 450W Bifacial · PRE-450-BI** in red: **`68 short — need 80, 12 in stock`**.
- **Premier 540W Bifacial · PRE-540-BI**, not red: **`reserve 10`**.
- Then a red box:

> **Cannot confirm — Premier 450W Bifacial: need 80, have 12.
> Procure more inventory, then retry.**

**Confirm & reserve** is disabled. The stock figures (12) were read from the
development database. Staging will show its own numbers, so read them off the
screen during the checklist and update this step.

**Point at:** the 540W line. There are enough 540W panels, and the system still
refuses the whole order. It names only the product that is actually short.

**SAY:** "Your screen from the second of September (`3.png`): Swipe showed the
panel stock at minus 84, and the proforma went out anyway. Here the order stops.
It tells you which product is short and by how many. And nothing is
half-reserved: the 540s are in stock, but they aren't held for an order that
can't ship. Either the whole order is covered, or nothing moves."

**Do not** put this order's figures (₹12,51,272.00, IGST) beside `3.png` as if
they were the same sale. They aren't: this is test data. Compare the
**behaviour** (Swipe let it through, this doesn't), not the numbers.

> 📷 **SCREENSHOT PLACEHOLDER — S3**
> URL: `https://demo.staging.dealerlink.in/orders/<order id>`
> In frame: the Confirm panel with the red "68 short" line, the plain "reserve 10" line,
> the red Cannot confirm box and the disabled Confirm & reserve button.
> Place it beside `3.png` with the `Stock: -84.00 NOS` cell circled.

---

## Step 4 — One serial, from the godown to the dealer

**Setup:** none. This is seeded (Day 13 seed).

**PRESENTER ONLY — the fixture name.** Every seeded dispatch is for a product
called **"Day13 Dispatch Panel 540W"**. It will be on screen for this whole step.
Don't draw attention to it. If someone asks: "That's a test item name. The trail
is what we're showing." (It is covered by the fictional-data line at login.)

**Click path:**

1. Sidebar **Inventory**. In **"Search by serial number…"** type `DSP13-demo-0001`.
2. One row appears. Click it.
3. The serial page shows the Item card and the **Lifecycle** card: **Procured**
   (with the procurement link), **Reserved** ("For dealer"), and **Dispatched**
   ("Dispatch xxxxxxxx…").
4. Sidebar **Dispatch**, then **DSP-2026-0001** (status _delivered_). Under
   "Line items · N serial(s)", **DSP13-demo-0001** appears as a chip alongside
   0002–0004. The Parties section shows **Ship to (consignee): Patel Renewables**,
   Dibrugarh, AS.
5. Click **ORD-2026-0014** in the "against ORD-2026-0014" line. **Stop here.**

**SAY:** "Take the serial number your team types onto the invoice today. We know
which consignment it came in on, which order it was held for, which vehicle took
it and which dealer received it. When a panel comes back under warranty, this is
the answer, and nobody has to search through PDFs to find it. And this is the
order. From here you raise the invoice in Swipe, like you do today."

**Known gap, stated plainly if noticed.** The serial page does **not** name the
order or the dealer (it says only "For dealer"), and the Dispatched entry is not a
link. That is why step 4 goes through the Dispatch list. The data is all there,
but the serial page doesn't yet link through to it. Do not paper over this. If
asked, say "the link from the serial page is a small change. The record is
complete." (Filed as F.118.)

> 📷 **SCREENSHOT PLACEHOLDER — S4a / S4b / S4c**
> S4a URL: `https://demo.staging.dealerlink.in/inventory?q=DSP13-demo-0001`. In frame: the search box and the single result row.
> S4b URL: `/inventory/<item id>`. In frame: the Lifecycle card with Procured, Reserved and Dispatched.
> S4c URL: `/dispatch/<DSP-2026-0001 id>`. In frame: the serial chips, "against ORD-2026-0014", and Ship to Patel Renewables.
> Place S4c beside `5.png` (the serial list on their invoice).

**The demo ends here, on the ORD-2026-0014 order page.**

---

## Removed from the brief

### Their invoice, reproduced to the rupee (was Step 1)

**No demo-tenant equivalent exists, so it is dropped rather than approximated.**
The earlier version opened on a maharudra quotation whose panel line matched
their invoice `MA/26-27/1094` (`5.png`) exactly: 26 × ₹15,500, CGST ₹10,075 and
SGST ₹10,075. Only the `maharudra` tenant carries their products and figures
(F.106), and it is not reachable on staging. **Do not recreate their figures on
the demo tenant live**, and do not refer to their invoice as though it were on
screen. The credibility this step was meant to earn now rests on Step 1's
three-rate document being correct.

### Credit limit refusal

**Not built. Do not demo it, and do not imply it.** A credit limit can be
**stored** per dealer (Dealers → dealer → commercial terms, admin-only to edit).
**Nothing reads it when a quotation, PI or order is created or confirmed.**

I established this by listing every non-seed, non-migration file that references
`creditLimit`/`credit_limit` (`git grep -l`). All of them are dealer create /
edit / import / list, the dealer schema, and the Zod schema. None is in
`lib/actions/quotations`, `pi`, `orders` or `payments`. The only credit behaviour
that exists is **overdue tracking against the credit _period_** (the dashboard's
"outstanding past credit period").

**If they ask "can it stop us selling to a dealer over their limit?":** "Not yet.
Today it records the limit and shows who is overdue past their credit period.
Refusing an order over the limit isn't built." It is filed as **F.117** (HIGH)
but not scheduled, so do not quote a date.

---

## QUESTIONS THEY WILL ASK

**Q1. Where is the invoice?**
"Keep raising it in Swipe, and keep doing that until our e-invoicing is live,
which is Phase 3. We'll build a tax invoice before that, in Phase 1, but at your
turnover an invoice without an IRN doesn't count as issued, so that alone
doesn't let you move. Realistically you'd run the two side by side for months."
**Lead with the Phase 3 answer. Don't open with Phase 1 and qualify it
afterwards**, because the room will remember the first date it hears. If they
ask "so what's Phase 1's invoice for?": it's the document the e-invoice is built
on, and it isn't the day they switch.

**Q2. Does this do e-invoicing?**
"No. That's Phase 3, and it needs a contract with a GST Suvidha Provider. Swipe
does e-invoice and e-way bill today, and it does them well. That's why the
invoice stays in Swipe until then." Do not give a date for Phase 3. Nothing on
the plan supports one, and it depends on a provider contract that hasn't been
signed.

**Q2a (follow-up). So we type every order twice until then?**
"Yes, until Phase 3 there's no link between the two, so the order is keyed into
Swipe to raise the invoice. We'd rather tell you that now." Don't soften it, and
don't hint at an integration that isn't planned.

**Q3. Can we discount per line?**
"Not yet. Today a discount applies to the whole document, and we spread it across
the lines so the paise add up exactly. Your PFI-2033 puts ₹11,718 on the panel
line only. We can't reproduce that page, and we won't show you a total that
doesn't match yours. Per-line discount is a known gap." **Size it honestly**
(F.111): a new column on three line tables and a migration, a change to the tax
engine's discount allocation, and a decision on whether document-level and
per-line discounts can coexist. No day estimate is on record, so do not invent
one.

**Q4. What if we ship somewhere other than the bill-to?**
"That's a question for your accountant, and we'd rather ask than guess. Your
PFI-2033 billed Ponda, shipped to Kolhapur, and charged CGST and SGST. The
system can record a different ship-to, but which tax applies when the goods go
to a third party is exactly what we want your CA to confirm before we build
further on it." **Do not assert that IGST is correct.** It is F.112, and it is
one of the four tax questions in the outstanding email (CLIENT_CONTEXT §5). If
their CA is in the room, ask the question there.

**Q5. Does it sync with Tally?**
"A one-way export to Tally is on the plan for Phase 1. It isn't built yet."
**Then the point that is theirs:** "Your Swipe-to-Tally sync is running today.
Look at voucher MA/26-27/1079 (`1.png`): one panel at 5% and four switches at 18%.
Tally receives a single SGST line of ₹557.02. That figure is ₹222.94 at 5% plus
₹334.08 at 18%, added together. Your ledgers in `2.png` split sales by 5% and
18%. That one line can't be split back into them." Never say Swipe has no Tally
sync. **Do not let "Phase 1" here imply the ledger problem goes away at Phase 1.**
While Swipe issues the invoices of record, Dealerlink has no invoice of record to
export (see the PRESENTER ONLY note under "run both, for months"). If they ask
"so when does the ₹557.02 problem stop?", the honest answer is "when you invoice
from Dealerlink, which is after e-invoicing, Phase 3."

**Q6 (likely). Can we scan the panel barcodes?**
"Yes, with an ordinary USB or Bluetooth scanner and no software to install. Get a
**2D imager**, because panel labels often carry DataMatrix or QR, which a cheap
laser scanner can't read. Scanning at invoice time is designed but not built; today
serials are pasted in or scanned in when stock is received." Scanner choice and
the label format are open asks (CLIENT_CONTEXT §5, items 2–4).

**Q7 (likely). Whose company is this? / Is that a real GSTIN?**
"It's a made-up test company. The GSTIN, the bank details, the dealers and the
prices are all placeholders." On the demo tenant nothing on screen is theirs, so
nothing can be mistaken for theirs, **as long as nobody implies otherwise** (see
"This tenant is fictional"). Their own GSTIN goes in when their tenant is set up
(F.115 tracks it for the maharudra tenant).

---

## PRE-DEMO CHECKLIST (one page)

Do this on staging **the day before**, then do a clean run-through of Steps 1–4.
The staging items that need infrastructure access belong to the operator.

### A. Is staging's demo tenant the data this script was written against?

**As of 2026-09-26, it is not.** Staging's QT-2026-0016 is critical-path e2e
residue (CP Panel 600W MPI0UY19, CP Dealer MPI0UY19, one 18% line, dated
23 May 2026), not F.81's multi-rate document. This implies staging has not been
fully reseeded since about May (F.120). **A full staging reseed is a
precondition for this script.** Also, the smoke test that `docs/STAGING_ENV.md`
recommends takes demo-tenant document numbers, so don't run it between the
reseed and the demo.

1. ☐ Log in at `https://demo.staging.dealerlink.in/login` as `admin@demo.test`.
2. ☐ **Quotations → QT-2026-0016 is the right document**: Iyer Green, 4 lines at
   5/12/18%, total ₹2,74,496.02. **If it is missing or anything else, stop:**
   staging needs a full reseed (operator action, `docs/STAGING_ENV.md`). A reseed
   **truncates all of staging**, including the hand-made maharudra tenant and
   anything else created by hand. Every document number in this script assumes a
   clean reseed.
3. ☐ **The product list includes** Premier 555W TOPCon Module and Havells 40A DC
   Isolator Switch (both from the same seed).
4. ☐ Scan the Quotations, PIs and Orders lists for **test residue** from smoke
   runs (numbers such as `CHAIN-…`, `TEST-…`, `RLS-…`, `ORD-DSP-…`,
   `ORD-PAYTEST-…`). If there is a lot of it, a reseed clears it. Otherwise,
   scroll past it.

### B. Data that must be right

5. ☐ QT-2026-0016's PDF shows the six per-rate rows (2.5% ₹3,972.51, 6% ₹4,980.00
   and 9% ₹1,120.50, each for CGST and SGST) and a three-row HSN table. **If any
   figure differs, the render wins.** Update Step 1 to match it.
6. ☐ In `/quotations/new`, adding the two Step 2 products defaults to ₹13,325 and
   ₹4,150, and the totals match Step 2. Then **Cancel**.

### C. Staging the stock block

7. ☐ **PIs → PI-2026-0004** (Reddy Solar, status _sent_, 80 × Premier 450W
   Bifacial + 10 × Premier 540W Bifacial). Click **Confirm PI**. That creates a
   pending order. **Write down its number** (ORD-2026-0024 on a clean reseed).
8. ☐ Open that order and click **Confirm order** once. Check that the 450W line is
   red ("N short — need 80, M in stock"), the 540W line reads "reserve 10", and
   the red "Cannot confirm" box names **only** the 450W. Then click **Close**.
   Put the real N and M into Step 3.
   - If the 540W line is also red, its stock is under 10 on staging. The block
     still fires, but it names both products. Accept that and edit Step 3's
     "Point at", or ask the operator.
9. ☐ **Don't procure, confirm or reserve anything else on the demo tenant** between
   now and the demo. Any of these changes the stock figures that Step 3 reads.

### D. Serial trace

10. ☐ Search `DSP13-demo-0001` on /inventory. One result, whose lifecycle shows
    Dispatched. **If nothing matches**, staging's serials came from a seed before
    DEV.121 (serials made deterministic). Pick any serial on DSP-2026-0001's page
    instead and search for that.
11. ☐ DSP-2026-0001 shows ship-to Patel Renewables and "against ORD-2026-0014".

### E. Credit limit

12. ☐ **Nothing to set up. The feature is not built.** Do not set a limit and try
    to show a refusal. There is no refusal to show.

### WHAT NOT TO CLICK

- **Three-party documents: PI-2026-0003, PI-2026-0007, and PI-2026-0009 /
  ORD-2026-0002.** Their bill-to and ship-to differ. **PI-2026-0003** is the
  exact contested shape: bill-to Iyer Green in MH, ship-to Patel Renewables in
  AS, printed as IGST. Opening it hands the room the question in Q4 as a
  statement.
- **Fixture-named products and their documents.** QT-2026-0017 prints HSN
  85414300 at 18% and 5%. QT-2026-0018 / 0019 and PI-2026-0032 are an "Assay
  Reference Kit (fixture-only, non-solar)". QT-2026-0020, PI-2026-0033 and
  ORD-2026-0023 are made of "F.101 fixture — n% line" products. The Products
  list shows these names too, so don't browse it.
- **PI-2026-0030 and PI-2026-0032.** Both are marked _confirmed_, but the seed
  created no order for either.
- **QT-2026-0010.** It has three revisions, and dozens of seeded PIs point at it.
- **New dispatch on ORD-2026-0022 or ORD-2026-0023.** The seed confirmed them
  without reserving any stock, so the dispatch form will show "No reserved serials
  available for this product."
- **Convert to PI → Ship to** set to a dealer in a different state (see Step 2).
- **"Place of supply (override)"** on the quotation builder. Leave it empty.
- **"Save & send" / "Email PDF"** during the live part. Step 2 ends with
  **Cancel**.
- **Confirm & reserve** on the Step 3 order. It is disabled, but don't try it. And
  don't procure more panels mid-demo "to show it working" unless you have staged
  that too.
- **"Quick find ⌘K"** in the sidebar. It is a placeholder, not a search box, and
  it does nothing (F.119). Serial search is only on /inventory.
- **Delete / Cancel order / Cancel PI.** These are admin buttons you will see
  because you are logged in as admin.
- **Reports → GST.** The rate-wise and HSN-wise GST report is F.9 (pending). Don't
  open reports to "show the numbers".
- **Anything asking to download a tax invoice.** There isn't one. That is the
  point of the ending.

---

## Screenshots

**None were captured. Every image above is a placeholder.** As of 2026-09-26:

1. **Claude in Chrome was not available** in the session that wrote this script.
   No browser tools were exposed.
2. **Staging's demo data is unverified** (checklist A). A screenshot taken before
   A.2 passes may show documents that don't match this script.

Capture S0–S4c after checklist sections A–D are done. Each placeholder names its
URL and what must be in frame.
