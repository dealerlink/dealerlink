# F.105 — Does the production order path derive `place_of_supply` from the tenant's state?

**Audit only. Nothing was fixed.** Completed 2026-09-23 on `main` at `43c06db`.

**Verdict: NO.** `orders.place_of_supply` is written in exactly one production place,
and it copies the PI's value, which is itself derived from the **ship-to dealer's**
state per ADR-012. No production write site on any of the three document types reads
the tenant's state into `place_of_supply`.

The verdict is stronger than "currently correct". `dealers.state` is nullable
(`packages/db/src/schema/dealer.ts:54`), so a tenant-state fallback was _available_
— and `apps/web/lib/actions/pi/helpers.ts:152-154` **throws**
`VALIDATION: "<role> dealer is missing a state"` instead of taking it. The production
path refuses to produce the bad value rather than substituting one. The only
`?? tenantState` fallbacks in the repository are in two seed derivations (D4, D6 below).

**The 34-mismatching-orders measurement that prompted this audit is real, and it is
seed corruption** (the "of 68" in the original framing was a wrong denominator — see
the correction under Measurements):
four hardcoded `'MH'` literals in two seed modules, plus four more on the adjacent
`tenant_state_at_issue` column in the same inserts. The three document types do **not**
share a derivation, so the blast radius is _data_, not _logic_.

## Method and instruments

Two independent passes reached the same verdict and the same mapping.

- `code-auditor` (read-only, no database): the writer enumeration, the derivation
  list and the site→derivation mapping, via `Grep` (ripgrep-backed) with
  `head_limit: 0` for complete populations, plus full reads of the five production
  actions and the four seed modules. Negative-existence claims rest on affirmative
  enumeration: a file that does not appear in the complete 94-file
  `place_of_supply|placeOfSupply` population cannot write the column
  (CLAUDE.md §11.1 rulings 7 and 8).
- The main thread: the write-path read, and **every measurement below**, against the
  live development database through `psql` on `DATABASE_DIRECT_URL` (the `dealerlink`
  superuser, so RLS does not hide rows). Insert sites were enumerated with
  `git grep -n "insert(orders)"` and cross-checked against `git grep` and `rg -na` on
  both spellings — `rg -na` because `git grep` cannot see untracked files, and plain
  `grep` is corroboration only (ruling 8).

Where a claim below is measured, it says so. Where it is inferred, it says that too.

## The column exists on all three tables

`orders.placeOfSupply` `packages/db/src/schema/order.ts:77` (ADR-012 comment at `:75`);
`performa_invoices.placeOfSupply` `performa-invoice.ts:73` (comment `:71`);
`quotations.placeOfSupply` `quotation.ts:63`. All `text NOT NULL` under a
`~ '^[A-Z]{2}$'` CHECK (`order.ts:125`, `performa-invoice.ts:123`, `quotation.ts:115`).
Confirmed present in the live database on all three tables.

That is why the blast-radius question was the right one to ask: a shared faulty
derivation would have reached three document types, and F.4 prints the tax type on
all three.

## List 1 — every write site

### `orders`

| #   | Site                                                                                                         | Kind                                               |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| O1  | `apps/web/lib/actions/pi/status-transitions.ts:143` (value `:153`)                                           | **PRODUCTION** insert — `confirmPi`. The only one. |
| O2  | `packages/db/src/seeds/day11.ts:407` (value `:417`)                                                          | seed                                               |
| O3  | `packages/db/src/seeds/day12.ts:171` (value `:180`)                                                          | seed — **defective**                               |
| O4  | `packages/db/src/seeds/day13.ts:246` (value `:255`)                                                          | seed — **defective**                               |
| O5  | `packages/db/src/seeds/multi-rate.ts:634` (value `:644`)                                                     | seed                                               |
| O6  | `packages/db/tests/orders.test.ts:92`, `:369`, `:449`; `dispatch.test.ts:121`, `:378`; `payments.test.ts:99` | test fixtures                                      |
| O7  | `packages/db/migrations/0015_normalize_state_codes.sql:347-387`                                              | in-place code normalization                        |

