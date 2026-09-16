# CLIENT_CONTEXT.md — the prospect, and what we know about them

> **What this file is.** A consolidation of the client facts that were, until
> now, addressable only inside `docs/STAGE_F_BUILD_v3.md` — a document whose
> title tells nobody it holds the client evidence. Every fact here is drawn from
> that file: **§7 Client evidence** for the voucher arithmetic, the
> screenshot-to-filename mapping, the scanner findings and the serial-capture
> decisions; **§0 Go-live scope** for the turnover figures and the e-invoicing
> threshold; **§6** for the e-way bill window.
>
> **Nothing here is new.** Where this file and `docs/STAGE_F_BUILD_v3.md`
> disagree, that file is the origin and wins until somebody decides otherwise —
> which is filed as a task rather than settled here, because two copies of the
> same evidence is the drift this project keeps paying for.
>
> **What is NOT here:** anything from the client conversation that was never
> written into `docs/STAGE_F_BUILD_v3.md`. This file consolidates the record; it
> does not extend it. If you remember something about this prospect that is not
> in either file, it is not written down anywhere and it should be.

---

## 1. Who they are

**Maharudra Agencies.** A prospect, not the pilot tenant. Solar panel
distribution. Currently running **Swipe** (invoicing) alongside **TallyPrime
Silver** (accounts), with Swipe's Tally Sync enabled.

Their evidence lives as five screenshots in `docs/client-evidence/`.

---

## 2. Citations use FILENAMES, not screenshot numbers

`docs/STAGE_F_BUILD_v3.md` originally cited the client's screenshots by a
delivery-order number that is the **exact reverse** of the filenames they were
saved under, so every citation resolved to the wrong image — in a document Day
26 and Day 27 both read for context. The citations were renumbered to filenames
on the Day 25 follow-up; the **files were not renamed**, because the filenames
are load-bearing elsewhere (capture provenance in `docs/pdf-references/`).

Older notes, commits and the work order still use the original numbers, so the
mapping is kept:

| original citation | file    | what it actually shows                                                                                                |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Screenshot 1      | `5.png` | Tax invoice `MA/26-27/1094`, total ₹4,23,150.00 — **26 serials under one line item**, 4 pages                         |
| Screenshot 2      | `4.png` | Swipe PFI-2033 preview, total ₹5,76,955.00 — Goa bill-to → Kolhapur ship-to, and **mixed-rate** (2.5%/2.5% and 9%/9%) |
| Screenshot 3      | `3.png` | Swipe PFI create screen — `Stock: -84.00 NOS` in red against a 36-unit PFI                                            |
| Screenshot 4      | `2.png` | TallyPrime Group Summary — `SALE @ 5% - CENTRAL` beside `SALES @ 18% - CENTRAL`                                       |
| Screenshot 5      | `1.png` | TallyPrime voucher `MA/26-27/1079`, total ₹13,744.00 — carries `ROUND OFFS 0.46`                                      |

Each row was verified image by image rather than inferred from the reversal.
**When adding a citation, use the filename.**

---

## 3. The ₹557.02 voucher — the defect they hired us to fix

`docs/client-evidence/1.png`, TallyPrime voucher **`MA/26-27/1079`**, total
**₹13,744.00**:

| Item                           | Qty | Amount         | GST rate |
| ------------------------------ | --- | -------------- | -------- |
| Premier NDCR TOPCON G12R 615wp | 1   | ₹8,917.50      | 5%       |
| PEDLER LB SWITCH-40A           | 4   | ₹3,712.00      | 18%      |
|                                |     | **₹12,629.50** |          |

Tally shows a single `SGST - OUTPUT` line of **₹557.02**, which is:

```
8,917.50 × 2.5%  =  222.94
3,712.00 × 9.0%  =  334.08
                    ------
                    557.02
```

**Two rates summed into one ledger line.** The four-ledger structure in
`docs/client-evidence/2.png` — `SALE @ 5% - CENTRAL`, `SALE @ 5% - LOCAL`,
`SALES @ 18% - CENTRAL`, `SALES @ 18% - LOCAL` — cannot be reconciled from that
figure, because the figure has already destroyed the split.

The same voucher reads `Syncronized: No` and `Provide e-Invoice details: No`.

**Their Tally Sync is enabled and running.** They tried it; it fails on exactly
this. **Never claim Swipe lacks Tally sync** — the accurate and stronger claim is
that their sync collapses ₹222.94 + ₹334.08 into one ledger line.

### The round-off, and why it belongs to the same document

The voucher also carries `ROUND OFFS 0.46`, and the two facts close on each
other — checked here by arithmetic on the figures above, because it is the
reason F.4 and F.6 are one piece of work rather than two:

```
12,629.50 + 557.02 (CGST) + 557.02 (SGST)  =  13,743.54
                                 + 0.46 round-off
                                 =  13,744.00   ← the voucher total
```

Without a round-off ledger the voucher will not balance. F.4 (multi-rate
summary) and F.6 (round-off row) land in the same renderer component, and
`docs/client-evidence/4.png` — Swipe's own mixed-rate preview — is a real
client document that needs **both** before it renders correctly. Its line-level
figures (CGST 2.5% ₹13,671.00 and SGST 2.5% ₹13,671.00 alongside CGST 9.0%
₹211.50 and SGST 9.0% ₹211.50) are recorded in F.4's notes in
`docs/stage-f-tasks.json`, not in §7, which records only that the document is
mixed-rate.

---

## 4. Turnover, the ₹5 crore threshold, and why e-invoicing is in go-live scope

