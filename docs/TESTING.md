# Testing Approach

> **Scope:** Test stack, coverage targets, and the mandatory RLS isolation pattern. Back to [CLAUDE.md](../CLAUDE.md).

| Layer            | Tool                                 | What to test                                                                                 |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Unit             | **Vitest**                           | Tax math (`packages/tax/`), `formatINR`, GSTIN validation, Zod schemas                       |
| Integration      | **Vitest + testcontainers-postgres** | Database operations against a real Postgres with RLS active                                  |
| E2E              | **Playwright**                       | Login → create deal → generate quote → confirm order → dispatch (one happy path per persona) |
| Component visual | Optional, **Chromatic** Phase 2      | —                                                                                            |

**Coverage targets:** 90%+ on `packages/tax/`, 70%+ on Server Actions, smoke E2E for each role's primary workflow.

**RLS test pattern** is mandatory: for every table, write a test that asserts a query as Tenant A cannot see Tenant B's data. This catches the entire class of multi-tenant data leak bugs.

---

## The only rule that has not failed: run the control

**Isolate the section under test, and prove the assertion fails when the thing it
checks is removed.**

That is one instruction, and it is deliberately not "avoid whole-document
assertions" — because avoidance depends on remembering, and remembering has now
failed the same author three times in one session:

1. DEV.138 row 11 recorded a vacuous `toContainText` on a page body.
2. DEV.138 row 16 recorded two checks satisfiable by the wrong route.
3. F.172 then shipped `expect(rendered).toContain(task)` against a whole rendered
   document — which passes whether or not the section under test rendered
   anything, because the same string appears in a different table. **Written
   after both of the above were recorded, and after the rules below were added to
   this file.**

In none of those cases was the author unaware of the pattern. The third was
written by the person who had just documented it. What caught it was not
vigilance: it was deleting the behaviour and watching the test stay green.

So the practice is mechanical rather than attentive:

- **Scope the assertion.** Extract the region you mean — a section, an element, a
  returned object — and assert inside it. `apps/web` has
  `[data-testid]` for this; `scripts/sync-project-plan.test.ts` has a
  `defectSection()` helper that slices the rendered document.
- **Then break it on purpose.** Remove the fallback, drop the constraint, revert
  the loader, delete the trigger — whatever the assertion claims to observe — and
  confirm the test goes RED. If it stays green, the assertion is decoration and
  the test is not evidence.
- **Record the red run**, not the possibility of one. "This would fail if…" is a
  hypothesis; a pasted failure message is a measurement.

A passing negative result is not evidence until something demonstrates it could
have failed — **and the demonstration must fail for the REASON the check exists**
(DEV.138 row 16). A check that fails for some other reason is still unverified.

---

## Two rules about the VALUE a test asserts on

Both of these are about fixtures rather than code, both were learned by shipping a
test that reported a pass it had not earned, and neither is caught by any gate.

### 1. Never assert an ABSOLUTE value of shared mutable state

**An assertion on an absolute value of shared state is an assertion about test
ORDER and corpus HISTORY, not about the code under test.** It reports a pass on a
virgin database and a failure afterwards, and neither result is about the behaviour
it was written to check.

Worked example (F.175): two numbering tests asserted
`document_counters.last_value === 1` for a new document series, and that the
counter row did not exist after a rolled-back transaction. Both were true when
written. Both broke the moment an end-to-end spec allocated real numbers through
the same allocator — `expected 5 to be 1`. The counter is shared, mutable, global
state.

**Assert the DELTA, or the invariant.** Read a baseline first, then assert that one
allocation advances the counter by exactly one, and that a rolled-back transaction
leaves it unchanged. Those were the properties the tests actually meant.

At risk: anything asserting a row COUNT, a `max(id)`, a sequence value, or the
ABSENCE of a row another test may create. Some absolutes are legitimate —
`rls.test.ts`'s derived population is a fact about the schema, not about history —
so the question is whether the value is a property of the code or of everything
that has run before.

### 2. Never choose a test value where the right and wrong implementations agree

**A test value chosen where the right and wrong implementations agree is not a
test. It reports the same result either way.**

Worked example (DEV.154): a render assertion expected `207,813.00` where
`Intl.NumberFormat('en-IN')` produces **`2,07,813.00`** — lakh grouping. The
expectation was wrong, not the render. The sibling assertion, on `46,634.00`,
passed — and **could not have failed**, because under a lakh en-IN grouping and
plain thousands grouping produce the same string. The test that ran first was
structurally incapable of catching the error.

This generalises past number formatting: a date inside a month where two formats
coincide, a state code identical in both conventions, a quantity of `1` where `n`
and `n - 1` agree, a single-line document where a per-line and a document-level
calculation give the same total.

**Before trusting a green assertion, ask what value the WRONG implementation would
produce — and if it is the same value, the fixture is the thing to change.**
