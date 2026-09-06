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
4. **Phase C — end-of-day routine** (mandatory, see below).

## Phase C — end-of-day routine (mandatory)

Every future day's prompt **must** conclude with these steps. Do not skip.

```text
C1. pnpm preflight                         # 0 hard failures, warnings only ok
C2. pnpm verify                            # all spec files pass
C3. pnpm typecheck && pnpm lint            # both green
C4. pnpm build && pnpm test                # both green
C5. Update PROJECT_PLAN.md:
    - Stage A–E (hand-maintained): find the row, set status ✅, set date,
      add notes summary
    - Stage F (GENERATED — see below): edit docs/stage-f-tasks.json, then
      run `pnpm plan:sync`. NEVER hand-edit the Stage F table.
    - append a changelog row at the bottom with the commit SHA
      (the changelog is outside the markers, so it is a normal edit)
C6. Append the day's deviations to /DEVIATIONS.md
    (append-only; never edit historic entries; if a deviation is
     resolved later, write a new RESOLVED entry referencing the original)
C7. git add -A && git commit -m "feat(<scope>): day N — <summary>"
C8. git push
C9. VERIFY THE DEPLOY LANDED — a push that lands is NOT a deploy that works.
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
     commit SHA + push confirmation, and the deploy phase of both apps.
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
the JSON fails the gate. The script writes only between
`<!-- STAGE_F_TASKS:START -->` and `<!-- STAGE_F_TASKS:END -->` and asserts
that everything outside those markers is byte-identical before writing.

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
intentionally drifted from a daily prompt's spec. Format is per-entry:

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