`UPDATE orders` sites that do **not** touch the column, established affirmatively —
none appears in the 94-file population: `packages/db/src/orders/transitions.ts:134`
(the `updates` object is built in full at `:120-132` — status, timestamps, cancel
reason), `packages/db/src/payments/recompute.ts:65`,
`apps/web/lib/actions/orders/order-lifecycle.ts:34`,
`packages/db/src/seeds/day12.ts:308` and `:329` (payment status only).

There is **no** `apps/web/lib/actions/orders/` write of this column at all. That
absence is what makes the derivation question necessary: the order does not derive,
it inherits.

### `performa_invoices`

| #   | Site                                                                                                                | Kind                  |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| P1  | `convert-quotation-to-pi.ts:99` (value `:108`)                                                                      | **PRODUCTION** insert |
| P2  | `update-pi.ts:79` (value `:82`)                                                                                     | **PRODUCTION** update |
| P3  | `day11.ts:305` (value `:314`)                                                                                       | seed                  |
| P4  | `day12.ts:144` (value `:152`)                                                                                       | seed — **defective**  |
| P5  | `day13.ts:223` (value `:231`)                                                                                       | seed — **defective**  |
| P6  | `multi-rate.ts:557` (value `:566`)                                                                                  | seed                  |
| P7  | `payments.test.ts:80`; `orders.test.ts:68`; `dispatch.test.ts:61`; `apps/workers/tests/maintenance-jobs.test.ts:74` | test fixtures         |
| P8  | `0015_normalize_state_codes.sql:263-303`                                                                            | normalization only    |

Not touching it: `packages/db/src/pi/transitions.ts:119`,
`apps/workers/src/jobs/validity-expiry.ts:53`.

### `quotations`

| #   | Site                                                                          | Kind                             |
| --- | ----------------------------------------------------------------------------- | -------------------------------- |
| Q1  | `create-quotation.ts:73` (value `:83`, via `helpers.ts:174`)                  | **PRODUCTION** insert            |
| Q2  | `revise-quotation.ts:38` (value `:48`)                                        | **PRODUCTION** insert (revision) |
| Q3  | `update-quotation.ts:98` (value conditionally set `:87`)                      | **PRODUCTION** update            |
| Q4  | `day8.ts:420` (value `:430`)                                                  | seed                             |
| Q5  | `day8.ts:574` (value `:584`)                                                  | seed (revisions 2/3)             |
| Q6  | `multi-rate.ts:468` (value `:479`)                                            | seed                             |
| Q7  | `quotation.test.ts:97`, `:224`, `:250`, `:277`; `maintenance-jobs.test.ts:50` | test fixtures                    |
| Q8  | `0015_normalize_state_codes.sql:179-219`                                      | normalization only               |

Not touching it: `apps/web/lib/actions/quotations/status-transitions.ts` (5 update
sites), `validity-expiry.ts:45`, `day8.ts:558`.

## List 2 — every derivation

Seven distinct expressions produce a value. **There is no shared helper that derives
it.** `computeDocumentTotals` / `computeTotalsForPersistence` / `totalsFor` _consume_
it as a parameter and never compute it.

| ID  | Expression                                                             | Location                                                             | Reads                                                        |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| D1  | `(input.placeOfSupplyOverride ?? dealerCtx.dealerState).toUpperCase()` | `create-quotation.ts:56`; `update-quotation.ts:44-46`                | the quotation's own dealer                                   |
| D2  | `(input.placeOfSupplyOverride ?? shipTo.state).toUpperCase()`          | `convert-quotation-to-pi.ts:71`; `update-pi.ts:41`                   | **ship-to dealer**, or an explicit operator override         |
| D3  | `placeOfSupply: <parent>.placeOfSupply`                                | `revise-quotation.ts:48`; `status-transitions.ts:153`; `day8.ts:584` | copy from the parent document                                |
| D4  | `(shipTo.state ?? tenantState).toUpperCase()`                          | `day11.ts:275`                                                       | ship-to, tenant state only as a null-fallback                |
| D5  | `plan.forcePlaceOfSupply ?? dealer.state ?? tenantState`               | `day8.ts:374`                                                        | seed override, then the dealer                               |
| D6  | `dealer.state ?? tenantState`                                          | `multi-rate.ts:461`                                                  | the single dealer, tenant state as a null-fallback           |
| D7  | literal `'MH'`                                                         | `day12.ts:152`, `:180`; `day13.ts:231`, `:255`                       | **nothing. Hardcoded, and it equals tenant `demo`'s state.** |

