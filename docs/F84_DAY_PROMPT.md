# F.84 — the 3% fixture, plus the render and request coverage F.55 deliberately did not ship

> **STATUS: APPROVED — run as written.** Drafted by `prompt-drafter` and settled by
> the operator on 2026-09-19. All eight open questions are answered under **Settled
> decisions** at the end, as D-1 to D-8; every reference in the body points there.
> One recommendation was **overruled** (D-3) and one precondition the drafter
> supplied was **corrected on measurement** (D-6) — both are recorded as such rather
> than smoothed over.

**Goal.** Put a 3% GST rate into the seed corpus as real, persisted, clock-pinned
data, and then prove that a 3% document survives the two layers F.55's validation
change could not reach: the **PDF render path** and the **request layer**. This is
a **fixture-and-coverage day, not a validation day** — see the premise check
below.

**Primary deliverables**

1. A seeded 3% product (own HSN) and at least one **intra-state, single-rate 3%**
   quotation chain, placed so that no existing document moves.
2. A new worker test in `apps/workers/tests/` that renders that document through
   the production chain and asserts the rate and its half appear in the extracted
   text. **No golden file, no matrix entry.**
3. A new `apps/web/tests/e2e/verify-day-f84.spec.ts` driving 3% through the
   request layer. **`critical-path.spec.ts` is protected and is not touched.**
4. Corpus-shape assertions in `packages/db/tests/` so a future flattening of the
   corpus fails loudly and locally.

**Read before starting**

- `docs/stage-f-tasks.json` — F.84's row **in full** (three layers: original
  scope, "RE-SCOPED AND UNBLOCKED 2026-09-18", "REQUEST-LAYER SCOPE NARROWED
  2026-09-19"), plus F.55, F.81, F.85, F.87, F.89, F.93, F.94, F.3, F.4, F.6.
- `docs/F55_DAY_PROMPT.md` — **A.0** (the corrected baseline recipe; use it
  verbatim, do not re-derive), **A.8** (this day's render/request shape and its
  sizing), **D-1** (why this work is F.84's), and its "Settled decisions" block.
- `docs/F55_SPEC.md` §5 item 1 (the end-to-end requirement F.55 left unmet) and §6.
- `docs/F55_AUDIT.md` §2 (the five `computeTax` call paths; **two have no Zod in
  front of them**) and §5 (the 18-surface table, rows 5–18).
- `docs/GST_RATE_MODEL_AUDIT.md` §0.1–§0.5, §2.2, §3.4.
- `packages/db/src/seeds/multi-rate.ts` **in full** — F.81's module and the
  pattern to follow, including its header's reasoning on placement, on
  `computeTax` vs `computeTotals`, and on rounding-sensitive rates.
- `packages/db/src/seeds/clock.ts`, `packages/db/src/seeds/pin-created-at.ts`,
  `packages/db/package.json:16` (the `db:seed` chain).
- `apps/workers/scripts/long-serial-fixture.sql:18-27` — its own header on the
  post-`pin-created-at` timestamp trap (and F.85, which is the residue of it).
- `apps/web/tests/e2e/verify-day-f55.spec.ts` — read the **assertions**, not the
  titles (see R-3).
- `CLAUDE.md` §5, §10.1, §10.4, §11.1 rulings 1, 3, 4, 7, 8, §11.2;
  `docs/BUILD_PROMPT_TEMPLATE.md`; `docs/STAGE_F_BUILD_v3.md` §9.

---

## PREMISE CHECK — confirmed against the code, 2026-09-19

F.84's row asserts that F.55 made 3% shape-valid everywhere and that **nothing
here needs to widen a type, a constraint or a schema**. Verified:

- Four CHECKs are `gst_rate >= 0`: `packages/db/src/schema/product.ts:72`,
  `quotation.ts:171`, `performa-invoice.ts:175`, `order.ts:172`.
- `packages/tax/src/types.ts:21` — `export type GstRate = number;`. The engine's
  guard is shape-only: `packages/tax/src/compute.ts:147`.
- One shared Zod rule: `packages/schemas/src/product.ts:28` (`gstRateSchema`),
  consumed at `product.ts:51` and `quotation.ts:45`.
- Both PDF-loader read gates are gone:
  `apps/workers/src/templates/quotation.tsx:195-206` and
  `performa-invoice.tsx:125-135` now do `Number(l.gstRate)` with the deletion
  recorded in a comment.
- 3 is already probed at DB-insert + both Zod layers + the engine:
  `packages/db/tests/gst-rate-invariant.test.ts:72` (`ACCEPTED` includes 3),
  asserted at `:149-168`; and `packages/db/tests/dealers.test.ts:176-193`.

**If anything during the day appears to require a migration, a constraint change
or a `packages/tax` edit, that contradicts the premise: stop and report it as a
finding (CLAUDE.md §10.1).** The highest migration is `0018_smiling_bill_hollister`
(19 files, `0000`–`0018`, full listing read); this day adds none.

---

## READ THIS FIRST — five places the three sources disagree with each other or with the code

**R-1 — The render criterion is only satisfiable on a SINGLE-RATE, INTRA-STATE
document, and no source says so.** F.84's re-scope note and `F55_DAY_PROMPT.md`
A.8 (`:416-420`) both ask the render test to assert "the rate and its half
(3 percent yields a `1.5%` half-rate label)". The half-rate label exists only when
the document has one rate: `apps/workers/src/templates/quotation.tsx:233-234` sets
`gstRateLabel = distinctRates.length === 1 ? String(distinctRates[0]) : null`, and
`apps/workers/src/pdf/view-model.ts:131-133` renders `halfRateLabel = ''` when it
is null. `apps/workers/src/templates-typst/quotation.typ:104-106` then prints
`"CGST " + data.halfRateLabel` — i.e. **no rate qualifier at all** on a
mixed-rate document. That is F.81's already-observed behaviour (its notes: the
mixed-rate QT-2026-0016 renders "CGST 10,073.01" with the qualifier absent) and it
is **F.4's defect, not this day's**. It is also intra-state-only: inter-state
renders `"IGST " + fullRateLabel` (`quotation.typ:104`), so there is no `1.5%` on
an IGST document. **Consequence: the fixture must include one intra-state
quotation whose every line is at 3%, or acceptance criterion 5 cannot pass.** See
**D-2 settles this: single-rate intra-state, so criterion 5 stands and now states
both preconditions on its own face.** Neither F.84's notes nor A.8 stated them, and
the day would have discovered them by failing to pass a criterion it had already
committed to.

