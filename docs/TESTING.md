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
- **And check what else is running.** A control can be falsified from **outside its
  own frame**: a background shell, a watch-mode runner, `next dev`, a polling
  loop, a cron, or another session on the same working tree appears nowhere in the
  control's code and can rewrite the precondition mid-run. DEV.157 is the worked
  example — a poller running the FIXED script healed the state a control had
  deliberately broken, and the run reported that the defect did not exist. **Every
  other rule here fails for a reason visible in the test; this one does not.**
  Prefer a precondition the control OWNS (a temp directory, a rolled-back
  transaction, a fixture it creates and tears down) over a shared one it merely
  sets, and **treat an output the setup cannot explain as a failed control rather
  than as a result.**

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

---

## An instrument that cannot fail the way you expect

**`git fetch` in this environment exits 0 when pointed at a remote that does not
exist.** So a test that expects a network failure by breaking the remote URL will
**silently pass having proved nothing** — the same shape as the two rules above,
one layer down: the instrument, rather than the value, is what cannot fail.

Measured 2026-10-03 while writing F.180's fetch-failure control:

| override                                             | `git fetch origin main` |
| ---------------------------------------------------- | ----------------------- |
| `remote.origin.url=https://example.invalid/nope.git` | **exit 0**              |
| `remote.origin.url=/nonexistent/repo.git`            | **exit 0**              |
| `core.gitproxy=/bin/false`                           | **exit 0**              |
| `fetch.parallel=notanumber`                          | **exit 128** ✓          |

`git config --get remote.origin.url` returns the bogus value, so **the override is
live and the URL is being read and ignored** — git here is mediated rather than
dialling the address it is handed. The three zero-exit rows are not "my override
did not apply"; they are "the fetch reported success without the remote".

**The route that works is an invalid `fetch.*` config value.** It fails the fetch
at argument-parsing time, before any network, and leaves `git rev-parse` and
`git log` working — so only the branch under test is affected and the rest of the
script still runs. `fetch.recurseSubmodules`, `fetch.parallel` and
`fetch.negotiationAlgorithm` were all measured at exit 128.

**The general point, which outlives this particular shim:** when a test needs an
operation to FAIL, verify that the chosen method actually makes it fail before
building an assertion on top — and name the method in the test, so the next reader
knows what was broken on purpose. An unverified failure-injection is a green test
with nothing behind it.

---

## Assert count before any click

**A `.click()` on a locator that matches nothing burns the full test timeout and
then reports `Test timeout exceeded`.** That reads as a slow or hung
application. The fact is a selector matching zero elements.

```ts
// Reports "Test timeout of 120000ms exceeded" after two minutes.
await page.getByRole('link', { name: /Demo/ }).first().click();

// Reports 'no row for the seeded tenant "demo": expected 1, got 0' in a second.
const row = page.locator('li, tr').filter({ hasText: 'demo.dealerlink.in' });
await expect(row, 'no row for the seeded tenant "demo"').toHaveCount(1);
await row.getByRole('link', { name: 'Open' }).first().click();
```

**Same family as the two value rules above, one layer out: a signal that is
truthful about something other than what was asked.** `status: ok` is truthful
about `applied > 0`. `version: 'dev'` is truthful about a fallback. A timeout is
truthful about elapsed time. In each case the reader takes it as an answer to a
question it was never measuring.

Worked example (F.148 A.1): a new verify spec clicked a tenant row by display
text. The admin list renders the slug as `<slug>.dealerlink.in` with a separate
"Open" link, so nothing matched, the click waited out the whole 120-second
budget, and the failure named the budget. **Two minutes to learn that a selector
was wrong, and the message pointed at the wrong suspect.**

So, mechanically:

- **Assert `toHaveCount` before clicking, filling or reading anything** derived
  from a locator you have not already asserted on. One line, and it fails with
  the number it found.
- **Give the assertion a message naming the fixture**, because "expected 1, got
  0" on its own does not say which row was missing.
- **Address a fixture by a seeded identifier, not by how it looks on screen.**
  Display text changes with the design; a slug changes when someone changes the
  seed, which is a diff you can read. A spec that picks its fixture by
  appearance is order-dependent by construction — F.134's shape, one layer up.

**And do not reach for a longer timeout.** The budget was not the problem, and
raising it makes the next instance of this take four minutes to tell you the
same wrong thing (CLAUDE.md §11.1 ruling 1).
