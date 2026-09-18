# GST rate-model audit — can this codebase represent a rate set that changes over time?

> ## ⚠ CONFIRM THE SLAB SET WITH AN ACCOUNTANT BEFORE ANY SPEC IS WRITTEN
>
> This audit was prompted by an operator report that India restructured GST
> slabs on **22 September 2025** (GST 2.0, 56th Council): **12% and 28% removed
> as slabs, 40% added, and 3% / 0.25% special rates for precious metals
> continuing**.
>
> **The operator states these facts come from web sources, not from a CA and not
> from this repository. Nothing here verifies them.** No statutory source is
> cited anywhere in this codebase for any rate, and the project's own standing
> habit runs the other way — `packages/db/src/seeds/multi-rate.ts` records its
> product-to-rate mapping as "fixture realism" asserting no statutory rate.
>
> The main thread's own training data is **consistent** with the operator's
> account of the 56th Council restructuring. That is corroboration from a second
> unverified source, **not** verification, and it is recorded here only so the
> operator knows the claim was not merely passed through unexamined.
>
> **Two things need professional confirmation before a spec is drawn:**
>
> 1. **The current slab set**, exactly — including whether 12% and 28% are
>    abolished outright or retained for any residual category, and the precise
>    status of 3% and 0.25%.
> 2. **The transitional treatment of pre-22-Sep-2025 rates** — what a document
>    issued under the old schedule must show, and for how long those rates must
>    remain storable, renderable and reportable. §3 below shows the codebase
>    cannot currently express that distinction at all, so this answer sizes the
>    work directly.
>
> **§5 reframes the question** — the operator's challenge is that the defect is
> not the list's CONTENT but the existence of a hardcoded list at all, since the
> rate-to-product classification is the tenant's. §5 enumerates three options and
> recommends none. **§6** records F.81's seeded 12% as a separate,
> fixture-realism defect.
>
> Every finding below about **what the code can and cannot express** is
> independent of the claim and stands whichever slab set turns out to be
> correct. Findings that depend on the claim are marked `[depends on the claim]`
> by the auditing agent.

---

## Provenance

**Sections 1–4** were produced by the `code-auditor` subagent on 2026-09-18 and
are transcribed **unchanged**. That agent is granted `Read, Grep, Glob` only and
hands its report back as its return value, so it could not write this file.

**Section 0** is the main thread's, and exists because the agent has no shell.
Three of its findings were flagged in its own §4 as reasoned-but-unexecuted. All
three are now **executed**, and all three hold. Where §0 and §1–4 overlap, §0 is
the measurement and §1–4 is the reading.

Audit only. **No spec is drawn here, and no direction is recommended.**

---

## 0. Measured addenda (main thread, executed 2026-09-18)

### 0.1 Which rates the live constraint actually accepts

Attempted inserts into `products` on the dev database, then deleted:

| rate   | result                                                             |
| ------ | ------------------------------------------------------------------ |
| `40`   | **REJECTED** — `violates check constraint "products_gst_rate_chk"` |
| `3`    | **INSERTED**, reads back `3.00`                                    |
| `0.25` | **REJECTED** — by the CHECK                                        |
| `5`    | **INSERTED** (control — proves the probe can succeed)              |

### 0.2 The column type is not the obstacle for 40 or 0.25 — the constraint is

```
select '0.25'::decimal(5,2), '40'::decimal(5,2), '0.125'::decimal(5,2);
   ->    0.25                  40.00                0.13
```

`numeric(5,2)` stores `0.25` and `40.00` exactly. This confirms §1.3 by
execution. It also locates the real type ceiling one step further down: `0.125`
**rounds to `0.13`**, so a sub-quarter-percent rate would not survive storage —
though §1.3 is right that no half-rate is ever stored, only rendered.

### 0.3 Narrowing the constraint is a data migration, and it fails today — measured

§1.2 reasons that `ADD CONSTRAINT` without `NOT VALID` validates existing rows,
and its §4.1 correctly flags that as standard Postgres semantics rather than a
repository fact. Executed, inside a rolled-back transaction:

```sql
begin;
alter table quotation_lines drop constraint quotation_lines_gst_rate_chk;
alter table quotation_lines add constraint quotation_lines_gst_rate_chk
  check (gst_rate in (0, 3, 5, 18, 40));
rollback;
```

```
ALTER TABLE
ERROR:  check constraint "quotation_lines_gst_rate_chk" of relation
        "quotation_lines" is violated by some row
```

Rows currently at `12.00`: **products 2, quotation_lines 2,
performa_invoice_lines 2, order_lines 0** — F.81's seeded Chain A. The
constraint was confirmed intact afterwards (`pg_get_constraintdef` still returns
the six-member set), so nothing was changed.

**So a narrowing migration aborts against its own seed corpus today.** On a
tenant database carrying real historical documents it would abort against those
instead — and that is the mechanism by which a slab change becomes a data
problem rather than a schema edit.

### 0.4 The Chain A arithmetic, verified and projected

§2.1's hand arithmetic is confirmed against the database: the seeded
`QT-2026-0016` carries `cgst_amount = 10073.01`. Projections re-derived through
`packages/tax`'s own `Decimal` + `round2`:

| third rate          | CGST         | per-line                               |
| ------------------- | ------------ | -------------------------------------- |
| **12%** (as seeded) | **10073.01** | 1120.50 + 2331.88 + 4980.00 + 1640.63  |
| 3%                  | 6338.01      | 1120.50 + 2331.88 + 1245.00 + 1640.63  |
| 40%                 | 21693.01     | 1120.50 + 2331.88 + 16600.00 + 1640.63 |
| 0%                  | 5093.01      | 1120.50 + 2331.88 + 0.00 + 1640.63     |

The 3% and 40% figures reproduce §2.1's hand-derived values exactly. **These are
projections through the engine's arithmetic, not engine output** — `computeTax`
refuses both rates, so it cannot be asked directly.

**The seed's stated purpose survives any of these.** The ±0.01 per-line-versus-
document divergence comes entirely from the two 5% lines
(2331.88 + 1640.63 = 3972.51 against 3972.50 at document level) and is invariant
across the third rate. Only the quoted total drifts.

### 0.5 The intersection, which bounds the third-rate question

`[depends on the claim]` Intersecting the claimed-live set with what is
reachable today:

| set                             | members                 |
| ------------------------------- | ----------------------- |
| claimed statutorily live        | `0, 0.25, 3, 5, 18, 40` |
| DB CHECK permits                | `0, 3, 5, 12, 18, 28`   |
| all eight code constants permit | `0, 5, 12, 18, 28`      |
| **live ∩ DB ∩ code**            | **`0, 5, 18`**          |

**The only rate that is both claimed-current and reachable today, other than the
two Chain A already uses, is 0%** — which F.87 deferred on the ground that F.3
and F.4 have not decided whether a zero-tax group renders as a row or is
suppressed. Stated as an intersection, not as a proposal.

---

## Sections 1–4 — `code-auditor` report, transcribed unchanged

**Audited:** the Dealerlink monorepo at `/workspace`, branch `f55-notes`, HEAD `c01b558` per the session git snapshot. **Date:** 2026-09-18. Read-only; no file was modified.

**Scope.** How GST _rates_ are modelled: the code constants, the DB CHECK constraints, the storage type, the write/read/render/report paths, and whether any concept distinguishes a historical rate from a current one.

**Instrument note (CLAUDE.md §11.1 ruling 8).** Every negative below was produced with the ripgrep-backed `Grep` tool and/or `Glob` directory listings, and each is stated as an affirmative enumeration — "X is absent from this list, which I read in full" — with the list named. I have no `Bash`; bare `grep` was not used and could not have been.

**Exclusion.** `/workspace/.claude/worktrees/f82-claudemd-gstrate/` is a second checkout duplicating nearly every hit (filed as F.88). Excluded from every enumeration below; I list only primary-checkout paths.