**R-2 — A matrix entry is genuinely unavailable, mechanism confirmed
independently.** `apps/workers/tests/pdf-snapshots.test.ts:129` does
`readFileSync(path.join(REFERENCE_DIR, ...))` using each case's label, for
**every** case in `apps/workers/scripts/typst-matrix.json`, so a case without a
reference PDF throws. The matrix holds 14 entries (read in full; none multi-rate,
none 3%) and `docs/pdf-references/` is read-only input. **The new render test must
resolve its own document and must not be driven by the matrix.** How it addresses
the document is **D-3**.

**R-3 — The narrowed request-layer note is accurate about `verify-day-f55.spec.ts`;
that file's own second test TITLE is not.** Read against the assertions:
case 1 (`:32-45`) asserts `toHaveAttribute('type', 'number')` and that
`select option` with text `/^28%$/` has count 0 — **one** slab label, not the whole
list, so "no hardcoded slab option renders" is slightly stronger than what runs;
case 2 (`:47-68`) does save at 40 with warning-then-second-click, reaching
`/catalog/<id>`; case 3 (`:70-80`) fills `18` and asserts the warning has count 0
— it **never clicks Save**, so its title "a rate already in the catalogue **saves**
with no warning at all" overstates its body. F.84's note describes case 3
correctly ("produces NO warning"). Do not fix the title on this day — file it
(§11.2); it is listed under FOUND WHILE READING.

**R-4 — The fixture's data-layer value is narrower than F.84's older "SCOPE
CORRECTION" paragraph claims.** That paragraph lists "the products CHECK
accepting 3 (demonstrated by the insert succeeding)" as something the fixture
reaches. F.55 already covers it —
`packages/db/tests/gst-rate-invariant.test.ts:72,149-168` and
`packages/db/tests/dealers.test.ts:176-193`. What the fixture adds that nothing
else can: a **persisted** 3% document, which is what
`packages/db/tests/quotation-engine-parity.test.ts:51-101` (it sweeps every seeded
`QT-%` quotation), the render path and the report/corpus paths can actually see.
Say this in the closeout notes rather than repeating the older claim.

**R-5 — F.84's claim that F.55 shipped no render check is correct.**
`apps/workers/tests/` is seven files, listed in full: `amount-in-words.test.ts`,
`email-handler.test.ts`, `maintenance-jobs.test.ts`,
`payment-receipt-template.test.ts`, `quotation-template.test.ts`,
`pdf-snapshots.test.ts`, `setup-env.ts`. None is new for F.55, and DEV.139's scope
line lists no file under that directory.

