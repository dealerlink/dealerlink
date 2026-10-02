# Day 42–51 — F.6 + F.8 + F.144: tax invoice, credit note, debit note

**STATUS: APPROVED 2026-09-30.** Every open question from the draft has been
settled by the operator and appears below as a **D-number**. There are no open
questions left in this prompt. If you find yourself choosing between two
defensible options and no D-number covers it, that is CLAUDE.md §10.1's signal —
stop and ask.

> **THESE D-NUMBERS ARE THIS PROMPT'S OWN.** They are **not**
> `docs/STAGE_F_BUILD_v3.md`'s D-numbers, which run D-1…D-8 and mean entirely
> different things — its D-5 is "CI before schema work", its D-7 is the
> Ship-To address convention, its D-8 is the credit-note sign. When you cite one
> of these, write **`F6 D-n`**. A bare `D-n` cannot disambiguate across documents
> that number their decisions independently; that is F.100's subject, and it was
> added to F.100 _because_ `dealer-address.ts` sent a reader to the wrong D-5.

**Read first, in this order:** `docs/F6_SPEC.md` (what and why — it carries every
ruling below in full, with the reasoning), then `docs/INVOICE_CN_DN_AUDIT.md`
(where — a verbatim `code-auditor` enumeration with `file:line` evidence). Where
the code disagrees with either, **the code wins and the disagreement is a
finding**: report it, do not quietly follow the document.

Two known caveats about the audit, so you do not rediscover them: it read `main`
before F.144 existed, so its "no debit-note row" sentence is stale; and it
verified `computeTax`'s negative-line throws by **reading**, not executing. They
have since been executed — `docs/STAGE_F_BUILD_v3.md` §11 has the measured table.

---

## The settled decisions — F6 D-1 … F6 D-12

| #           | Decision                                                                                                                                                                                                                                                                        | Full reasoning                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **F6 D-1**  | The loader **reads stored totals** and derives only the **grouping**. Two assertions: `storedTotal − (storedTaxable + Σ grouped tax) === storedRoundOff`, and `Σ(line taxable) === stored taxable_amount`                                                                       | F.152 · `F6_SPEC.md` §1           |
| **F6 D-2**  | Distinguish an intended reference move from an unintended one by **pre-change capture** (`render-typst.ts` + `REFS_DIR` on `compare-figures.mjs`). **The predicted move-set is EMPTY, written down in the branch before the test is re-run.** Any non-empty diff is a finding   | `F6_SPEC.md` §1                   |
| **F6 D-3**  | The invoice stores the **WHOLE-RUPEE** total, not the engine total. `round_off` is **SIGNED** — no `>= 0` CHECK. `amountInWords` and `grand:` follow the **stored** total                                                                                                       | `F6_SPEC.md` §2                   |
| **F6 D-4**  | Round-off is **always applied**. No `tenant_settings` flag — a decision on CLAUDE.md §8's fiscal-year/currency precedent, not an omission                                                                                                                                       | `F6_SPEC.md` §2                   |
| **F6 D-5**  | `ship_to_address_id` is **DEFERRED** — not added to the invoice this day. Filed as **F.160** for all four documents together                                                                                                                                                    | `STAGE_F_BUILD_v3.md` §10 · F.160 |
| **F6 D-6**  | **TWO unions** (`RenderableDocumentType`, `RenderableKind`) plus a **type-level exhaustiveness check**. Do NOT collapse them — they are genuinely different sets. _(This reverses an earlier one-union ruling; the reasoning is in the spec and matters more than the outcome)_ | `F6_SPEC.md` §3 · F.153           |
| **F6 D-7**  | Note prefixes come from the `prefixes['x'] ?? 'CN'` **fallback**. Touch **none** of the three hardcoded lists. Configurable prefixes filed as **F.164**; the silent-key-loss path as **F.163**                                                                                  | `F6_SPEC.md` §4a                  |
| **F6 D-8**  | **Accounts** issues invoices; **ADMIN** issues credit and debit notes. Reducing a receivable is different authority from raising one                                                                                                                                            | `F6_SPEC.md` §4a                  |
| **F6 D-9**  | `round_off` on the **invoice table only**. The PI is filed as **F.165**, expected work. **F6 D-2's empty prediction is CONDITIONAL on this** — fold F.165 in and the prediction is void                                                                                         | `F6_SPEC.md` §1, §2 · F.165       |
| **F6 D-10** | Credit-note **settlement is out of scope** for writes. **AUTHORISED:** five one-line comments naming **F.161**, at the five read-path sites. Comments only, no behaviour change                                                                                                 | `F6_SPEC.md` §4, §4a · F.161      |
| **F6 D-11** | Credit and debit notes carry **POSITIVE lines**; the document type supplies direction. **`packages/tax` is untouched.** A zero-quantity line is not a reversal — a fully-reversed line is **omitted**                                                                           | `STAGE_F_BUILD_v3.md` §11 · F.159 |
| **F6 D-12** | Acceptance criteria 1, 3 and 8/9 are restated to be measurable: the mutate-and-rollback fixture; GROUPED tax plus the taxable-half assertion; and the RLS/audit split                                                                                                           | `F6_SPEC.md` §6                   |

