# STAGE_F_BUILD.md — v3

> Supersedes v2. Replace `docs/STAGE_F_BUILD_v2.md` with this file before
> running Day 22.
>
> **Changes from v2:**
>
> 1. **The task table is gone.** `docs/stage-f-tasks.json` is the single source
>    of truth; `PROJECT_PLAN.md` is generated from it via `pnpm plan:sync` and
>    guarded by `pnpm plan:check`. A hand-maintained third copy is the exact
>    drift that produced a stale `SECURITY_AUDIT.md` and a wrong Day 19 plan.
> 2. **CI is now a phase** (SP0.5). Day 21 established there is no CI anywhere.
> 3. **Typst migration inserted before the document work** (SP0.6).
> 4. **Go-live scope corrected** — e-invoice and e-way bill are legally required
>    for this client.
> 5. Items folded in from `POST_PILOT_WORK_ORDER.md`, with a note on what that
>    document got wrong.

---

## 0. Go-live scope

The client will not go live until SP2 completes. **SP2 alone is not a legal
go-live point for them.**

Screenshot 4 shows sales ledger closing balances for 1-Apr-26 to 1-Sep-26:

| Ledger                | Closing balance   |
| --------------------- | ----------------- |
| SALE @ 5% - CENTRAL   | ₹8,49,15,635.18   |
| SALE @ 5% - LOCAL     | ₹14,98,85,331.52  |
| SALES @ 18% - CENTRAL | ₹18,27,638.53     |
| SALES @ 18% - LOCAL   | ₹1,63,72,156.04   |
| **Total, 5 months**   | **≈ ₹25.3 crore** |

The e-invoicing threshold is ₹5 crore AATO and has been since 1 August 2023.
They are roughly 12× above it annualised. A B2B invoice without an IRN is
**treated as not issued**, and the recipient loses input tax credit — so a
Dealerlink invoice without an IRN costs their dealer money.

**Go-live scope = SP0 + SP1 + SP2 + e-invoice + e-way bill.** Payment links
stay post-go-live; they are not a compliance item.

---

## 1. Where the plan lives

| Artifact                             | Role                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `docs/stage-f-tasks.json`            | **Source of truth.** Task list, sequencing, status                          |
| `PROJECT_PLAN.md`                    | Generated between `<!-- STAGE_F_TASKS:START/END -->`. Never hand-edited     |
| `pnpm plan:sync` / `pnpm plan:check` | Regenerate / assert no drift. `plan:check` is in the verify chain           |
| **This file**                        | Decisions, specs for items whose detail lives nowhere else, client evidence |

To change the plan: edit the JSON, run `pnpm plan:sync`, commit both.

---

## 2. Decisions log

| #   | Decision                                                                    | Consequence                                                                |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| D-1 | **Third-party GSP** for e-invoice and e-way bill (ClearTax / Masters India) | Built behind a provider interface so the ERP-intermediary route stays open |
| D-2 | **Tally mapping is tenant-configurable**, not a fixed standard              | Module F.11                                                                |
| D-3 | **Ship-To GSTIN in SP1**                                                    | GSTN Advisory 661, effective 1 Aug 2026                                    |
| D-4 | **`dealer_addresses` over keeping Ship-To as a dealer**                     | ~5 d vs 2.7 d. Rationale in §4                                             |
| D-5 | **CI before schema work**                                                   | Day 22. Rationale in §3                                                    |
| D-6 | **Typst before the document work, not after**                               | Rationale in §5                                                            |

### D-1 — questions for the GSP shortlist, before signing

1. How does the API handle the **April 2026 MFA mandate** for automated
   generation? If a human second factor is needed per invoice, a
   queue-and-retry design does not work.
2. Can a taxpayer hold API user profiles with **more than one GSP**
   simultaneously? If yes, the client keeps Swipe's e-invoicing live through
   migration instead of a hard cutover.

