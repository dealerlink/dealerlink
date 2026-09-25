# CLIENT_CONTEXT.md — the prospect, and what we know about them

> **THE RULE THAT GOVERNS THIS FILE — operator ruling, 2026-09-16, closing F.80.**
>
> | File                          | Role                                                                                                                   |
> | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
> | `docs/STAGE_F_BUILD_v3.md` §7 | **The evidence record.** Provenance and reasoning. Written once, rarely changed.                                       |
> | **This file**                 | **The working reference.** What a session reads before a client-facing task. Changes as asks close and decisions land. |
>
> **This file cites §7 as its source and duplicates no reasoning: facts and
> pointers only.** Where the two disagree, **§7 wins and the copy is the bug** —
> fix it here, not there.
>
> That rule exists because the drift is not hypothetical. §7's own citations
> once resolved to the wrong image — every one of them — in a document that Day
> 26 and Day 27 both read for context, and each wrong citation looked exactly as
> authoritative as a right one. Two copies of the same reasoning fail the same
> way and more quietly.
>
> **What is NOT here:** anything about this prospect that was never written into
> `docs/STAGE_F_BUILD_v3.md`. This file consolidates the record; it does not
> extend it. If you remember something that is in neither file, it is written
> down nowhere and it should be.

---

## 1. Who they are

**Maharudra Agencies.** A prospect, not the pilot tenant. Solar panel
distribution. Running **Swipe** (invoicing) alongside **TallyPrime Silver**
(accounts), with Swipe's Tally Sync enabled.

Five screenshots in `docs/client-evidence/`.

---

## 2. Cite the client's screenshots by FILENAME

The original delivery-order numbers are the **exact reverse** of the filenames.
The files were **not** renamed — the filenames are load-bearing in capture
provenance under `docs/pdf-references/`. How that was found and verified: §7,
"Citations in this document refer to FILENAMES".

| original citation | file    | what it shows                                                                                                         |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Screenshot 1      | `5.png` | Tax invoice `MA/26-27/1094`, total ₹4,23,150.00 — **26 serials under one line item**, 4 pages                         |
| Screenshot 2      | `4.png` | Swipe PFI-2033 preview, total ₹5,76,955.00 — Goa bill-to → Kolhapur ship-to, and **mixed-rate** (2.5%/2.5% and 9%/9%) |
| Screenshot 3      | `3.png` | Swipe PFI create screen — `Stock: -84.00 NOS` in red against a 36-unit PFI                                            |
| Screenshot 4      | `2.png` | TallyPrime Group Summary — `SALE @ 5% - CENTRAL` beside `SALES @ 18% - CENTRAL`                                       |
| Screenshot 5      | `1.png` | TallyPrime voucher `MA/26-27/1079`, total ₹13,744.00 — carries `ROUND OFFS 0.46`                                      |

**When adding a citation, use the filename.**

---

## 3. The ₹557.02 voucher

`docs/client-evidence/1.png` — TallyPrime voucher **`MA/26-27/1079`**, total
**₹13,744.00**.

| Item                           | Qty | Amount         | GST rate |
| ------------------------------ | --- | -------------- | -------- |
| Premier NDCR TOPCON G12R 615wp | 1   | ₹8,917.50      | 5%       |
| PEDLER LB SWITCH-40A           | 4   | ₹3,712.00      | 18%      |
|                                |     | **₹12,629.50** |          |

Tally shows **one** `SGST - OUTPUT` line of **₹557.02**:

```
8,917.50 × 2.5%  =  222.94
3,712.00 × 9.0%  =  334.08
                    ------
                    557.02
```

Two rates, one ledger line. The voucher also reads `Syncronized: No` and
`Provide e-Invoice details: No`. The four-ledger structure in
`docs/client-evidence/2.png` cannot be reconciled from that figure. Why this is
the defect they hired us to fix: §7, Finding 1.

**Their Tally Sync is enabled and running.** It fails on exactly this.
**Never claim Swipe lacks Tally sync** — the accurate and stronger claim is that
their sync collapses ₹222.94 + ₹334.08 into one ledger line.

### The round-off on the same voucher

```
12,629.50 + 557.02 (CGST) + 557.02 (SGST)  =  13,743.54
                                 + 0.46 round-off
                                 =  13,744.00   ← the voucher total
```

**The CGST leg is inferred, not quoted.** §7 states only the `SGST - OUTPUT`
line of ₹557.02. An equal CGST follows from this being an intra-state sale and
is corroborated by reproducing the voucher total to the paisa, `ROUND OFFS 0.46`
included. For the CGST line as evidence, read it off `docs/client-evidence/1.png`.

Without a round-off ledger the voucher will not balance. F.4 (multi-rate
summary) and F.6 (round-off row) land in the same renderer component and are one
piece of work; the argument is in F.4's notes in `docs/stage-f-tasks.json`.

The mixed-rate document to render against is `docs/client-evidence/4.png`,
Swipe's own PFI-2033 preview, which carries two rate pairs on one document:

| Line             | CGST       | SGST       |
| ---------------- | ---------- | ---------- |
| 2.5% / 2.5% pair | ₹13,671.00 | ₹13,671.00 |
| 9.0% / 9.0% pair | ₹211.50    | ₹211.50    |

---

## 4. Turnover and the ₹5 crore e-invoicing threshold