**Treatment of the operator's GST 2.0 claim.** The 22-Sept-2025 slab restructure (12% and 28% removed, 40% added, 3% / 0.25% special rates continuing) is treated throughout as an **unverified hypothesis about the world**. Nothing in this repository states or confirms it, and I did not attempt to verify it. Findings that depend on it are marked **[depends on the claim]**. Findings about what the code can and cannot express are independent of it and are marked as such where the distinction matters.

**Relationship to `docs/F55_AUDIT.md`.** Read in full. Its two central enumerations — eight rate-list constants, four CHECK constraints on four `decimal(5,2)` columns — I **re-derived independently** before relying on them, with a differently-shaped pattern (`12[^0-9]{0,6}18[^0-9]{0,6}28` over `**/*.{ts,tsx,js,jsx,sql,typ,json,mjs,cjs}` across the whole repo, 159-line result read in full). Both hold at the cited lines. Where it is now incomplete for the wider question, I say so in §1 and §3.

---

### 1. Both rate lists are stale in both directions — the exact state

#### 1.1 Code constants — the complete population is eight, and it is uniform

My independent pass returned exactly the eight non-test constants `docs/F55_AUDIT.md` §1 lists, at the same lines, plus the same five human-readable strings and six test-local lists. **All eight carry the identical literal `[0, 5, 12, 18, 28]` (or its type-union form).** There is no disagreement between them and no ninth.

| #   | file:line                                                         | exact literal                                            |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `packages/tax/src/types.ts:7`                                     | `export type GstRate = 0 \| 5 \| 12 \| 18 \| 28;`        |
| 2   | `packages/tax/src/compute.ts:7`                                   | `const VALID_GST_RATES = [0, 5, 12, 18, 28];`            |
| 3   | `packages/schemas/src/product.ts:4`                               | `export const GST_RATES = [0, 5, 12, 18, 28] as const;`  |
| 4   | `packages/schemas/src/quotation.ts:42`                            | `.refine((n) => [0, 5, 12, 18, 28].includes(n), …)`      |
| 5   | `apps/workers/src/templates/quotation.tsx:46`                     | `const VALID_GST_RATES: GstRate[] = [0, 5, 12, 18, 28];` |
| 6   | `apps/workers/src/templates/performa-invoice.tsx:35`              | `const VALID_GST_RATES: GstRate[] = [0, 5, 12, 18, 28];` |
| 7   | `apps/web/app/(app)/catalog/new/new-product-form.tsx:125`         | `{[0, 5, 12, 18, 28].map((r) => (`                       |
| 8   | `apps/web/app/(app)/catalog/[id]/product-detail-sections.tsx:259` | `{[0, 5, 12, 18, 28].map((r) => (`                       |

**Against the claim [depends on the claim]:**