Supporting: `loadDealerForDocument` (`pi/helpers.ts:132-156`) upper-cases and throws
on a missing state; `loadDealerForQuotation` (`quotations/helpers.ts:53`).

## The mapping — site to derivation

**orders**

| Site                          | Derivation                         | Ship-to respected?              |
| ----------------------------- | ---------------------------------- | ------------------------------- |
| **O1 production `confirmPi`** | **D3, copying a PI written by D2** | **YES — correct**               |
| O2 day11                      | D4                                 | yes                             |
| **O3 day12:180**              | **D7**                             | **NO — defective**              |
| **O4 day13:255**              | **D7**                             | **NO — defective**              |
| O5 multi-rate                 | D6                                 | yes, by the single-dealer shape |

**performa_invoices**

| Site                      | Derivation | Ship-to respected? |
| ------------------------- | ---------- | ------------------ |
| **P1 production convert** | **D2**     | **YES — correct**  |
| **P2 production update**  | **D2**     | **YES — correct**  |
| P3 day11                  | D4         | yes                |
| **P4 day12:152**          | **D7**     | **NO — defective** |
| **P5 day13:231**          | **D7**     | **NO — defective** |
| P6 multi-rate             | D6         | yes                |

**quotations** — Q1 → D1, Q2 → D3, Q3 → D1, Q4 → D5, Q5 → D3, Q6 → D6. All correct:
a quotation has no separate ship-to, so CLAUDE.md §5 makes the dealer's own state the
place of supply. **This difference is expected and is not a finding.**

**The decisive negative result:** no PI or order write site uses D1 or any other
quotation-shaped derivation. The three document types do not share a derivation, so
a fix is scoped to two seed files.

**`multi-rate.ts` (D6) is correct for a fragile reason.** `:564` and `:642` set
`shipToDealerId: dealer.id` — the same dealer whose state D6 reads. It agrees with
ship-to by the single-dealer shape, not by reading ship-to.

## Measurements

All against the live development database, 2026-09-23.

### `place_of_supply` versus the ship-to dealer's state

| Table                                | Agrees | Mismatch | Of the mismatches, how many carry tax |
| ------------------------------------ | ------ | -------- | ------------------------------------- |
| `orders`                             | 10     | **34**   | **0**                                 |
| `performa_invoices`                  | 30     | **34**   | **0**                                 |
| `quotations` (vs. the single dealer) | 49     | 4        | see below                             |

The 34 mismatching orders are **17 order numbers × 2 tenants**, not 34 distinct
documents — order numbers are per-tenant.

> **CORRECTION, 2026-09-23, made while fixing F.103.** The "agrees" column above
> originally read 34 for `orders` and 55 for `performa_invoices`, and the finding was
> described as "34 of 68" and "exactly half". **Those denominators were wrong.** They
> were measured against a database carrying **db-test fixture rows on top of the seed**.
> `pnpm db:seed` TRUNCATEs (`packages/db/src/seeds/index.ts:108`), so the corpus is
> whatever the seed wrote plus whatever has been inserted since — and
> `pnpm --filter @dealerlink/db test` inserts orders and PIs into the same shared
> development database, which is DEV.91's known behaviour. Reproduced deterministically,
> twice:
>
> | state                                     | orders | PIs    |
> | ----------------------------------------- | ------ | ------ |
> | clean reseed                              | 44     | 64     |
> | after `pnpm --filter @dealerlink/db test` | **68** | **89** |
> | clean reseed again                        | 44     | 64     |
>
> 68 and 89 are therefore a post-test-run corpus, not a seeded one. Re-measured by
> reseeding with the pre-F.103 code on a truncated database and taking the counts before
> running any suite: orders 34 mismatching against 10 agreeing, PIs 34 mismatching
> against 30 agreeing.
>
> **The numerator 34 is unchanged and was right both times**, as are every derivation,
> every write-site mapping and the verdict — none of which depends on the denominator.
> What does not survive is the phrase **"exactly half"** and the inference it invited,
> recorded in the original F.103 filing, that so clean a split "points at a code path
> taken for one branch of a conditional and not the other". It does not. The real shape
> is that 19 of each tenant's 22 orders are written by the two seed modules carrying the
> hardcoded literal, and 17 of those 19 land on a non-MH ship-to. The symmetry was an
> artefact of the extra rows.
>
> **The transferable lesson:** an absolute count taken against the shared development
> database is only as good as the database's provenance. Every count in this document was
> re-taken immediately after a reseed, before any suite ran. Where a claim needs a
> denominator, say which state it was measured in.