---

## Phase A — the work

### A.0 — Establish the "nothing moved" baseline. Before any other change.

Adding seed rows is the only thing that can move a rendered document — that is
D-1's whole reason for splitting this row from F.55. Take the recipe **verbatim**
from `docs/F55_DAY_PROMPT.md` A.0 (`:116-156`), substituting `/tmp/f84-*` for
`/tmp/f55-*`. The points that must not be paraphrased away:

- `pnpm typst:install` then `pnpm typst:check` first; the pinned binary is what
  every reference was rendered with.
- Seed, then apply `apps/workers/scripts/long-serial-fixture.sql`, then
  `determinism-check` (expect MATCH), then `pnpm --filter workers test`.
- **Hash rendered output into a FRESH directory** —
  `pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/f84-pre`
  (flags confirmed at `apps/workers/scripts/render-typst.ts:161-165`), then
  `sha256sum`. **Never hash `docs/pdf-references/`**: it is git-tracked read-only
  input, so a pre/post diff over it is empty by construction and could not detect
  the thing it is written to detect. That is DEV.136 exactly.
- Repeat into `/tmp/f84-pre2` from a **second independent reseed of the unchanged
  tree** and diff the two `.sha` files. That control is what makes any later
  movement attributable to this day.

**What F.81's experience predicts, and why it is a prediction and not a
guarantee.** F.81 added four products and four documents in the same seed position
this day will use, and reports all 14 renders byte-identical both against the
pre-seed baseline and across two independent reseeds. The mechanism is structural:
every earlier seed module picks products **positionally from unordered selects**
(`multi-rate.ts:14-19` cites `day7.ts:229`, `day8.ts:357`, `day12.ts`,
`day13.ts`), so rows added after them cannot be picked up. Expect no movement —
and if any of the 14 moves, that is **a finding to report, not a baseline to
re-record** (§11.1 rulings 1 and 4).

### A.1 — Where the fixture goes, and why the position is the whole risk

The `db:seed` chain, read at `packages/db/package.json:16`, is exactly:
`index → day5 → day6 → day7 → day8 → day11 → day12 → day13 → multi-rate → pin-created-at`.

**The new rows must land after `multi-rate.ts` and before `pin-created-at.ts`.**
Two independent reasons:

1. **Positional picks.** Anything inserted before `day13` re-deals lines of
   documents that already have reference PDFs (A.0's baseline would then move for
   a reason unrelated to 3%).
2. **The clock.** `pin-created-at.ts:63-79` rewrites `created_at`/`updated_at` on
   15 tables — enumerated there as `quotations`, `performa_invoices`, `orders`,
   `payments`, `dispatches`, `dealers`, `products`, `inventory_items`, `deals`,
   `quotation_lines`, `performa_invoice_lines`, `order_lines`, `dispatch_lines`,
   `dispatch_serials`, `payment_allocations`. Every table a 3% quotation→PI→order
   chain writes is in that list, so rows inserted **before** the pass are pinned
   for free. The status-history tables are **not** in the list and do not need to
   be: they carry only `transitioned_at` (`packages/db/src/schema/quotation.ts:191`),
   which the seed sets explicitly — follow `multi-rate.ts:451-479` and set it.

**Anything inserted AFTER `pin-created-at.ts` escapes the pin** and must set every
timestamp by hand, which is the trap
`apps/workers/scripts/long-serial-fixture.sql:18-27` documents in its own header:
`generatedAt` resolves to the source row's `created_at`, so an unpinned row put a
wall-clock minute into a rendered footer ("12:06" against "12:07"). **If the
operator directs this fixture to be a post-seed `.sql` file instead** (not
recommended, and D-1 rules it out), it must then set `created_at` and `updated_at` explicitly
on every insert, using `pin-created-at.ts:113-115`'s own rule — the row's own
business date at `10:00:00` UTC — and it will inherit F.85 (a hardcoded literal
that `SEED_EPOCH` cannot move).

**The document-counter hazard, which is this day's version of the same risk.**
Document numbers come from the per-tenant counter (`multi-rate.ts:174-189`), so a
new chain allocated **before** existing ones renumbers them. `typst-matrix.json`
pins `QT-2026-0001/0006/0010`, `PI-2026-0001/0002`, `PAY-2026-0007`,
`DSP-2026-0005`, and `long-serial-fixture.sql:46` pins `ORD-2026-0019`. **Allocate
strictly after every existing allocation** — i.e. after `multi-rate.ts`'s Chain B
— and confirm afterwards that `ORD-2026-0019` still resolves, as F.81 did.