- **Absent from every one of the eight:** `40`, `0.25`. Also absent: `3` (which the repo's own DB CHECKs _do_ permit — see 1.2).
- **Present in every one of the eight:** `12`, `28`.

The membership statement is an enumeration, not a search: I read all eight literals character-by-character in the grep output above. Corroborating negative for `40`: a `Grep` for `0\.25|\b40\b.{0,20}(gst|GST|rate)|(gst|GST|rate).{0,20}\b40\b` over `**/*.{ts,tsx,sql,typ}` across `/workspace` returned **four hits, read in full — all four are SVG gradient/fill attributes** in `apps/web/components/auth/aurora.tsx:12,46` and its worktree copy. There is no GST-rate `40` and no `0.25` anywhere in the TypeScript, SQL or Typst source.

Five human-readable strings restate the same five-member set and would become false alongside it: `packages/tax/src/types.ts:16`, `packages/tax/src/compute.ts:138`, `packages/schemas/src/product.ts:23`, `packages/schemas/src/quotation.ts:43`, `apps/web/app/(app)/catalog/new/page.tsx:28`.

**Two rate literals `docs/F55_AUDIT.md` does not enumerate** (they are not rate _lists_, but they are hardcoded rates that pin a value):

- `apps/web/app/(app)/catalog/new/new-product-form.tsx:23` — `gstRate: '18'`, the new-product form's initial state.
- `apps/web/app/(app)/catalog/import/product-import-form.tsx:46` — `gstRate: Number(r.gstRate ?? 18)`, the CSV-import default for a row that omits the column.

#### 1.2 Database CHECK constraints — a different, wider set

Four columns store a GST rate; all four are `decimal({ precision: 5, scale: 2 })` and all four carry a CHECK. Enumerated from the 23-file `packages/db/src/schema/*` listing read in full (no other module declares a rate column; `rate-limit.ts` is unrelated):

| table                    | column declared at                               | CHECK declared at         | permitted set              |
| ------------------------ | ------------------------------------------------ | ------------------------- | -------------------------- |
| `products`               | `packages/db/src/schema/product.ts:38`           | `product.ts:72`           | `IN (0, 3, 5, 12, 18, 28)` |
| `quotation_lines`        | `packages/db/src/schema/quotation.ts:157`        | `quotation.ts:171`        | `IN (0, 3, 5, 12, 18, 28)` |
| `performa_invoice_lines` | `packages/db/src/schema/performa-invoice.ts:162` | `performa-invoice.ts:175` | `IN (0, 3, 5, 12, 18, 28)` |
| `order_lines`            | `packages/db/src/schema/order.ts:155`            | `order.ts:172`            | `IN (0, 3, 5, 12, 18, 28)` |

Migration of record: `packages/db/migrations/0017_friendly_logan.sql:1-8`, read in full (8 lines), which DROPs the four narrow constraints and re-ADDs them widened.

**Against the claim [depends on the claim]:**

- **Absent from the DB CHECK set:** `40`, `0.25`.
- **Present in the DB CHECK set:** `12`, `28`.
- **Divergence from the code:** `3` is permitted by all four CHECKs and by none of the eight code constants. This is the F.55 gap, unchanged.

**A structural fact about the migration pattern that matters more than the membership.** `0017_friendly_logan.sql` uses `DROP CONSTRAINT` + `ADD CONSTRAINT` with **no `NOT VALID`** (lines 1-8, read in full). `ADD CONSTRAINT … CHECK` without `NOT VALID` validates against every existing row. Consequence, independent of any claim about the law: **narrowing this list is not a schema edit, it is a data migration.** If any `quotation_lines`, `performa_invoice_lines` or `order_lines` row carries a rate being removed, the `ADD` fails and the migration aborts. Today that is not hypothetical for `12` — `packages/db/src/seeds/multi-rate.ts:145` seeds a 12% product whose rate reaches all three line tables via Chain A.

#### 1.3 Is 0.25% representable? — type yes, everything else no

Checked at the column type and scale as asked, not only at the constraint.

- **Storage: YES, exactly.** `numeric(5, 2)` (`product.ts:38`, `quotation.ts:157`, `performa-invoice.ts:162`, `order.ts:155`) has scale 2, so `0.25` is stored exactly as `0.25`, with no rounding. Precision 5 also accommodates `40.00` with three integer digits to spare. **The storage type is not the obstacle for either value.**
- **CHECK: NO.** `0.25` is absent from the six-member `IN` list on all four tables.
- **Type: NO, and structurally.** `GstRate` (`packages/tax/src/types.ts:7`) is a union of _integer_ literals. `0.25` is not assignable, and neither is any other fractional rate. This is the one layer where the fractional case differs in kind from `40` rather than in degree.
- **Runtime engine: NO.** `VALID_GST_RATES.includes(0.25)` is `false` → `compute.ts:135-139` throws `INVALID_GST_RATE`.
- **Zod: NO**, both refinements.
- **Arithmetic, if it were permitted: fine.** `compute.ts:58` `new Decimal(line.gstRate).dividedBy(100)` and `:69` `rate.dividedBy(2)` are `Decimal`, not float; `round2` is applied per line (`:66`, `:70-71`). Nothing in the engine assumes an integer rate.
- **The scale-2 interaction, stated precisely.** The _derived half-rate_ for 0.25% is 0.125%, which `numeric(5,2)` could not store — but **no half-rate is ever stored anywhere.** Only the full rate occupies a column; CGST/SGST are stored as money (`cgst_amount`, `sgst_amount`), and the halved figure exists only as a render-time label string at `apps/workers/src/pdf/view-model.ts:132` (`${Number(rateLabel) / 2}%`). So `decimal(5,2)` × `0.25` is a **non-problem for storage** and produces the label `"0.125%"` at render. The same mechanism already yields `"1.5%"` for a 3% document and `"20%"` for a 40% one. The label path is rate-agnostic and needs no list.

---

### 2. Cost of changing the seeded 12% rate, and which alternatives are reachable

#### 2.1 Every site that references the seeded rate

F.81 seeds `MR-INV-5K` (Growatt 5kW Hybrid Inverter, HSN `85044090`) at `12.00` as the third rate on Chain A. Complete population from `Grep` `'12\.00'|"12\.00"|12\.00|12%` and `MR-INV-5K|85044090` across `/workspace` (both results read in full, worktree excluded), filtered to sites where the value is load-bearing for this seed.

**Code — must change:**

1. `packages/db/src/seeds/multi-rate.ts:145` — `gstRate: '12.00'`. The only executable site.
2. `packages/db/tests/multi-rate-corpus.test.ts:88` — `expect(rates, …).toContain('12.00')`. **The only test assertion on the literal, in the whole repository.**

**Code comments — become false:**

3. `packages/db/src/seeds/multi-rate.ts:114` — "Three rates — 5, 12 and 18 — settled by the operator on 2026-09-17."
4. `packages/db/src/seeds/multi-rate.ts:332` — "while 0/12/18/28 have whole-percentage halves and are exact on every integer."
5. `packages/db/src/seeds/multi-rate.ts:336` — "this document gives CGST 10073.01 per-line against 10073.00 document-level."
6. `packages/db/src/seeds/multi-rate.ts:339-340` — "(85359090→18, 85414300→5, 85044090→12)".

**On #5, the arithmetic, because it is the one figure that is quantitatively load-bearing.** Chain A (`multi-rate.ts:343-348`) is intra-state: ISO-40A 3×4150 @18% → CGST 1120.50; MOD-555 7×13325 @5% → 2331.88; **INV-5K 2×41500 @12% → 4980.00**; MOD-585 5×13125 @5% → 1640.63. Sum = **10073.01**, reproducing the documented figure. The 12% line contributes 4980.00 of it, so the **absolute figure changes** with the third rate (at 3% → 1245.00, total 6338.01; at 40% → 16600.00, total 21693.01). The **±0.01 per-line-vs-document divergence survives untouched**, because it originates entirely in the two 5% lines (…875 and …625 rounding up to 2331.88 + 1640.63 = 3972.51 against 3972.50 at document level). The seed's stated _purpose_ for the shape is therefore preserved by any third-rate change; only the quoted number drifts.

**Documents — drift:**

7. `docs/SEED_DATA.md:41` — catalogue row `| MR-INV-5K | Growatt 5kW Hybrid Inverter | 85044090 | 12% |`
8. `docs/SEED_DATA.md:68` — the `10073.01` / `10073.00` figure
9. `docs/SEED_DATA.md:22` — "real GST rates (5%, 12%, 18%, 28%)"
10. `DEVIATIONS.md:5864` — "`MR-INV-5K` 12% `85044090`"
11. `DEVIATIONS.md:5874-5875` — "carries CGST **10073.01** where document-level rounding would give **10073.00**"
12. `DEVIATIONS.md:5777` — parity table row "intra `MH→MH`, 18/5/12/5 … CGST 10073.01"
13. `PROJECT_PLAN.md:129`, `PROJECT_PLAN.md:132` — generated; drift resolves via `pnpm plan:sync` once the source row changes
14. `docs/stage-f-tasks.json:740` — F.81's `notes`
15. `docs/F81_DAY_PROMPT.md:35, 309, 463, 468, 538` — the record that Q1 was settled at 12%

**Fixtures — none.** `apps/workers/scripts/typst-matrix.json` contains **14 entries, read in full**: `QT-2026-0001` (×2, demo + sample), `QT-2026-0006`, `QT-2026-0010`, `PI-2026-0001`, `PI-2026-0002`, `PAY-2026-0007`, `DSP-2026-0005`, `DSP-REF-0026`, `DSP-REF-0500`, and four `BRANDED__` re-runs of documents already in that list. `docs/pdf-references/` contains **exactly 14 PDFs plus `README.md` and `capture-results.json`**, matching those labels one-for-one (full `Glob` listing read). No F.81 document appears in either. That F.81's documents cannot be among them is established by seed ordering, not by inference: `packages/db/package.json:16` runs `multi-rate.ts` **last** of the document-creating seeds, and it allocates numbers through `nextCounter` (`multi-rate.ts:175`), so every number it takes is strictly above the pre-existing ones. **No PDF snapshot or reference byte-compare would change.**

**Two tests adapt automatically rather than needing edits:** `packages/db/tests/quotation-engine-parity.test.ts:70` re-runs `computeTax` over seeded quotations rather than asserting literals; and six of the seven `multi-rate-corpus.test.ts` cases are shape assertions (distinct-rate count, non-ascending ordering, two-lines-at-5%, PI≡quotation rate sets, mixed-rate order in a supply status, one HSN spanning two rates) that hold for any third rate distinct from 5 and 18.

**Instrument caveat, stated because it affects completeness.** The literal `MR-INV-5K` returns only six hits because the seed builds the SKU by template concatenation: `multi-rate.ts:142` ``sku: `${SKU_PREFIX}INV-5K` `` and `multi-rate.ts:346` ``spec(`${SKU_PREFIX}INV-5K`, 2, 41500)`` do **not** match it. Neither carries a rate, so neither belongs on the change list — but a reader re-running my search should expect the discrepancy.

#### 2.2 Which alternative third rates are reachable today

| layer                | **3%**                                                                                                                                                                                                           | **40%**                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) DB CHECK**     | **PASSES.** Present in all four `IN (0, 3, 5, 12, 18, 28)` lists — `product.ts:72`, `quotation.ts:171`, `performa-invoice.ts:175`, `order.ts:172`; `0017_friendly_logan.sql:5-8`                                 | **FAILS.** Absent from all four. `numeric(5,2)` would hold `40.00` fine — the type is not the obstacle, the constraint is. **Requires a migration.** |
| **(b) Zod**          | **FAILS.** `packages/schemas/src/product.ts:4` + refine at `:19-24` (product create / update / bulk import); `packages/schemas/src/quotation.ts:42` (quotation lines, and PI lines via `performa-invoice.ts:14`) | **FAILS.** Identical two gates, identical reason.                                                                                                    |
| **(c) `computeTax`** | **FAILS.** `packages/tax/src/compute.ts:135` → throws `INVALID_GST_RATE` at `:136-139`. Compile-time union `types.ts:7` rejects it too.                                                                          | **FAILS.** Identical.                                                                                                                                |
| **(d) PDF loaders**  | **FAILS.** `toGstRate` throws a plain `Error` — `apps/workers/src/templates/quotation.tsx:49-56` (called `:207`), `performa-invoice.tsx:37-44` (called `:135`)                                                   | **FAILS.** Identical.                                                                                                                                |

`docs/F55_AUDIT.md` §2 and §3 already establish (b), (c) and (d) for 3% and the DB-permits-3 fact, including the trace showing both loaders are live on the Typst path via `apps/workers/src/jobs/render-pdf.ts:33-34, 84-86`. I re-read all four anchors and confirm them.

**The discriminating statement.** **3% and 40% are identical at every code layer and differ at exactly one:** 3% is already insertable into all four tables; 40% is not, and cannot be without a migration to the four CHECK constraints. Neither is computable, validatable or renderable today. A seed that inserted 3% directly through Drizzle would bypass Zod but still fail inside the seed itself — `multi-rate.ts:193` `totalsFor` calls `computeTax`, so it could not even produce totals to persist. (The `as GstRate` at `multi-rate.ts:312` is a compile-time widen with no runtime effect.)

I report this and recommend nothing.

---

### 3. The conflation — where one rate list serves both "enterable now" and "stored, read, rendered, reported"

