# BUILD_PROMPT_TEMPLATE.md — Daily build prompt template

> Established Day 6. Every future day's prompt should follow this shape so
> housekeeping is automatic and verification is uniform.

## Anatomy of a daily prompt

1. **Header** — Day number, date, primary deliverables, references (BRD §,
   CLAUDE.md §, prototype screen).
2. **Phase A — main module work** — schema, server actions, UI, tests.
3. **Phase B — automation kit usage** (this is the steady-state):
   - Start with `pnpm preflight` (script in `scripts/preflight.mjs`).
   - Run `pnpm verify` before declaring work done (specs in
     `apps/web/tests/e2e/verify-day-N.spec.ts`).
   - From Day 23, open a PR and let CI run the same gates (R22).
4. **Phase C — end-of-day routine** (mandatory, see below).

## Phase C — end-of-day routine (mandatory)

Every future day's prompt **must** conclude with these steps. Do not skip.

> **Changed Day 22 (task F.33): days land via PR, and CI is authoritative.**
> From **Day 23** onward there are **no direct pushes to `main`**. A day's work
> goes onto a branch, opens a pull request, and merges only once all three CI
> jobs are green. `main` carries `deploy_on_push: true` on **both** DO apps, so
> the merge _is_ the production deploy — see `docs/RUNBOOKS.md` R22.
>
> Local `pnpm verify` stays in the closeout but is **demoted to a fast local
> signal**. CI runs the same chain against a fresh, ephemeral, freshly seeded
> database on a 16 GB runner. If local verify cannot complete because of the
> devcontainer memory ceiling (DEV.87 / DEV.91 — the margin is ~0.9 GB and
> depends on a fresh container), **that is no longer a reason to hold a merge**.
> Say so, and let CI be the gate. It is _not_ licence to merge red CI.

```text
C1. pnpm preflight                         # 0 hard failures, warnings only ok
C2. pnpm verify                            # local signal; CI is the gate (see C7-C9)
C3. pnpm typecheck && pnpm lint            # both green
C4. pnpm build && pnpm test                # both green
                                           # NOTE the order: C2 verify BEFORE C4
                                           # test. pnpm test writes rows to the
                                           # shared dev DB and verify asserts
                                           # against a known seeded state
                                           # (DEV.91). Re-run pnpm db:seed if
                                           # you need to go back the other way.
C5. Update the plan:
    - Stage F work: edit docs/stage-f-tasks.json, then run `pnpm plan:sync`.
      PROJECT_PLAN.md is GENERATED IN FULL since F.37/F.63 — never hand-edit
      any part of it, and `.claude/settings.json` denies Edit/Write on it.
    - Stage 0 / Stages A–E / risks: those moved to docs/PROJECT_HISTORY.md,
      which IS hand-maintained. Find the row and edit it normally — no sync
      step, no deny rule. Do not look for those rows in PROJECT_PLAN.md.
    - the prose around the Stage F table (title, purpose, companion list) comes
      from docs/project-plan-header.md. Edit that, then `pnpm plan:sync`.
      `pnpm plan:check` names which of the two sources drifted.
    - there is NO changelog row to append. The `## Changelog` section was
      DELETED on Day 24 (DEV.110) and must not return: it duplicated the
      completedDate + notes that docs/stage-f-tasks.json already carries, and
      it was maintainable only by a hand edit CLAUDE.md §10.4 forbids.
      scripts/sync-project-plan.test.ts fails the `test` job if it reappears in
      the plan, the header template or the history file, and
      `assertTemplateUsable()` refuses to render a template containing one.
C6. Append the day's deviations to /DEVIATIONS.md
    (append-only; never edit historic entries; if a deviation is
     resolved later, write a new RESOLVED entry referencing the original)
