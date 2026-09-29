# Invoice / credit note / debit note — enumeration for a combined F.6 spec

> **Audit only. Nothing was fixed.** Commissioned 2026-09-29 as input to a spec
> the operator writes; the operator's invocation said, in terms, *do not fix
> anything found*.

## Provenance

| | |
| --- | --- |
| **Audited by** | the `code-auditor` subagent (`.claude/agents/code-auditor.md`), in its own context window, one invocation, 72 tool uses, 183,763 tokens, 551 s |
| **Tools it had** | **`Read`, `Grep`, `Glob` — and nothing else.** No `Bash`, no `Write`, no `Edit`. It could not execute a command, run a test, query a database or edit a file |
| **Transcribed by** | the main thread, 2026-09-29 |
| **Transcription method** | **mechanical, not retyped.** Everything below the horizontal rule is the agent's `SubagentHandback` message, extracted from the subagent transcript and concatenated programmatically, `cmp`-verified identical to the extracted original (SHA-256 `6933bf35d83cf3b5…`, 35,961 bytes). The main thread wrote this header and nothing else |
| **Tree audited** | `main`, before PR #81 merged |

### Why the transcription method is stated

The main thread's context was compacted between receiving this report and writing
it to a file, so the report was no longer in context to retype. It was recovered
from the session's own subagent transcript and concatenated programmatically.
Retyping a 35,663-character report from a summary would have produced a
*paraphrase presented as a verbatim record*, which is the one thing a transcript
must not be. **Nothing below is compressed, summarised, reordered or corrected**
— including the things the main thread believes are wrong, which are flagged
here and left untouched there.

**This file is exempt from `prettier` in `.prettierignore`, and that exemption is
the one repository-config change this audit required.** The pre-commit hook runs
`prettier --write` on every `.md` file, and on this one it does not merely
reformat. It pairs the underscores in a bare path with a nearby emphasis run and
rewrites `TAX_INVOICE_AUDIT.md:96` as `TAX*INVOICE_AUDIT.md:96` — a corrupted
file reference inside a document whose entire value is being exact. Measured by
diffing the two files' whitespace-split token streams, which is also how the
claim that nothing else changed was checked; the only other differences were
emphasis delimiters and table padding. An unformatted verbatim record is the
point of a verbatim record, while a formatted one with a mangled path in it is a
worse document that looks tidier. The identical asterisk/underscore pairing
hazard is already on record for the plan renderer at `DEVIATIONS.md:5290`.

## Two caveats that bound what this report can be used for

