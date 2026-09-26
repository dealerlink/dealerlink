# F.5a — Ship-To addresses and the two delivery arrangements

> **STATUS: APPROVED — operator 2026-09-26. Run it.** All twelve questions are
> settled as **D-1 to D-12** at the end of this document. **D-1 carries a bounded
> authorisation to add a file to `packages/tax`**, and **D-9's ADR sentence is
> quoted verbatim and is not to be paraphrased.**

> **THREE THINGS TO READ BEFORE PHASE A:**
>
> 1. **The ruling that widened this row**, in `docs/stage-f-tasks.json` F.5a, from
>    "WIDENED 2026-09-26 BY OPERATOR RULING" onward. The design is RULED. The
>    builder implements both arrangements and does not re-open which one applies.
> 2. **`docs/F105_AUDIT.md` in full.** It is the write-site and derivation map this
>    day rewires. Its citations were re-confirmed on 2026-09-26 (see PREMISE CHECK)
>    — use it rather than re-deriving, but re-read the two production PI actions,
>    because they are the only two files where the branch actually lands.
> 3. **THE WRONG FIX, named below.** It is the one a reader reaches for, and it
>    would reclassify documents that have already been issued.

## THE WRONG FIX, NAMED FIRST

You will be adding a second place-of-supply rule. **The obvious move — recompute
`place_of_supply` for existing rows so that every document agrees with the new
model — is REJECTED and must not be implemented, in the migration, in a seed, or
in a script.**

`place_of_supply` and `tenant_state_at_issue` are **at-issue snapshots**
(`packages/db/src/schema/quotation.ts:61`, `performa-invoice.ts:70`,
`order.ts:75`). Every read path derives the tax type from those stored columns —
`apps/web/lib/queries/orders.ts:270`, `apps/web/lib/queries/performa-invoices.ts:284`,
`apps/web/lib/tax/document-summary.ts:105`, and the two PDF loaders
(`apps/workers/src/templates/quotation.tsx:281-282`,
`templates/performa-invoice.tsx:212-213`). So a backfill that rewrites the column
changes **the tax type printed on documents that have already been issued**, which
is the F.99 failure mode with statutory consequences attached.

**The decided direction is the opposite:** the arrangement is an input to the
derivation **at write time only**. Defaulting to (a) means the derivation for an
existing or a newly-created document is byte-for-byte what it is today, so nothing
reclassifies. If a step appears to require moving a stored `place_of_supply`, that
is the signal that the shape is wrong — **stop and report.**

## Goal

Model delivery addresses on a dealer, and record on the **document** which of the
two IGST Act 2017 §10 sub-clauses applies when ship-to differs from bill-to, so
that place of supply derives from the **ship-to state under §10(1)(a)** and the
**bill-to state under §10(1)(b)**. Default to (a). Ask only when the parties
differ. Supersede ADR-012 with an ADR that states two rules and the condition that
selects between them. Move no stored money and no stored `place_of_supply`.

## Primary deliverables

1. A `dealer_addresses` table with its RLS policy, its index set, its place in the
   seed, and a test module of its own — **shape settled by Q2/Q5, migration
   authorised separately.**
2. A document-level record of the delivery arrangement on the document types where
   ship-to and bill-to can differ — **which tables is Q3; column shape is Q2.**
3. The two-branch place-of-supply derivation, with (a) as the default — **its home
   is Q1.**
4. The two production forms asking for the arrangement, and only when the parties
   differ: `apps/web/app/(app)/quotations/[id]/convert-to-pi/convert-form.tsx` and
   `apps/web/app/(app)/pi/[id]/edit/pi-edit-form.tsx`. Those are the only two
   surfaces that set a ship-to (see PREMISE CHECK, enumerated).
5. **An ADR superseding ADR-012**, not replacing it (the ADR-015/ADR-013
   precedent). The next free id is **ADR-016** — established by enumerating all
   fifteen `^## ADR-` headings in `DECISIONS.md`, which run 001–015 and are **not
   in sorted order** (ADR-014 is first at `:9`, ADR-013 last at `:707`). Re-run
   C6a's check anyway.
6. Fixtures exercising **both** branches, with an **executed control** that is red
   before the change and green after.
7. **The reclassification measurement**: a pre/post snapshot over every seeded
   quotation, PI and order proving that not one stored `place_of_supply` or derived
   classification moved, with a falsifying control showing the instrument can
   report a move.

## Read before starting

- `docs/stage-f-tasks.json` — F.5a in full; **F.112** (rewritten 2026-09-26 to a
  narrow onboarding observation; it no longer blocks this row); F.5b (`:122-128`,
  the next task and the one that shares this day's "when Bill-To ≠ Ship-To"
  condition); F.105; F.103; F.114 (the `orders` asymmetry); F.106 and F.115 (the
  client demo tenant this day must not disturb); F.100 (section-anchor miscites —
  you will meet several; **do not fix them here**).
- `CLAUDE.md` §4 (schema rules: `tenant_id`, RLS, index, soft delete), §5 (place of
  supply, state codes, when tax recalculates), §10.1 (stop and ask), §11.1 rulings
  1, 2, 3, 4, 5, 7, 8, §11.2.
- `DECISIONS.md` ADR-012 (`:571-602`) in full, and ADR-015 (`:606`) for the shape a
  superseding ADR takes here.
- `docs/STAGE_F_BUILD_v3.md` §4 (`:102-128`, D-4's rationale), §6 (`:176-188`,
  the F.5a/F.5b spec), §9 (`:433-451`, protected surfaces — note `:438`).
- `docs/F105_AUDIT.md` in full.
- `docs/F101_DAY_PROMPT.md` — **for the rigour bar, not the subject**: the bounded
  authorisation, the STOP condition stated so it is not a judgement call, the
  executed controls, and the three-measurements block.
- `docs/BUILD_PROMPT_TEMPLATE.md` — the prompt shape and "Phase C — end-of-day
  routine" (`:18`).
