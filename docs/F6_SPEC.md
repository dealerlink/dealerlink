# F.6 / F.8 / F.144 — Tax invoice, credit note, debit note

**Status:** specification. Written against `docs/INVOICE_CN_DN_AUDIT.md`, which
is the authority on _where_; this is the authority on _what_ and _why_. Do not
restate the audit's site lists — cite them.

**One body of work, not three tasks in sequence.** They share the numbering
machinery, the party model, the money columns, RLS discovery, permissions and
all twenty `chrome.typ` components. The audit found four genuine differences
(§4) and everything else is one implementation. Building them separately means
touching the same files three times.

**Three decisions are settled and are inputs, not questions:**

|       | Decision                                                                                                        | Recorded                  |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| F.152 | The loader reads stored **totals** and derives only the **grouping**                                            | F.152                     |
| D-7   | `ship_to_address_id` FK on all four documents; no snapshotted address text                                      | `STAGE_F_BUILD_v3.md` §10 |
| D-8   | Credit and debit notes carry **positive lines**; the document type supplies direction. `packages/tax` untouched | `STAGE_F_BUILD_v3.md` §11 |

---

## 1. The loader change comes first

F.152 is not a detail of this work; it is its precondition, and it lands before
any document type is built.

`performa-invoice.tsx:116-139` recomputes every total from stored lines, while
`view-model.ts:14-16` asserts that numbers are read and never recomputed, citing
`CLAUDE.md` §19. They agree today only because the stored columns were
themselves written by `computeTax`.

**The new contract:**

- **Totals are read from stored columns** — `subtotal`, `discount_amount`,
  `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`,
  `total_amount`. Never recomputed.
- **Grouping is derived from lines** — `byRate` and `byHsn`, as
  `computeTaxSummary` already does. Per-line tax is not stored, so this half
  must be derived.
- **The two reconcile exactly**, asserted in the loader, failing loudly with a
  named error identifying the document.

Apply it to the PI loader as part of this work. The quotation loader too, if
the audit's enumeration shows it shares the mechanism.

**HOW AN INTENDED MOVE IS DISTINGUISHED FROM AN UNINTENDED ONE — settled
2026-09-30. Take a PRE-CHANGE CAPTURE, and write the predicted move-set down
before re-running the test.**