C6a. CONFIRM EVERY NEW ID IS FREE before writing it — DEV entries, ADRs,
     Stage F tasks, runbook sections. One command each:

       grep -c '^## DEV\.NN'  DEVIATIONS.md    # must print 0
       grep -c '^## ADR-NNN'   DECISIONS.md     # must print 0
       node -e "console.log(require('./docs/stage-f-tasks.json').tasks.some(t=>t.id==='F.NN'))"

     Do not derive the next id by eye from the end of the file. Both failures
     this guards against were caused by exactly that: DEVIATIONS.md carries two
     `## DEV.64` headings, and Day 27 nearly shipped a second `## ADR-014`
     because the highest-numbered ADR does not sit last in DECISIONS.md. The
     file is not sorted, and the tail is not the maximum.
C6b. NO UNEARNED PRECISION — in a notes field, a DEV entry, an ADR, or a
     commit message. Do not write a count, an "only"/"the only", a "first" or
     "first N versions", a "same as"/"identical to"/"byte-identical", or any
     version-history claim ("wrong in the first version", "three commits
     rewrote this field") UNLESS the number or the exclusivity IS the point
     AND you ran the command that produces it. When it is the point, name the
     command in the text so the next reader can re-run it, and prefer an
     ENUMERATION over a count: an enumeration fails visibly when it drifts,
     a count fails silently.

     THE TEST THAT SETTLES IT — delete the clause. If the sentence still means
     what it meant, the clause was decoration, and the operator's formulation
     applies: "A clause that cannot be load-bearing can only be wrong."

     AND THE CONVERSE, which the same PR demonstrated and which decides whether
     this rule is even the right one to reach for: if deleting the clause
     CHANGES the meaning, it is load-bearing, and deleting it is not the fix —
     verifying it is. Two of PR #27's findings were of that kind, not this one:
     the pg-boss retry figure — e3dd539: "That is wrong in exactly the way that
     misleads someone checking Sentry for a specific render and counting
     events" — and the trackEvent Axiom/pino mechanism, which f165352 calls
     "the most consequential error on this branch, because it is load-bearing
     for the fix F.73 asks for". C6b governs DECORATION. A load-bearing claim is C6a's
     habit — run the command — applied to prose.

     WHY THIS IS A SEPARATE RULE from C6a rather than a note under it: it
     targets the category that per-command discipline cannot reach. Claims
     ABOUT THE REPO get checked because a command exists for them. Claims
     ABOUT YOUR OWN WORK — how many commits touched a field, which version
     first carried an error, how many assertions you ran before committing —
     have no command unless you write one, and writing one feels like
     ceremony. The operator's count of PR #27: "three failures were counts
     about your own process, where no command exists unless you write one" —
     and per a37eed3, which enumerates all three, "Every one sits in a sentence
     whose purpose was to establish that the checking was done".

     NO DRAFTING HISTORY IN TRACKED FILES — this one is absolute, not
     conditional on having run a command, because no command exists. A claim
     about what an earlier DRAFT of a sentence said, how many times you
     rewrote it, or what you fixed before committing cannot be checked by
     anyone, ever: the drafts were never committed. Two such claims reached
     file content on the branch that added this rule, and one of them named
     the wrong commit — for an event that no committed version of the file
     ever recorded.

     The line between the two cases is git: COMMITTED history is fair game
     ("the attribution stood until 8e735a8" is one command away). Uncommitted
     drafting is not. If the lesson from a draft is worth keeping, state the
     RULE it produced and drop the anecdote — "cite anchors, not line numbers,
     in a file you are editing" needs no story to be useful. The anecdote
     belongs in the commit message, where a reader knows they are reading an
     account rather than a fact.

     INHERITED TEXT IS NOT VERIFIED TEXT. On PR #27 the trackEvent
     Axiom/pino mechanism and the "PR #25 was docs-only" claim both arrived
     from main (664d39e) and were rewritten AROUND without being re-read,
     because text already in the file reads as already-checked. If you are
     editing a paragraph, the claims you did not write are now yours.
C6c. `git add` A NEW SCANNER BEFORE YOU VALIDATE IT. Any tool that enumerates
     `git ls-files` — `check:ids`, `check:paths`, a NUL sweep, a doc audit —
     CANNOT BE VALIDATED FROM A TREE WHERE IT IS UNTRACKED. The scan will not
     reach itself, so the tool never sees its own source, its own allowlist or
     its own fixtures, and the validation is vacuous while looking convincing.

     This is not hypothetical. `check:paths` was written, run locally against
     58 paths, probed for non-vacuity by moving a cited file, and it passed —
     because its two files were still `??` in `git status`. They became tracked
     at commit time, the scan reached its own allowlist, read every
     deliberately-absent path in it as a citation, and CI went red on the first
     run. The local probes inherited the same blind spot, which is exactly why
     they had looked convincing.

     SAME SHAPE AS DEV.124, and worth naming as a family rather than as two
     incidents: there, a reading of the PRESENT was used as evidence about the
     PAST — a real API call, a real branch listing, a plausible mechanism
     connecting them, and no control. Here, a real command, real output, and no
     control either: nothing in the run distinguished "no dangling paths" from
     "the scanner cannot see the files that would dangle". **A real command with
     real output is not evidence until you know what result would have falsified
     it.** For a scanner, the falsifying case is its own tracked presence — so
     stage it first, and check that the tool's own files appear in the set it
     scanned.
C7. git switch -c day-<N>-<slug>
    git add -A && git commit -m "feat(<scope>): day N — <summary>"
    git push -u origin day-<N>-<slug>
C7a. RUN THE `verifier` SUBAGENT — BEFORE opening the PR, not after.
    It runs the closeout checks CI cannot see: plan:sync idempotency,
    PROJECT_PLAN.md being generated in full with no hand edits,
    DEVIATIONS.md append-only, and the DO deploy phase. Tell it nothing about
    what the day intended — it must not be given a reason to soften a finding.

    A FAIL STOPS THE DAY (CLAUDE.md §10.3). Fix the finding or bring it to the
    operator; do not open the PR on a FAIL.

    The ordering is structural, not a matter of remembering: on Day 24 the PR
    was opened first and the verifier then returned a FAIL, so the sequence was
    violated by accident rather than by choice. Running it first makes that
    impossible. It is cheap — it opens no PR, triggers no CI and costs one
    agent invocation.

C8. OPEN A PR AND WAIT FOR GREEN CI. No direct pushes to main (Day 22 on).
        gh pr create --fill --base main
        gh pr checks --watch        # non-zero exit if any check fails
    All three checks — `checks`, `test`, `e2e` — must be green. Do NOT
    disable, skip or mark-as-flaky a spec to get a merge through; if a spec
    is genuinely environment-dependent, leave it failing and report it.
    Then merge:
        gh pr merge --squash --delete-branch
    Merging IS the production deploy: both DO apps have deploy_on_push: true
    on main. Triage guidance + the branch-protection setup are in
    docs/RUNBOOKS.md R22; `gh` setup is R23.
C9. VERIFY THE DEPLOY LANDED — a merge that lands is NOT a deploy that works.
    The DO pipeline was silently broken across three commits (cef54d8,
    9756c6f, e3e3afe) before anyone noticed. After push:
        node scripts/verify-deploy.mjs both
    It polls the LATEST deployment of BOTH apps (dealerlink-staging
    77edf06b-…, dealerlink-production d8a25cb8-…) until each reaches a
    terminal phase and reports ACTIVE / ERROR. Exit 0 iff both are ACTIVE.
    Do NOT declare the day complete on a push alone. If either is ERROR,
    open the deploy logs (`doctl apps logs <appId> --type build|deploy`)
    before closing. Requires an authenticated doctl (`doctl auth list`).
C10. Print final summary: tests delta, files added (A vs B), deviations count,
     the PR number + merge commit SHA, the CI run URL, and the deploy phase
     of both apps.
```

## Stage F — marking a task complete (Day 19 onwards)

From Stage F Day 19, the Stage F task table in `PROJECT_PLAN.md` is
**generated from `docs/stage-f-tasks.json`** and must never be hand-edited.

Every Stage F day's close-out therefore does this instead of editing the table:

```text
1. Edit the task's object in docs/stage-f-tasks.json:
     "status": "complete", "completedDate": "YYYY-MM-DD", "notes": "<summary + SHA>"
2. pnpm plan:sync                # regenerates the table between the markers
3. Commit stage-f-tasks.json AND PROJECT_PLAN.md together
```

`pnpm plan:check` runs inside `pnpm verify`, so a table that has drifted from
the JSON fails the gate. Since F.37/F.63 the script renders the WHOLE file —
from `docs/stage-f-tasks.json` plus the committed header template
`docs/project-plan-header.md` — so there is no hand-editable region left in it
and no byte-identity assertion to trip. The markers survive inside the output
to delimit the JSON-sourced half, so `plan:check` can name which source
drifted. Stages 0–E moved to `docs/PROJECT_HISTORY.md`, which IS
hand-maintained.

Full workflow, failure modes and recovery: `docs/RUNBOOKS.md` — "Updating the
Stage F task table".

## Verification commands (Day 6 onwards)

- `pnpm lint` — runs ESLint in every workspace via `pnpm -r lint`. Scope is
  identical to the pre-commit hook (`lint-staged` runs the same eslint
  invocation). If `pnpm lint` is green, the pre-commit hook will be too.
- `pnpm lint:strict` — alias of `pnpm lint` retained for clarity in CI.
- `pnpm lint:fix` — `eslint --fix` across every workspace.
- `pnpm typecheck` — `tsc --noEmit` in every workspace.
- `pnpm test` — Vitest in every workspace.
- `pnpm verify` / `pnpm verify:latest` — Playwright E2E specs that smoke-test
  every shipped day. Each day adds a `verify-day-N.spec.ts` file.

From Day 22 all of the above also run in CI (`.github/workflows/verify.yml`)
on every pull request, against a fresh ephemeral Postgres. **CI is the
authoritative gate**; the local commands are the fast signal. See
`docs/RUNBOOKS.md` R22.

## Lint toolchain split (intentional)

- `apps/web` uses `next lint` (kept because next's eslint plugin has Next.js
  specific rules).
- `packages/*` and `apps/workers` use plain `eslint --max-warnings=0`.

The two share the root `.eslintrc.js` ruleset (import/order, no-explicit-any,
no-unused-vars, consistent-type-assertions). The split is only in the
invocation, not the rules.

## Adding a verify spec

Each day adds **one** Playwright spec under `apps/web/tests/e2e/`:

```ts
// verify-day-N.spec.ts
import { expect, test } from '@playwright/test';

test.describe('Day N — <module>', () => {
  test('happy path smoke', async ({ page }) => {
    /* … */
  });
});
```

Specs are smoke-level — they validate the day's deliverable surface is
reachable and the obvious assertions hold (a list has rows, a status pill
shows, a form submits). Deep behavioural coverage lives in Vitest.

## Deviations log

`/DEVIATIONS.md` is the append-only record of any time the implementation
intentionally drifted from a daily prompt's spec.

**Check the id is free before you write it** — `grep -c '^## DEV.NN' DEVIATIONS.md`
must print 0. The file is long, it is not sorted by id, and the highest id does
not necessarily sit at the end. It already contains two `## DEV.64` headings
from a resolution that reused the id instead of taking a new one, which is why
the `verifier` flags it on every run.

Format is per-entry:

```markdown
## DEV.NN — Day N — short title

**Date:** YYYY-MM-DD
**Spec said:** …
**Built:** …
**Why:** …
**Impact:** …
**Resolution:** none / tracked as R.X / resolved in DEV.MM
```

When a deviation is resolved later, append a **new** entry (e.g. DEV.18) with
status `RESOLVED — supersedes DEV.05`. Never edit historic entries.

---

_Established 2026-05-11 as part of Day 6 daily automation kit._
