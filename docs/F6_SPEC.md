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
union (F.153). Resolve it — do not widen both and leave two unions that must be
kept in step by hand.

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

1. The loader reads stored totals; the reconciliation assertion exists and has
   been shown to fail when the two disagree
2. An invoice issues from a confirmed order, renders, and carries its serials
3. Round-off is stored, rendered, and reconciles `stored total − (taxable +
tax)` exactly
4. A credit note and a debit note issue against an invoice, each carrying the
   originating invoice number as a snapshot
5. `packages/tax` is unchanged — no file modified, no fixture moved
6. All 14 reference cases hold on all three measures. **Expect the PI reference
   renders to move** if §1 changes what the PI loader prints — that is the
   feature, not a finding, and the day must distinguish an intended move from
   an unintended one before it starts
7. The type divergence is resolved, not widened
8. Every new table is caught by `rls.test.ts`'s enumeration, with its policy and
   audit trigger present

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