**Three things F6 D-1…D-12 do NOT cover, and each is a STOP:** any schema change
or migration (there are several — say so and wait); any change to `packages/tax`;
any deviation from this prompt's scope, including a fix noticed in passing.

---

## What changed from the draft, so you can trust the D-numbers

The draft this prompt is built from asked seven open questions and flagged four
unmeasurable criteria. All eleven are now settled above. Two draft findings
changed the work rather than merely answering a question:

1. **`ship_to_address_id` exists nowhere in code.** `STAGE_F_BUILD_v3.md` §10
   originally claimed F.5a "had already taken the FK-only route for the PI". That
   was **false** — F.5a shipped the `dealer_addresses` master table, its RLS
   policy, its audit stanza and its tests, and wired **no document** to it. The
   §10 text is corrected and the FK is deferred (**F6 D-5**).
2. **The §1 loader change most likely moves NOTHING**, against the spec's
   original "expect the PI reference renders to move". F.152 measured 0 of 31 PIs
   and 0 of 48 quotations differing. Hence **F6 D-2**'s empty prediction, and
   hence criterion 6 now reads "before the test is re-run" rather than the
   unsatisfiable "before it starts".

---

## Phase A — the module work

### A.0 — THE DECISIONS ARE SETTLED. This is no longer a gate.

**Every open question the draft raised is answered — see F6 D-1…D-12 above.** Start at A.1 and work forward. What remains a STOP is not a question but a CLASS of action: any schema change or migration, anything touching `packages/tax`, and any deviation from this prompt's scope. Several steps below need a migration, and each says so. When you reach one, present the DDL and wait; do not write it because the step exists.

### A.1 — The loader contract (F.152). This lands FIRST, on its own commits.

Files: `apps/workers/src/templates/quotation.tsx`, `apps/workers/src/templates/performa-invoice.tsx`.

**A.1.1 — Establish the pre-change baseline BEFORE editing anything.**

```
cd apps/workers && pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/pre-f6
pnpm --filter @dealerlink/workers test        # pdf-snapshots must be green on main first
```

If `pdf-snapshots.test.ts` is not green **before** your first edit, stop and report — you have no baseline.

**A.1.2 — Change both loaders.** Header totals (`subtotal`, `discountAmount`, `taxableAmount`, `cgstAmount`, `sgstAmount`, `igstAmount`, `totalAmount`) are read from the stored columns. Per-line figures (`lineDiscount`, `taxableValue`, `gstAmount`, `lineTotal`) and `taxRateGroups`/`taxHsnGroups` continue to derive from lines — there are no columns for them (F.99; `performa-invoice.ts:161-199`). `amountInWords` takes the **stored** total.

Both loaders share the shape: `performa-invoice.tsx:116-139` + `:231-241`, and `quotation.tsx:187-188` + `:314,:324`. **Yes, the quotation loader shares the mechanism** — §7 item 1 is answered; apply §1 to it too. Fix the two once, in one helper, rather than twice.

**A.1.3 — Add the reconciliation assertion.** In the loader, after the grouping is built and before returning. It must name the document (number, not id) and the disagreeing figures, and it must **throw**, not warn. Two assertions, not one, because the single identity in F6_SPEC §2 cannot catch a bad `taxable_amount` (it cancels on both sides):

- `Σ rateGroups(cgst+sgst+igst)` equals `storedCgst + storedSgst + storedIgst`
- `Σ line taxableValue` equals `storedTaxableAmount`

Compare as fixed-2dp strings or `Decimal`, never as floats.