`docs/client-evidence/2.png`, sales ledger closing balances **1-Apr-26 to
1-Sep-26**:

| Ledger                | Closing balance   |
| --------------------- | ----------------- |
| SALE @ 5% - CENTRAL   | ₹8,49,15,635.18   |
| SALE @ 5% - LOCAL     | ₹14,98,85,331.52  |
| SALES @ 18% - CENTRAL | ₹18,27,638.53     |
| SALES @ 18% - LOCAL   | ₹1,63,72,156.04   |
| **Total, 5 months**   | **≈ ₹25.3 crore** |

- **E-invoicing threshold: ₹5 crore AATO**, since **1 August 2023**. They are
  roughly **12× above it annualised**.
- A B2B invoice **without an IRN is treated as not issued**, and the recipient
  **loses input tax credit**.
- **Go-live scope = SP0 + SP1 + SP2 + e-invoice + e-way bill.** SP2 alone is not
  a legal go-live point for them. Payment links stay post-go-live.
- **E-way bill:** for AATO above ₹20 crore, generate **within 180 days of the
  invoice date**. Validate before submission rather than failing at the API.

Source and full argument: §0 Go-live scope; the e-way bill window is §6.

---

## 5. Open asks — waiting on the client

None of these is a decision we can take for them.

> **THE OUTSTANDING EMAIL IS OVERDUE, and it carries two lists, not one.**
> Recorded here because the asks and the tax questions live in different files and
> whoever sends it needs both.
>
> - **Four client asks** — the four numbered below. Answerable by the client.
> - **Four tax questions** — the numbered list in `docs/GST_RATE_MODEL_AUDIT.md`:
>   the current slab set, the transitional treatment of pre-22-Sep-2025 rates,
>   whether GSTR-1 Table 12 needs the HSN summary per (HSN, rate) pair, and — added
>   2026-09-25 — whether IGST Act §10(1)(b) makes place of supply the buyer's
>   location in a bill-to/ship-to case. These need their **CA**, not the client.
>
> **Question 4 is the one that blocks work.** It is tracked as **F.112** (HIGH),
> F.5a should not be built before it is answered, and the evidence is the client's
> own shipped invoice — `docs/client-evidence/4.png` charges CGST + SGST on a
> Goa-to-Maharashtra supply where ADR-012 would render IGST. The other three are
> queued so the codebase stops carrying unverified statutory claims as
> justifications; nothing is blocked on them.

1. **Serials on the invoice PDF.** Serials in Tally are **not** required
   (confirmed by the client). Whether serials appear on the **invoice PDF** is
   open — `docs/client-evidence/5.png` carries 26 under one line item across 4
   pages, so the answer changes the layout. **Confirm before F.7.**
2. **Barcode symbology, and therefore which scanner to buy.** Their observed
   format is `NSMG26080006959` — 15 alphanumeric, suggesting Code 128 or
   DataMatrix. **Specify a 2D imager**; a 1D laser scanner fails on the
   DataMatrix and QR labels common on solar modules. Confirm against their
   actual labels before they buy.
3. **The serial format to validate against.** Needs their real label format.
   Regex or prefix validation per product or per tenant, 1–2 days.
4. **Scanner suffix must send CR/Enter.** Usually the default; some scanners
   need a configuration barcode. A **setup instruction, not code** — it has to
   reach whoever configures their hardware.

**Scanner integration needs no code.** USB and Bluetooth scanners run in **HID
keyboard mode**: they type the decoded string and send Enter. No driver, no SDK,
no native layer. Front-end only — a scan field that holds focus, detects the
terminator, appends, clears, refocuses, dedupes in-session, and gives **audible
feedback per scan**. Phone-camera scanning needs `BarcodeDetector` or zxing,
depends on the PWA work, and is out of scope for this phase.

---

## 6. Open decisions — serial capture at scan time

The client wants serials scanned **at invoice time** by barcode, flowing into
inventory. Dealerlink auto-reserves FIFO at **order confirmation** and picks at
**dispatch**.

**Decision: swap-on-scan.** Keep FIFO reservation as it is, treat picked serials
as provisional, add one atomic
`swapReservedSerial(orderId, outSerialId, inSerialId)` per scan. Slogan:
**reserve on quantity, assign on identity.** The rejected alternative and the
condition that would revive it are in §7, Finding 4.

Five rejection cases must be settled by the ADR. **Three are settled:**

- Serial reserved for a **different order** → hard fail, naming the order and
  the dealer.
- Serial is a **different product** than the line → fail.
- Serial already `dispatched` / `delivered` / `damaged` → fail.

**Two are open:**

1. **Fewer scans than the line quantity** → partial dispatch (supported) or
   block? **Open.** No recommendation on record.
2. **Serial not in the system** → reject, or quick-add? **Open.**
   **Recommendation on record: reject.**

---

## 7. In §7, deliberately not copied here

- **Finding 2 — Dealerlink has the same single-rate defect.** F.3 and F.4 close
  it. **Internal only. Never appears in a client document.**
- **Finding 3 — negative stock.** `docs/client-evidence/3.png`;
  Dealerlink's `confirmOrder` already blocks it with
  `InsufficientInventoryError`. **Demo this.**
- **The GSP shortlist questions** (§2, D-1), the **Tally mapping design** (§6,
  F.11) and the **provider abstraction** (§6, F.23) — specs, not client facts.