#### 3.0 The finding in one line

There is **no site anywhere in this repository that distinguishes the two sets.** Every rate list in the codebase is a single list, and each is applied to whichever of the two jobs its position happens to put in front of it. The separation does not exist to be got wrong — it has never been drawn.

#### 3.1 Write validation — should enforce the ENTERABLE set; currently correct in kind, stale in content

| site                                                              | what it gates                                                                                                                                                                                             | breaks if wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/schemas/src/product.ts:4` + refine `:19-24`             | `createProductSchema` (`:39`), `updateProductSchema` (`:42`), `bulkImportProductsSchema` (`:60-62`) → wired into `apps/web/lib/actions/products/create-product.ts`, `update-product.ts`, `bulk-import.ts` | Enforcing the _storable_ set here would let an operator create new products at an abolished rate. Correct job; content is `[0,5,12,18,28]`.                                                                                                                                                                                                                                                                                                                                            |
| `packages/db/src/schema/product.ts:72` (`products_gst_rate_chk`)  | the product master — genuinely a current-rate column, not a history column                                                                                                                                | Same. Correct job.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `apps/web/app/(app)/catalog/new/new-product-form.tsx:125`         | `<option>` children of the "GST rate \*" `<select>` (`:119-131`)                                                                                                                                          | Correct job. Also `:23` hardcodes the initial value `'18'`.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/web/app/(app)/catalog/[id]/product-detail-sections.tsx:259` | `<option>` children of the pricing-editor `<select>` (`:253-265`)                                                                                                                                         | Correct job. **This `<select>` is already broken for a different reason:** `:255` is `value={form.gstRate}` where `form.gstRate` is the raw DB string `'18.00'` (`product-detail-sections.tsx:24` types it `string`; `apps/web/lib/queries/products.ts:14,63,116` is the one query module that never `Number()`s it), while the options render integer literals — so no option matches. This is the shipped defect CLAUDE.md §5 names. Widening or narrowing the list does not fix it. |
| `apps/web/app/(app)/catalog/new/page.tsx:28`                      | help copy "GST rate: 0, 5, 12, 18, or 28"                                                                                                                                                                 | Prose only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/web/app/(app)/catalog/import/product-import-form.tsx:46`    | `Number(r.gstRate ?? 18)` — CSV rows omitting the column silently become 18%                                                                                                                              | Not a list; a hardcoded default that would survive any rate change unremarked.                                                                                                                                                                                                                                                                                                                                                                                                         |

#### 3.2 Write validation that is ALSO read validation — the conflating sites proper

| site                                                                                                                                                     | applied to NEW input                                  | applied to EXISTING data                                                                                                                                                                                                                                                                                                                                  | what breaks                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/schemas/src/quotation.ts:42` (`quotationLineInputSchema`; re-exported as `piLineInputSchema` at `packages/schemas/src/performa-invoice.ts:14`) | `createQuotationSchema` (`quotation.ts:73`)           | `updateQuotationSchema` and `updatePiSchema` (`performa-invoice.ts:46`) re-submit the document's **existing lines**, which are re-validated against the current list                                                                                                                                                                                      | A draft carrying an abolished rate becomes uneditable — every save fails on a line the user did not touch. Blast radius is bounded: `apps/web/lib/actions/quotations/update-quotation.ts:19,27-32` and `apps/web/lib/actions/pi/update-pi.ts:31-33` both restrict editing to `draft`.                                                                                                            |
| **`packages/db/src/schema/quotation.ts:171`, `performa-invoice.ts:175`, `order.ts:172`**                                                                 | new line inserts                                      | **these are history-bearing snapshot columns** — `quotation_lines.gst_rate` is annotated "CRITICAL: gst_rate is the source of truth for Day 9 tax engine" (`quotation.ts:156`) and is written from the product master at line-creation time                                                                                                               | **The sharpest instance.** Three constraints on columns whose entire purpose is to freeze a past rate carry the same list as the constraint on the live master. Because `0017_friendly_logan.sql` adds constraints **without `NOT VALID`**, narrowing the list makes the migration fail against historical rows — which is, perversely, the only thing currently preventing silent history loss. |
| **`packages/tax/src/compute.ts:7` + guard `:135-139`**                                                                                                   | `computeTotalsForPersistence` ← `create-quotation.ts` | **recomputation over stored lines**: `apps/web/lib/actions/pi/convert-quotation-to-pi.ts:86` (lines from `loadQuotationLines`, `pi/helpers.ts:184-205`, straight from Postgres with **no Zod anywhere on that path**); `apps/workers/src/templates/quotation.tsx:199`; `performa-invoice.tsx:127`; `packages/db/tests/quotation-engine-parity.test.ts:70` | **The single most consequential conflation in the repo.** One list decides both "may this rate be entered" and "may this stored document be totalled". An old 28% quotation would become un-convertible and un-renderable the moment 28 left the list. `packages/tax` is a protected surface (CLAUDE.md §10.1).                                                                                  |
| `packages/tax/src/types.ts:7` (`GstRate`)                                                                                                                | `TaxLineInput.gstRate` (`:17`) — an input type        | `TaxLineOutput.gstRate` (`:45`) and `SerializedTaxLine.gstRate` (`packages/tax/src/serialize.ts:13,40`) — **output** types describing an already-stored rate                                                                                                                                                                                              | Same conflation at the type level. Compile-time only, and every DB-derived caller launders it through `as GstRate` — five such casts: `quotations/helpers.ts:179`, `pi/helpers.ts:62`, `preview.ts:83`, plus `toGstRate` in the two loaders.                                                                                                                                                     |

#### 3.3 Read validation — the dangerous class, and it is populated

These validate or coerce a rate coming **out of** the database. Each should be enforcing the storable set, or nothing at all. Each enforces the enterable set.

| site                                                                                            | reads from                                                                                 | behaviour on an off-list rate                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`apps/workers/src/templates/quotation.tsx:46, 49-56`**, called at `:207`                      | `quotation_lines`                                                                          | throws `Error("quotation template: unexpected GST rate \"…\"")` — **a stored, issued quotation stops rendering.** Live on the Typst path (`render-pdf.ts:34, 84`). |
| **`apps/workers/src/templates/performa-invoice.tsx:35, 37-44`**, called at `:135`               | `performa_invoice_lines`                                                                   | identical throw; `render-pdf.ts:33, 86`.                                                                                                                           |
| `apps/web/lib/actions/pi/helpers.ts:62` (`computeDocumentTotals`)                               | `loadQuotationLines` (`:184-205`, `Number(r.gstRate)` at `:201`)                           | `TaxComputationError` → `AppError('VALIDATION')` at `:78`. Reached from `convert-quotation-to-pi.ts:86` with **no Zod in front of it**.                            |
| `apps/web/lib/quotation/preview.ts:83` (`toNum(l.gstRate) as GstRate`) → `computeTax` at `:122` | product master via `apps/web/app/(app)/quotations/_components/load-builder-data.ts:49, 87` | throws **client-side**, inside the `useMemo` at `apps/web/app/(app)/quotations/_components/summary-card.tsx:25-35`, on every keystroke.                            |
| `apps/web/lib/actions/quotations/helpers.ts:179` → `computeTax`                                 | `loadProductsForLines` (`:114-136`, `Number(r.gstRate)` at `:134`)                         | `AppError('VALIDATION')` at `:186`.                                                                                                                                |

**Read paths that do NOT validate — the history-safe ones, listed so the contrast is exact:** `apps/web/lib/queries/quotations.ts:127,328`, `orders.ts:113,295`, `performa-invoices.ts:133,314` all do `Number(l.gstRate)` with no gate and render `{l.gstRate}%` (`quotations/[id]/page.tsx:151`, `pi/[id]/page.tsx:176`, `orders/[id]/page.tsx:244`). `apps/web/lib/actions/quotations/revise-quotation.ts:89` and `apps/web/lib/actions/pi/status-transitions.ts:189` copy `gstRate` **verbatim** between documents with no validation and no recomputation. These would survive a slab change untouched.