### Why 34 — measured, not inferred

day12 writes 11 orders per tenant (`day12.ts:84-96`) and day13 writes 8
(`day13.ts:120-132`), both assigning ship-to round-robin over active dealers while
hardcoding `'MH'`: 19 per tenant. Measured on the `sample` tenant, where any order
stamped `MH` is definitionally hardcoded because that tenant is in `KA`:

| Hardcoded orders | Ship-to happens to be MH, so coincidentally agrees | Mismatches |
| ---------------- | -------------------------------------------------- | ---------- |
| **19**           | **2**                                              | **17**     |

×2 tenants = 38 hardcoded, 4 coincidental, **34 mismatching**. day11 (D4) and
multi-rate (D6) are the consistent remainder.

### The second symptom — `tenant_state_at_issue` is hardcoded too

The same inserts hardcode `tenantStateAtIssue: 'MH'` (`day12.ts:151`, `:179`;
`day13.ts:230`, `:254`). Tenant `sample` is in **KA** (`packages/db/src/seeds/index.ts:75`).

| Table               | Tenant | Actual state | Stored | Rows   | Wrong   |
| ------------------- | ------ | ------------ | ------ | ------ | ------- |
| `orders`            | demo   | MH           | MH     | 46     | no      |
| `orders`            | sample | KA           | KA     | 3      | no      |
| `orders`            | sample | KA           | **MH** | **19** | **yes** |
| `performa_invoices` | demo   | MH           | MH     | 57     | no      |
| `performa_invoices` | sample | KA           | KA     | 13     | no      |
| `performa_invoices` | sample | KA           | **MH** | **19** | **yes** |
| `quotations`        | both   | —            | —      | 53     | no      |

On those 38 rows **both sides** of the inter-state comparison are wrong. They store
`MH/MH` and so read intra-state for a tenant that is not in Maharashtra at all; the
correct classification is `KA` against the ship-to's state, which is IGST on most of
them. The `demo` tenant is clean on this axis only because it happens to be in MH.
Quotations are clean — day8 and multi-rate derive it.

This is the same defect as the `place_of_supply` symptom — the same hardcoded
literals in the same inserts — and the two are separable only by which column is
inspected. They are folded into one row, F.103, for that reason: fixing either alone
leaves the data wrong.

### What the bad data already renders

`apps/web/app/(app)/orders/[id]/page.tsx:74` feeds the stored `place_of_supply` into
`summariseDocument`, so F.3's rate-wise block derives from it. Measured on
`ORD-2026-0003` — ship-to in `AS`, stored place of supply `MH`, one line at 18% on
₹50,000, header tax columns all `0.00`:

- rendered: **CGST @ 9% ₹4,500 / SGST @ 9% ₹4,500**
- correct under ADR-012 (`MH` → `AS` is inter-state): **IGST @ 18% ₹9,000**
- the header beside it reads **₹0.00** for all three

So the screen shows a wrong tax _type_ and a wrong _amount_, on a document whose
stored tax is zero. All 34 mismatching orders have line rows and a non-zero
`total_amount`; none has stored tax. F.4 will print the tax-type label from the same
wrong columns.

### Is the header/summary divergence reachable in production?

**No — it is a seed artefact, and it dies with F.103.** Two mechanisms were checked.