Client ID and Secret are issued to service providers; the API username and
password are created by each taxpayer for their own GSTIN. That structure is
what keeps the ERP-intermediary path a later commercial decision rather than a
rewrite.

---

## 3. D-5 — why CI comes before schema work

Day 21 found: no `.github/`, no Actions in the repo or its history. The only
automation is DigitalOcean App Platform — `.do/app.yaml` and
`.do/app.production.yaml`, both `branch: main`, `deploy_on_push: true`,
build-only. **Every push to `main` has deployed to production having run
nothing but `next build`.**

The only gate has been a local suite that OOM-crashes (DEV.87/91) against a
database shared with manual test runs.

CI also fixes DEV.87 honestly rather than managing it: GitHub runners have
16 GB and a fresh database per run.

---

## 4. D-4 — `dealer_addresses`

Day 19 found Ship-To is a **dealer**, not an address: `shipToDealerId` on
performa invoices, orders and dispatches all reference `dealers`. Two options
were on the table — keep it (2.7 d) or add `dealer_addresses` (~5 d).

**Take the larger one.** The client's own evidence settles it: screenshot 3
shows Swipe with separate Billing Address and Shipping Address dropdowns on one
customer, and screenshot 2 has a Goa bill-to shipping to Kolhapur, Maharashtra.
One dealer, multiple delivery sites. The current model forces a fake dealer
record per project site — in solar distribution that is the main path, not an
edge case.

The cost argument runs the other way from the day estimate. The tax invoice,
credit note, e-invoice payload and e-way bill payload all **snapshot the
ship-to party**. Doing the cheap thing now means rewriting that snapshot in
four documents plus their PDFs plus both IRP payloads.

**Split into two tasks** so the risky part is isolated:

- **F.5a — schema, migration, place-of-supply rewiring (~3 d).** Touches
  ADR-012's derivation path, the most safety-critical logic in the codebase.
  Own day, own commit, own tests. **Write a superseding ADR.**
- **F.5b — GSTIN validation (~1.5 d).** Mostly promotion: a correct GSTN
  mod-36 checksum already exists in `lib/format/index.ts`, tested, wired only
  to the tenant's own GSTIN. Add the state-code cross-check and the
  required-when-different rule.

---

## 5. D-6 — Typst before the document work

`POST_PILOT_WORK_ORDER.md` §5 sequences the Typst migration fifth and advises
against starting within ~3 weeks of go-live. Go-live is ~60 days out, so the
window exists — and it belongs **immediately after CI, before F.3**.

**Sequencing.** SP1 authors or substantially rewrites four document surfaces:
the multi-rate tax block, the HSN/SAC summary table, the tax invoice (new), the
credit note (new), plus serial lists on invoice lines. Migrating afterwards
means writing all of that twice.

**Three reasons specific to this codebase:**

- **Kills DEV.89.** `@sparticuz/chromium` is x86-64 only; the devcontainer is
  arm64. The current gate means local tests exercise a different binary than
  production. That is a silent-divergence risk on the PDF path.
- **Relieves DEV.87.** Chromium is a large share of the ~8 GB verify peak.
- **Snapshot-testable PDFs on a legal document.** Chromium output is not
  byte-stable, so a tax invoice can only be verified by rendering and
  eyeballing it. SP1 is entirely about GST correctness on documents a dealer
  files ITC against.

**Fallback:** if Typst's markup is an unacceptable learning cost,
`@react-pdf/renderer` keeps JSX, runs in-process, and still removes Chromium —
weaker typography, no new language. **Decide before starting; do not switch
mid-migration.**

**Guardrails:** do not change any number that appears on a document. This is a
rendering change only — `packages/tax` is untouched. Supersede ADR-013, do not
delete it. Keep pg-boss; only the PDF job changes shape. Capture reference PDFs
for all four current paths (quotation, PI, payment receipt, dispatch note),
each with a branded tenant and both tax cases, before writing any Typst.