### A.2 — The fixture's content

Following `multi-rate.ts` as the pattern, and **only** as the pattern:

- **The product.** One product per tenant at `gstRate: '3.00'` with its own HSN
  code, distinct from `85414300`, `85414011`, `85044090`, `85359090` (the four
  already in the catalogue). Follow `multi-rate.ts:58-64`: the product-to-rate
  mapping is **fixture realism and asserts no statutory rate**. Say that in the
  module header. Do not invent a statutory justification for 3% on any HSN — the
  operator's own recorded position (F.55's notes) is that 3% is the gold/precious-
  metals rate and does not apply to solar, and `CLAUDE.md` §1's tenant-agnostic
  framing is why the rate is worth supporting anyway.
- **Totals come from `computeTax`, not from `day8`'s `computeTotals`.** Operator
  ruling recorded in F.81's notes and in `multi-rate.ts:28-56`, after a
  measurement. `serializeOutput(computeTax(...))` as `multi-rate.ts:191-210`. This
  is **use** of `packages/tax`, not modification — but see STOP AND ASK.
- **Shape: at least one intra-state quotation whose every line is 3%** (R-1),
  with its PI. **D-2**: single-rate only — no mixed 3% chain.
- **Deterministic picks only.** `orderBy` + `limit 1`, never `limit 1` over an
  unordered select — `multi-rate.ts:236-256` and `:264-277` are the pattern, and
  the anti-pattern is what R-4's positional-pick problem is made of.
- **Re-runnable**: tag-based cleanup first, then rebuild (`multi-rate.ts:665-670`).
  Use a new tag; do not reuse `multi-rate-seed-*`.

**Rounding — the prices are a deliberate choice, not an arbitrary one.** 3% is one
of two rates in play whose intra-state half is fractional: CGST/SGST at 1.5%. For
an integer-rupee line subtotal `S`, the tax in paise is `1.5 × S`, which is a whole
number of paise **only when `S` is even** — so an **odd** integer subtotal puts a
half-paisa on the line and the rounding model becomes observable. That is the same
property `multi-rate.ts:328-337` documents for 5% (CGST 2.5%), where the shipped
Chain A carries `CGST 10073.01` per-line against `10073.00` document-level, and
F.81's header states plainly that with a **single** such line the per-line and
document-level models agree trivially and a regression would pass unnoticed. So:
**≥2 lines at 3% with odd integer-rupee subtotals**, if the operator wants this
fixture to carry the same property. **D-4: yes.**

Note what `quotation-engine-parity.test.ts` does and does not do here: because the
seed's totals come from `computeTax` and the test re-runs `computeTax`
(`:70-94`), it is a **round-trip** for these documents and will be green whatever
prices are chosen. It therefore did **not** decide D-4 — it only guarantees the
stored columns and the engine agree. Do not present it as validating the rounding
choice.

### A.3 — Corpus-shape assertions

Assert the fixture's *shape*, so a future flattening of the corpus fails in a file
whose name says what it is about — the argument
`packages/db/tests/multi-rate-corpus.test.ts:10-15` makes for itself. At minimum:
every active tenant's catalogue contains `'3.00'`; at least one **intra-state**
quotation exists all of whose lines are `'3.00'`; the PI carries the same rate as
its quotation. Assert rates as a **set membership** (`toContain('3.00')`), not a
count — `multi-rate-corpus.test.ts:84-89` explains why.

**Give the new assertions a control.** F.81 deleted its seed rows and confirmed all
7 assertions failed; DEV.138/DEV.139's signature is that "a passing negative
result is not evidence until something demonstrates it could have failed". Whether
the file is new or an extension of `multi-rate-corpus.test.ts` is **D-5**.

### A.4 — The render check (A.8's shape, sized as A.8 sizes it)

One new test under `apps/workers/tests/`. It renders the seeded single-rate 3%
quotation through the production chain — `loadQuotationPdfData` → `buildViewModel`
→ `renderTypstPdf`, the chain `pdf-snapshots.test.ts:69-93` already uses, with
`resolveGeneratedAt` as at `:78-82` — and asserts:

- the loader does **not** throw (F.89's bare `Error` stays; it is simply not
  reached — **F.89 is not in scope**);