**A separate conflation running the other direction, which no layer above covers.** On save, the line's rate is re-read from the **product master**, not taken from the submitted line: `apps/web/lib/actions/quotations/helpers.ts:215-216` ("gst_rate + hsn captured from product master at line-creation time") writing at `:228`, and `apps/web/lib/actions/pi/update-pi.ts:55` (`gstRate: p.gstRate`). So editing a draft **re-stamps its lines with the product's current rate**, silently. Correct for a new document; for an existing one it means the "snapshot" is only as old as the last edit. Bounded to `draft` status by the two guards cited in 3.2. `packages/schemas/src/quotation.ts:31-32` documents the intended contract ("captured from product.gst_rate at the moment the line is added — never recomputed at preview/save time"), which the update path does not honour.

#### 3.4 Render

- The two `toGstRate` gates (3.3) are the **only** hard rate gate on the render path.
- `apps/workers/src/templates/quotation.tsx:234-235` and `performa-invoice.tsx:161-162` — `Array.from(new Set(lines.map(l => l.gstRate)))`, single rate → `gstRateLabel`, mixed → `null`. A rate-wise grouping, correctly keyed on `Number(l.gstRate)` (`:227` / `:155`), so the `'18.00'`-vs-`18` hazard does not apply. **No list.**
- `apps/workers/src/pdf/view-model.ts:131-133` — `halfRateLabel` = `${Number(rateLabel) / 2}%`, `fullRateLabel` = `${rateLabel}%`. Rate-agnostic; yields `"1.5%"` at 3, `"20%"` at 40, `"0.125%"` at 0.25.
- The same derivation is **duplicated twice more**: `apps/workers/src/templates/_components/TaxSummary.tsx:28-29` and `apps/workers/scripts/render-typst.ts:236-238`. Three copies, all rate-agnostic, none list-gated.
- `apps/workers/src/lib/format.ts:25-27` `formatRate` → `` `${rate}%` ``, used at `LineItemsTable.tsx:55`. Rate-agnostic.
- **Typst templates are rate-agnostic and carry no list.** `Grep` `gstRate|rate` over the full directory `apps/workers/src/templates-typst/` returned **12 hits, read in full**; the only rate-bearing one is `quotation.typ:78` `str(l.gstRate) + "%"`. The rest are `doc-id` footer strings and comments.

**So the render layer's only exposure is the two `toGstRate` functions.** Everything downstream of them prints whatever number it is handed.

#### 3.5 Report grouping

- **`apps/web/lib/reports/gst-summary.ts:75-89` does not group by rate at all.** It groups by `place_of_supply` and `(tenant_state_at_issue <> place_of_supply)`, summing stored `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount`. Its header comment (`:8-12`) forbids calling `@dealerlink/tax`.
- **Affirmative basis that no report anywhere touches a rate:** the complete `gstRate|gst_rate` population over `/workspace/apps` (read in full, ~120 lines) contains **zero** hits under `apps/web/lib/reports/`. The only near-miss is the `GstRow` interface name (`gst-summary.ts:38, 75, 90`), a substring coincidence.
- **The consequence, stated as a capability gap rather than a defect:** this report is immune to a slab change _because_ it has no rate-wise breakdown. It cannot produce one. A rate-wise GST summary does not exist.
- The only rate-wise groupings in the app are `apps/web/app/(app)/quotations/_components/summary-card.tsx:37-45` (client-side, `new Set(...)` → `"mixed"` or `"N%"`, no list) and the two PDF-loader `distinctRates` sites in 3.4. Plus one test-only HSN×rate grouping at `packages/db/tests/multi-rate-corpus.test.ts:246-252`.

#### 3.6 Tally mapping / accounting export — **DOES NOT EXIST**

Established by affirmative enumeration over five complete lists, not by a clean search:

1. **`apps/web/lib/reports/*` — 12 files, full `Glob` listing read:** `access.ts`, `csv.test.ts`, `csv.ts`, `gst-summary.ts`, `index.ts`, `inventory-valuation.ts`, `outstanding.ts`, `period.ts`, `reports.test.ts`, `resolve.ts`, `sales-summary.ts`, `types.ts`. No Tally, GSTR, e-invoice or ledger module.
2. **`ReportKey` at `apps/web/lib/reports/types.ts:50`** — exactly four members: `'sales-summary' | 'outstanding' | 'inventory-valuation' | 'gst-summary'`.
3. **The `ACCESS` map at `apps/web/lib/reports/access.ts:19-25`** — five roles, each mapped to a subset of those same four keys. `REPORT_TITLES` (`:46-51`) and `REPORT_DESCRIPTIONS` (`:53-60`) likewise have exactly four entries.
4. **`apps/web/app/(app)/reports/**`— 9 paths, full`Glob` listing read:** four report page routes (`gst-summary`, `inventory-valuation`, `outstanding`, `sales-summary`), plus `page.tsx`, `actions.ts`and three`\_components`. No export route beyond CSV.
5. **`apps/workers/src/jobs/*` — 3 files, full `Glob` listing read:** `pdf-cleanup.ts`, `validity-expiry.ts`, `render-pdf.ts`. No export or accounting job.

Corroborating full-text pass: `Grep` `(?i)tally|gstr|irn|e-invoice` over `/workspace/apps` and `/workspace/packages` separately, **both results read in full**. Every hit is one of: a local counter helper named `tally()` (`apps/workers/src/jobs/validity-expiry.ts:30, 49, 57`), the `GstRow` identifier, two prose strings describing gst-summary as "the GSTR-1 base" (`gst-summary.ts:12`, `access.ts:59`), a comment naming Tally as reference accounting software (`packages/tax/src/round.ts:10`), and `path.dirname` false positives on "irn"/"dirname".

**Doc claim, disclosed as such:** `docs/stage-f-tasks.json` carries plan rows at `:195` ("GSTR-1 export (B2B, B2CL, CDNR, HSN)"), `:204` ("Tally mapping configuration module"), `:213` ("Tally export — voucher generation engine"), `:222` ("Tally export — XML output + idempotency") and `:321` ("E-invoice / IRN"). These are **planned work items, not implementations**, and I reached the DOES-NOT-EXIST verdict from the five enumerations above before consulting them. The practical consequence for this audit: **there is no accounting-export rate mapping to become stale**, and equally, whichever direction is chosen, the mapping layer is greenfield.

#### 3.7 As-of date or rate-version concept — **DOES NOT EXIST**

Established by enumeration:

1. **`packages/db/src/schema/*` — 23 files, full `Glob` listing read:** `access-log`, `audit-log`, `auth-events`, `deal`, `dealer`, `dispatch`, `document-counter`, `email-delivery-log`, `generated-document`, `inbound-token-history`, `index`, `inventory`, `order`, `payment`, `performa-invoice`, `product`, `quotation`, `rate-limit`, `session`, `tenant-settings`, `tenant`, `user`, `webhook-events`. **There is no rate-version, rate-history, tax-rate or notification module.**
2. **`Grep` `AtIssue|at_issue|effective|effectiveFrom|valid_from|validFrom|version` over `packages/db/src/schema` — 6 hits, read in full.** All six are `tenantStateAtIssue` (`order.ts:76`, `quotation.ts:62`, `performa-invoice.ts:72`) and the three `^[A-Z]{2}$` format CHECKs that reference it. **The only "as of issue" snapshot concept in the entire schema is the tenant's STATE, not its rate regime.**
3. **`packages/db/src/schema/product.ts` read in full (87 lines):** 22 columns. `gstRate` at `:38` has no companion effective-from, effective-to, notification-reference or version column.

**What does exist, and what it can and cannot do.** The rate is snapshotted _by value_ onto every document line — `quotation_lines.gst_rate`, `performa_invoice_lines.gst_rate`, `order_lines.gst_rate` — at line-creation time (`apps/web/lib/actions/quotations/helpers.ts:215-216`; contract stated at `packages/schemas/src/quotation.ts:31-32`). PI→Order copies it verbatim (`status-transitions.ts:189`) and revision copies it verbatim (`revise-quotation.ts:89`). **That preserves the number and nothing else.** A stored `18.00` cannot say whether it was 18% under the old schedule or 18% under a new one; nothing in the row identifies a regime, an effective date, or a gazette notification. Document date is the only temporal anchor, and no code joins a rate to it.