`POST_PILOT_WORK_ORDER.md` §5.6 proposes collapsing `apps/workers` into the web
app once rendering is in-process. Correct, and correctly flagged as a separate
item — **do not bundle it**.

---

## 6. Feature specs

Detail for items whose specification lives nowhere else. Sequencing lives in
the JSON.

### F.5a / F.5b — Ship-To addresses and GSTIN

See §4 for the rationale. GSTIN requirements:

- 15 characters: 2-digit state code, 10-char PAN, entity number, `Z`, checksum.
  **Validate the checksum**, not just the shape. The implementation exists.
- **Cross-check** the embedded state code against the address state. A mismatch
  is among the most common IRP rejections and is far cheaper to catch at entry.
- Required when Bill-To ≠ Ship-To; optional when identical.
- Block dispatch when required and missing, naming the dealer and address. Do
  not defer the failure to e-way bill generation.
- **Do not** let the GSTIN override place-of-supply derivation. Place of supply
  stays derived from the Ship-To _address_ state per ADR-012.

### F.11 — Tally mapping configuration

There is no universal chart of accounts. Screenshot 4 shows
`SALE @ 5% - CENTRAL` beside `SALES @ 18% - CENTRAL` — singular and plural in
the same ledger set. Tally XML import matches by **exact name string**, so a
mismatch either creates a duplicate ledger or rejects the voucher. That is the
precise failure the client hired us to fix, so a hardcoded mapping would
reproduce it.

**Core design: import, then select. Never free-type.**

1. **Import** the tenant's Tally masters (XML or Excel export) into a
   `tally_master_cache` holding exact names, parent groups and GUIDs.
2. **Map by dropdown**, sourced from that cache. No keyboard entry of a Tally
   name anywhere in the UI.
3. **Re-import** on demand, with a diff showing which mappings broke.

| Mapping            | Detail                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales ledgers      | `(GST rate × supply type)` → ledger. Rows generated from rates actually in use                                                                                          |
| Output tax ledgers | CGST / SGST / IGST, optionally rate-wise                                                                                                                                |
| Round-off ledger   | Screenshot 5 shows `ROUND OFFS 0.46`; without it the voucher will not balance                                                                                           |
| Party ledgers      | Dealer → ledger, plus the parent group for auto-creation (typically Sundry Debtors)                                                                                     |
| **Stock items**    | **Not optional.** Screenshot 5 holds `Premier NDCR TOPCON G12R 615 wp` while their Swipe catalog holds `Premier Energies 620wp topcon dcr`. Tally matches stock by name |
| Units              | Dealerlink UOM → Tally symbol (`NOS`, `OTH` in the screenshots)                                                                                                         |
| Purchase ledgers   | Same structure, for the vendor bill export                                                                                                                              |

**Guardrails:** export is blocked, loudly, when any mapping is incomplete —
never fall back to a default name, never auto-create a ledger silently. Mapping
changes are audit-logged with before/after. Provide a **preview mode** that
resolves one invoice's ledger names before committing to a period export.

### F.23 — GSP provider abstraction

Built before the e-invoice work so that work targets an interface, not a vendor.

- `EInvoiceProvider`: `generateIrn`, `cancelIrn`, `generateEwb`, `updatePartB`,
  `extendEwb`, `cancelEwb`. One concrete implementation, kept honest by a stub.
- **Per-tenant credentials** encrypted at rest: the tenant's GSTIN, API
  username and password. Client ID and Secret are ours, per environment.
- Sandbox/production toggle **per tenant**.
- Credentials never logged, never returned, never in error messages.

### E-way bill note

Must be generated **within 180 days of invoice date** for AATO above ₹20 crore.
Validate before submission rather than failing at the API.

---

## 7. Client evidence

Files in `docs/client-evidence/`. Prospect: Maharudra Agencies, running Swipe +
TallyPrime Silver.

### Finding 1 — mixed-rate invoices collapse into one Tally ledger

Screenshot 5, voucher `MA/26-27/1079`:

| Item                           | Qty | Amount         | Rate |
| ------------------------------ | --- | -------------- | ---- |
| Premier NDCR TOPCON G12R 615wp | 1   | ₹8,917.50      | 5%   |
| PEDLER LB SWITCH-40A           | 4   | ₹3,712.00      | 18%  |
|                                |     | **₹12,629.50** |      |

Tally shows a single `SGST - OUTPUT` of **₹557.02** = `8,917.50 × 2.5%` +
`3,712.00 × 9%` = `222.94 + 334.08`. Two rates summed into one line. The
four-ledger structure in screenshot 4 cannot be reconciled from that. The same
voucher reads `Syncronized: No` and `Provide e-Invoice details: No`.

**Their Tally Sync is enabled and running.** They tried it; it fails on exactly
this. Never claim Swipe lacks Tally sync — the accurate and stronger claim is
that their sync collapses ₹222.94 + ₹334.08 into one ledger line.

### Finding 2 — Dealerlink has the same defect

The Day 10 document spec renders tax as _"CGST @ X% + SGST @ X% (intra-state)
OR IGST @ X%"_ — single-rate per document, with no HSN/SAC summary table.
Swipe's preview (screenshot 2) handles this correctly. **In a mixed-rate
side-by-side demo today, Dealerlink loses.** F.3 and F.4 close it.

**Internal only. Never appears in a client document.**

### Finding 3 — negative stock

Screenshot 3 shows `Stock: -84.00 NOS` in red while a PFI for 36 units is
raised. Swipe permits invoicing against stock it does not have. Dealerlink's
`confirmOrder` blocks this with `InsufficientInventoryError` naming the short
product. **Demo this** — it is already built.

### Finding 4 — serial capture is a design decision

The client wants serials scanned **at invoice time** by barcode, flowing into
inventory. Dealerlink auto-reserves FIFO at **order confirmation** and picks at
**dispatch**.

**Resolution: swap-on-scan.** Keep FIFO reservation exactly as is; treat picked
serials as provisional. Add one atomic `swapReservedSerial(orderId, outSerialId,
inSerialId)` called per scan. All existing invariants, locks and the
concurrent-dispatch test survive untouched. The alternative — quantity-based
reservation with serials bound only at scan — is architecturally cleaner but
rewrites `confirmOrder`, `cancelOrder`, `createDispatch` and every reservation
test. Take it only if warehouse bin locations arrive later.

**Reserve on quantity, assign on identity.** FIFO picking _specific_ serials at
order-confirm was always a fiction; the warehouse picks whatever panel is
nearest.

Five rejection cases the ADR must settle, all of which occur in week one:

- Serial reserved for a **different order** → hard fail, name the order and dealer
- Serial is a **different product** than the line → fail
- Serial already `dispatched` / `delivered` / `damaged` → fail
- **Fewer scans than line quantity** → partial dispatch (supported) or block. _Open_
- **Serial not in the system** → reject or quick-add. _Open._ Recommend reject;
  silent creation destroys the traceability that is the moat

### Scanner integration — none required

USB and Bluetooth scanners run in **HID keyboard mode**: they type the decoded
string and send Enter. No driver, no SDK, no native layer. Front-end only — a
scan field that holds focus, detects the terminator, appends, clears, refocuses,
dedupes in-session, and gives **audible feedback per scan** (the operator is
looking at the panel, not the screen).

Three real decisions:

- **Specify a 2D imager.** Solar module labels commonly carry DataMatrix or QR.
  A cheap 1D laser scanner will fail. Their format (`NSMG26080006959`, 15
  alphanumeric) suggests Code 128 or DataMatrix.
- **Serial format validation per product or tenant.** Panel labels often carry
  serial, model and power-class barcodes side by side; the operator will scan
  the wrong one. Regex or prefix validation with a rejection beep. 1–2 days, and
  it prevents a category of silent data corruption.
- **Scanner suffix must send CR/Enter.** Usually default; some need a config
  barcode. Setup instruction, not code.