1. _Could production store zero tax over taxed lines?_ No. Every production write of
   the tax columns is either `totals` from the engine (`convert-quotation-to-pi.ts:118`,
   `update-pi.ts:89`, `create-quotation.ts:92`, `update-quotation.ts:73`) or a copy of
   a parent that was (`status-transitions.ts:159`, `revise-quotation.ts:57`). day12 and
   day13 simply never set `cgstAmount`/`sgstAmount`/`igstAmount` at all, so their rows
   default to zero over taxed lines. No production path does that.
2. _Could lines change after the header is computed?_ No. Production inserts order
   lines once (`status-transitions.ts:177`); the only later `update(orderLines)` sites
   are `dispatch/create.ts:357` (`dispatchedQuantity`), `dispatch/lifecycle.ts:151`
   (`dispatchedQuantity`) and `orders/reserve.ts:127`, `:161` (`reservedQuantity`) —
   fulfilment counters. Neither `unitPrice` nor `gstRate` occurs anywhere in those
   files. PI lines are deleted and re-inserted by `update-pi.ts:71-74` with the totals
   recomputed at `:68` in the same transaction.

The _structural_ shape — header from stored columns, summary derived from lines — does
have one production-reachable divergence: the discount allocation residual, already
documented at `apps/web/lib/tax/document-summary.ts:26-27`. **That is F.101**, and it
needs no separate row.

### The four quotation mismatches are not a defect

They are `day8.ts:163`, `:173`'s deliberate `forcePlaceOfSupply` overrides exercising
the production override path in D1:

| Quotation    | Tenant | Tenant state | Forced PoS | Dealer state | Classified |
| ------------ | ------ | ------------ | ---------- | ------------ | ---------- |
| QT-2026-0008 | demo   | MH           | TN         | KA           | IGST       |
| QT-2026-0008 | sample | KA           | TN         | KA           | IGST       |
| QT-2026-0009 | demo   | MH           | KA         | UP           | IGST       |
| QT-2026-0009 | sample | KA           | KA         | UP           | CGST+SGST  |

Worth one note: those seed comments read "inter-state vs MH", which holds for `demo`
and not for `sample`. `QT-2026-0009/sample` is forced to `KA` against a `UP` dealer and
lands intra-state. The override is the authority, so the value is not wrong — the
comment's stated intent just does not hold for both tenants.

## The reference PDFs are not affected

F.105's filing anticipated that correcting the seed would move the 14 Chromium
reference renders and need a deliberate re-baseline. **It would not.** There are no
orders among the 14, and both reference PIs are clean on both axes:

| Reference    | Tenant | `tenant_state_at_issue` | `place_of_supply` | Ship-to | Verdict |
| ------------ | ------ | ----------------------- | ----------------- | ------- | ------- |
| PI-2026-0001 | demo   | MH                      | MH                | MH      | clean   |
| PI-2026-0001 | sample | KA                      | MH                | MH      | clean   |
| PI-2026-0002 | demo   | MH                      | TN                | TN      | clean   |
| PI-2026-0002 | sample | KA                      | TN                | TN      | clean   |

The quotation, dispatch and payment-receipt references are unaffected — quotations are
clean on both columns, and neither dispatch nor payment receipts carry
`place_of_supply`.

## No test asserts the invariant

No test asserts `place_of_supply == ship_to_dealer.state`, or the
`tenant_state_at_issue == tenant_settings.state` equivalent. There is no test module
for the PI or order server actions at all. The nearest thing,
`apps/web/tests/e2e/verify-day-16.spec.ts:122-123`, _defends against_ the bad data in
its row-selection predicate rather than asserting the rule — it requires
`tenant_state_at_issue = place_of_supply = ship_to.state` to find a row it can trust.

## Conclusions

1. **The production path is correct on all three document types, and structurally
   refuses to produce the bad value.** No live tax-classification defect.
2. **F.103 is bounded fixture corruption**: eight hardcoded literals in two seed
   files — four on `place_of_supply`, four on `tenant_state_at_issue` — affecting 38
   orders and 38 PIs across two tenants.
3. **No re-baseline is required**, so F.103 is cheaper than its filing assumed.
4. **F.103 does not outrank F.101.**
5. The header/summary divergence visible on `ORD-2026-0003` is a seed artefact and
   dies with F.103. The one production-reachable divergence of that shape is F.101.