**Doc claims, both disclosed:**

- `docs/RUNBOOKS.md:255` (R8) states the policy explicitly — "The change applies to **new** quotations only. Quotations and invoices already in flight are frozen by design — the tax rate at the time of issue is what's billed. Don't try to retroactively re-tax a sent quote." So the _intent_ to separate history from current exists in prose. Its only enforcement in code is the per-line value snapshot plus the draft-only edit guards; §3.3's re-stamp-from-master finding shows even drafts do not honour it.
- `docs/RUNBOOKS.md:244` and `:274` state that the CHECK constraint accepts `{0, 5, 12, 18, 28}`. **That is now wrong** — migration `0017_friendly_logan.sql` widened all four to `{0, 3, 5, 12, 18, 28}`. Reported as doc drift, not as a finding about behaviour.

#### 3.8 Where `docs/F55_AUDIT.md` is now incomplete for this wider question

It is not wrong anywhere I checked. It is silent on five things this question needs, all newly reported above:

1. The `ADD CONSTRAINT`-without-`NOT VALID` pattern in `0017_friendly_logan.sql` and its consequence for _narrowing_ (1.2). Its §3 covers widening only.
2. The re-stamp-from-product-master behaviour on document edit (`quotations/helpers.ts:215-216`, `update-pi.ts:55`) (3.3).
3. The two hardcoded rate defaults `new-product-form.tsx:23` and `product-import-form.tsx:46` (1.1) — correctly outside its "rate-list constant" scope, but they pin a rate.
4. The complete absence of an as-of/version concept (3.7).
5. The complete absence of a Tally/GSTR/e-invoice export (3.6).

One apparent inconsistency worth recording so a future reader does not chase it: `docs/F55_AUDIT.md` §1 row 8 cites `product-detail-sections.tsx:259` and CLAUDE.md §5 cites `:255`. **Both are correct about different lines** — `:255` is `value={form.gstRate}`, `:259` is the `.map(`. Verified by direct read.

---

### 4. What I could not determine

1. **I could not execute anything.** I have no `Bash`. Every runtime claim — that `computeTax` throws on 3 or 40, that `toGstRate` throws before `computeTax` on the PDF path, that the browser preview throws inside a `useMemo`, that `ADD CONSTRAINT` without `NOT VALID` would fail against existing 12% rows — is derived by reading code and tracing imports. The last of these is standard Postgres semantics, not a repository fact, and I state it as such.
2. **The arithmetic in 2.1 is mine, not the repo's.** I computed CGST 1120.50 + 2331.88 + 4980.00 + 1640.63 = 10073.01 by hand from `multi-rate.ts:343-348` and the rounding model in `compute.ts:55-72`. It reproduces the figure the seed and `docs/SEED_DATA.md:68` already assert, which is corroboration — but the derived alternatives (6338.01 at 3%, 21693.01 at 40%) are unexecuted hand arithmetic and should be re-derived before being relied on.
3. **I could not verify live database state.** §1.2 reports what the schema files and migrations declare. Whether staging or production has actually applied `0017_friendly_logan` is not determinable from the repository; `packages/db/migrations/meta/_journal.json` records intent, not application.
4. **I did not verify the GST 2.0 claim and deliberately did not try.** I have no CA, no gazette, and no web access I would trust for this. Every membership statement about "claimed-current" and "claimed-abolished" rates is marked `[depends on the claim]` and is a statement about the code's contents measured against the operator's stated set, not an assertion about Indian law.
5. **I could not confirm HEAD by running git.** The commit `c01b558` and branch `f55-notes` come from the session snapshot, which warns it does not update. If commits landed after it, line numbers could have shifted. Every anchor I cite was read directly today and held.
6. **I could not exclude a rate list in a spelling all my passes missed.** My §1.1 enumeration is complete against a pattern requiring `12`, `18` and `28` within 6 non-digit characters of one another. The residual risk is a list that omits one of those three _and_ is not near any `gstRate|gst_rate|GST_RATES|GstRate` identifier — the population `docs/F55_AUDIT.md` §1 pass 3 covered, which I did not re-run. I judge it small and name it rather than imply completeness I did not establish.
7. **I could not determine whether any non-repository consumer holds a copy of the rate list** — a client bundle under `apps/web/.next/` (surfaced as build output, not treated as source), an operator runbook outside `docs/`, or anything external. §1.1's enumeration is complete over repository source only.
8. **I did not read `PROJECT_PLAN.md:129`/`:132` or `docs/stage-f-tasks.json:740`/`:767` in full** — both are long single-line JSON/markdown records my grep reported as "[Omitted long matching line]". I cite them as _locations where the 12% seed fact is restated_, established from the match itself, not from their content. Nothing in my findings depends on what they say.

**Doc-claim disclosure required by the auditing rules.** I formed §1's enumeration, §3's conflation map, §3.6 and §3.7 from code before opening any planning document. `docs/F55_AUDIT.md` was read first, as the invocation directed, and its §1/§3 findings are cited as prior work I re-derived rather than re-trusted. `docs/stage-f-tasks.json`, `DEVIATIONS.md`, `PROJECT_PLAN.md` and `docs/F81_DAY_PROMPT.md` were encountered only as grep hits during the §2.1 change-site enumeration, where their _existence at a line_ is the finding. `docs/RUNBOOKS.md` R8 was read deliberately, after §3.7's conclusion was already reached from the schema enumeration, and is reported as a doc claim that **agrees** with the intent and **contradicts** the code on one point (`:244`, `:274`, the stale CHECK set).

---

## Main-thread note on §4.1 and §4.2

Both are now closed by execution, in §0.3 and §0.4 above: the `NOT VALID` consequence was run against the live database and produced the predicted abort, and the alternative-rate arithmetic was re-derived through `packages/tax`'s own `Decimal` and reproduces both hand-derived figures exactly. §4.1's remaining runtime claims — the `computeTax` and `toGstRate` throws — were executed during the F.55 audit follow-up and are recorded in `DEVIATIONS.md` and on F.89.

---

## 5. The reframe, and the options it opens (main thread, 2026-09-18)

### 5.1 The operator's challenge, which relocates the defect

Everything above §5 investigates the rate _list_ as though its content were the
problem — stale in both directions, and needing correction. The operator's
challenge is that this mistakes the symptom for the defect:

> Rates are already set **per product**, so the system should not know which rate
> applies to what — that is the **tenant's classification**. The defect is
> therefore that the code **validates against a hardcoded statutory list** in
> eight places plus four CHECK constraints. A hardcoded list is a claim about
> what rates exist, and it goes stale whenever the GST Council meets.

This is a different diagnosis from F.55's. F.55 asks "which rates should the list
contain". The reframe asks "why is there a list at all". Two facts already in
this audit support the reframe rather than the original framing:

- **The classification is per-product data, not code.** `products.gst_rate`
  (`packages/db/src/schema/product.ts:38`) is a tenant-editable column, and R8
  (`docs/RUNBOOKS.md:238-277`) is an operator procedure for changing it. Nothing
  in the codebase maps an HSN code to a rate; the tenant asserts the pairing.
  So the eight lists do not encode _which rate applies to what_ — they only
  restrict _which numbers are sayable_.
- **The list is stale in both directions right now** (§1.1, §1.2), and it went
  stale without anyone noticing, twice: once when 3 was added to the database and
  not the code (§1.2), and once — `[depends on the claim]` — when the Council
  met.

**This section enumerates options. It recommends none.** Which option is right
depends on the accountant's answer to the two questions in the caveat at the top
of this file, and on whether the operator wants Phase 1 to carry rates for
verticals it does not yet serve.

### 5.2 What "recurring maintenance" already costs, measured

Option C below is "keep it hardcoded and accept recurring maintenance, with a
named owner it does not currently have". Two findings size that honestly.