Phone-camera scanning needs `BarcodeDetector` or zxing and depends on the PWA
work. Out of scope for this phase.

### Serials in Tally — not required

Confirmed by the client. Simplifies the Tally export. Serials on the **invoice
PDF** (as screenshot 1 does, 26 under one line) are a separate question —
confirm before F.7.

---

## 8. `POST_PILOT_WORK_ORDER.md` — what it got wrong

> **Day 22 finding — the file is NOT in this repo.** `POST_PILOT_WORK_ORDER.md`
> has never existed in any commit, on any branch (`git log --all --name-only`
> finds no path matching it). It was a planning artefact of a previous session
> that was never committed. Day 22 was asked to add a superseded-header to it
> and correct its stale facts; there is nothing to edit. **This section is
> therefore the only surviving record of that document** — which is exactly
> what the paragraph below already claimed for its §5 and §6. Everything
> actionable from it is now scheduled in `docs/stage-f-tasks.json`
> (F.34–F.37, F.42, F.50, F.51). Do not go looking for the file.

That document is superseded where it conflicts with `stage-f-tasks.json`. Its
§5 (Typst) and §6 (retrospective) reasoning is preserved above and is the only
place it is written down. Stale facts:

| Claim                                    | Reality                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-4 drizzle-orm open                     | **Closed** — F.2a, `e787efc`, 0.45.2                                                                                                               |
| ~503 tests, 57–59 specs                  | 560 vitest, 65 verify                                                                                                                              |
| Continue deviations from DEV.82          | Continue from **DEV.92** (Day 21). DEV.87 resolved by DEV.91; DEV.91 closed; DEV.89 stands as a permanent harness note, and F.38 removes its cause |
| `PROJECT_PLAN.md` stale since 2026-06-02 | Carries a generated Stage F table                                                                                                                  |
| F-1/F-2/F-3 status ambiguous             | All closed (Stage C.4 / D.2)                                                                                                                       |

It also predates the two largest findings of this phase: **there is no CI**, and
the client's turnover puts **e-invoicing legally in go-live scope**.

**Reject §1.1's instruction to delete `docs/UX_FINDINGS.md`.** P-7 and P-8 are
scheduled in F.3; P-10, P-11 and P-12 are scheduled in SP4. It is durable
reference now, not pilot residue.

**Accept and schedule:** delete `docs/pilot/credentials-cheatsheet.md` with the
`git log -p --all -- docs/pilot/` history check (rotate if anything real is
there); downsize production with all three coupled parameters together, plus a
**restore-before-go-live** task so it cannot be forgotten; fix the
`RESEND_FROM_EMAIL` drift between the committed spec and live config; docs
restructure via `git mv`; the E.7 retrospective.

**Defer:** vendor Lucia to SP4 hardening — right call eventually, but it is an
auth change with real blast radius, no forcing function, and it touches the
force-password-rotation trapdoor. Escalate if a CVE lands. Also F-9 logo
validation, DO Spaces, F-5 `email_delivery_log` scope, DEV.79 BetterStack,
`SENTRY_RELEASE`, Resend MX.

**The retrospective is the highest-value item in that document.** UMA never
started and produced zero usage data. Whatever stopped them is waiting for the
next client. That conversation costs no engineering time and should shape the
backlog more than any technical finding.

---

## 9. Standing guardrails

- `packages/tax` and its fixtures, RLS policies, `adminDb`, audit triggers and
  `critical-path.spec.ts` are protected. No refactor without an explicit
  instruction.
- Place of supply is Ship-To for goods, IGST Act §10, ADR-012.
- `gstRate` returns as a **string**. Any grouping by rate must normalise to
  numeric first, or `'18'` and `'18.00'` become separate groups.
- Money is read from stored columns, never recomputed.
- From Day 23, days land via branch and PR with green CI. No direct pushes to
  `main`.
- Never hand-edit the `PROJECT_PLAN.md` task table.