There is no expected-diff manifest and no per-case classification: the 14 objects
in `apps/workers/scripts/typst-matrix.json` carry only `label`, `type`,
`tenantSlug`, `documentNumber` and `branded`, and `pdf-snapshots.test.ts`
tolerates exactly two named deviations. There is also **no way to re-baseline** —
the capture tool named in `docs/pdf-references/README.md` is absent from
`apps/workers/scripts/` (F.83's one-way door). So the discrimination cannot be
automated, and the only thing that makes a move intended is that it was
**predicted in writing, per figure, before the test was re-run**.

1. On `main`, before any change:
   `cd apps/workers && pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/pre-f6`
2. After the loader change, the same command to `/tmp/post-f6`.
3. `REFS_DIR=/tmp/pre-f6 node apps/workers/scripts/compare-figures.mjs /tmp/post-f6`.
   That script reads `REFS_DIR` and defaults to `docs/pdf-references`, so the
   pre-change set becomes the reference; it prints the set difference in **both**
   directions per document and exits non-zero on any difference. **That output IS
   the move manifest.**
4. `compare-typst.mjs --refs /tmp/pre-f6 --renders /tmp/post-f6` for the
   side-by-side and the full extracted text of each pair.

Both need the scratch rasteriser install (`docs/RUNBOOKS.md` R25) and **neither
runs in CI**.

**THE PREDICTED MOVE-SET IS EMPTY, AND THAT PREDICTION IS CONDITIONAL — write
both down in the branch before step 2.**
F.152 measured 0 of 31 PIs and 0 of 48 quotations differing between stored and
recomputed; every reference case has lines, because they render today; and
`round_off` is on the **invoice** table only, so no quotation or PI totals block
gains a row. **So any non-empty diff is a finding**, and the criterion is not
"expect a move" but "predict the move-set, and justify every element of it".

**THE CONDITION: `round_off` lands on the INVOICE TABLE ONLY this day.** If it
were also added to `performa_invoices`, the PI totals block would gain a Round
Off row and **three PI reference cases would move for real** — the empty
prediction would be false, and the day would need a justified per-figure move
manifest instead. Settled 2026-09-30: **invoice only, and the PI is FILED as
EXPECTED WORK rather than as a maybe** (F.165). The client's PFI-2033 totals
₹5,76,955.00, a whole rupee, so the PI probably does need it; the deferral is
because adding it here moves three reference cases, and that deserves its own day
with its own pre-change capture rather than being folded into a day that already
changes the loader.

So if this day's scope grows to include the PI column, **the empty prediction is
void** and §1's procedure must be re-run with a non-empty expected set.

`typst-determinism` cannot move either: `determinism-check.ts` pins a single
dispatch case, which no quotation or PI loader change can reach.

**Why this cannot wait:** an invoice descends from an order, and `orders` has
`discount_amount` but no `discount_type` or `discount_value` (F.114). A
recomputing loader therefore cannot reproduce its parent's own discount — it
would print a different number on a legal document and nothing would notice.
That was measured: `demo/ORD-2026-0023` stores `discount_amount` 30046.50 and
recomputes to 0.00, cascading +32414.89 onto the total.

---

## 2. Round-off, expressible for the first time

Under §1, round-off is **the reconciliation term**, not a column fighting a
recomputation:

```
roundOff = storedTotal − (storedTaxable + sum of grouped tax)
```

**But it must also be stored**, because a reconciliation term derived at render
time is a recomputation by another name. Add `round_off` to the invoice table,
written at issuance by the same path that writes the other totals, and have the
loader read it and assert the identity above.

**WHAT `total_amount` STORES — settled 2026-09-30: the WHOLE-RUPEE total, not the
engine total.**

This is forced, not preferred. `packages/tax/src/compute.ts:132` is:

```ts
totalAmount: taxableAmount.plus(cgstAmount).plus(sgstAmount).plus(igstAmount),
```

so **if the invoice stored `computeTax`'s `totalAmount`, the identity above would
evaluate to 0.00 for every document that has ever existed and no Round Off row
could ever appear.** Shipping the column under that write path would be shipping
a column that is always zero. The client's `ROUND OFFS 0.46` closing 13,743.54
against a stated 13,744.00 establishes the requirement, so the stored total must
be the whole-rupee figure — a number **no pure function of the lines
reproduces**, which is precisely why §1 is a precondition rather than a tidy-up.

Two consequences that are part of this decision, not details of it:

- **`amountInWords` and `grand:` follow the STORED total.** Today
  `amountInWords(tax.totalAmount)` and `grand:` take the engine's figure; under
  this ruling both read the stored one, or the document says one number in
  figures and a different one in words.
- **`round_off` is SIGNED. No `>= 0` CHECK.** Rounding 13,744.40 down to
  13,744.00 gives **−0.40**. A non-negative constraint would reject half of all
  real cases. A magnitude bound is defensible; a sign bound is not.

**ROUND-OFF IS ALWAYS APPLIED — settled 2026-09-30, and stated as a DECISION
rather than left as an omission.** Nothing in `tenant_settings` expresses a
rounding preference, and none is added. Every invoice rounds to the whole rupee
and carries the `round_off` term, for a tenant that wants it and a tenant that
does not.

The precedent is CLAUDE.md §8's locked decisions: the fiscal year is hardcoded to
April–March and the currency and locale to INR/en-IN for Phase 1, each with a
`tenant_settings` column already present but read as a constant. The same shape
applies here — if per-tenant rounding is ever wanted it is a column and a config
flip, not a migration. What matters is that this is **recorded as chosen**, so
nobody later reads the absence of a flag as an oversight and adds one in passing.

**AND THE IDENTITY CANNOT DETECT A WRONG `taxable_amount`**, which must be stated
so nobody reads it as covering more than it does. `storedTaxable` appears on both
sides of `roundOff = storedTotal − (storedTaxable + Σ grouped tax)` and
**cancels**. The assertion catches tax drift and nothing else. Covering the
taxable half needs a SECOND assertion — `Σ(line taxable) === stored
taxable_amount` — which is computable, because the loader already holds the
per-line taxable figure.

The client's evidence is the requirement: their documents round to whole rupees
and their Tally voucher `MA/26-27/1079` carries `ROUND OFFS 0.46`, which closes
12,629.50 + 557.02 + 557.02 = 13,743.54 against a stated total of 13,744.00. So
round-off reconciles a whole-rupee document total against line-level tax
arithmetic. It is a correctness requirement, not a display convention.

**The insertion point is already specified in live code.** `chrome.typ:337-356`
carries an explicit ROUND-OFF INSERTION POINT, and `totals-block(words:, rows:,
grand:)` is caller-driven — so **no edit to `chrome.typ` is required**. The row
appends as the last element of `rows:` in the calling template, after the
`taxRows` spread and before `grand:`. The four on-screen totals blocks take it
at the positions the audit enumerates.

---

## 3. The invoice

The audit is unambiguous: **no write path, read path, route, template or test
exists.** Five declaration-only placeholders do.

**Resolve the type divergence first.** `RenderableDocumentType` has five arms
including `'invoice'`; `RenderableKind` has four and omits it, and
`TEMPLATE_FOR`, `FOOTER_LABEL` and `filenameFor` are all keyed on the four-arm
union (F.153).

**Settled 2026-09-30: TWO unions, plus a type-level exhaustiveness check that
makes the relationship between them CHECKED rather than remembered.**

> **This REVERSES a ruling made earlier the same day, and the reasoning matters
> more than the outcome.** The first ruling was "ONE union — two kept in step by
> hand is what produced the divergence". That mistook the symptom for the cause.
> **The queue payload and the renderer's capability are genuinely different
> sets**: the payload boundary describes what a job may legitimately ASK FOR,
> and `RenderableKind` describes what the renderer can actually PRODUCE. A
> document type can correctly exist in the first while absent from the second —
> that is what `render-pdf.ts`'s exclusion list expresses today for
> `'invoice'`. Collapsing them would assert an identity that is **not true**,
> and would force every future not-yet-implemented type to be either absent from
> the payload schema (so the job cannot be enqueued at all) or present in the
> renderer's config objects (so it claims a template it does not have).
>
> **The defect was that the relationship was UNCHECKED, not that there were two
> types.** The fix is therefore a check, not a merge: an exhaustiveness
> constraint asserting that every `RenderableKind` has an entry in
> `TEMPLATE_FOR`, `FOOTER_LABEL` and `filenameFor`, and that every
> `RenderableDocumentType` is either a `RenderableKind` or explicitly listed
> in the exclusion set. Then adding an arm to either union without completing the
> other side fails `typecheck` instead of drifting.
>
> Recorded as a reversal rather than an edit because the first ruling dismissed
> this argument without engaging it, and the record of a decision is worth less
> if it hides the version that was wrong.

**Build:**

- `invoices` table with the seven money columns plus `round_off`, the
  `ship_to_address_id` FK per D-7, and the arrangement column F.5a added to PIs
  and orders
- `'invoice'` allocated through `nextCounter` — which takes a free-text
  `docType`, so **no migration is needed** for numbering
- Route and server action issuing from a **confirmed order**
- `templates-typst/tax-invoice.typ`. **Not** a React template: `tax-invoice.tsx`
  reusing `_components/*` is dead code post-ADR-015, and the audit corrects
  `TAX_INVOICE_AUDIT.md` §A.1/§A.3 on exactly this
- Serials rendered on invoice lines (F.7). Their own invoice lists 26 under one
  line item; test at 26 and at 500

**Fix the orphan placeholder.** `tenant-detail-sections.tsx:817` renders a live,
persisting, role-gated "Tax invoice" prefix input for a document that cannot be
created, and `invoice` is required in `docPrefixesSchema` so it cannot be
deleted. It becomes correct by construction once the invoice exists — confirm
that rather than assume it.

**An issued invoice is immutable.** It has no edit path; the credit note is its
correction mechanism.

---

## 4. Credit and debit notes

**Positive lines, direction from the document type** (D-8). `packages/tax` is
untouched — no protected-surface change and no stop-and-ask.

The audit's three blockers resolve as follows:

| Blocker                                                                                | Resolution                         |
| -------------------------------------------------------------------------------------- | ---------------------------------- |
| `computeTax` throws on negative lines                                                  | Moot under D-8. Lines are positive |
| `payment_allocations_target_chk` permits exactly one of `(orderId, performaInvoiceId)` | **Out of scope.** See below        |
| `payments_amount_chk` is `amount > 0`                                                  | Same                               |

**Settlement is explicitly out of scope for this work.** A credit note against
an invoice is a _document_; how it settles against a payment or a future invoice
is a separate problem needing a third allocation target and a rewritten
constraint. **File it.** Building the document without the settlement is
correct: their Tally receives vouchers, and reconciliation happens there.

**What each needs beyond an invoice:**

- An enum migration for `credit_note` / `debit_note`. The invoice does not need
  one; these do
- **The originating document reference** — the invoice's number _snapshotted_,
  not only an FK. GSTR-1's CDNR section reports the original invoice number, and
  that must not change if the invoice is ever renumbered. This is the one shape
  with no precedent in the codebase, so specify it explicitly rather than
  inferring from the party pattern
- Their own status lifecycle. An issued invoice is immutable; a credit note is
  the correction. They cannot share a state machine

**Zero-price lines work and zero-quantity lines do not** — `unitPrice >= 0`,
`quantity > 0`, executed and confirmed. A fully-reversed line is therefore
expressed by omitting it, not by a zero quantity. Say so in the code, because
the alternative will be attempted and will throw under a misleading name
(F.159).

---

## 4a. Settled 2026-09-30 — prefixes, roles, and the settlement comments

**Document prefixes: use the FALLBACK, do not extend the admin surface.** Allocate
`credit_note` and `debit_note` numbers through the `prefixes['x'] ?? 'CN'` pattern
`allocatePaymentNumber` already uses (`apps/web/lib/actions/payments/helpers.ts:37`).
Zero admin-surface change and no JSONB default change this day.
Operator-configurable prefixes for the two notes are **filed** (F.164).

The reason to keep them apart is a live data-loss path, filed separately as
**F.163**: `updateTenantDocPrefixes` replaces the **whole** `doc_prefixes` JSONB and
`docPrefixesSchema` is a closed `z.object`, so **a key present in the database
default but absent from the schema is DELETED on the first operator save** —
silently, with no error, and no test covers it. The three lists
(`docPrefixesSchema`, the JSONB default, the admin `keys` array) must only ever
change together, and this day changes none of them.

**Role gating: Accounts issues invoices; ADMIN issues credit and debit notes.** Not
the same authority — raising a receivable and reducing one are different acts, and
the second writes off money the tenant is owed. CLAUDE.md §6 gives Accounts
"generate invoices" explicitly, so the invoice half is the rule already written;
the notes go to Admin because §6 grants Admin everything within the tenant and §9
forbids inventing a role permission that is not specified. `TAX_INVOICE_AUDIT.md:96`
proposed exactly this split and it was never implemented — it is now a decision
rather than a proposal.

**The settlement read-path comments are AUTHORISED for this day** — five one-line
comments, one at each site named in F.161
(`packages/db/src/payments/recompute.ts:57-60`,
`apps/web/lib/reports/outstanding.ts:102`, `apps/web/lib/queries/payments.ts:381`
and `:433`, `apps/web/app/(app)/dashboard/page.tsx:94`), each naming F.161 and
saying the figure is incomplete once a reducing document exists. This is an
explicit authorisation of a scope extension beyond the three tasks (§11.2), granted
because a filed row nobody reading `outstanding.ts:102` will ever find is how the
gap becomes a support ticket. **Comments only — no behaviour change at any of the
five sites.**

---

## 5. Out of scope

- **E-invoice and e-way bill** — F.23/F.24/F.25, GSP-gated, days 76–83
- **Settlement of a credit note** against payments or invoices — filed per §4
- **`packages/tax` behavioural change** of any kind. If the work appears to
  require one, that is a STOP
- **F.159's error-code rename** — filed, touches `packages/tax`
- **F.114's `discount_type`/`discount_value` on orders.** §1 removes the
  urgency by reading stored totals, but the gap stands
- **Returning a delivered dispatch.** `returnDispatchDb` accepts only an
  `in_transit` dispatch. A credit note against a delivered order has no
  inventory counterpart — file it, do not extend the return engine here

---

## 6. Acceptance

1. The loader reads stored totals, and the reconciliation assertion **has been
   shown to fail** by a MUTATE-AND-ROLLBACK FIXTURE: a test that alters one stored
   money column inside a transaction, asserts the loader raises its named error
   identifying the document, and rolls back. _(Amended 2026-09-30 — "has been
   shown to fail" named no mechanism, and a criterion whose satisfaction cannot be
   demonstrated is how DEV.129 happened. The fixture is the mechanism, and it must
   also go RED if the assertion is deleted, or it is testing the database rather
   than the assertion.)_
2. An invoice issues from a confirmed order, renders, and carries its serials
3. Round-off is stored, rendered, and reconciles
   `stored total − (stored taxable + Σ GROUPED tax)` exactly — **the GROUPED tax,
   derived from the lines, not the stored tax columns.** That is the side that can
   catch a grouping error; stored-against-stored compares two numbers written by
   the same call and cannot. **Plus a SECOND assertion,
   `Σ(line taxable) === stored taxable_amount`** — because the first identity
   **cannot detect a wrong `taxable_amount`: `stored taxable` appears on both
   sides and cancels.** _(Amended 2026-09-30. As written this was ambiguous between
   stored and grouped tax, and the two differ in exactly what the assertion is
   capable of catching.)_
4. A credit note and a debit note issue against an invoice, each carrying the
   originating invoice number as a snapshot
5. `packages/tax` is unchanged — no file modified, no fixture moved
6. All 14 reference cases hold on page count, footer text and body text — the
   three things `pdf-snapshots.test.ts` asserts. **The predicted move-set is
   EMPTY and was written down in the branch BEFORE the test was re-run**; any
   non-empty diff is a finding requiring justification per figure. _(Amended
   2026-09-30. This read "Expect the PI reference renders to move … the day must
   distinguish an intended move from an unintended one before it starts". Both
   halves were wrong: F.152's own measurement predicts no move, and no mechanism
   can classify a move before the move exists — the satisfiable form is "before
   the test is re-run". "All three measures" was undefined anywhere in this
   document; it is now named.)_
7. The type divergence is resolved, not widened
8. Every new table is caught by `rls.test.ts`'s enumeration, with its
   `tenant_isolation` policy present. This half is **automatic** — the test
   derives its population from `pg_class`, so a new tenant-scoped table is
   checked without anyone adding it to a list.
9. Every new table has its `audit_trg` stanza in `triggers/audit-log.sql` **and a
   per-table test asserting the audit row**. This half is **NOT automatic and
   nothing enumerates it**: `rls.test.ts` checks `relrowsecurity`,
   `relforcerowsecurity` and the policy only, and no test anywhere enumerates the
   25 hand-written trigger stanzas — so a table whose stanza was forgotten looks
   identical to one that has it. _(Split from a single criterion on 2026-09-30.
   The two halves have different deciders, and conflating them let the manual half
   inherit the automatic half's assurance. `dealer-address.ts:63-65` records F.5a
   hitting exactly this.)_

---

## 7. Open for the builder

Report; do not decide:

1. Whether the quotation loader shares the PI loader's recomputation, and
   whether §1 applies to it
2. What `nextCounter`'s free-text `docType` means for the three new document
   types — confirm no migration is needed, rather than inheriting the audit's
   claim
3. Whether the audit's "63 of 94 PIs have no lines" (F.97) bounds any acceptance
   measurement here, as it bounded F.152's