**1 — It audited `main` before #81 merged, so F.144 reads as absent.** Q3
states, correctly for the tree it read: *"there is no debit-note row … So the
operator's combined spec would be adding a third document that has never been
planned, not merging three planned rows."* That was true when measured and is
**false now**: the parity revision filed **F.144** ("Debit note — not built and
NOT ON THE PLAN AT ALL until now"), and it merged in PR #81 the same day. The
report's *enumeration* was right — the row genuinely did not exist in the tree it
read — and the sentence about the plan is stale rather than mistaken. Its
substantive point survives entirely: the debit note has no code, and F.8 (credit
note) still has `"notes": null`.

**2 — `computeTax`'s negative-line throw was verified by READING, not by
EXECUTING.** The report says so itself, in its own closing words: *"I did not
confirm that `computeTax` actually throws on a negative quantity, only that
`compute.ts:151-156` says it does."* This matters more than a normal caveat,
because that throw is load-bearing for the whole credit-note design — the report
concludes from it that a credit note cannot pass negative lines through the
existing engine, and therefore that either the document carries positive lines or
`packages/tax` changes, which is a protected surface requiring a §10.1
stop-and-ask. **A claim that decides a protected-surface question should be
executed before the spec relies on it.** The agent could not execute anything, so
this is a limit of the instrument and not a lapse: it reported the limit rather
than rounding a read to a measurement.

## One discrepancy inside the report, flagged and NOT corrected

Q1's section "Where `docs/TAX_INVOICE_AUDIT.md` is NOW WRONG" says the doc's
mechanics *"have drifted in **eight** places"* and then enumerates **nine**,
numbered 1–9. The enumeration is the evidence and the count is derived from it,
so per C6b the enumeration is what to trust — and the pointer added to
`docs/TAX_INVOICE_AUDIT.md` names **nine**. The word "eight" is left exactly as
written, because an audit report is a record of what an auditor said.

---

# Enumeration for a combined tax-invoice / credit-note / debit-note spec

**Instrument note.** Every negative below is an **affirmative enumeration** (a complete list read in full) unless I explicitly label it "grep-only". My `Grep` is ripgrep-backed; I have no Bash, so I never touched the `grep` shim of DEV.115. I could **not** read the BRD `.docx` (no Bash, and F.128 records that it is unreadable to tooling) — so every statement about what GST law or the BRD *requires* below is drawn from code comments and repo docs, and I flag it where it matters.

---

## Q1 — What exists of the tax-invoice path today?

# VERDICT: DOES NOT EXIST

Declaration-only placeholders in five places. Zero write paths, zero read paths, zero routes, zero template, zero tests.

### LAYER-BY-LAYER

| Layer | State | Evidence |
|---|---|---|
| **schema** | **absent** | `Glob packages/db/src/schema/*` → 24 paths read in full: 23 modules + `index.ts`. `performa-invoice.ts` exists; there is no `invoice.ts`, `credit-note.ts` or `debit-note.ts`. Barrel `/workspace/packages/db/src/schema/index.ts:5-27` exports **23** modules, read line by line — none is an invoice module. |
| **migration** | **absent** | `Glob packages/db/migrations/*.sql` → 21 files (`0000`–`0020`), read in full. No invoice DDL. |
| **RLS** | **absent** | `Glob packages/db/src/rls/*` → 22 files read in full (20 table policies + `00-app-role.sql`, `00-helpers.sql`). No `invoices.sql`. |
| **audit trigger** | **absent** | `/workspace/packages/db/src/triggers/audit-log.sql` — **25** `CREATE TRIGGER audit_trg` stanzas enumerated (`:157`–`:305`). No invoice table among them. |
| **enums** | **placeholder present** | `generated_document_type` includes `'invoice'` at `/workspace/packages/db/src/schema/generated-document.ts:17`; `RenderableDocumentType` at `/workspace/apps/workers/src/jobs/render-pdf.ts:39`; Zod arm at `/workspace/packages/schemas/src/email.ts:57`. |
| **numbering — write** | **absent** | Complete `nextCounter` call-site set. Production: `document-counter.ts:44` → `'dealer'` (fy 0); `dispatch/create.ts:92` → `'dispatch'`; `quotations/helpers.ts:242` → `'quotation'`; `procurements/create-procurement.ts:20` → `'procurement'`; `payments/helpers.ts:38` → `'payment'`; `deals/create-deal.ts:45` → `'deal'`; `pi/helpers.ts:168` via `allocateDocumentNumber`, whose parameter type is literally `docType: 'performa_invoice' \| 'order'` (`/workspace/apps/web/lib/actions/pi/helpers.ts:164`). **`'invoice'` is allocated nowhere.** |
| **prefix — read** | **absent** | Complete `prefixes[...]` read-key set (5 sites): `'dispatch'`, `'proforma'`, `'order'`, `'payment'`, `'quotation'`. Plus `prefixes[k.key]` in the admin form. **`prefixes['invoice']` is read by nothing.** |
| **prefix — write** | **present, and live** | `doc_prefixes` default includes `invoice: 'INV'` (`tenant-settings.ts:47`, migration `0000_cultured_iron_man.sql:32`). `docPrefixesSchema` at `/workspace/apps/web/lib/admin/schemas.ts:70` makes `invoice` **required**. The operator UI renders an editable "Tax invoice" prefix at `/workspace/apps/web/app/admin/tenants/[id]/tenant-detail-sections.tsx:817` and it really persists via `updateTenantDocPrefixes` → `update-tenant.ts:110`. **An operator can configure the prefix of a document that cannot be created.** |
| **write path** | **absent** | `Glob apps/web/lib/actions/**/*.ts` → **60** files read in full. No `invoices/` directory, no credit/debit note action. |
| **read path** | **absent** | `Glob apps/web/lib/queries/*` → **11** modules read in full: audit, dealers, deals, dispatch, generated-documents, orders, payments, procurements, quotations, products, performa-invoices. No invoice query module. |
| **routes/UI** | **absent** | `Glob apps/web/app/**/page.tsx` → **50** paths read in full. No `/invoices`, `/credit-notes`, `/debit-notes`. Sidebar `NAV_ITEMS` at `/workspace/apps/web/components/shell/Sidebar.tsx:23-35` — **11** entries enumerated + Settings at `:135`; no invoice entry. The orders route dir contains exactly 3 occurrences of "invoice", all "performa invoice" (`orders/page.tsx:132,135`, `orders/[id]/page.tsx:136`) — **no "Generate tax invoice" control**. |
| **template** | **absent** | `Glob apps/workers/src/templates-typst/**/*` → **5** files read in full: `quotation.typ`, `performa-invoice.typ`, `payment-receipt.typ`, `dispatch-note.typ`, `_lib/chrome.typ`. No `tax-invoice.typ`. |
| **loader** | **absent** | `Glob apps/workers/src/templates/*` → 7 files: 4 `load*PdfData` modules + `styles.ts`, `tax-groups.ts`, `types.ts`. No invoice loader. |
| **render job** | **guard throws** | `/workspace/apps/workers/src/jobs/render-pdf.ts:65-76` is a **negative allow-list** of four types; `'invoice'` throws `render-pdf: documentType "invoice" is not implemented yet` **by omission**, not via an explicit case. |
| **enqueue** | **absent** | Complete `documentType:` literal set at enqueue sites: `'quotation'` (×4), `'performa_invoice'` (×3), `'dispatch'` (×3), `'payment_receipt'` (×3). **No site constructs `'invoice'`.** |
| **permissions** | **nothing to gate** | No action exists. CLAUDE.md §6 promises Accounts "generate invoices" — unimplemented. |
| **tests** | **absent** | `Glob packages/*/tests/**/*.test.ts` → **20** files read in full; `Glob apps/**/*.spec.ts` → **27** e2e specs read in full. None is an invoice/credit-note/debit-note spec. |

### A significant divergence the Day 19 audit could not have seen

`RenderableDocumentType` (5 arms, incl. `'invoice'`, `render-pdf.ts:36-41`) and **`RenderableKind`** (4 arms, `'invoice'` **absent**, `/workspace/apps/workers/src/pdf/view-model.ts:30`) are now two different unions. `TEMPLATE_FOR` (`:72`), `FOOTER_LABEL` (`:64`) and `filenameFor` (`:180`) are all keyed on the **4**-arm `RenderableKind`. So F.6 must add an arm to `RenderableKind` and entries to three config objects, plus the `filenameFor` switch — work that did not exist when the Day 19 audit was written.

### Where `docs/TAX_INVOICE_AUDIT.md` is NOW WRONG

The verdict (Part A, `:21`) **holds** — I re-derived it above independently, then read the doc. Credit where due: F.6's notes in `docs/stage-f-tasks.json:200` already record a Day-24 re-derivation on the same enumerations I used (`nextCounter` call sites, `documentType:` literals, `prefixes[...]` keys, directory listings), so my method here is a **third** confirmation, not a discovery. But the doc's *mechanics* have drifted in eight places:

1. **§A.4's hard block is LIFTED.** "Prerequisite: F.3 + F.4 must land first" — F.3 and F.4 are both `"status": "complete"` (`stage-f-tasks.json:131`, `:158`, F.4 completed 2026-09-24). The multi-rate summary and HSN/SAC table now exist and are live (`quotation.typ:111`, `:129-151`).
2. **§A.1 row 4 / §A.3 / §A.4 item 7 name the wrong renderer.** They say the template is `apps/workers/src/templates/tax-invoice.tsx` reusing "Header / PartyBlock / Footer / TaxSummary". Since ADR-015 (Day 27) the live renderer is **Typst**. `apps/workers/src/templates/_components/` **still exists** with 6 React components (`Footer.tsx`, `Header.tsx`, `LineItemsTable.tsx`, `PartyBlock.tsx`, `SerialsTable.tsx`, `TaxSummary.tsx`) — all **dead code**: `render-pdf.ts:30-34` imports only `TEMPLATE_FOR`, `buildViewModel` and the four `load*PdfData` loaders. The real target is `templates-typst/tax-invoice.typ` + `_lib/chrome.typ`.
3. **§A.1 row 8 cites `_components/Footer.tsx`** for bank details. The live one is `footer-block` at `_lib/chrome.typ:395`.
4. **§A.5's CHECK constraint column is false.** It says `gstRate IN (0,5,12,18,28)`. All four `*_gst_rate_chk` constraints are now `gst_rate >= 0` — e.g. `performa-invoice.ts:197`. F.55 / migration `0018_smiling_bill_hollister` closed this.
5. **§A.5's 3% warning is obsolete.** "The CHECK omits 3%" — closed by F.55.
6. **§A.5's reasoning for normalising `gstRate` is the wrong mechanism.** It says `'18'` and `'18.00'` "become two buckets". CLAUDE.md §5 / DEV.135 / F.82 establish this cannot happen on a `decimal(5,2)` column. Right conclusion, wrong reason — and the `Set`-of-rates derivation at `performa-invoice.tsx:162` relies on the *correct* premise.
7. **§A.5's line citations are stale** (e.g. `performa-invoice.ts:157` for `hsnCode`; actual `:179`).
8. **§B.1 is now flatly false.** "There is **no separate shipping-address entity.** Ship-To is a dealer row, full stop." F.5a landed **option (b)**: `/workspace/packages/db/src/schema/dealer-address.ts` exists, with RLS (`rls/dealer-addresses.sql`), an audit trigger (`audit-log.sql:199-201`) and tests. Also §A.3/§B.5 cite **ADR-012**, now **superseded by ADR-016** (`performa-invoice.ts:72-74`, `order.ts:75-77`).
9. Minor: "22 schema files" → now **23**; `render-pdf.ts:28,56` → now `:36` and `:65-76`.

---

## Q2 — Where does round-off land, given F.101's per-line discount allocation?

# VERDICT: DOES NOT EXIST in code. The only round-off artefact in the repo is a documented, caller-driven **insertion point** in a comment.

### Does any round-off exist?

**No.** Established three ways:

- **Enumerated columns**, not searched: `quotations`, `performa_invoices`, `orders` each carry exactly seven money columns (`subtotal`, `discountAmount`, `taxableAmount`, `cgstAmount`, `sgstAmount`, `igstAmount`, `totalAmount`) — e.g. `performa-invoice.ts:103-109`, `order.ts:95-101`. No `round_off`. `payments` carries `amount`/`allocatedAmount` only; the three dispatch tables carry no money at all. `docs/F3_F4_AUDIT.md` §6.5 reached this first, by the same method; I credit it and confirm it.
- **`packages/tax/` read in full** (`compute.ts`, `round.ts`, `summary.ts`, plus `decimal.ts`, `types.ts`, `serialize.ts`, `state.ts`, `place-of-supply.ts` enumerated via Glob). Three independent statements that it is deliberately absent: `round.ts:22-29`, `compute.ts:28-29` ("No round-off adjustment is modelled here; that is F.6"), `summary.ts:25-26` and `:106` ("`totals` carries no `roundOff` field by design").
- **`roundOff` appears exactly ONCE in all of `apps/workers/`** — `_lib/chrome.typ:346`, inside a comment. (The 14 `"roundOff": null` entries in `docs/pdf-references-day25-signoff/reference-metadata.json` are harness *measurements* recording that no round-off text was found.)

### Current rounding order — PER LINE, summed upward

From `/workspace/packages/tax/src/compute.ts`:
- **Phase 2** `:42` — each line subtotal `round2(qty × price)`; document `subtotal` = **sum of rounded line subtotals** (`:44`).
- **Phase 3** `:47` — document discount rounded **ONCE** at document level, then **allocated downward** by largest remainder (`allocateDiscount`, `:230-268`), so `sum(lineDiscount) === discountAmount` **exactly**. `taxableAmount = subtotal − discountAmount` (`:56`).
- **Phase 4** `:95-100` — per-line CGST/SGST/IGST each `round2`'d.
- **Phase 5** `:121-132` — document tax totals = **sums of the already-rounded per-line taxes**; `totalAmount = taxableAmount + cgst + sgst + igst`.

`round.ts:15-20` records the deliberate asymmetry: **tax rounds up, discount allocates down.** `round.ts:22-29` states that CLAUDE.md §5's "round-off at grand total" concerns a *different quantity* — the optional whole-rupee adjustment line — and does not contradict line-level tax rounding. **I find no contradiction between CLAUDE.md §5 and the code.** §5 governs a line that does not exist yet.

### What a grand-total round-off would have to interact with

1. **F.101's largest-remainder allocation — no interaction, and that is the point.** `allocateDiscount` distributes `discountAmount` (the authority) across lines so the sum is exact. A round-off computed once on `totalAmount` sits *downstream* of all of it and touches no per-line figure. The two are orthogonal **provided** round-off is not allocated per line. `compute.ts:66-71` names the measured defect that per-line independent rounding caused (30046.50 vs 30046.51) — repeating that pattern for round-off would reintroduce it.
2. **`summary.ts`'s reconciliation invariant.** `sum(byRate) === sum(byHsn) === grandTotal` holds today because `totalsFrom` (`:297-308`) takes the engine's own figures and never re-sums the groups (`:290-296` explains why). A round-off added to `grandTotal` **breaks** that identity unless it is modelled as a document-level term outside the groups. `summary.ts:106` — "`taxableValue + totalTax`. **No round-off — that is F.6.**"
3. **The stored money columns, and a hazard nobody has recorded.** The PDF loader does **not** print the stored header totals — it **recomputes** them. `/workspace/apps/workers/src/templates/performa-invoice.tsx:116-139` calls `computeTax` over the stored lines and returns `subtotal: Number(tax.subtotal)` … `totalAmount: Number(tax.totalAmount)` at `:231-241`. So **a `round_off` column stored on an invoice row would be invisible on the rendered PDF unless the loader is changed to read it.** This is the sharpest single constraint I found for the spec.
   - **Repo self-contradiction, both sides named:** `/workspace/apps/workers/src/pdf/view-model.ts:14-16` asserts "It makes 'numbers are read, never computed' STRUCTURAL … per CLAUDE.md money is read from stored columns and never recomputed." The loader one directory over recomputes every total from lines. They agree numerically today (the stored columns were themselves written by `computeTax`), so this is latent, not a live defect — but round-off is exactly the field that would break the agreement.
4. **F.99** (`stage-f-tasks.json:932`) — "No per-line tax is stored at any grain, so every consumer recomputes." Confirmed: `performa_invoice_lines` stores `lineTotal` only (`performa-invoice.ts:185`) — no `taxableValue`, no `gstAmount`, no `lineDiscount`. This is *why* the loader recomputes.

### Does the totals block have somewhere to put a round-off line?

**Yes — and it is already specified, in live code, with no signature change needed.**

`/workspace/apps/workers/src/templates-typst/_lib/chrome.typ:337-356` is an explicit **ROUND-OFF INSERTION POINT** comment. `totals-block(words:, rows:, grand:)` at `:357` is **caller-driven**: it renders whatever pairs it receives (`:373-377`) and the 2px rule is at `:379`. **No edit to `chrome.typ` is required.** The row is appended to the `rows:` tuple in `/workspace/apps/workers/src/templates-typst/quotation.typ:99-112` — as the **last element**, immediately after the `..data.taxRows.map(...)` spread at `:111` and immediately before `grand:` at `:113`. `quotation.typ:108-110` carries the matching warning: hoisting the tax rows out of `rows:` would put Round Off above them. Target sequence: Subtotal, Discount, Taxable Amount, per-rate rows, Round Off, Grand Total.

The **on-screen** block is `/workspace/apps/web/components/tax/tax-summary-block.tsx` — a pure presentation component taking `rows: TaxSummaryRow[]`, rendered directly inside a `<dl>` at four call sites. It has **no** round-off slot and no document-level rows at all (it emits only per-rate CGST/SGST/IGST rows); a round-off row would be added by the *callers*, not here. Note `:115-125`: it must emit no DOM node — an accessibility constraint that bit once already.

**Repo contradiction to flag, already half-resolved:** `chrome.typ:348-356` and F.6's notes both state that `docs/F3_F4_AUDIT.md` §6.2 and F.6's own earlier text cite **stale line numbers** (":107"/":108") for the insertion point, because F.4 replaced the inter/intra conditional with the `taxRows` spread. The **named** anchor (last element of `rows:`) is authoritative. Separately I found `docs/F3_F4_AUDIT.md` §6.5 citing `round.ts:15,19,21` for the round-off prose — F.101 inserted the discount paragraph at `:15-20`, so those lines now point at the *discount* text; the round-off prose is at `round.ts:22-29`. Correct claim, stale citation.

---

## Q3 — What do a credit note and a debit note need beyond an invoice?

# VERDICT: DOES NOT EXIST — for both. And a **debit note is not in the plan at all.**

### What the repo already anticipates (the complete set — three prose mentions, zero code)

1. **`/workspace/packages/db/src/schema/dealer-address.ts:38-44`** — the strongest anticipation, and it is an **open decision blocking all three documents**: "What a document keeps a REFERENCE to is the address TEXT, which is presentation. How that reference is stored — an FK, a JSON snapshot, or both — is deliberately **NOT** decided here: four future documents face the same question (**tax invoice, credit note, e-invoice, e-way bill**) and D-5 rules that it be settled once in `docs/STAGE_F_BUILD_v3.md` rather than per-document. Deciding it for one document on one day is how four documents end up with three conventions." **This is a live, named, unresolved prerequisite for the spec.**
2. **`docs/TAX_INVOICE_AUDIT.md:95`** (doc claim, not code): "Cancellation must be a **credit note** (F.8), not a delete — a GST invoice is immutable once issued."
3. **`docs/PHASE_2_PLAN_v2.md:160`** and **F.10** (`stage-f-tasks.json:231`) — "GSTR-1 export (B2B, B2CL, **CDNR**, HSN)". CDNR is the GSTR-1 section for credit/debit notes; F.10 is `pending` with `notes: null`.

### Concept searches — what came back

- `credit_note|creditNote|debit_note|debitNote|cdnr|sales_return|salesReturn`, case-insensitive, whole repo: **5 hits, all in docs/plan** (`PHASE_2_PLAN_v2.md:160,170`, `stage-f-tasks.json:231`, `GST_RATE_MODEL_AUDIT.md:391`, `PROJECT_PLAN.md:125`). **Zero in any `.ts`/`.tsx`/`.sql`/`.typ`.**
- `debit|adjustment|reversal|revised_invoice|original_invoice` over `*.{ts,tsx,sql,typ}`: **6 hits**, read in full — `round.ts:24` and `compute.ts:29` (round-off *adjustment* prose), `chrome.typ:342`, and three payment-*reversal* references (`payments.test.ts:7,288`, `payments/transitions.ts:67`). **The word "debit" does not occur in any source file in this repository.**
- `credit` (case-insensitive, source files): every hit is `creditLimit`, `creditPeriodDays`, `defaultCreditPeriod`, the `CreditCard` lucide icon, or receipt prose "held as credit against future orders" (`payment-receipt.typ:95`). **Zero credit-note anything.** (Grep-only, hit the 60-result limit — but the targeted `credit_note|creditNote` search above is the affirmative one.)

### F.8 — what it commits to: **NOTHING**

The invocation's premise is wrong, and this matters for the spec. `/workspace/docs/stage-f-tasks.json:212-219`:

```json
{ "id": "F.8", "task": "Credit note / sales return", "subPhase": "SP1",
  "days": "41–42", "status": "pending", "completedDate": null, "notes": null }
```

**`notes` is `null`.** F.8 commits to a title, SP1, and a 2-day allocation. No schema decision, no numbering decision, no lifecycle, no inventory posture. Contrast F.6, whose notes run to ~6,000 words. **Every design question below is genuinely open.**

**And there is no debit-note row.** I enumerated all **~130** `"task":` titles and all **~130** `"id":` values in `stage-f-tasks.json` (F.1–F.143 plus F.2a/F.2b/F.5a/F.5b). "Credit note / sales return" is F.8; nothing mentions a debit note. So the operator's combined spec would be **adding a third document that has never been planned**, not merging three planned rows.

### What they need beyond an invoice — concretely

**Schema / columns**
- A reference to the originating document: an `invoiceId` FK (`onDelete: 'restrict'`, per the `performaInvoices` → `quotations` precedent at `performa-invoice.ts:55-57`) **plus** the original invoice *number* snapshotted as text — GSTR-1 CDNR reports the original document number, and an FK alone does not survive presentation. *(The number-snapshot requirement is my inference from the CDNR section name; I could not verify it against the BRD.)*
- A **reason** field. Precedent exists: `cancelledReason`, `returnedReason` (`dispatch.ts:79`), `performaInvoiceStatusHistory.reason` (`performa-invoice.ts:219`). These are all free `text()`. A GSTR-1-grade reason is likely an **enumerated** code, which is new.
- Adjustment **scope**: whether a credit note adjusts specific lines/quantities (needs `credit_note_lines` with a `invoiceLineId` FK) or is a lump-sum value adjustment (needs no lines). Nothing in the repo decides this.
- The seven money columns, in the same shape — plus `round_off` if Q2's answer lands here.
- Party columns: `billToDealerId`, `shipToDealerId`, `tenantStateAtIssue`, `placeOfSupply`, `deliveryArrangement` — copied forward, **not re-derived** (`order.ts:81-87` states the rule).

**Status lifecycle** — `performaInvoiceStatus` (`:28-36`) has 5 members and a dedicated `_status_history` table. A credit note plausibly needs far fewer (issued/cancelled), and a **tax invoice legally cannot be deleted or edited** once issued, which is the whole reason the credit note exists. So the invoice's lifecycle and the credit note's are *not* the same shape.

**Numbering** — `document_counters.docType` is free-text `text()` (`document-counter.ts:12`), unique on `(tenantId, docType, fiscalYear)` (`:17`), so **no migration is needed** to add series. But `docPrefixesSchema` (`admin/schemas.ts:66-73`) is a **closed 6-key Zod object** and `docPrefixes` has a 6-key JSONB default (`tenant-settings.ts:43-50`), and the admin form's `keys` array (`tenant-detail-sections.tsx:813-820`) is a hardcoded 6-entry list. Adding `credit_note`/`debit_note` prefixes touches **all three together** — and F.6's notes already warn that the `invoice` key is load-bearing: removing it breaks an unrelated validated admin path.

**Inventory interaction — a real path exists, and it is *not* a sales return**
`inventoryItemStatus` includes `'returned'` (`inventory.ts:27`) and it **is written**: `/workspace/packages/db/src/dispatch/lifecycle.ts:162` (`returnDispatchDb`) sets `dispatches.status = 'returned'`, routes every serial `dispatched → returned → in_stock` via `returnItem` (`:146`, `inventory/transitions.ts:196`), decrements `orderLines.dispatchedQuantity` (`:149-156`), and recomputes the order's fulfilment status (`:170`). Tested at `packages/db/tests/dispatch.test.ts:449-453`.
**But it moves no money and produces no document.** It also only accepts an `in_transit` dispatch (`:124-129`) — a *delivered* dispatch cannot be returned today. So F.8's "sales return" half has a goods-movement engine to reuse and a **money/document half that is entirely absent**, plus a state-machine gap (delivered → returned).

**Payment interaction — blocked by two CHECK constraints**
`payment_allocations_target_chk` (`payment.ts:151-154`) enforces **exactly one** of `(orderId, performaInvoiceId)` — a credit note cannot be allocated against without a third target column and a rewritten constraint. `payments_amount_chk` (`:102`) is `amount > 0`, so a credit **cannot** be modelled as a negative payment.

**Tax computation — a hard blocker for negative lines**
`computeTax` throws `NEGATIVE_QUANTITY` for `quantity <= 0` (`compute.ts:151-156`) and `NEGATIVE_UNIT_PRICE` for `unitPrice < 0` (`:158-163`). **A credit note cannot pass negative lines through the existing engine.** It must carry positive lines with the document *semantically* a reduction — or `packages/tax` must change, which is a **protected surface under CLAUDE.md §10.1 requiring a stop-and-ask.**

---

## Q4 — What the three share, and what genuinely differs

# VERDICT: PARTIAL — one implementation serves most layers; four must differ, and one is blocked on an undecided cross-document question.

| Layer | One implementation? | Why / evidence |
|---|---|---|
| **Document numbering** | **YES, with one caveat** | `nextCounter` (`document-counter.ts:14`) is an atomic `INSERT … ON CONFLICT DO UPDATE` over free-text `docType`; the unique index is `(tenantId, docType, fiscalYear)`. **Three separate `docType` values, one mechanism, zero migration.** Separate counters per type is not a choice — GST requires distinct series per document type, and a shared counter would make `INV-2026-0007` and `CN-2026-0007` mutually exclusive. `allocateDocumentNumber` (`pi/helpers.ts:161-170`) is the right shape to reuse but its `docType` param is a 2-arm literal union that must widen. **Caveat:** `docPrefixesSchema` + the JSONB default + the admin `keys` array are three hardcoded 6-key lists that must move together. |
| **Party model** | **YES** | `billToDealerId` / `shipToDealerId` / `tenantStateAtIssue` / `placeOfSupply` / `deliveryArrangement` are identical on `performa_invoices` (`:63-88`) and `orders` (`:68-87`), with identical CHECKs (`^[A-Z]{2}$`, `deliveryArrangement IN ('s10_1_a','s10_1_b')`). All three documents copy forward from the invoice's own source. `resolvePlaceOfSupply` in `packages/tax/src/place-of-supply.ts` already exists and is shared. **BUT:** `dealer-address.ts:38-44`'s D-5 question — how a document stores its Ship-To *address* reference — is **undecided and explicitly scoped to exactly these documents.** This is the one thing that must be settled *before* the spec, not inside it. |
| **Tax computation** | **YES for the invoice; the two notes need a decision** | `computeTax` + `computeTaxSummary` are pure and document-agnostic. `buildTaxGroups` (`templates/tax-groups.ts:47`) already serves two loaders and takes only `{tenantState, placeOfSupply, discount, lines}` — a third caller is free. **The genuine difference:** the negative-quantity/price throws (`compute.ts:151-163`) mean a credit/debit note must use positive lines. Modifying `packages/tax` is a **protected surface** (CLAUDE.md §10.1). |
| **Money columns** | **YES** | Same seven `decimal` columns, same precisions, same CHECKs, on `quotations`/`performa_invoices`/`orders`. Clone them. **Plus `round_off` if Q2 lands here** — and note `orders` already diverges by lacking `discountType`/`discountValue` (F.114, `stage-f-tasks.json:1031`), so the "same shape" claim is about the seven totals, not every commercial column. |
| **Typst template** | **Mostly — one entry point each, shared body is the open call** | `performa-invoice.typ` is **22 lines**: it imports `quotation-body` from `quotation.typ:15` and passes different data. That is the pattern. `quotation.typ:10-12` explicitly says the PI "has its own entry point so the two can diverge later (**F.6's tax invoice**, F.4's multi-rate summary) without either inheriting the other's changes by accident." So: three thin entry points, and a decision about whether they share one body. |
| **`_lib/chrome.typ` components** | **YES — reusable as-is** | I enumerated all **20** top-level `#let` bindings. **Reusable unchanged:** `doc-shell(doc-id:)` `:207`, `doc-header(bill-from:, title:, rows:, logo:, revision:)` `:265`, `party-body(party, note:)` `:174`, `card-row` `:77`, `card` `:59`, `caps-label` `:97`, `data-table(columns:, aligns:, header:, rows:, total-cells:)` `:111`, `supply-badge(inter)` `:324`, **`totals-block(words:, rows:, grand:)` `:357` — takes an arbitrary-length `rows:`, so no signature change for round-off**, `footer-block(terms:, bank:)` `:395`, `money` `:52`, `rupees` `:53`, `meta-row` `:157`, `callout` `:146`, plus the `px`/colour/font tokens. **Not needed by these three:** `serial-chips` `:426` and `ack-block` `:459` (dispatch-note only) — though `serial-chips` is exactly what **F.7** ("Serials rendered on invoice lines", `:203`, `notes: null`) will want. **Zero chrome components need modifying.** |
| **PDF loader shape** | **YES structurally, and this is the largest single build item** | All four loaders return one type and follow one sequence: load header → load both dealer parties → load tenant + settings → load lines ordered by `lineNumber` (throw if empty) → `computeTax` → `buildTaxGroups` → assemble. Three near-identical loaders is real work, and `performa-invoice.tsx:4-9` already documents the "reuse wholesale, differ only in data" precedent. **The spec must decide whether the loader prints stored totals or recomputed ones** (see Q2 §3) — and note these loaders live in `.tsx` files that are otherwise dead React, which F.71 (`:671`) exists to untangle. |
| **Queue / render path** | **YES, with an ENUM MIGRATION for two of the three** | `'invoice'` is already in `generated_document_type` (`:17`), `RenderableDocumentType` (`:39`) and the Zod arm (`email.ts:57`). **`credit_note` and `debit_note` are in none of them** — so those two need a **pgEnum value migration** that the invoice does not. That is the single clearest asymmetry in the whole comparison. All three then need: an arm on `RenderableKind` (`view-model.ts:30`), entries in `TEMPLATE_FOR` (`:72`) and `FOOTER_LABEL` (`:64`), a `filenameFor` case (`:180`), and removal from the `render-pdf.ts:65-70` exclusion. `generated_documents.documentId` is deliberately untyped `text()` (`generated-document.ts:37-38`) precisely so it can point at different tables — no change needed there. |
| **RLS** | **YES, and it is nearly free** | `/workspace/packages/db/src/migrate.ts:35` `readdirSync`s the `rls/` directory and applies every `.sql` file, so **dropping in new policy files is auto-discovered**. Copy `rls/performa-invoices.sql` verbatim (ENABLE + FORCE + `tenant_isolation` with `USING` **and** `WITH CHECK`) three times. |
| **Audit** | **YES but NOT automatic** | `triggers/audit-log.sql` is one explicit stanza per table (25 enumerated). `dealer-address.ts:63-65` records exactly this trap: "it is **NOT** automatic, and no pre-existing test would have caught its absence (F.5a P-8)". Each new table needs its own stanza **and a test asserting the audit row**. |
| **Permissions** | **YES** | `tenantAction(allowedRoles, schema, fn)` (`wrap.ts`) serves all three. The `role` split is a policy decision: TAX_INVOICE_AUDIT.md:96 proposes Accounts to generate, Admin for cancel/credit-note. That is a doc *proposal*, not implemented. |

### The four things that genuinely differ

1. **Enum migration.** `credit_note` / `debit_note` need pgEnum values; `invoice` does not.
2. **Status lifecycle.** An issued tax invoice is immutable; a credit note is the *correction mechanism* for it. These cannot share one state machine, and neither can share the PI's 5-state `draft → sent → confirmed → cancelled → expired`.
3. **The originating-document reference.** An invoice descends from an order (an existing precedent: `orders.performaInvoiceId`, `performa_invoices.quotationId`). A credit/debit note descends from an **invoice** *and* must carry its number for CDNR — a shape with no precedent in the repo.
4. **Sign and direction.** Blocked by `compute.ts:151-163`. A credit note reduces what the dealer owes; a debit note increases it. The engine accepts neither as a negative, and the payment-allocation CHECK accepts neither as a target.

---

## WHAT IS MISSING (in build order)

1. **Decide D-5** — how a document stores its Ship-To address reference (`dealer-address.ts:38-44`). Explicitly scoped to these documents and explicitly deferred. Blocks the schema.
2. **Decide the `computeTax` sign question** — protected surface, needs a §10.1 stop-and-ask.
3. **Decide whether the PDF loader prints stored or recomputed totals** — determines whether a stored `round_off` is visible.
4. Schema: 3 header tables (+ line tables, + status history where the lifecycle needs one) + migration + 3 RLS files + audit-trigger stanzas + `tenant_id`-leading indexes.
5. Widen: `generated_document_type` and `renderPdfJobPayloadSchema` (2 new values); `docPrefixesSchema` + JSONB default + admin `keys` array (together); `allocateDocumentNumber`'s `docType` union; `RenderableKind` + `TEMPLATE_FOR` + `FOOTER_LABEL` + `filenameFor`.
6. `nextCounter` allocation for 3 new `docType`s, reading `prefixes['invoice'|…]`.
7. Write paths (`tenantAction`): create-invoice-from-order, create-credit-note-from-invoice, create-debit-note-from-invoice, generate/download/send PDF.
8. Query modules, routes, sidebar entries.
9. 3 Typst entry points + shared body decision + 3 loaders + removal from the render-pdf exclusion. Round-off row appended last in `rows:`.
10. Round-off column + single grand-total computation + a reference PDF capture (`docs/pdf-references/README.md` records the matrix does not cover it).
11. Seeds, tests, `verify-day-*` spec, DEVIATIONS entry.

## PLACEHOLDERS FOUND

| Placeholder | Location |
|---|---|
| `'invoice'` in `generated_document_type` | `packages/db/src/schema/generated-document.ts:17` (migration `0008`) |
| `'invoice'` in `RenderableDocumentType` | `apps/workers/src/jobs/render-pdf.ts:39` |
| `'invoice'` in `renderPdfJobPayloadSchema` | `packages/schemas/src/email.ts:57` |
| `doc_prefixes.invoice = 'INV'` | `packages/db/src/schema/tenant-settings.ts:47`; `migrations/0000_cultured_iron_man.sql:32` |
| `invoice` **required** in `docPrefixesSchema` — load-bearing, cannot be deleted | `apps/web/lib/admin/schemas.ts:70` |
| **Live, role-gated, persisting "Tax invoice" prefix input** for a document that cannot exist | `apps/web/app/admin/tenants/[id]/tenant-detail-sections.tsx:817` → `update-tenant.ts:110` |
| `("Round Off", money(data.roundOff))` — commented-out insertion point | `apps/workers/src/templates-typst/_lib/chrome.typ:346` |
| 6 dead React template components (unreachable since ADR-015) | `apps/workers/src/templates/_components/*.tsx` |
| **NOT a placeholder:** `inventoryItemStatus.'returned'` is genuinely written | `dispatch/lifecycle.ts:162`, `inventory/transitions.ts:196` |

## WHERE I LOOKED AND FOUND NOTHING

Globs (all read in full): `packages/db/src/schema/*` (24); `packages/db/migrations/*.sql` (21); `packages/db/src/rls/*` (22); `packages/db/src/triggers/*` (1); `apps/web/app/**/page.tsx` (50); `apps/web/lib/actions/**/*.ts` (60); `apps/web/lib/queries/*` (11); `apps/web/components/**/*.tsx` (17 — **there is no `components/documents/` directory**); `apps/workers/src/templates-typst/**/*` (5); `apps/workers/src/templates/**/*` (13); `packages/schemas/src/*` (18); `packages/tax/**` (9 source); `packages/*/tests/**/*.test.ts` (20); `apps/**/*.spec.ts` (27).
Complete populations read: schema barrel (23 exports); `nextCounter` call sites; `documentType:` literals; `prefixes[...]` read keys; `CREATE TRIGGER audit_trg` stanzas (25); `#let` bindings in `chrome.typ` (20); `NAV_ITEMS` (11); `stage-f-tasks.json` `"task":` titles and `"id":` values (~130 each).
Greps returning nothing relevant: `credit_note|creditNote|debit_note|debitNote|cdnr|sales_return|salesReturn` (5 doc-only hits); `debit|adjustment|reversal|revised_invoice|original_invoice` over source (6 hits, **zero "debit"**); `roundOff` in `apps/workers` (1 hit, a comment); `invoice` in the orders route dir (3 hits, all "performa").

## CONFIDENCE

**High** on every existence verdict in Q1, Q2 and Q3, and on the Q4 rows about numbering, RLS, audit, money columns, chrome components and the queue path — all rest on complete enumerations a reader can re-derive.

**Medium** on three things: (a) the claim that the PDF-loader recomputation is a *hazard* for a stored `round_off` — the mechanism is read from code and certain, but whether the spec cares depends on a design choice not yet made; (b) that a credit note must snapshot the original invoice *number* for CDNR — inferred from the GSTR-1 section name, not verified; (c) role assignments, which exist only as a doc proposal.

**Could not establish:** anything from the BRD `.docx` (no Bash; F.128 records it is unreadable to tooling and asks for a committed text rendering — if the spec needs BRD §4's own statement of credit-note requirements, that gap must be closed first). I also could not execute anything, so no runtime claim here was verified by running it — in particular I did not confirm that `computeTax` actually throws on a negative quantity, only that `compute.ts:151-156` says it does.