**A.1.4 — Write the movement prediction down, then measure it.** In the branch (commit message or a scratch note that becomes part of the deviation entry), state **before** re-running the test which of the 14 reference cases you expect to move and which figures. On F.152's own measurement (_"quotations 0 of 48 with lines differ; PIs 0 of 31 differ"_) the predicted set is **empty**. Then:

```
cd apps/workers && pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/post-f6
REFS_DIR=/tmp/pre-f6 node apps/workers/scripts/compare-figures.mjs /tmp/post-f6     # expect exit 0
pnpm --filter @dealerlink/workers test                                              # expect green
```

`compare-figures.mjs` needs the R25 scratch rasteriser. **Any figure difference, in either direction, that you did not predict is a finding for the operator — not a reason to touch `pdf-snapshots.test.ts` or `docs/pdf-references/`.** The test's own header forbids widening the tolerated segment; there is no capture tool to re-baseline with (`capture-references.ts` is gone — it is absent from the complete `apps/workers/scripts/` listing).

**A.1.5 — Prove the loader actually reads the column.** A green parity test proves nothing here, because stored and recomputed agree. Add a test that mutates one stored `total_amount` inside a transaction, asserts the loaded/rendered total follows the mutation, and rolls back — the same instrument control F.152's own measurement used (`+1.11`, named with `delta=-1.11`, rolled back). The same fixture demonstrates the A.1.3 assertion can fail, which acceptance criterion 1 requires.

**A.1.6 — Correct the two comments this change falsifies** (§11.1 ruling 6 — correct a citation during the change that breaks it): `packages/db/src/schema/performa-invoice.ts:102` (_"Denormalized totals — recomputed authoritatively via @dealerlink/tax"_) and the equivalent on `quotations`/`orders` if present. In the same commit as the code change.

### A.2 — Resolve the type divergence (F.153). See F6 D-6 — TWO unions plus a check.

`RenderableDocumentType` at `apps/workers/src/jobs/render-pdf.ts:36-41` (5 arms, includes `'invoice'`); `RenderableKind` at `apps/workers/src/pdf/view-model.ts:30` (4 arms, omits it). `TEMPLATE_FOR` (`:72`), `FOOTER_LABEL` (`:64`) and `filenameFor` (`:180`) are all keyed on the 4-arm union. `render-pdf.ts:65-76` is a **negative allow-list**, so `'invoice'` throws by omission.

Resolve, do not widen both — F.153's row states the requirement and names the candidate (a type-level exhaustiveness check over the config objects). If you cannot resolve without a decision, that is a STOP.

### A.3 — Schema. STOP AND ASK BEFORE WRITING ANY OF THIS.

Every item here is a migration and therefore §10.1. Do not write the DDL before the operator authorises it.

- `invoices` + `invoice_lines` (+ status history if the lifecycle needs one), `credit_notes` + lines, `debit_notes` + lines
- Seven money columns cloned from `performa_invoices:103-109`, plus **signed** `round_off` on the invoice
- `tenant_id` NOT NULL, FK, `tenant_id`-leading indexes (CLAUDE.md §4)
- Party columns copied forward, never re-derived: `billToDealerId`, `shipToDealerId`, `tenantStateAtIssue`, `placeOfSupply`, `deliveryArrangement` — the `performa_invoices:63-88` shape, with the `^[A-Z]{2}$` and `('s10_1_a','s10_1_b')` CHECKs
- **NO `ship_to_address_id`. F6 D-5 DEFERS IT.** The column exists nowhere in the codebase — F.5a shipped the `dealer_addresses` master table and wired no document to it — and an invoice descends from an order that has no such column, so there is nothing to copy forward and wiring the invoice alone would need a picker no other document has. Filed as F.160 for all four documents together. **Do not add it, not even nullable.**
- One RLS `.sql` per new table (`migrate.ts` `readdirSync`s the directory, so the file is auto-applied); one **explicit** audit-trigger stanza per new table in `triggers/audit-log.sql` — that is NOT automatic (`dealer-address.ts:63-65`)
- A pgEnum value migration adding `credit_note` and `debit_note` to `generated_document_type` (`generated-document.ts:14-20`, read in full: `quotation`, `performa_invoice`, `invoice`, `dispatch`, `payment_receipt` — the two notes are absent; the invoice is not). The single clearest asymmetry in the three.

### A.4 — Numbering. No migration needed — confirm it rather than inherit it.