**There is no owner mechanism of any kind.** No `CODEOWNERS` file exists at the
repository root, in `.github/`, or in `docs/` — checked directly. Ownership of
the rate lists is currently nobody's by construction, not by oversight.

**The maintenance procedure exists, is stale, and cannot do the job.** R8,
"Updating product GST rates after a tax change" (`docs/RUNBOOKS.md:238`), is
precisely the runbook for a Council rate change. Three things about it:

1. Its stated prerequisite (`:244`) is that the constraint "only accepts
   {0, 5, 12, 18, 28}". **That is wrong today** — migration `0017_friendly_logan`
   made it `{0, 3, 5, 12, 18, 28}` — and `[depends on the claim]` wrong again
   against the current slab set.
2. Its worked example (`:240`) is "HSN 8541 panels move from 18% to 12%" — an
   example that moves a product **to a slab the claim says no longer exists**.
3. **Its own procedure cannot introduce a new slab.** Step 3 (`:250-254`) routes
   the change through the product-detail **GST rate dropdown** (`:253`), which is site 8
   of the eight — a hardcoded `<option>` list. A rate absent from that array
   cannot be selected. R8's "Don't" (`:274`) already knows this and says "If a
   new statutory rate is added, that requires a migration" — naming the remedy
   and assigning it to no one.

So the recurring cost is not hypothetical and not small: the procedure written
for exactly this event is itself one of the things that goes stale, and it routes
through one of the eight lists.

### 5.3 The three options, by site

The eight sites and four constraints, as established in §1.1 and §1.2. **P**
marks a protected surface under CLAUDE.md §10.1 (`packages/tax`), requiring
operator sign-off.

| #       | site                                                                               | **A — shape only**                                                                                                                                                                                          | **B — tenant-configurable data**                                                                                                                                                                                                                                                                | **C — keep hardcoded**                                                                                          |
| ------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1 **P** | `packages/tax/src/types.ts:7` `GstRate` union                                      | **changes** — union → numeric type. The five `as GstRate` casts (`quotations/helpers.ts:179`, `pi/helpers.ts:62`, `preview.ts:83`, both `toGstRate`) become unnecessary                                     | **changes, identically** — a runtime-configurable set cannot be a compile-time union                                                                                                                                                                                                            | unchanged structurally; **content edited per Council meeting**                                                  |
| 2 **P** | `packages/tax/src/compute.ts:7` + guard `:135-139`                                 | **changes** — `includes()` → shape predicate                                                                                                                                                                | **changes, and architecturally.** `computeTax` is documented as a pure function with no I/O (`compute.ts:11-12`), so it cannot read tenant settings: either the allowed set becomes a new **input parameter** (signature change on a protected surface) or the guard leaves the engine entirely | content edited per meeting                                                                                      |
| 3       | `packages/schemas/src/product.ts:4` + refine `:19-24`                              | **changes** — refine → shape. `GST_RATES` can be deleted or demoted to a UI suggestion list; **it is imported nowhere else** (measured: the only two references are its own declaration and its own refine) | **changes** — Zod schemas here are static and shared by client and server (CLAUDE.md §3), so per-tenant means a schema **factory**, or moving the refine to the action layer where the tenant is known                                                                                          | content edited per meeting                                                                                      |
| 4       | `packages/schemas/src/quotation.ts:42` (and PI lines via `performa-invoice.ts:14`) | **changes** — same                                                                                                                                                                                          | **changes** — same factory/relocation problem                                                                                                                                                                                                                                                   | content edited per meeting                                                                                      |
| 5       | `apps/workers/src/templates/quotation.tsx:46` + `toGstRate` `:49-56`               | **changes, and this is the one that dissolves §3.3** — with no list, a stored historical rate always renders. The read-validation conflation stops existing rather than moving                              | **changes** — the loader has a tenant context and could read settings, **but would then enforce the currently-configured set against historical data**: §3's conflation is relocated, not fixed                                                                                                 | content edited per meeting                                                                                      |
| 6       | `apps/workers/src/templates/performa-invoice.tsx:35` + `toGstRate` `:37-44`        | **changes** — same                                                                                                                                                                                          | **changes** — same                                                                                                                                                                                                                                                                              | content edited per meeting                                                                                      |
| 7       | `catalog/new/new-product-form.tsx:125` `<option>` list                             | **stops being validation** — but the dropdown still needs something to offer, so this becomes an open sub-question: a suggestion list, or a numeric input. Option A does not answer it                      | **changes** — natural fit; reads the tenant's configured set                                                                                                                                                                                                                                    | content edited per meeting                                                                                      |
| 8       | `catalog/[id]/product-detail-sections.tsx:259` `<option>` list                     | **stops being validation**, same sub-question. Note `:255`'s `'18.00'`-vs-`'18'` defect (§3.1) is **independent and fixed by none of the three**                                                            | **changes** — same                                                                                                                                                                                                                                                                              | content edited per meeting                                                                                      |
| —       | `products_gst_rate_chk`                                                            | **changes** — range/shape (`>= 0 AND <= 100`; scale already enforced by `numeric(5,2)`). **Migration required, but it WIDENS, so unlike §0.3's narrowing it cannot fail against existing rows**             | **changes** — a CHECK cannot reference another table, so it becomes either shape-only (as A) or a **hardcoded ceiling that silently caps what a tenant may configure**. Either way a migration                                                                                                  | content edited per meeting; **each abolition is a data migration that aborts against history (§0.3, measured)** |
| —       | `quotation_lines_gst_rate_chk`                                                     | **changes** — same                                                                                                                                                                                          | **changes** — same                                                                                                                                                                                                                                                                              | same                                                                                                            |
| —       | `performa_invoice_lines_gst_rate_chk`                                              | **changes** — same                                                                                                                                                                                          | **changes** — same                                                                                                                                                                                                                                                                              | same                                                                                                            |
| —       | `order_lines_gst_rate_chk`                                                         | **changes** — same                                                                                                                                                                                          | **changes** — same                                                                                                                                                                                                                                                                              | same                                                                                                            |

**Also touched, under A and B both:** the five human-readable strings
(`types.ts:16`, `compute.ts:138`, `product.ts:23`, `quotation.ts:43`,
`catalog/new/page.tsx:28`), and R8's stale prerequisite and worked example.
**Under C these go stale again every meeting.**

**Not touched by any of the three, and worth stating so they are not assumed
away:** the two hardcoded rate defaults (`new-product-form.tsx:23` `gstRate: '18'`,
`product-import-form.tsx:46` `Number(r.gstRate ?? 18)`) — each remains a claim
that 18% is the sensible default; and the absence of any as-of/version concept
(§3.7), which no option here introduces.

### 5.4 Three existing tests invert under Option A

Concrete and enumerable, because shape-only validation makes currently-invalid
rates valid:

| test                                      | asserts today                              | under A                                                             |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `packages/db/tests/dealers.test.ts:153`   | "product check rejects GST rate of 10"     | 10 becomes **valid** — test inverts                                 |
| `packages/db/tests/quotation.test.ts:152` | rejects `'9.00'`                           | 9 becomes **valid** — test inverts                                  |
| `packages/tax/tests/compute.test.ts:324`  | `computeTax(… 10 …)` → `INVALID_GST_RATE`  | inverts                                                             |
| `packages/tax/tests/compute.test.ts:328`  | `computeTax(… 100 …)` → `INVALID_GST_RATE` | inverts **only if** Option A introduces a `<= 100` bound — see 5.4a |

The first three rows are mechanical. The fourth is not, and the reason needs
stating precisely, because the earlier wording of this section implied something
false.

#### 5.4a — There is no 100-bound today; the operator ruled that Option A adds none

**Correction to this section's first version, which called `compute.test.ts:328` a
"boundary decision" and thereby implied the repository had chosen 100 as a
bound. It has not.** Established by reading every `100` in the engine
(`packages/tax/src/compute.ts`, four occurrences): `:58` and `:164` are
`dividedBy(100)` conversions, and `:148`/`:151` are the **discount** percent
bound (`'Discount percent must be 0-100'`) — a different quantity. **No bound on
a GST rate exists anywhere.** `compute.test.ts:324` and `:328` pass because 10
and 100 are not enum members; the two values are arbitrary out-of-set examples,
not a chosen limit. So a `<= 100` bound under Option A would **introduce** a
bound that has never existed, not preserve one.