- the extracted text carries `3%` (the per-line rate;
  `templates-typst/quotation.typ:78` prints `str(l.gstRate) + "%"`) and `1.5%`
  (the CGST/SGST half-rate label).

**Extract the same way `pdf-snapshots.test.ts:97-114` does, and note that its
`squash` strips all whitespace** — so the text to match is `CGST1.5%`, not
`CGST 1.5%`. Reuse the extractor rather than writing a second one, or state why not.

**No golden file, no matrix entry, nothing added to `docs/pdf-references/`** (R-2).
How the test addresses the document is **D-3**.

**The criterion needs an executed non-vacuity control, not an intended one.**
DEV.129's lesson and DEV.139's "control that silently never ran" are the same
lesson twice. Point the same assertion at an existing single-rate 18% quotation
and show it red on `1.5%` (an 18% document yields `9%`), then restore. Report the
output.

### A.5 — The request-layer check

A **new** `apps/web/tests/e2e/verify-day-f84.spec.ts`. **Do not touch
`apps/web/tests/e2e/critical-path.spec.ts`** — it is protected
(`docs/STAGE_F_BUILD_v3.md:436`), and F.55's one-line authorisation at `:166` was
scoped to F.55 and does not carry forward.

What is already covered, so this day does not rebuild it: `verify-day-f55.spec.ts`
covers the catalogue form at a novel rate and the D-6 warning affordance (R-3).
**What remains is the document chain**, and the hop F.84's notes single out is
`apps/web/lib/actions/pi/convert-quotation-to-pi.ts:86`, which reaches `computeTax`
with **no Zod layer in front of it** (`F55_AUDIT.md` §2 row 3, confirmed by reading
the file: the lines come from `loadQuotationLines` at `:73`). The other unguarded
path is the **browser preview** (`apps/web/lib/quotation/preview.ts:83` →
`computeTax`), reached from the quotation builder's summary card on every line edit.

The route through the UI exists and is already demonstrated by
`critical-path.spec.ts:250-326`: `/quotations/new` → `pickOption(getByLabel('Add a
product line'), SKU)` → totals appear → `Save & send` → accept → `Convert to PI` →
`Create draft PI` → send + `Confirm PI` → an order is auto-created. **How much of
that chain this spec drives is **D-6**, and whether the fixture leaves an
accepted-but-unconverted 3% quotation for it to convert is **D-7**.

Two facts to design around, both read from the code:

- `convert-quotation-to-pi.ts:52-61` guards on `NOT_FOUND`, `status !== 'accepted'`,
  and `role === 'sales' && preparedBy !== auth.user.id`. It does **not** forbid a
  second PI from the same quotation. The seeded chain sets `status: 'accepted'` and
  `preparedBy` = the tenant's sales user (`multi-rate.ts:429`), so logging in as
  **admin** avoids the preparer check.
- The 3% fixture changes the catalogue's distinct-rate set, which feeds
  `listTenantGstRates` (`apps/web/lib/queries/products.ts:165-178`) and hence both
  the suggestion datalist and the placeholder
  (`new-product-form.tsx:156`, `String(knownGstRates[0])` — today 5, afterwards 3).
  So **3 will no longer trigger the D-6 warning**: the new spec must not assert a
  warning at 3%. An optional extra assertion is that 3 now appears in the
  suggestions — **D-8**.

### What this day does NOT do

- **Not** F.87 — the 0% fixture. Its blocker is a rendering decision F.3/F.4 own.
- **Not** F.89 — the loaders' bare `Error` class.
- **Not** F.3/F.4 — no rate-wise summary, no HSN/SAC table, and **not** the empty
  half-rate label on mixed-rate documents (R-1), which is F.4's.
- **Not** a matrix entry, a reference PDF, or any change under
  `docs/pdf-references/` or to `determinism-expected.json`.