- `docs/DESIGN_SYSTEM.md` — **there is no prototype screen for address
  management.** `docs/Distribyte.html` contains exactly one occurrence of
  "Address" (`:957`), a read-only single-address block. CLAUDE.md §9's "open the
  prototype and match it" has nothing to match here; follow the design system and
  the existing `apps/web/app/(app)/dealers/[id]/dealer-detail-sections.tsx`.

---

## PREMISE CHECK — confirmed against the code, 2026-09-26

**P-1 — `place_of_supply` is on exactly three tables, and `ship_to_dealer_id` on a
different three. The two sets are not the same set, and this is the asymmetry the
brief asked about.** Established by one ripgrep pass over the whole of
`packages/db/src/schema/` for `placeOfSupply|place_of_supply|shipToDealerId|billToDealerId|tenantStateAtIssue`,
read in full:

| Table               | `place_of_supply`              | bill-to / ship-to party ids     |
| ------------------- | ------------------------------ | ------------------------------- |
| `quotations`        | **yes** (`quotation.ts:63`)    | **no** — one `dealerId` (`:54`) |
| `performa_invoices` | yes (`performa-invoice.ts:73`) | yes (`:63`, `:66`)              |
| `orders`            | yes (`order.ts:77`)            | yes (`:68`, `:71`)              |
| `dispatches`        | **no**                         | yes (`dispatch.ts:53`, `:56`)   |
| payments            | no                             | no                              |

**So the arrangement question can only be asked where both are true:
`performa_invoices` and `orders` — two tables, not three.** A quotation has a
single dealer and no ship-to, so the parties cannot differ and the question is
meaningless there (CLAUDE.md §5 already records why). `dispatches` carries both
parties but is tax-neutral and stores no place of supply. Q3 decides whether the
column goes anywhere beyond those two.

**P-2 — `dealer_addresses` does not exist.** By affirmative enumeration, not by a
clean search: `packages/db/src/schema/` contains 23 files, listed in full, none
named for addresses; `packages/db/src/schema/index.ts` is 27 lines and exports 22
modules, read in full; `packages/db/src/rls/` contains 21 files, listed in full.
The string `dealer_addresses` occurs in five tracked files and **every one is a
planning document** — `PROJECT_PLAN.md`, `docs/stage-f-tasks.json`,
`docs/STAGE_F_BUILD_v3.md`, `docs/F3_DAY_PROMPT.md`, `docs/TAX_INVOICE_AUDIT.md`.
Nothing in `packages/` or `apps/` mentions it.

Today a dealer carries **one** address inline: `packages/db/src/schema/dealer.ts:50-56`
(`addressLine1`, `addressLine2`, `city`, `state`, `pincode`, `country`), with
`state` **nullable** under `dealers_state_chk` (`:109`).

**P-3 — `packages/tax` does not need to change, and ADR-012 says why.** The engine
takes `placeOfSupply` as an opaque string and reduces the whole classification to
`tenantState.trim() !== placeOfSupply.trim()` (`packages/tax/src/state.ts:15-17`,
called at `compute.ts:37`). ADR-012's own Decision section says it: "The
`@dealerlink/tax` engine already takes an opaque `placeOfSupply` string, so no
engine change was needed — only the callers feeding it the right state."

**This corrects the brief that commissioned this prompt**, which states the day
"touches `packages/tax`". It touches **the callers of** `packages/tax`. Whether a
new pure derivation function should nonetheless live inside the package is a real
design question and is **Q1** — but it is a choice, not a requirement, and the
day's protected-surface exposure depends on the answer.