**Measured: nothing in the arithmetic depends on any bound.** Through the
engine's own `Decimal` model, taxable ₹10,000.00 intra-state:

| rate    | half-label | tax       | total      |
| ------- | ---------- | --------- | ---------- |
| 40%     | 20%        | 4,000.00  | 14,000.00  |
| 99%     | 49.5%      | 9,900.00  | 19,900.00  |
| 100%    | 50%        | 10,000.00 | 20,000.00  |
| 101%    | 50.5%      | 10,100.00 | 20,100.00  |
| 204%    | 102%       | 20,400.00 | 30,400.00  |
| 999.99% | 499.995%   | 99,999.00 | 109,999.00 |

Nothing throws and nothing overflows. Two incidental facts: **a shape bound
already exists and nobody chose it** — `numeric(5,2)` caps at 999.99, so "no
bound" was never the alternative; and the half-rate label degrades cosmetically
at both extremes, giving `499.995%` at the ceiling and `0.125%` at 0.25%.

**OPERATOR RULING, 2026-09-18 — under Option A, decline to encode a bound.**
Recorded here as a sub-decision _within_ Option A's shape. **It does not select
Option A**; §5 still recommends no option. The reasoning, in the operator's
terms: `numeric(5,2)` already caps at 999.99, that cap was never chosen, needs
no owner and makes no statutory claim, whereas `<= 100` adds a bound that has
never existed. And the typo argument does not survive measurement — the
realistic fat-finger classes are `5 → 50`, `12 → 120`, `18 → 180`, and a
`<= 100` bound catches the extra-digit errors while **missing `5 → 50`, the
commonest one**. It buys staleness risk without buying protection.

Consequence for the table above: `compute.test.ts:328` **inverts** under Option
A as ruled, because 100 becomes valid. All four rows are then mechanical.

#### 5.4b — On Option A's ledger: typo-catching becomes a WARNING, not a rejection

**This is a cost of Option A and is recorded as one, so it is not discovered
later.** Declining to encode a bound removes the only thing that would have
caught an implausible rate at the boundary, so the protection has to move — and
the operator's constraint on where it moves is specific:

> Typo-catching moves to the catalogue form as a **warning on unusual values,
> not a rejection. A rejection is a bound wearing different clothes.**

That distinction is the whole point. A rejection threshold is a statutory claim
about which rates exist, with the same staleness and the same absent owner as the
list in §5.2 — it would reintroduce the defect at a different number and in a
different file. A warning asserts nothing about the law; it says only that a
value is unusual for this catalogue, and it leaves the tenant's classification
authority intact, which is the premise of the whole reframe (§5.1).

Unscoped and unbuilt — the catalogue form is
`apps/web/app/(app)/catalog/new/new-product-form.tsx` and the pricing editor is
`catalog/[id]/product-detail-sections.tsx`, and neither has any warning
affordance today. Noted as a ledger item against Option A, not as work.

### 5.5 Option C tends toward Option A by accretion

Stated as a structural observation, not as an argument for either.

Under C, an **abolition** has two possible treatments. Either the abolished rate
stays in the list forever — in which case the list only ever grows — or it is
removed, which §0.3 measured as a data migration that aborts against existing
rows. If the list only grows, then after enough Council meetings it no longer
means "rates that currently exist"; it means "rates ever valid", which **is the
storable set**. At that point the enterable set has no enforcement anywhere, and
the system behaves as Option A does — but with a list nobody can prune and a
maintenance obligation still on the books.

So C is not a stable resting point unless abolitions are actually processed, and
processing them is the expensive half.

---

## 6. F.81's 12% third rate — a fixture-realism problem, separate from validation

`[depends on the claim]` **These are two different defects and should not be
bundled.** The validation question (§5) is "which numbers may be said". The
fixture question is "what does our own demo corpus assert about the world". F.81
seeds a product at 12% (`packages/db/src/seeds/multi-rate.ts:145`,
`MR-INV-5K`, HSN `85044090`), so **the seed corpus asserts that an abolished slab
exists** — and it does so in a document (`QT-2026-0016`) that a demo would put in
front of a prospect.

That is a realism defect regardless of how §5 is settled. Even under Option A,
where 12% would be perfectly _valid_ to store, seeding it still claims a slab
that the claim says was withdrawn.

**The cost of changing it is small, and measured.** Full enumeration in §2.1;
the arithmetic in §0.4. In summary:

- **One executable site** — `multi-rate.ts:145`.
- **One test assertion** — `multi-rate-corpus.test.ts:88`. The other six cases in
  that file are shape assertions that hold for any third rate distinct from 5 and
  18, and `quotation-engine-parity.test.ts` recomputes rather than asserting
  literals.
- **Four code comments** and **nine documentation sites** drift (§2.1 items 3–6
  and 7–15), including the quoted `10073.01` figure.
- **No fixture, no matrix entry and no reference PDF** — because F.81 added none,
  under the operator's own Q3 ruling. That decision was taken for an unrelated
  reason (a Chromium cross-renderer contract versus a Typst self-capture) and it
  happens to mean **nothing needs re-baselining**.
- The seed's purpose survives: the ±0.01 per-line-versus-document rounding
  divergence comes entirely from the two 5% lines and is invariant across the
  third rate (§0.4). Only the quoted total moves.

**But it cannot be fixed independently of §5.** §0.5's intersection is the
constraint: of the claimed-live rates, only `{0, 5, 18}` are reachable today, and
5 and 18 are already Chain A's other two. So the options for the fixture are:

1. **0%** — reachable now, but F.87 deferred it because F.3/F.4 have not decided
   whether a zero-tax group renders as a row or is suppressed. Would give
   CGST 5093.01 (§0.4).
2. **3%** — needs the code widening only (already passes the DB CHECK, measured
   §0.1). CGST 6338.01.
3. **40%** — needs a migration **and** the code widening. CGST 21693.01.
4. **Drop to two rates (5/18)** — costs F.3/F.4 the three-group ordering and
   pluralisation coverage that was the stated reason for a third rate at all.

Options 2 and 3 make the fixture change depend on §5's outcome. Option 1 depends
on an F.3/F.4 rendering decision. Option 4 is available immediately and trades
away test coverage. **Reported, not recommended.**

---

## 7. Observation — compensation cess is not a GST rate, and no bound would catch it

**Recorded as an observation, not as work.** Operator instruction, 2026-09-18.

Compensation cess is a **separate levy from the GST rate**, and on some goods it
has historically run far above 100% ad valorem. It therefore sits outside every
rate set discussed in this audit, current or claimed-abolished.

The reason it is worth recording here rather than nowhere: **no bound in any
plausible range would catch cess conflated into `gst_rate`.** A `<= 100` bound
would not (cess can exceed 100); a bound at the top slab would reject a
legitimate value in the same breath as an illegitimate one, and there is no
threshold that separates "a high cess entered in the wrong column" from "a rate
this audit's claim says does not exist". So this is not an argument for or
against any bound, and §5.4a's ruling is unaffected.

**The actual fix is a separate column, and it does not exist.** §3.7's
enumeration of all 23 schema modules found no cess column, no cess table and no
cess concept; §1.2's enumeration found exactly four rate columns, all
`gst_rate`. So if a tenant ever needs to bill cess, today the only place to put
it is the GST rate column, which would be wrong in a way nothing detects and
which would then flow into `cgst_amount`/`sgst_amount`/`igst_amount` as though it
were GST.

**Domain caveat, the same one that governs this whole audit.** The claim that
cess is separate and can exceed 100% is the main thread's, from training data,
with no statutory source in this repository. It carries the same status as the
slab set in the caveat at the top of this file and belongs in the same
conversation with the accountant.

No row is filed for this. It is an observation about a gap, and whether Phase 1
should model cess at all is a product question nobody has asked yet.