- **Not** a migration, a constraint change, or any edit inside `packages/tax`.
- **Not** F.85 (`long-serial-fixture.sql`'s hardcoded `pinned_ts`), **not** F.86
  (`day8`'s float `computeTotals`), **not** F.88 (`.gitignore`), **not** F.91,
  **not** F.93, **not** F.94, **not** F.95.
- **Not** `verify-day-f55.spec.ts`'s misleading test title (R-3) — file it.

---

## Phase B — verification

**Must stay green** (say which ran locally and which in CI):

- `pnpm --filter workers test` — all 14 `pdf-snapshots.test.ts` cases by name,
  text-identical against the Chromium references, **plus** the new render test.
  Typst is installed in CI's `test` job (`.github/workflows/verify.yml:283-288`).
- `cd apps/workers && pnpm exec tsx scripts/determinism-check.ts` → MATCH, with
  `git diff --stat apps/workers/scripts/determinism-expected.json` empty.
- `pnpm --filter @dealerlink/db test` — including
  `quotation-engine-parity.test.ts`, `multi-rate-corpus.test.ts`,
  `gst-rate-invariant.test.ts`, `dealers.test.ts`, `quotation.test.ts`.
- `pnpm --filter @dealerlink/tax test`, `pnpm --filter @dealerlink/schemas test`
  (should be untouched — if either changes, that is a scope deviation).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm verify`,
  `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check`.

**New coverage this day adds:** the A.4 render test with its executed control; the
A.3 corpus assertions with their deletion control; `verify-day-f84.spec.ts`.

**The three measurements, kept as three statements** (they answer different
questions and each can fail alone — F.55 §5 and its shipped precedent):

```
# 1 — TEXT against the Chromium contract
pnpm --filter workers test                 # pdf-snapshots.test.ts, 14 named cases

# 2 — BYTES against the pre-change render
pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/f84-post
( cd /tmp/f84-post && sha256sum *.pdf | sort -k2 ) > /tmp/f84-post.sha
diff /tmp/f84-pre.sha /tmp/f84-post.sha    # must be empty

# 3 — BYTES across two independent reseeds (full db:seed + long-serial fixture each time)
diff /tmp/f84-reseed1.sha /tmp/f84-reseed2.sha   # must be empty
```

Also re-confirm, because the fixture allocates document counters:
`psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f apps/workers/scripts/long-serial-fixture.sql`
applies cleanly (it resolves `ORD-2026-0019` at `:46`), and every
`typst-matrix.json` document number still resolves.

---

## Phase C — closeout

Follow `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" in full.
Unusual for this day:

- **C2 before C4 matters more than usual.** `pnpm test` writes to the shared dev DB
  (DEV.91), and DEV.139 records exactly how that bit: rewritten accepting INSERTs
  leaked products at rates outside the old enum and silently disabled the control
  meant to validate the change. Reseed deliberately between steps and say when.
  Any probe INSERT this day adds must roll back inside its own transaction, the
  pattern `gst-rate-invariant.test.ts:150-159` uses.
- **C5:** F.84's own row; record explicitly whether F.55's acceptance criterion 5
  is now met (it is the reason this row exists). Note the R-4 correction — the
  fixture's data-layer contribution is narrower than the row's older paragraph
  claims. Anything else found goes in as a **row**, never folded in (§11.2).
- **C6:** a deviation entry is near-certain for R-1 (the render criterion's
  single-rate/intra-state precondition, absent from both sources) and R-3 (the
  `verify-day-f55.spec.ts` title).
- **C6a:** confirm every new id is free. **C6b:** no unearned precision — in
  particular, do not write "byte-identical" or a table/row count you did not
  produce with a command.
- **C7a:** `verifier` before the PR. A FAIL stops the day (§10.3).

---

## Acceptance criteria — each with the command or file that decides it

1. `pnpm db:seed` completes and every active tenant's catalogue contains a product
   at `'3.00'` on a new HSN code. → the A.3 corpus test, via
   `pnpm --filter @dealerlink/db test`.
2. At least one **intra-state** quotation exists all of whose lines are `'3.00'`,
   with a PI carrying the same rate. → the A.3 corpus test.
3. The A.3 assertions fail when the 3% rows are deleted. → executed control;
   report the failure count.
4. `quotation-engine-parity.test.ts` is green with the new `QT-` documents
   included. → `pnpm --filter @dealerlink/db test`.
5. **The SINGLE-RATE, INTRA-STATE** seeded 3% quotation renders through
   `loadQuotationPdfData` → `buildViewModel` → `renderTypstPdf` without throwing,
   and the extracted text contains `3%` and the `1.5%` half-rate label. → the A.4
   test, via `pnpm --filter workers test`.

   **Both preconditions are part of the criterion, not context for it.** The
   half-rate label does not exist on a mixed-rate document
   (`quotation.tsx:233-234` → `null` → `view-model.ts:131-133` → `''`) and the
   intra-state branch is the only one that emits a half at all
   (`quotation.typ:104-106`). Neither F.84's notes nor `F55_DAY_PROMPT.md` A.8
   stated either, so as originally written this criterion was unsatisfiable under
   two of the three fixture shapes and the day would have found that out by
   failing. D-2 chooses the shape that satisfies it; R-1 is why.
6. Criterion 5 goes red when pointed at a single-rate 18% document. → the A.4
   executed control; report the output.
7. All 14 reference cases still match on **text**. → `pnpm --filter workers test`.
8. All 14 renders are **byte-identical** to the A.0 pre-change hashes. →
   `diff /tmp/f84-pre.sha /tmp/f84-post.sha`, empty.
9. All 14 renders are **byte-identical across two independent reseeds**. →
   `diff /tmp/f84-reseed1.sha /tmp/f84-reseed2.sha`, empty.
10. `determinism-check` prints MATCH with `determinism-expected.json` unmodified.
    → `pnpm exec tsx scripts/determinism-check.ts` + `git diff --stat`.
11. No file under `docs/pdf-references/` and no entry in
    `apps/workers/scripts/typst-matrix.json` changed; no migration added; no file
    under `packages/tax/` changed; `critical-path.spec.ts` unchanged. →
    `git diff --name-only main`.
12. `long-serial-fixture.sql` applies cleanly and every matrix document number
    still resolves. → the psql run + `pnpm --filter workers test`.
13. `verify-day-f84.spec.ts` drives 3% through the request layer and is green. →
    `pnpm verify`.
14. `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check` exit 0; `pnpm lint`,
    `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm verify` green.

**Criteria checked against each other.** 5 requires a single-rate intra-state 3%
document; 2 is what guarantees one exists — they are consistent **only** under
D-2. 8 and 9 require no movement in the existing renders; that holds only under
A.1's placement. 5 and 11 are compatible because the A.4 test resolves its own
document instead of adding a matrix entry. 4 cannot fail on the price choice
(A.2), so do not read it as validating D-4.

---

## STOP AND ASK

- **Seeding money columns.** The fixture writes `subtotal`, `taxableAmount`,
  `cgstAmount`, `sgstAmount`, `igstAmount`, `totalAmount` on quotations, PIs and
  orders. CLAUDE.md §10.1 names money columns; F.81 did the same thing under an
  explicit operator authorisation (the use-versus-modification ruling recorded at
  `DEVIATIONS.md:5750-5798`). **Confirm that authorisation extends to this day
  before writing the module.**
- **Importing `computeTax` into a seed** is use, not modification, on the same
  ruling — but no file under `packages/tax/` may change, tests and fixtures
  included. If the engine needs anything, stop.
- **Any migration, constraint change or schema edit** — not expected (premise
  check). If one appears necessary, that contradicts this row's premise and is a
  finding.
- **Any movement in any of the 14 reference cases** — a finding, never a
  re-baseline.
- **`critical-path.spec.ts`** — no edit, not even the F.55-shaped one-liner.
- **Any decision the Settled decisions section does not cover.** Eight were open
  and eight are answered; a ninth is a stop.
- **Any deviation from this scope**, including a "quick fix" to the
  `verify-day-f55.spec.ts` title, to F.85's `pinned_ts`, or to F.93's three tests.

---
## Settled decisions

Eight questions, eight answers, operator 2026-09-19. **One recommendation was
overruled (D-3) and one supplied precondition was corrected on measurement (D-6).**

**D-1 (was Q1) — extend `multi-rate.ts`; do not write a second module.**
Option (b). Two copies of chain-building are two things to get subtly wrong
independently — the same argument that merged the two Zod rate rules into one
`gstRateSchema` on the F.55 day. **Append strictly after Chain B**, so every
existing counter allocation keeps its number.

The header correction at `multi-rate.ts:116-117` is **not a cost of this option**:
that text currently states 3% is excluded pending F.55, which is now false and has
to be fixed whichever option is chosen.

**D-2 (was Q2) — single-rate 3% only.**
Option (a), the minimum this row's own criteria require. F.81 already gives F.3/F.4
three rate groups, so option (b)'s extra mixed chain would buy **realism rather
than coverage shape**, at two more documents and two more counter allocations. Not
(c) — it would make criterion 5 unsatisfiable.

**D-3 (was Q3) — use `resolveDocument`. THE DRAFTER'S RECOMMENDATION IS OVERRULED.**
Option (a). The fragility argument is real, but it **applies equally to the 14
existing references**, which are addressed the same way and have survived F.81 —
because the append-after-Chain-B ordering keeps prior counters fixed. **That
discipline is the protection, and D-1 already puts it in force here.** Introducing a
second addressing scheme for one test creates exactly the drift
`apps/workers/scripts/resolve-document.ts:5-13` warns against.

**Make the ordering rule explicit in the fixture's own comment as the thing that
protects the address**, so the next reader sees why the document number is safe to
depend on rather than inferring that nobody thought about it.

**D-4 (was Q4) — yes: odd integer-rupee line subtotals, at least two 3% lines.**
Option (a). 3% halves to 1.5%, so any odd rupee subtotal produces a half-paisa tie.
Same argument F.81 accepted for 5%, and it costs nothing.

**D-5 (was Q5) — extend `multi-rate-corpus.test.ts`.**
Option (a), following D-1 so the test's provenance matches the seed's.

**D-6 (was Q6) — the two unguarded hops only. AND THE JUSTIFICATION IS CORRECTED.**
Option (b). `docs/F55_AUDIT.md` §2 names exactly two production paths that reach
`computeTax` with no Zod in front of them: the browser preview
(`apps/web/lib/quotation/preview.ts:83`) and
`apps/web/lib/actions/pi/convert-quotation-to-pi.ts:86`. Those are what the spec
drives. CLAUDE.md §11.1 ruling 3 — justify a runtime cost rather than assume it.

**The reason given for excluding the order hop was wrong, and the corrected reason
is stronger.** The operator's framing was that "`createQuotation` and the order hop
have schemas and are covered". Measured: `createQuotation` does
(`create-quotation.ts:31`, `createQuotationSchema`), but **the order hop's schema
does not see the rate at all.** `confirmPi` is a `tenantAction` with
`confirmPiSchema`, and `packages/schemas/src/performa-invoice.ts:62` is
`z.object({ id: z.string().uuid() })` — the PI id and nothing else. Order lines take
`gstRate: l.gstRate` copied verbatim out of `performa_invoice_lines`
(`status-transitions.ts`), never through Zod.

So the order hop is **not rate-guarded — and it performs no rate validation at all,
which is why it needs no coverage.** There is no gate there that could reject 3%; it
is a pure copy. The two hops in (b) are different in kind: they reach a real
validator (`computeTax`) with nothing in front of it. Excluding the order hop
because it is *inert* is a sound reason; excluding it because it is *guarded* would
have been a false one.

**F.84's notes are corrected in the same closeout.** They read like option (a)
because the operator's own narrowing instruction said "through quotation, PI and
order"; that wording was **aspirational**, the operator has said so, and the
evidence supports the two hops.

**D-7 (was Q7) — yes: seed an extra accepted-but-unconverted 3% quotation.**
Option (a). The drafter's formulation is the reason and is worth keeping verbatim:
option (b) "makes the spec depend on the absence of a guard that nobody has decided
should be absent". One more document and one more counter value.

**D-8 (was Q8) — assert the datalist contains 3; not the placeholder.**
Option (a), narrowed. The datalist is a set and is stable; the placeholder is
`String(knownGstRates[0])` (`new-product-form.tsx`), which is order-dependent and
would break when F.87's 0% lands.

---

## Also settled on the same day, outside the eight

Three defects the drafter surfaced in code shipped on 2026-09-18. **Two are
corrected in this day's PR; one is filed.**

- **`verify-day-f55.spec.ts:70`'s title is a false claim** — "a rate already in the
  catalogue **saves** with no warning at all", in a test whose body fills `18`,
  asserts the warning is absent, and **never clicks Save**. One line, in a day that
  touches e2e coverage anyway. **Corrected now**, not filed.
- **F.84's notes cited "F.55's spec section 5.1"**, and `docs/F55_SPEC.md` has
  `## 5. Acceptance` with no §5.1 — the requirement is item 1 under it.
  **Corrected now**, because a citation is read as authority.
- **`listTenantGstRates` filters neither `deleted_at` nor `status`** — filed as a
  row, not fixed here. The finding is **not** the non-idempotent test; that is a
  symptom. The defect is that rate suggestions on both catalogue screens include
  rates drawn from **non-active products** — `inactive` and `discontinued` — which
  is wrong on a user-visible surface in code shipped the day before.

  The row as first filed also said **deleted** products, and that half is **not
  reachable**: `products.deleted_at` exists (`packages/db/src/schema/product.ts:64`)
  but nothing under `apps/web/lib/actions/products/` ever sets it, so no product is
  ever soft-deleted today. The `deleted_at` filter is still worth adding — no query
  in `apps/web/lib/queries/products.ts` filters it while `CLAUDE.md` §4 says Product
  queries should — but as forward-safety, not as a present-day leak. Corrected in
  F.96 before it was committed.
