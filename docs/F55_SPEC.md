# F.55 — Shape-only GST rate validation (Option A)

**Status:** specification. Written against `docs/F55_AUDIT.md` and
`docs/GST_RATE_MODEL_AUDIT.md`. Those are the authority on *where*; this is the
authority on *what* and *why*. Do not restate site lists — cite the audit.

**Decision: Option A.** Two arguments, the second decisive.

*Staleness.* Eight constants and four CHECK constraints encode a statutory claim
that goes stale whenever the GST Council meets. It is stale now in both
directions — neither list carries 40%, both carry 12% and 28%, which the
September 2025 rationalisation removed. R8 is Option C already attempted and
already failed: a runbook written for exactly this event, stale twice over,
whose step 3 cannot introduce a new slab because it routes through the
hardcoded dropdown.

*Commercial.* A tenant's accountant is not available until their deal closes.
Any design that must know their slab set therefore **cannot be built**. Option A
is the only one that does not ask. This generalises to every future tenant and
is the load-bearing reason.

---

## 1. The rule

**Rates are tenant data, not application knowledge.** The system stores,
computes with, and renders whatever rate a tenant sets on a product. It holds no
opinion about which rates exist.

Validation is **shape only**, and no stricter than the column:

- non-negative
- at most two decimal places
- within `numeric(5,2)` (≤ 999.99)

**No upper bound is encoded beyond the column's own.** `numeric(5,2)` caps
magnitude at 999.99; that bound was never chosen, needs no owner, and makes no
statutory claim. Adding `<= 100` or `<= 40` would *introduce* a bound that does
not exist today — and per the audit's measurement, `<= 100` misses the commonest
typo (`5` → `50`) while `<= 40` is the hardcoded list compressed to one number,
going stale on the same schedule with the same absent owner.

The honest justification is not "supporting a rate that might be needed."
100% has no statutory meaning and likely never will. It is **declining to encode
a limit.**

---

## 2. Scope of change

The audit enumerates eight constants and four CHECK constraints. By kind:

| Kind | Change |
|---|---|
| **Write validation** (Zod enums) | Replace the enum with a shape refinement per §1 |
| **DB CHECK constraints** | **Must change too.** Currently an enum of six values, so the DB is the binding constraint and a tenant still could not enter 40%. Replace with `>= 0`; `numeric(5,2) NOT NULL` already supplies the rest |
| **Engine guard** (`VALID_GST_RATES` + throw) | Remove the enum check. Keep a shape guard throwing `INVALID_GST_RATE` on a genuinely malformed value — negative, NaN, out of column range |
| **Read validation** (the five §3.3 sites) | **Delete.** Under §1 these become vacuous by construction: a code check no stricter than the column can never fire on stored data. This is what makes a historical 12% document render, convert and total |
| **UI dropdown** | See §3 |

`packages/tax` is a protected surface. No existing fixture may change, and no
number on any existing document may move. The engine's behaviour changes only
for rates it previously rejected.

---

## 3. The catalogue form

Replace the hardcoded dropdown with **numeric input plus suggestions**, where
the suggestions are **derived from the distinct rates already present in that
tenant's product master**.

- A new tenant starts with no suggestions, types 5 and 18, and sees them
  thereafter.
- Suggestions are a convenience and never a constraint — any shape-valid value
  may be typed.
- Nothing is hardcoded, so nothing goes stale, and the list is correct per
  tenant by construction.

**Typo-catching moves here as a warning, not a rejection.** A value outside the
tenant's existing set gets a confirmation prompt, not a block. A rejection is a
bound wearing different clothes. This is a real cost of Option A and belongs on
its ledger rather than being discovered later.

---

## 4. The invariant, enforced

The audit's condition — *code shape ⊇ DB constraint* — holds only while nobody
changes one side. Nothing enforces it, and it has already diverged once
unnoticed: that divergence **is** the 3% gap this task exists to close.

Add a mechanical test asserting it:

- No enumerated rate list exists on the rate path (a negative assertion by
  **enumeration** of the sites the audit lists, not by search — plain grep is
  corroboration only, per the standing ruling)
- The DB CHECK on all four columns is shape-only
- Any value the DB accepts, the code accepts

A note in a runbook is what failed last time. This is the replacement.

---

## 5. Acceptance

1. A product can be created at 3%, 40%, and any shape-valid rate, end to end —
   catalogue → quotation → PI → order → dispatch → PDF. Data layer alone is not
   sufficient: F.84's fixture reaches the data layers and misses render and
   request, which is precisely where the two unguarded throws live.
2. A stored 12% line renders, converts to PI, and totals correctly.
3. The two unguarded throws in the PDF loaders no longer fire on a shape-valid
   rate. Their bare-`Error` classification is F.89 and is **not** in scope here.
4. No existing fixture changes; no number on any existing document moves.
5. All 14 reference cases unchanged, on all three measures.
6. The §4 invariant test passes, and fails if either side is narrowed.

---

## 6. Out of scope, filed separately

- **F.89** — the PDF loaders throw a bare `Error` with no code. Option A makes
  it unreachable for shape-valid rates; the class remains.
- **The `'18.00'` vs `'18'` select defect** — independent of all three options,
  already inside F.3's screen work.
- **Re-stamp from product master on draft save** (§3.3), which contradicts the
  contract at `quotation.ts:31-32`. File it: a stated contract and the code
  disagree, and that is a defect regardless of this task.
- **No as-of / regime concept** (§3.7). Option A fixes *rendering* a historical
  rate; it does not make a document identifiable as to which regime it was
  issued under. That matters for F.6 — a tax invoice states the rate applied —
  and should be a row, not a note.
- **F.90** — R8's rewrite, now rate-agnostic and unblocked. Its one residual
  dependency is §3 above, since R8 step 3 names the dropdown.

---

## 7. Sequencing

Before F.3. F.81 has landed, so this widening now has multi-rate documents to be
exercised against — which was the argument for this order and it held.

F.84 (the 3% fixture) unblocks on completion, and should be extended to reach
render and request per §5.1 rather than shipping as originally scoped.