`docs/client-evidence/2.png` shows sales ledger closing balances for
**1-Apr-26 to 1-Sep-26**:

| Ledger                | Closing balance   |
| --------------------- | ----------------- |
| SALE @ 5% - CENTRAL   | ₹8,49,15,635.18   |
| SALE @ 5% - LOCAL     | ₹14,98,85,331.52  |
| SALES @ 18% - CENTRAL | ₹18,27,638.53     |
| SALES @ 18% - LOCAL   | ₹1,63,72,156.04   |
| **Total, 5 months**   | **≈ ₹25.3 crore** |

The **e-invoicing threshold is ₹5 crore AATO**, and has been since **1 August
2023**. They are roughly **12× above it annualised**.

**Why this is a compliance item and not a feature.** A B2B invoice without an
IRN is **treated as not issued**, and the recipient loses input tax credit. So a
Dealerlink invoice without an IRN does not merely look unfinished — it **costs
their dealer money**.

**Go-live scope = SP0 + SP1 + SP2 + e-invoice + e-way bill.** SP2 alone is not a
legal go-live point for them. Payment links stay post-go-live; they are not a
compliance item.

**E-way bill window.** For AATO above ₹20 crore, an e-way bill must be generated
**within 180 days of the invoice date**. Validate before submission rather than
failing at the API.

---

## 5. Open asks — questions for the client

Four things in the record are waiting on the client. None is a decision we can
take for them.

1. **Serials on the invoice PDF.** Serials in Tally are **not** required —
   confirmed by the client, and it simplifies the Tally export. Whether serials
   appear on the **invoice PDF** is a separate and still-open question.
   `docs/client-evidence/5.png` shows their current tax invoice carrying **26
   serials under one line item** across 4 pages, so the answer changes the
   document layout. **Confirm before F.7.**
2. **Barcode symbology, and therefore which scanner to buy.** Solar module
   labels commonly carry DataMatrix or QR, and **a cheap 1D laser scanner will
   fail on them**. Their observed format — `NSMG26080006959`, 15 alphanumeric —
   suggests Code 128 or DataMatrix. **Specify a 2D imager**, and confirm the
   symbology on their actual labels before they buy hardware.
3. **The serial format to validate against.** Panel labels often carry serial,
   model and power-class barcodes side by side, and the operator will scan the
   wrong one. Regex or prefix validation per product or per tenant, with a
   rejection beep, is 1–2 days of work and prevents a category of silent data
   corruption — but it needs their real label format to validate against.
4. **Scanner suffix must send CR/Enter.** Usually the default; some scanners
   need a configuration barcode. This is a **setup instruction, not code**, and
   it has to reach whoever configures their hardware.

### Scanner integration needs no code

Recorded here because it is easy to over-plan: USB and Bluetooth scanners run in
**HID keyboard mode** — they type the decoded string and send Enter. No driver,
no SDK, no native layer. The work is front-end only: a scan field that holds
focus, detects the terminator, appends, clears, refocuses, dedupes in-session,
and gives **audible feedback per scan** (the operator is looking at the panel,
not at the screen).

Phone-camera scanning needs `BarcodeDetector` or zxing and depends on the PWA
work. Out of scope for this phase.

---

## 6. Open decisions — serial capture at scan time

The client wants serials scanned **at invoice time** by barcode, flowing into
inventory. Dealerlink auto-reserves FIFO at **order confirmation** and picks at
**dispatch**.

**The resolution is swap-on-scan.** Keep FIFO reservation exactly as it is,
treat picked serials as provisional, and add one atomic
`swapReservedSerial(orderId, outSerialId, inSerialId)` called per scan. Every
existing invariant, lock and the concurrent-dispatch test survives untouched.
The alternative — quantity-based reservation with serials bound only at scan —
is architecturally cleaner but rewrites `confirmOrder`, `cancelOrder`,
`createDispatch` and every reservation test; take it only if warehouse bin
locations arrive later. **Reserve on quantity, assign on identity:** FIFO picking
_specific_ serials at order-confirm was always a fiction, because the warehouse
picks whatever panel is nearest.

Five rejection cases must be settled by the ADR, all of which occur in week one.
**Three are settled:**

- Serial reserved for a **different order** → hard fail, naming the order and
  the dealer.
- Serial is a **different product** than the line → fail.
- Serial already `dispatched` / `delivered` / `damaged` → fail.

**Two are open:**

1. **Fewer scans than the line quantity** → partial dispatch (which is
   supported) or block? **Open.** No recommendation is on record.
2. **Serial not in the system** → reject, or offer a quick-add? **Open.**
   **Recommendation on record: reject** — silent creation destroys the
   traceability that is the moat.

---

## 7. What stays in `docs/STAGE_F_BUILD_v3.md` and is deliberately not copied here

- **Finding 2 — Dealerlink has the same defect.** Single-rate document
  rendering, no HSN/SAC summary; F.3 and F.4 close it. **Internal only. Never
  appears in a client document.**
- **Finding 3 — negative stock.** `docs/client-evidence/3.png` shows
  `Stock: -84.00 NOS` in red while a 36-unit PFI is raised. Swipe permits
  invoicing against stock it does not have; Dealerlink's `confirmOrder` blocks it
  with `InsufficientInventoryError` naming the short product. **Demo this** — it
  is already built.
- **The GSP shortlist questions** (§2, D-1), the **Tally mapping design** (§6,
  F.11) and the **provider abstraction** (§6, F.23) — all specs rather than
  client facts.