`document_counters.docType` is free-text `text()` and the unique index is `(tenantId, docType, fiscalYear)` — `packages/db/src/schema/document-counter.ts:12,17`, read in full. **Confirmed: `nextCounter` needs no migration for three new series.** §7 item 2 is answered.

The prefix is the live hazard, and it is a real one:

- `docPrefixesSchema` is a **closed 6-key `z.object`** with `invoice` required — `apps/web/lib/admin/schemas.ts:66-73`
- The JSONB default is a 6-key object — `packages/db/src/schema/tenant-settings.ts:43-50`
- The admin form's `keys` array is a hardcoded 6-entry list, `invoice` → `'Tax invoice'` — `apps/web/app/admin/tenants/[id]/tenant-detail-sections.tsx:813-820`
- `updateTenantDocPrefixes` **replaces the whole JSONB** with the parsed input — `apps/web/lib/actions/admin/update-tenant.ts:110`

**F6 D-7: touch NONE of the three lists.** Use the `prefixes['x'] ?? 'CN'` fallback that `allocatePaymentNumber` already uses (`apps/web/lib/actions/payments/helpers.ts:37`). The reason is a live data-loss path, filed as **F.163**: because Zod strips unknown keys and `updateTenantDocPrefixes` replaces the whole JSONB, a key added to the default without also being added to `docPrefixesSchema` is **silently deleted on the first operator save** — and the deleted key is a tenant's document-numbering prefix. Configurable note prefixes are filed as **F.164**, explicitly _after_ F.163.

### A.5 — Write paths and routes

`tenantAction` for: create-invoice-from-confirmed-order, create-credit-note-from-invoice, create-debit-note-from-invoice, and the generate/download/send PDF actions. **Roles per F6 D-8: `['accounts', 'admin']` for the invoice, `['admin']` ONLY for the credit and debit notes.** Reducing a receivable is different authority from raising one. `TAX_INVOICE_AUDIT.md:96` proposed this split and it was never implemented; it is now a decision. Routes + `NAV_ITEMS` entries — the current array has 11 entries and no invoice entry (`apps/web/components/shell/Sidebar.tsx:23-35`, read in full).

**An issued invoice is immutable** — no edit path, no delete path. The credit note is the correction mechanism. Say so in the code.

### A.6 — Round-off. STOP AND ASK (money column + schema).

Write path: the grand-total adjustment computed **once** on `totalAmount`, as `packages/tax/src/round.ts:28-29` says it must be if introduced — _"If/when a round-off line is introduced, it is computed once on `totalAmount`, consistent with §6."_ **Nothing in `packages/tax` changes.**

**F6 D-3: the invoice stores the WHOLE-RUPEE total.** `compute.ts:132` makes `totalAmount = taxable + cgst + sgst + igst`, so storing the engine's figure makes `round_off` identically 0.00 forever — a column that can never be non-zero. **`round_off` is SIGNED: no `>= 0` CHECK**, because rounding 13,744.40 down gives −0.40. **`amountInWords` and `grand:` read the STORED total**, or the document says one number in figures and another in words. **F6 D-4: always applied**, no tenant flag. **F6 D-9: this table only** — not `performa_invoices`, which is F.165, and folding it in VOIDS F6 D-2's empty move prediction.

Render path — the anchor is NAMED, not numbered, because F.4 moved it:

- the Round Off pair is the **last element of the `rows:` tuple** in `apps/workers/src/templates-typst/quotation.typ`, immediately after the `..data.taxRows.map(...)` spread (`:111`) and immediately before `grand:` (`:113`). Target sequence: Subtotal, Discount, Taxable Amount, per-rate rows, Round Off, Grand Total.
- **No edit to `_lib/chrome.typ` is required.** `totals-block(words:, rows:, grand:)` at `:357` takes an arbitrary-length `rows:` and renders whatever pairs it receives (`:373-377`).
- Pass a **bare pre-formatted string**, not `money(...)` — every sibling row does, and `totals-block` applies the mono wrapper itself at `chrome.typ:375`. The insertion-point comment's own sample (`chrome.typ:346`) double-wraps; leave the comment, do not copy it literally.
- Add `roundOff` to `MONEY_KEYS` in **both** view builders — `apps/workers/src/pdf/view-model.ts:33-48` and `apps/workers/scripts/render-typst.ts:68-83`. They are a fork (F.108) and a key added to one only makes the measurement harness report the old output.

### A.7 — Templates and loaders