**P-4 — there are exactly two production derivations of place of supply for a
three-party document, and they are one line each.**
`apps/web/lib/actions/pi/convert-quotation-to-pi.ts:71` and
`apps/web/lib/actions/pi/update-pi.ts:41`, both
`(input.placeOfSupplyOverride ?? shipTo.state).toUpperCase()` — F.105's D2, still
at the cited lines. The order inherits without deriving:
`apps/web/lib/actions/pi/status-transitions.ts:153` copies `pi.placeOfSupply`
(F.105's D3, still at the cited line). `packages/db/src/dispatch/create.ts:303-304`
copies the order's two party ids. **So the branch lands in two files.** Everything
downstream inherits, which is what makes the blast radius small and the ADR large.

**P-5 — exactly two forms set a ship-to.** From a ripgrep pass for
`shipToDealerId` across `apps/web` with `.next` excluded, read in full: three query
modules, seven action/helper modules, and two components —
`quotations/[id]/convert-to-pi/convert-form.tsx` and `pi/[id]/edit/pi-edit-form.tsx`.
There is no dispatch picker. **Both forms duplicate the classification rule
client-side for a preview banner** — `convert-form.tsx:26-27` and
`pi-edit-form.tsx:58` — and both derive the preview's place of supply from
`shipTo.state`. Under (b) both banners will show the wrong classification unless
they are changed. That is Q8.

**P-6 — `placeOfSupplyOverride` already exists and no UI sets it.**
`packages/schemas/src/performa-invoice.ts:27` and `:41`, documented at `:21-22` as
"an escape hatch for a ship-to address whose state is not the dealer's registered
state" — which is this task's subject, anticipated. Neither form submits it
(`convert-form.tsx:63-69` and the `pi-edit-form` submit block omit it). What the
override means once there are two branches is **Q9**.

**P-7 — the production path refuses to invent a state.**
`apps/web/lib/actions/pi/helpers.ts:152-154` throws
`VALIDATION: "<role> dealer is missing a state"` rather than falling back to the
tenant's. Still at the cited lines. Any address model must preserve that property:
an address with no state must fail loudly, not default.

**P-8 — RLS, grants and audit for a new table are three separate files, and only
one of them is automatic.**
`packages/db/src/migrate.ts:48-58` applies every `.sql` in `packages/db/src/rls/`
then every `.sql` in `packages/db/src/triggers/`, sorted, after the drizzle
migrations. `packages/db/src/rls/00-app-role.sql:43-54` re-grants on ALL TABLES and
sets default privileges, so **grants are automatic**. **RLS is not** — it needs a
new `packages/db/src/rls/dealer-addresses.sql` following `rls/dealers.sql`
(`ENABLE` + `FORCE` + `DROP POLICY IF EXISTS` + `CREATE POLICY tenant_isolation`
over `app_current_tenant()`). **The audit trigger is not** — it needs a stanza in
`packages/db/src/triggers/audit-log.sql` beside `dealers` (`:183-186`), if Q2 says
addresses are auditable.

**And no test would catch either omission.** The RLS metadata assertions are
hand-written `it.each` lists — `packages/db/tests/rls.test.ts:88-102` (six tables),
`packages/db/tests/dealers.test.ts:50-60` (four). There is no coverage test that
enumerates tables and demands a policy. A new table gets no policy and no failure
unless this day writes both.

**P-9 — the seed truncates by explicit list with CASCADE.**
`packages/db/src/seeds/index.ts:107-124` names `dealers` in the TRUNCATE list with
`CASCADE`, so a `dealer_addresses` table referencing `dealers` is truncated
transitively. **Confirm that by running a reseed twice, not by reading the SQL.**

**P-10 — no test asserts the place-of-supply invariant.** F.105's own finding
("No test asserts the invariant", `docs/F105_AUDIT.md:330-337`), and
`apps/web/tests/e2e/verify-day-16.spec.ts:122-123` **defends against** bad data in
its row selection rather than asserting the rule. F.103 fixed the data without
adding the assertion. This day is the first that can write it, because it is the
first that knows what the rule is.

---

## READ THIS FIRST — where the sources disagree with the code

**R-1 — ADR-012 cites §10 generically and never distinguishes the sub-clauses.**
Confirmed by reading `DECISIONS.md:571-602` in full. `:577` says "under the IGST
Act 2017 **§10**, the place of supply for goods is where delivery to the recipient
is completed — the Ship-To location". `:595`'s worked example is "a Maharashtra
distributor billing a Maharashtra dealer but shipping to **that dealer's**
Karnataka site" — **the same dealer's other site, which is the (a) case.** So
F.112's reading holds: ADR-012 is correct about the case it reasoned about and
silent about the case that distinguishes the clauses. The superseding ADR must say
that explicitly, because "ADR-012 was wrong" is the wrong summary and will mislead
the next reader.

**R-2 — `docs/STAGE_F_BUILD_v3.md:438` becomes false when this lands.** It reads
"Place of supply is Ship-To for goods, IGST Act §10, ADR-012", in the **standing
guardrails** section that other days read as binding. So does `:187-188` in the
F.5a/F.5b spec: "Place of supply stays derived from the Ship-To _address_ state per
ADR-012." So does CLAUDE.md §5's bulleted rule. **All three must be corrected in
the same commit as the ADR** (CLAUDE.md §11.1 ruling 6 — a citation ported
unchanged is re-baselined as checked). Which of them, exactly, is Q10.

**R-3 — the row's own pre-2026-09-26 text is retained beneath the ruling and
contradicts it.** F.5a's notes still contain "Place of supply stays derived from
the Ship-To ADDRESS state" and the BLOCKED-on-F.112 paragraph. The widening
paragraph supersedes both. **Read the whole field and take the later ruling**; do
not treat the earlier sentence as a second constraint.

**R-4 — `packages/tax/src/state.ts:4-6` misstates DEV.33 and contradicts
CLAUDE.md §5.** Verbatim: "Per DEV.33, state values are stored as full names
("Maharashtra", "Karnataka") rather than 2-letter codes." CLAUDE.md §5 says the
opposite and names the same DEV ("stored as a **2-letter ISO 3166-2:IN code**
… DEV.33, closed Stage C Day C.2"), and every state CHECK in the schema is
`~ '^[A-Z]{2}$'`. **The behaviour is unaffected** — the comparison is opaque either
way — but you will read this file while working out where the branch goes, and the
comment will tell you the wrong thing about the data. **Do not fix it here**: it is
a comment in a protected package and it belongs to whoever schedules it. Report it.

**R-5 — the corpus size in the brief is not a number I could reach.** The brief
says "116 seeded quotations/PIs/orders". The only measured figures I found are
`docs/F105_AUDIT.md:193-201` and F.103's completion note: a clean reseed at
2026-09-23 gave **44 orders and 64 PIs**, and F.105's tables give **53
quotations** — 161, before F.106 added the Maharudra tenant's two chains. **Do not
carry 116, and do not carry 161 either.** A.0 measures it on a clean reseed and
reports the number with the state it was measured in, which is F.105's own
transferable lesson (`:212-215`): an absolute count against the shared dev
database is only as good as the database's provenance, and
`pnpm --filter @dealerlink/db test` inserts orders and PIs into it (DEV.91).

**R-6 — three more CLAUDE.md §6 miscites sit on files this day reads.**
`packages/tax/src/compute.ts:8` ("CLAUDE.md §6, BRD §4" for the GST computation),
`packages/db/src/schema/dispatch.ts:31` ("CLAUDE.md §6 — physical goods follow the
consignee"), and `apps/workers/src/templates/_components/TaxSummary.tsx:6`. §6 is
Auth & Roles; the rule is §5. These are **F.100's population**, whose row
explicitly says to enumerate it rather than fix the two known instances. **Do not
fix them here.** Report them so F.100's population grows on the record.

---

## Phase A — the work

### A.0 — The baseline. Before any other change.

Take the baseline recipe **verbatim** from `docs/F84_DAY_PROMPT.md` A.0 as F.3,
F.4 and F.101 did, substituting `/tmp/f5a-*`. It must include `pnpm typst:install`,
`pnpm typst:check`, `pnpm db:seed`, `apps/workers/scripts/long-serial-fixture.sql`,
`determinism-check.ts` (expect MATCH), `pnpm --filter workers test`, a render of
`apps/workers/scripts/typst-matrix.json` into a **fresh** directory with hashes, a
second independent reseed, and **the one-byte-flip control, EXECUTED, with its
output reported.** Never hash `docs/pdf-references/*.pdf` (DEV.136).

Then **five measurements specific to this day, run and reported, none reasoned
about** (DEV.138, DEV.139):

1. **The classification census.** For every row of `quotations`,
   `performa_invoices` and `orders`: tenant slug, document number,
   `tenant_state_at_issue`, `place_of_supply`, and the derived inter/intra
   classification. Save it. **Report the row counts per table** and say the state
   they were measured in — immediately after a reseed, before any suite ran (R-5).
2. **The party census.** For `performa_invoices` and `orders`, how many rows have
   `ship_to_dealer_id <> bill_to_dealer_id`, and for those, the bill-to state, the
   ship-to state, and the stored `place_of_supply`. **This is the population the
   arrangement question would ever be asked about, and it sizes Q6's backfill.**
   If it is zero, say so and say what that means: the seeded corpus cannot
   demonstrate either branch, and a green suite afterwards is a boundary check, not
   a proof.
3. **The reference-document exposure.** Which of the 14 matrix cases are PIs, and
   for each, whether its ship-to differs from its bill-to.
   `docs/F105_AUDIT.md:313-328` reports both reference PIs clean on both state
   columns; **re-measure rather than inherit** — F.105's own re-measurement
   corrected its denominators.
4. **The falsifying control for measurement 1**, EXECUTED. Inside a transaction
   that is **rolled back**, change one seeded document's `place_of_supply` to a
   different state, re-run the census, and show the pre/post diff naming that
   document. Report the output. A clean diff from an instrument never shown capable
   of a dirty one is not evidence (DEV.138). Then confirm the rollback left the row
   unchanged.
5. **The baseline suites, green before any change**, so a later red is
   attributable: `pnpm --filter @dealerlink/db test`,
   `pnpm --filter @dealerlink/tax test`, `pnpm --filter web test`,
   `pnpm --filter workers test`.

### A.1 — `dealer_addresses`

**STOP: this is a schema change and a migration. Do not write it until Q2, Q5 and
the migration authorisation are settled.** Then:

- The table in `packages/db/src/schema/dealer-addresses.ts`, exported from
  `packages/db/src/schema/index.ts`. Every CLAUDE.md §4 standard column, the
  `tenant_id` FK, `tenant_id`-leading indexes, the `^[A-Z]{2}$` state CHECK
  matching `dealer.ts:109`, and `deleted_at` if Q2 says soft delete.
- The RLS policy in `packages/db/src/rls/dealer-addresses.sql`, following
  `rls/dealers.sql` exactly — `ENABLE` **and** `FORCE`, and `WITH CHECK` as well as
  `USING`.
- The audit trigger stanza in `packages/db/src/triggers/audit-log.sql` beside
  `dealers`, if Q2 says auditable.
- The drizzle migration, generated not hand-written, landing as `0019_*` (the
  directory holds `0000`–`0018`, listed in full).
- **`pnpm db:migrate` on a database that already has data**, then again, to prove
  idempotence — the RLS and trigger files are re-applied on every run.

### A.2 — The derivation

**STOP: Q1 decides where this lives.** Whichever it is, the rule is the same and
the constraints are binding:

- The function is **pure** and takes the arrangement, the ship-to state and the
  bill-to state. It returns a state. It does no I/O and reads no request context.
- **(a) is the default.** An absent, null or unrecognised arrangement resolves to
  (a) — the ship-to state — because that is what the system does today, and it is
  what makes "nothing existing reclassifies" true rather than hoped for.
- The two production call sites are `convert-quotation-to-pi.ts:71` and
  `update-pi.ts:41`. **Those are the only two derivations to change.** If a third
  appears to need changing, stop: F.105's mapping says the rest inherit, and a
  third would mean the mapping has drifted.
- `status-transitions.ts:153` copies the PI's value forward. **It must also copy
  the arrangement forward**, or an order will print a tax type whose stated
  justification it does not carry — the F.114 defect exactly, where `orders` ended
  up knowing less than the PI it descends from. Whether that is one column or two
  is Q2/Q3.
- **`computeTax` is not edited.** It receives a state, as it does today.
- **No stored `place_of_supply` is written by anything in this phase except a
  create or an edit of a draft PI**, which is the existing behaviour.

### A.3 — The forms

Both forms, and **only** when `shipToDealerId !== billToDealerId`:

- `apps/web/app/(app)/quotations/[id]/convert-to-pi/convert-form.tsx` — the
  arrangement control sits with the existing Ship-To select (`:88-101`) and above
  the two existing banners (`:104-126`).
- `apps/web/app/(app)/pi/[id]/edit/pi-edit-form.tsx` — the same, beside `:94`.
- The banners must tell the truth under both branches. `convert-form.tsx:26-27` and
  `pi-edit-form.tsx:58` each reimplement the classification from `shipTo.state`;
  under (b) both are wrong. **Q8 decides whether they take the branch or are
  replaced by a server-derived preview.**
- Copy: the control must say what it is asking in the distributor's language, not
  the statute's. Name the two cases concretely (the dealer's own premises versus a
  site the dealer has told you to deliver to) and put the clause reference in
  secondary text. A control labelled "§10(1)(a) / §10(1)(b)" will be answered
  wrongly by the person filling it in, which is worse than not asking.
- Server-side is the authority. The forms may not be the only place the rule holds
  (CLAUDE.md §6 — hiding a control is not enforcement).

### A.4 — Fixtures for both branches, and the executed control

**Both branches carry fixtures. One branch plus an argument that the other follows
is not acceptable** (the row says so; F.101's D-6 is the precedent).

- A unit fixture per branch over the derivation, asserting the resolved state and
  therefore the classification, on the **same pair of addresses** — that is the
  whole point: identical addresses, two arrangements, two answers.
- **A control that is RED before the change and green after, EXECUTED, with its
  output reported.** The (b) case is the natural one: before the branch exists,
  every input resolves to the ship-to state, so a (b) assertion must fail. Report
  the failure text. Then implement, then report green. Do not design this control;
  run it (DEV.129 — "checked for intent and not executed").
- A seeded chain exercising (b) end to end, **only if Q11 says so.** If it is
  seeded, it is seeded into its own tenant on F.106's precedent — `document_counters`
  is keyed on tenant + doc type + fiscal year, so a new tenant's counters start at
  1 and cannot shift a pinned number in `demo`, `sample` or `maharudra` — and it is
  seeded **after** the existing modules and **before** `pin-created-at.ts`, as
  `client-demo.ts` is.
- **A test asserting the invariant nothing asserts today** (P-10): for every seeded
  PI and order, `place_of_supply` equals the state the recorded arrangement selects.
  This is the regression guard for the whole day and the thing that would have
  caught F.103 four months earlier.

### A.5 — The ADR and the standing documents

- **ADR-016**, superseding ADR-012 and **not deleting it** (ADR-015/ADR-013 is the
  precedent, `DECISIONS.md:606-612`). Confirm the id is free with C6a's command;
  the file is not sorted and the tail is not the maximum.
- It must state: the two rules; the condition that selects between them; that the
  condition is a **per-document** fact and not a tenant setting (ADR-012 already
  rejected the tenant-setting option at `:591` on the ground that §10 is statute —
  that rejection stands and is worth restating); that (a) is the default and why
  (the common case, and the one that keeps every existing document's stored
  classification valid); and what ADR-012 got right, which is everything it
  reasoned about.
- **Record what is still unverified.** F.112 and `docs/GST_RATE_MODEL_AUDIT.md:3-33`
  are explicit that the statutory reading is the operator's and the model's, not a
  CA's. The ADR must not launder that into a verified claim. The
  GST_RATE_MODEL_AUDIT caveat is the house style for saying so.
- Correct the standing text per Q10 and R-2, **in the same commit as the ADR**.
- `docs/F105_AUDIT.md` describes a world with one rule. Q10 covers whether it gets
  a dated correction or a pointer.

### What this day does NOT do

- **It does not backfill, recompute or otherwise move any stored
  `place_of_supply` or `tenant_state_at_issue`, on any table, by any route.**
- **It does not edit `computeTax`, `summary.ts`, `round.ts`, `serialize.ts` or any
  fixture under `packages/tax/tests/`.** If Q1 puts a new function in
  `packages/tax`, it is a **new file and additive only**.
- **It does not touch money.** No `subtotal`, `discount_amount`, `taxable_amount`,
  `cgst_amount`, `sgst_amount`, `igst_amount` or `total_amount` on any table, and
  no change to how any of them is computed.
- **It does not re-baseline a reference PDF.** The 14 are a one-way door and the
  capture tool no longer exists (F.4's note). A moved reference is a finding.
- **It is not F.5b.** No GSTIN checksum, no embedded-state cross-check, no
  required-when-different GSTIN rule, no dispatch block.
- **It is not F.114.** No `discount_type`/`discount_value` on `orders`, even though
  the day adds a column to the same table and the argument is the same one.
- **It is not F.100.** R-4's and R-6's miscites are reported, not fixed.
- **It does not touch `apps/web/tests/e2e/critical-path.spec.ts`** — protected, not
  even a one-liner. If it goes red, that is a finding for the operator.
- **It does not touch `packages/db/src/dispatch/create.ts` or
  `apps/web/lib/actions/orders/confirm-order.ts`** unless Q3 says dispatches are in
  scope — those two hold the `FOR UPDATE` locking CLAUDE.md §10.1 protects
  (`dispatch/create.ts:114`, `:164`).

---

## Phase B — verification

**Must stay green** (say which ran locally and which in CI):

- `pnpm --filter @dealerlink/db test` — `rls.test.ts`, `dealers.test.ts`,
  `quotation.test.ts`, `quotation-engine-parity.test.ts`,
  `multi-rate-corpus.test.ts`, `orders.test.ts`, `dispatch.test.ts`,
  `payments.test.ts`, `payments-propagation.test.ts`, `gst-rate-invariant.test.ts`,
  `audit.test.ts`, `impersonation.test.ts`.
- `pnpm --filter @dealerlink/tax test` — **`compute.test.ts` and `summary.test.ts`
  byte-unchanged**, which `git diff` decides.
- `pnpm --filter web test` — including `apps/web/lib/quotation/preview.test.ts`
  (eleven `placeOfSupply` cases) and `apps/web/lib/reports/reports.test.ts`.
- `pnpm --filter workers test` — `pdf-snapshots.test.ts` by named case,
  `multi-rate-render.test.ts`, `three-percent-render.test.ts`,
  `quotation-template.test.ts`, `payment-receipt-template.test.ts`,
  `tax-rows.test.ts`.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm verify`,
  `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check`.

**New coverage this day adds:**

- `packages/db/tests/dealer-addresses.test.ts` — RLS enabled **and** forced; a
  second tenant sees zero rows while the owning tenant sees its own (the
  cross-tenant assertion's own control); the state CHECK rejects a bad value; the
  FK behaviour Q2 settles; audit rows appear if Q2 says auditable.
- The two-branch derivation fixtures (A.4), including the executed red-then-green
  control.
- The invariant test (A.4, last bullet).
- `apps/web/tests/e2e/verify-day-f5a.spec.ts` — the Stage F naming convention
  (`verify-day-f3`, `verify-day-f55`, `verify-day-f84` exist). Smoke level per
  `docs/BUILD_PROMPT_TEMPLATE.md:259-276`: the address surface is reachable, the
  arrangement control appears when the parties differ and **does not appear when
  they do not**, and a created PI shows the classification the chosen arrangement
  implies.

**The measurements, as separate statements — each answers a different question and
each can fail alone:**

1. **THE CLASSIFICATION CENSUS, pre against post.** Re-run A.0 measurement 1 and
   diff. **Zero rows differ, on all three tables.** If any row moves, **the day
   stops** — that is a finding and never a re-baseline (CLAUDE.md §11.1 rulings 1
   and 4), and it must be reported before any reseed, because a reseed destroys the
   evidence that tells a state bug from a stale fixture (ruling 5).
2. **TEXT against the Chromium reference contract.** `pnpm --filter workers test`
   — `pdf-snapshots.test.ts`, 14 named cases.
3. **BYTES against the A.0 pre-change render**, fresh directory, plus **BYTES
   across two independent reseeds**, plus `determinism-check.ts` printing MATCH
   with `git diff --stat apps/workers/scripts/determinism-expected.json` empty.
   **A moved byte is possible here even with nothing under `apps/workers/` edited**,
   because the PI loader recomputes through `computeTax` on every render and prints
   the tax-type badge (`templates/performa-invoice.tsx:212-213`,
   `templates-typst/quotation.typ:52`). If a byte moves, that is measurement 1
   failing in another instrument, and the same stop applies.
4. **The falsifying control for measurement 1**, re-reported (A.0 measurement 4).

---

## Phase C — closeout

Follow `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" (`:18`) in
full. Unusual for this day:

- **C2 before C4 matters more than usual.** `pnpm test` writes to the shared dev DB
  (DEV.91) and every measurement here depends on a known seeded state. Reseed
  deliberately between steps and **say when**, and re-take the census immediately
  after a reseed and before any suite (R-5).
- **C5:** F.5a's own row; **F.112** (this day owns the statutory distinction it
  observed — say whether the observation survives unchanged as an onboarding item);
  **F.5b** (whose "required when Bill-To ≠ Ship-To" condition is now computed by
  this day's code, so its row should say so); F.114 if Q3 lands a column on
  `orders`; and **new rows for anything filed rather than folded in** (CLAUDE.md
  §11.2) — including R-4 and R-6's miscites, which go to **F.100's population**.
- **C6 — a deviation entry is certain**, and must carry: the P-1 asymmetry
  correction (two tables, not three); P-3's correction that `packages/tax` did not
  need to change; the measured corpus size and the state it was measured in (R-5);
  the executed red-then-green control's output; and the census result stated as
  "0 of N rows moved, by this query" rather than as an assumption.
- **C6a:** confirm the ADR id **and** the DEV id are free with the commands. The
  ADR file is not sorted (P-6 of the deliverables list) and `DEVIATIONS.md` already
  carries two `## DEV.64` headings.
- **C6b — no unearned precision.** No count, no "the only", no "byte-identical"
  without the command; prefer an enumeration to a count.
- **C6c** applies if the day adds any scanner or checker: `git add` it before
  validating it.
- **C7a:** `verifier` before the PR, told nothing about what the day intended. A
  FAIL stops the day (§10.3).
- `pnpm check:paths` covers `docs/` paths only. If any tracked file cites a
  `docs/` file this day has not yet created, it needs a `planned-deliverable` row
  in `scripts/path-reference-allowlist.json` naming the task
  (`scripts/path-reference-allowlist.json:2`).

---

## Acceptance criteria — each with the command or file that decides it

1. `dealer_addresses` exists with RLS **enabled and forced** and a working
   `tenant_isolation` policy. → `packages/db/tests/dealer-addresses.test.ts` via
   `pnpm --filter @dealerlink/db test`; the cross-tenant case returns zero rows and
   the same-tenant case returns non-zero, which is its own control.
2. `pnpm db:migrate` is idempotent — run twice against a populated database, second
   run clean. → the command's own exit code and output, reported.
3. The derivation returns the **ship-to** state under (a) and the **bill-to** state
   under (b), from one identical pair of addresses. → the two unit fixtures added
   in A.4, via the suite Q1's answer puts them in.
4. An absent, null or unrecognised arrangement resolves to (a). → a named case in
   the same file.
5. **The (b) assertion is RED before the change and green after**, executed, with
   the failure output pasted. → the same command, run against the pre-change tree.
6. **Not one stored `place_of_supply` or derived classification moved, on any of
   `quotations`, `performa_invoices`, `orders`.** → the A.0 census diffed pre
   against post; reported as "0 of N, by this query", with N measured.
7. **The census instrument is shown capable of reporting a move.** → A.0
   measurement 4's rolled-back mutation, output pasted.
8. For every seeded PI and order, `place_of_supply` equals the state its recorded
   arrangement selects. → the new invariant test, via
   `pnpm --filter @dealerlink/db test`.
9. All 14 reference cases match on **text**. → `pnpm --filter workers test`
   (`pdf-snapshots.test.ts`, 14 named cases).
10. All 14 renders are byte-identical to the A.0 hashes and across two independent
    reseeds; `determinism-check` prints MATCH with `determinism-expected.json`
    unmodified. → `diff /tmp/f5a-pre.sha /tmp/f5a-post.sha`;
    `diff /tmp/f5a-reseed1.sha /tmp/f5a-reseed2.sha`; `determinism-check.ts` plus
    `git diff --stat`.
11. The byte pipeline is shown capable of reporting a difference. → A.0's one-byte
    flip, output reported.
12. **No file under `packages/tax/src/` is modified, and no file under
    `packages/tax/tests/` is modified.** (If Q1 puts the derivation in the package,
    this criterion is amended to "no EXISTING file under `packages/tax/src/` is
    modified and no file under `packages/tax/tests/` is modified" — the operator
    must amend it explicitly rather than leaving it to judgement.) →
    `git diff --name-only main -- packages/tax`.
13. No money column and no money computation is touched; `critical-path.spec.ts` is
    unchanged. → `git diff --name-only main` and
    `git diff main -- apps/web/tests/e2e/critical-path.spec.ts` (empty).
14. The arrangement control appears **only** when ship-to differs from bill-to. →
    `apps/web/tests/e2e/verify-day-f5a.spec.ts`, with a negative case as well as a
    positive one.
15. ADR-016 exists, states two rules and the selecting condition, says ADR-012 is
    superseded and not deleted, and records the statutory reading as unverified. →
    read `DECISIONS.md`; `grep -c '^## ADR-016' DECISIONS.md` printed 0 before it
    was written.
16. `docs/STAGE_F_BUILD_v3.md:438`, `:187-188` and CLAUDE.md §5's place-of-supply
    rule agree with ADR-016, in the same commit as the ADR. → `git show` on the
    ADR commit lists those files.
17. `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check` exit 0; `pnpm lint`,
    `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm verify` green.

**Criteria checked against each other.**

- **6 and 3 are compatible only under default-to-(a).** If the default were (b), or
  if the migration backfilled an explicit arrangement chosen per row, 3 would pass
  and 6 would fail. **6 is the discriminator between the accepted design and the
  rejected one**, which is why it is a criterion and not a note.
- **12 and 3 are in tension until Q1 is answered.** If the operator puts the
  derivation in `packages/tax`, criterion 12 as written forbids the file criterion
  3 requires. **They cannot both bind in their current form** — Q1's answer must
  amend 12, and the amendment must be written down, not inferred. Flagging this
  rather than pre-resolving it is the point: DEV.129's defect was a criterion whose
  own wording forbade its outcome.
- **13 forbids editing `apps/workers/`; 9 and 10 require the renders not to move.**
  As in F.101, **13 does not imply 9/10 here**, because the PI loader recomputes
  tax per render and prints the tax-type badge. Both are needed and neither is
  redundant.
- **5 is the only criterion that makes 3 and 4 non-vacuous**, and it must be
  **executed**, not intended.
- **7 is the only criterion that makes 6 non-vacuous.** A clean census diff from an
  instrument never shown capable of a dirty one is the DEV.138 signature exactly.
- **8 could conflict with 6, and that would be a finding.** 8 asserts the stored
  column agrees with the recorded arrangement; 6 asserts the stored column did not
  move. If the seeded corpus contains a row where those cannot both hold, **stop**
  — it means a seeded document's stored classification disagrees with the model,
  and that is a fact about the corpus the operator must see before anything is
  changed to accommodate it.

---

## STOP AND ASK

- **ANY SCHEMA CHANGE OR MIGRATION — CLAUDE.md §10.1, first bullet.** This day
  adds a table and at least one column. **The authorisation must be written down,
  naming its bounds, before Phase A begins**, in the shape F.55, F.81, F.84, F.3
  and F.101 used. State what may be added, what may not be altered, and — because
  this is the part that matters here — **that no existing column's stored values
  may be written by the migration.**
- **RLS POLICIES are protected** (`docs/STAGE_F_BUILD_v3.md:435-437`). This day
  adds one rather than weakening one, which is the benign direction, but it is the
  named surface and needs the operator's word.
- **A NEW ADR SUPERSEDING ADR-012.** §10.1 names ADR-012 specifically.
- **`packages/tax` is protected.** Q1 may put a new file inside it. **Do not
  assume the F.3-shaped "compose, don't edit" permission transfers** — ask.
- **`packages/db/src/dispatch/create.ts` and
  `apps/web/lib/actions/orders/confirm-order.ts` hold the `FOR UPDATE` locking
  §10.1 protects.** If Q3 extends the model to dispatches, this day edits a
  protected locking file. **Do not.** Ask first.
- **THE STOP CONDITION, STATED SO IT IS NOT A JUDGEMENT CALL:**
  > **If the post-change classification census differs from the pre-change census
  > by even one row, STOP.**
  > Not "assess whether the change is acceptable", not "record it and continue" —
  > stop, report the row, and bring it to the operator **before reseeding**. One
  > moved row means a document that has been issued now reads with a different tax
  > type, and that is the outcome this design was chosen to make impossible.
- **Any movement in any of the 14 reference renders** — a finding, never a
  re-baseline.
- **Any thirteenth decision** the twelve below do not cover.

---

## Settled decisions — D-1 to D-12, operator 2026-09-26

**D-1 (was Q1) — the derivation lives in `packages/tax`, as a NEW ADDITIVE FILE.**

> **BOUNDED AUTHORISATION.** Permitted: **one new file** in `packages/tax`
> containing the (a)/(b) selection as a pure function, and its own test file.
> **Not permitted:** any change to `computeTax`, to `isInterState`, to
> `round.ts`, to `compute.ts`, or to **any existing fixture in
> `packages/tax/tests/`**. If the new function appears to require editing an
> existing file in that package, that is a **STOP**, not a small refactor.

CLAUDE.md §5 puts tax math in `packages/tax` and says never inline in routes, and
the (a)/(b) selection is a statutory rule rather than a caller's convenience — the
same argument that put `isInterState` there. It is also testable without a
database.

**Acceptance criterion 12 is amended accordingly**: it read
`git diff --stat packages/tax/` empty. It now reads — **`git diff --stat
packages/tax/` shows ONLY the new file and its test; no existing file in that
package is modified.** The criterion is checked the same way; what changed is that
"empty" became "additions only", and the distinction is the whole of the
authorisation.

**D-2 (was Q2) — `text` + CHECK, NULLABLE. Auditable, soft-deleted.**

Text + CHECK over a `pgEnum` because adding a member later needs a migration and
the codebase already mixes both conventions; the `dispatches_status_chk`
precedent (`dispatch.ts:97`) is the one to follow.

**Nullable, and NULL carries meaning:** the parties are the same and the question
was never asked. A `NOT NULL` default would assert arrangement (a) on every
single-party document in the corpus, which is a claim nobody made — the unearned
precision C6b exists to stop.

Addresses are **auditable** (a stanza beside `dealers` at `packages/db/src/triggers/audit-log.sql:183-186` —
qualified because `packages/db/src/rls/audit-log.sql` also exists and is a different
file)
and **soft-deleted** (`deleted_at`), because a document may reference an address
and a hard delete would break a `restrict` FK.

**D-3 (was Q3) — the arrangement goes on `performa_invoices` and `orders` ONLY.**

Those are the only two tables where a differing ship-to and a `place_of_supply`
both exist. A quotation has one dealer and cannot express the distinction.
`dispatches` is tax-neutral, stores no place of supply, and its create path is a
protected `FOR UPDATE` file.

**The dispatch-note consequence is FILED AS ITS OWN ROW, explicitly NOT F.5b** —
operator ruling, overruling the drafter's recommendation. F.5b is **GSTIN
validation**; this is a delivery address on a logistics document. _A shared
trigger condition is not shared subject matter._ Merging them would produce a task
whose two halves have no reason to be reviewed together.

**D-4 (was Q4) — TWO COMMITS, ONE TASK.** The arrangement first — two columns, two
one-line derivations, the ADR, the fixtures. The address plumbing second.

**Two migrations is acceptable and was weighed:** cheap, separately revertible,
and better than one migration whose halves carry different risk. Landing the
arrangement first means the tax correctness this row exists for is provable before
the wider refactor starts.

**D-5 (was Q5) — snapshot the STATE; FK only for the address text.**

The state is a **tax input**, and the snapshot pattern is already explicit —
"Tax-engine inputs captured at issuance — never recomputed from masters"
(`performa-invoice.ts:70`). An address whose state is later edited would otherwise
silently invalidate the justification for a stored classification.

Full address **text** is **presentation**, and it is deliberately NOT half-decided
here: it must be settled **uniformly in `docs/STAGE_F_BUILD_v3.md`**, where four
future documents face the same question. Deciding it for one document in one day
is how four documents end up with three conventions.

**D-6 (was Q6) — existing rows get NULL everywhere.**

NULL resolves to (a) by A.2's rule, so behaviour is identical, and writing an
explicit value would assert on the record that somebody determined the arrangement
for every historical document, which nobody did.

**CHECK A.0's MEASUREMENT 2 FIRST. If the differing-party population is zero,
record the question MOOT rather than answered** — _a moot question answered reads
as a decision nobody made._

**D-7 (was Q7) — the migration writes to NO existing column. Binding, and stated
explicitly in the authorisation rather than left to follow from "nothing existing
reclassifies".** It is the single constraint that keeps this day off F.99's
ground, and an inference is not a constraint.

**D-8 (was Q8) — the classification is derived SERVER-SIDE and passed to both
forms.**

`convert-form.tsx:26-27` and `pi-edit-form.tsx:58` are already two duplicate
implementations of a rule CLAUDE.md §5 says lives in one place; teaching them the
branch would make three.

**If a live preview needs a round trip, take the round trip.** A preview that
prints a false classification to the person choosing the arrangement is worse than
a slower one.

**D-9 (was Q9) — `placeOfSupplyOverride` STAYS, and a row is filed to revisit it.**

It is in the Zod schema and reachable by any caller; removing it is a behaviour
change on a protected-adjacent path, and no UI sets it.

**The ADR must carry this paragraph VERBATIM. It is the operator's wording and is
not to be paraphrased, shortened, or re-expressed:**

> "Where placeOfSupplyOverride is set, it wins. The override names a place of
> supply directly; the arrangement only selects which party's state to derive one
> from. A derivation cannot overrule a value that was stated. Any document where
> both are present must be treated as a data-quality finding, not a precedence
> question — no UI sets the override, so its presence alongside an arrangement
> means something wrote it that should not have."

**D-10 (was Q10) — all of them in the ADR's commit, EXCEPT `docs/F105_AUDIT.md`.**

Corrected in the same commit as the ADR (§11.1 ruling 6):
`docs/STAGE_F_BUILD_v3.md:438` and `:187-188`, the schema comments at
`performa-invoice.ts:71` and `order.ts:75`, and the action docstrings at
`convert-quotation-to-pi.ts:26-28`, `update-pi.ts:22-23` and `pi/helpers.ts:44`.

**`docs/F105_AUDIT.md` gets a DATED POINTER at the top, not a rewrite.** It is
evidence of what was measured then, not a live rule, and rewriting evidence to
match a later decision destroys its value as evidence.

**CLAUDE.md §5 is the operator's under §10.4 and the operator is taking it:
correct it in the same commit.**

**D-11 (was Q11) — unit fixtures PLUS a seeded (b) chain in its own tenant. NOT a
matrix entry.**

Unit fixtures alone cannot show that the column, the copy-forward at
`status-transitions.ts:153` and the read paths agree — which is the half of the
change F.103 proved nobody catches by reading.

**(c) is rejected: a 15th matrix entry is a one-way door and this day has enough
of them.** The rendered-PDF case is **filed as its own row**, and that row must say
plainly: **until it exists, nothing proves the tax-type LABEL is right on a page —
only that the classification is.** A gap stated is a different object from a gap
omitted.

The chain goes in **its own tenant**, on F.106's counter-isolation argument
(per-tenant `document_counters` mean a new tenant cannot shift a pinned number).
**A.0's census is re-taken after it lands**, so criterion 6's N is stated for the
right corpus.

**D-12 (was Q12) — F.5a and F.5b stay SEPARATE; F.5b is resequenced strictly
after F.5a.**

They share a **condition**, not a **component**. The F.4/F.6 merge precedent
turned on the two editing the same component, and that does not apply here.

**The day-range overlap is a real plan defect and is fixed while in the plan** —
F.5a at 30–35 and F.5b at 33–34 cannot both be true.