`templates-typst/tax-invoice.typ`, and one entry point each for the two notes. **Not** a React template: `apps/workers/src/templates/_components/*.tsx` has been unreachable since ADR-015, and the audit corrects `TAX_INVOICE_AUDIT.md` §A.1/§A.3 on exactly this. `_lib/chrome.typ`'s 20 `#let` bindings are reusable **unchanged** — including `serial-chips` at `:426`, which is what F.7's serials want.

Three loaders following the four-loader sequence, built on the A.1 contract from the start (stored totals, derived grouping, reconciliation assertion). `buildTaxGroups` (`apps/workers/src/templates/tax-groups.ts:47`) takes `{tenantState, placeOfSupply, discount, lines}` and is free for a third, fourth and fifth caller.

Serials on invoice lines (F.7): test at **26** (the client's own invoice) and at **500**.

### A.8 — Credit and debit notes

**Positive lines; the document type supplies the direction (D-8). `packages/tax` untouched.** The executed measurement is `docs/STAGE_F_BUILD_v3.md:550-557`; the code is `compute.ts:149-163` (`quantity <= 0` → `NEGATIVE_QUANTITY`; `unitPrice < 0` → `NEGATIVE_UNIT_PRICE`).

**`unitPrice >= 0` and `quantity > 0` are DIFFERENT bounds.** A zero-priced line is accepted; a zero-quantity line throws under a misleading name (F.159). So **a fully-reversed line is expressed by omitting it, never by a zero quantity — say that in the code**, because the alternative will be attempted.

Beyond an invoice, each note needs:

- The **originating invoice number snapshotted as text**, alongside the FK (`onDelete: 'restrict'`, per `performa-invoice.ts:55-57`). GSTR-1's CDNR section reports the original document number and it must not move if the invoice is ever renumbered. **This shape has no precedent in the repository** — specify it, do not infer it from the party pattern. (The audit flags the CDNR requirement as its own inference from the section name, unverified against the BRD.)
- Its own lifecycle. An issued invoice is immutable; a credit note is the correction. They cannot share a state machine, and neither shares the PI's 5-state one.
- A reason field. Free `text()` has precedent (`dispatch.ts:79`, `performa-invoice.ts:219`); an enumerated GSTR-1-grade code does not. Report which you chose and why.

**F6 D-10: settlement is out of scope for WRITES, and the five read-path comments are AUTHORISED.** The scope call holds — nothing in `payments` or `payment_allocations` is NOT NULL against, FK'd to, or checked against a credit note. But settlement is entirely order-anchored, so add **one line-comment naming F.161** at each of: `packages/db/src/payments/recompute.ts:57-60` (a fully-credited order can never reach `paid`), `apps/web/lib/reports/outstanding.ts:102`, `apps/web/lib/queries/payments.ts:381`, `:433` and `apps/web/app/(app)/dashboard/page.tsx:94` (each overstates the receivable). **Comments only. No behaviour change at any of the five.** This is an explicit authorisation of a scope extension under §11.2 — it does not license any other.

### A.9 — The orphan placeholder

`apps/web/app/admin/tenants/[id]/tenant-detail-sections.tsx:817` renders a live, role-gated, persisting "Tax invoice" prefix input for a document that cannot be created, and `invoice` is required in `docPrefixesSchema` (`admin/schemas.ts:70`) so it cannot be deleted. It becomes correct by construction once the invoice exists — **confirm that by executing it** (issue an invoice on a tenant whose `invoice` prefix has been edited, and assert the document number carries the edited prefix). Do not assume.

### What this day does NOT do

- No e-invoice, no IRN, no e-way bill (F.23/F.24/F.25)
- **No settlement** of a credit note against a payment or a future invoice — file it
- **No behavioural change to `packages/tax` of any kind.** If the work appears to require one, that is a STOP
- No F.159 error-code rename (filed; touches `packages/tax`)
- No `discount_type`/`discount_value` on `orders` (F.114) — A.1 removes the urgency, the gap stands
- No extension of `returnDispatchDb` to delivered dispatches (`packages/db/src/dispatch/lifecycle.ts:124-129` accepts only `in_transit`) — file it
- No new case added to `apps/workers/scripts/typst-matrix.json`. `pdf-snapshots.test.ts:179` builds a per-case filename under the `docs/pdf-references/` directory and reads it for **every** case, so a case without a Chromium reference throws on `readFileSync`, and no capture tool exists. Follow `apps/workers/tests/three-percent-render.test.ts:12-18`, which states this and asserts on extracted text through the production chain instead.
- No fix to any of the five settlement read paths
- No touching `docs/pdf-references/` — one-way door

---

## Phase B — verification

**Must stay green, and each is a command:**

- `pnpm typecheck`, `pnpm lint`, `pnpm build`
- `pnpm test` — in particular `apps/workers/tests/pdf-snapshots.test.ts` (all 14 cases), `packages/tax/tests/*` (unchanged), `packages/db/tests/rls.test.ts`, `packages/db/tests/audit.test.ts`, `apps/workers/tests/three-percent-render.test.ts`
- `pnpm verify` / CI `e2e` — including `critical-path.spec.ts`, which is protected
- `cd apps/workers && pnpm exec tsx scripts/determinism-check.ts` — pinned to `DSP-REF-0500` (dispatch), so it should be untouched by this day; run it anyway
- `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check`

**New coverage this day adds:**

1. The A.1.5 mutate-and-rollback test: the loader's printed total follows the stored column, and the reconciliation assertion throws when the two disagree. One fixture, two properties.
2. Per-figure pre/post comparison of all 14 references (A.1.4), with the prediction written down first.
3. Invoice issuance from a confirmed order: numbering reads `prefixes['invoice']`, lines snapshot, `tenant_state_at_issue`/`place_of_supply` freeze, `round_off` written.
4. Round-off: an invoice whose unrounded total is not a whole rupee renders a Round Off row, and `storedTotal − (storedTaxable + Σ grouped tax)` equals the stored `round_off` exactly. Use the client's own arithmetic as the case: `12,629.50 + 557.02 + 557.02 = 13,743.54` against `13,744.00`, closed by `0.46`.
5. Credit note and debit note issue against an invoice, each carrying the originating invoice **number** as text; a zero-quantity line is rejected at the boundary with a message that does not say "negative".
6. Serials on invoice lines at 26 and at 500.
7. RLS + audit for each new table: `rls.test.ts` covers RLS **automatically** (`:108-161`, derived from `pg_class`); the **audit trigger is not covered by any enumeration** — write a per-table assertion, following `packages/db/tests/dealer-addresses.test.ts:294`.
8. A doc-prefix test: adding a key to the JSONB default without adding it to `docPrefixesSchema` loses it on save (`update-tenant.ts:110` replaces the whole object and Zod strips unknowns).
9. Verify spec `apps/web/tests/e2e/verify-day-f6.spec.ts` — resolve documents by a **stable key**, never `.first()`/shape (F.137, DEV.119).

**Seeds.** Deterministic, and per §11.1 ruling 4 fix the seed rather than exclude a field. Note F.97 bounds any corpus-wide measurement: its title says "38 of 64 performa_invoices have zero rows", F.152's later measurement says 63 of 94 — the two disagree and **both need a DB query to settle**. §7 item 3: yes, F.97 bounds anything measured across the PI corpus; it does not bound a purpose-built invoice fixture, which is what I recommend the acceptance measurements use.

---

## Phase C — closeout

Per `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" (C1-C10), in full. Unusual for this day:

- **C5** closes **four** rows, not one: F.6, F.8, F.144, and **F.152** (whose note says explicitly: _"this row closes when F.6 implements read-the-totals-derive-the-grouping with the reconciliation assertion, and the operator sets that"_). Also update F.153 (resolved here) and F.7 if the serials land. Check whether F.99/F.114 notes need a correction now that the loader reads totals.
- **C6** must carry: the movement prediction and what the measurement actually showed; whether criterion 6's expected move occurred; the round-off write-path decision as taken; and every filed-not-fixed item (settlement, delivered-dispatch return, F.159, the five outstanding-figure read paths).
- **C6a** — four or more new ids (DEV, filed tasks). Run the checks; the files are not sorted and the tail is not the maximum.
- **C6b** — no unearned precision. Do not write "14/14 identical" unless you ran `compare-figures.mjs` and can name it.
- **C7a** — the `verifier` runs **before** the PR. A FAIL stops the day.
- **C8** — merge is a production deploy. Merge authority is the operator's.

---

## ACCEPTANCE CRITERIA — and what decides each

1. Both loaders read the seven stored header totals; the two reconciliation assertions exist and throw. → `apps/workers/src/templates/{quotation,performa-invoice}.tsx` on review, plus the A.1.5 test in `pnpm --filter @dealerlink/workers test`.
2. The assertion has been **shown to fail** when stored and derived disagree. → the A.1.5 mutate-and-rollback test, which must go red if the assertion is removed.
3. All 14 reference cases hold. → `pnpm --filter @dealerlink/workers test` (`pdf-snapshots.test.ts`) exits 0, inside the required `test` job.
4. **Any movement in the 14 was predicted in writing before the test ran, and the prediction matched.** → the written prediction in the branch, against `REFS_DIR=/tmp/pre-f6 node apps/workers/scripts/compare-figures.mjs /tmp/post-f6` exit code and its per-document `reference only:` / `render only:` output. _Note: on F.152's measurement the predicted set is empty; a non-empty diff is a finding._
5. An invoice issues from a confirmed order, renders, and carries its serials at 26 and at 500. → `verify-day-f6.spec.ts` + the worker render tests.
6. `round_off` is stored, rendered as the last row before Grand Total, and equals `storedTotal − (storedTaxable + Σ grouped tax)` exactly on a document whose unrounded total is not a whole rupee. → a worker test asserting the loaded `roundOff` and the extracted PDF text on the 13,743.54 → 13,744.00 fixture.
7. `packages/tax` is unchanged — no file modified, no fixture moved. → `git diff --stat main -- packages/tax` prints nothing.
8. A credit note and a debit note issue against an invoice, each carrying the originating invoice number as a **snapshot** (a text column, not only an FK). → schema on review + a test that changes the invoice's number and asserts the note's snapshot does not move.
9. A zero-quantity credit-note line is rejected at the boundary with a message that does not claim the quantity is negative. → a boundary-validation test; `compute.ts:151-156` is not touched.
10. The type divergence is resolved, not widened. → `apps/workers/src/pdf/view-model.ts` + `apps/workers/src/jobs/render-pdf.ts` on review, and `pnpm typecheck` green with the exhaustiveness mechanism in place (a deliberately-missing config entry must fail `typecheck`).
11. Every new table has RLS enabled, forced, and a `tenant_isolation` policy. → `packages/db/tests/rls.test.ts:108` (automatic).
12. Every new table has an audit-trigger stanza **and a test asserting the audit row**. → per-table assertions in `packages/db/tests/`; **`rls.test.ts` does NOT cover this** — no enumeration test over `audit_trg` exists.
13. The operator-configurable "Tax invoice" prefix reaches a real document number. → a test that edits the prefix and asserts the issued number carries it.
14. `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check` exit 0.
15. All three required CI checks green: `checks`, `test`, `e2e`. → `gh pr checks --watch`.

**Criteria checked against each other.** 3 and 4 are compatible: 3 is the gate, 4 is the explanation. 6 and 7 are compatible only because round-off is computed in the **write path**, not in `packages/tax` — if any implementation of 6 requires editing `packages/tax`, 6 and 7 become jointly unsatisfiable and that is a STOP, not a trade. 2 and 3 are compatible: the mutation in 2 is rolled back, so it cannot reach 3's corpus — **but the test must not leave the row mutated, and `pnpm test` writes to the shared dev DB (C4's note, DEV.91)**, so verify the rollback.

---

## STOP AND ASK (CLAUDE.md §10.1)

1. **Every schema change and every migration here.** `invoices`, `invoice_lines`, `credit_notes`, `debit_notes`, their line and status-history tables, the `round_off` column, the `ship_to_address_id` FK, the `generated_document_type` enum values, every CHECK. None may be written before authorisation.
2. **`round_off` is a money column.** Named in §10.1.
3. **`packages/tax` is protected.** No file modified, no fixture moved. If the work appears to need it, stop.
4. The round-off **write** path — F6 D-3 settles WHAT is stored (the whole-rupee total) but storing a total no pure function of the lines reproduces is a change to how a money column is derived. Present the write path alongside the DDL and treat it as part of the same authorisation.
5. Role gating for the three documents — the Admin/Accounts split is a doc proposal, never implemented.
6. Whether any of this warrants a **new ADR or supersedes one**. ADR-015 (Typst) and ADR-016 (place of supply) are both in the blast radius. Writing or superseding an ADR is §10.1.
7. **Merge and deploy.** `main` carries `deploy_on_push: true` on both DO apps.
8. **Any movement in the 14 reference cases that was not predicted.** Bring it; do not widen the tolerated segment and do not touch `docs/pdf-references/`.
