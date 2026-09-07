# Drizzle ORM Upgrade Analysis — F.2a (Day 21)

> Closes security finding **F-4**: `drizzle-orm` advisory GHSA (SQL injection via
> unescaped `sql.identifier()` / `sql.as()`, CWE-89), fixed in **0.45.2**.
>
> Day 19 already established the advisory is **not reachable in our code**: zero
> `sql.identifier()` calls, zero `.as()` usage on user input. This bump closes
> the advisory defensively, not because it is exploitable here.

## Target version and rationale

| Package     | From   | To          | Why                                                                                                                                             |
| ----------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| drizzle-orm | 0.38.4 | **0.45.2**  | Lowest version that clears the advisory; also the newest stable `0.x` (next is 1.0 β).                                                          |
| drizzle-kit | 0.30.6 | **0.31.10** | Newest kit in the 0.45 line. kit 0.31.8 shipped in tandem with orm 0.45.0; 0.31.10 (2026-03-17) is the last kit before orm 0.45.2 (2026-03-27). |

We do **not** jump to the 1.0.0 beta/rc line — it removes RQBv1, reworks the
casing API (`casing:` config → dedicated imports) and splits dialects into
async/effect variants. That is a much larger surface than F-4 justifies. 0.45.2
is the minimal, in-era move that closes the finding.

## Baseline captured (Phase 0)

| Artifact                       | Result                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| preflight                      | all green, 18/18 migrations applied                                                     |
| `pnpm verify`                  | 65 specs (62 pass + 3 flaky-passed)                                                     |
| `pnpm test`                    | 556 (web 199, workers 40, scripts 26, schemas 68, tax 51, db 172)                       |
| `drizzle-kit generate` (drift) | **"No schema changes, nothing to migrate"**                                             |
| `/tmp/baseline-numeric.json`   | 40 money columns / 8 tables — **all `typeof string`** (nullable `discountValue` = null) |
| `/tmp/baseline-rls.sql`        | 36 policies / 31 tables (`pg_policies`)                                                 |

## Breaking-change review, 0.39 → 0.45.2, against OUR patterns

Reviewed release notes for every minor 0.39 → 0.45.2 for both packages.

### (a) NUMERIC / decimal handling — **CLEAR** (the money-critical one)

- **0.41.0** added _optional_ `mode: 'number' | 'bigint'` to `decimal`/`numeric`
  for pg/mysql/sqlite/singlestore. **This is additive.** With no `mode`
  specified — which is how all **52** of our decimal/numeric columns are
  declared — the default return type is unchanged: **string**. Confirmed
  empirically in Phase 5.1 (see below).
- **0.41.0** also _removed in-driver mapping for several postgres array types_
  (`numeric[]`, `timestamp[]`, …) to avoid precision loss. **We have exactly one
  array column** — `dealers.tags` = `text().array()`. `text[]` is not a
  precision-losing type and is not in the removed set. Not affected.
- No other numeric parsing change in the range.

> Our stack: `drizzle-orm/postgres-js` + `postgres@3.4.9`, `prepare: false`.
> postgres.js returns `numeric` as string; drizzle's default column codec keeps
> it a string. Neither changed. **gstRate and all money columns stay strings**,
> as CLAUDE.md §5 requires.

### (b) RLS — pgPolicy / enableRLS emission — **CLEAR**

Our RLS is **100% hand-written SQL** (`packages/db/src/rls/*.sql` +
`migrations/*.sql`). **Zero** usage of drizzle-kit's `pgPolicy()` /
`enableRLS()` / `crudPolicy()` DSL anywhere in the repo. Any change to how the
kit _emits_ policies is therefore irrelevant — our policies are authored SQL and
are byte-stable across the bump. `pg_policies` is expected to be byte-identical.

### (c) Row locking — `.for('update')` — **CLEAR**

We do **not** use drizzle's query-builder locking API. All locking is raw
`sql\`... FOR UPDATE\``(confirm-order, payment allocation helpers). The 0.41 /
0.43 "nowait" flag spelling fixes touch`.for('update', { noWait })` — an API we
never call. No impact.

### (d) Transactions / isolation — **CLEAR**

We use `db.transaction(async (tx) => …)` (via `withTenant`) with no isolation
options. No transaction API change in the range.

### (e) drizzle-kit migration generation — **verify in Phase 4**

kit 0.31 may change generated-SQL formatting. Since our schema has not changed,
Phase 4 expects **no new migration**. If one appears it is reported verbatim,
not applied.

### (f) Query builder (select / with / joins / sql``) — **CLEAR**

- 0.42 `inArray` accepts `ReadonlyArray` (additive), `InferEnum` util (additive).
- 0.43 cross/lateral joins (additive).
- No breaking signature change to select / with / joins / `sql\`\`` in range.

### (g) Prepared statements / placeholders — **CLEAR**

The 0.41 prepare-behavior change is **sql-js (SQLite)** specific. We run
postgres-js with `prepare: false`. No impact.

### ⚠ One semantic change that DOES touch us — `DrizzleQueryError` (0.44.0)

0.44.0 wraps **all** driver errors in `DrizzleQueryError`, with the original
driver error moved to `.cause`. Our replay/dedup detection in
`apps/web/lib/email/resend-webhook.ts` reads `err.code === '23505'` on the
top-level error. After the bump that code lives at `err.cause.code`, so the
check silently fails and duplicate webhooks would throw instead of being treated
as replays.

- **Category:** error-handling (e), **not** one of the hard-stop categories
  (a/b/c). This is a _fix-with-test_, not an abort trigger.
- **Fix:** unwrap `DrizzleQueryError` before reading `.code` (postgres.js error
  in `.cause` carries `.code`). Covered by a new regression test.

## GO / NO-GO

**GO.** The three hard-stop categories — (a) numeric, (b) RLS, (c) row locking —
are all clear against our specific usage. The only behavioural change that
reaches us is the 0.44 error-wrapping, which is contained, well-understood, and
covered by a fix + test. Proceeding to Phase 2. Final proof is Phase 5
(numeric golden diff, money parity, RLS byte-diff, locking tests).

_If Phase 5 contradicts any of the above (esp. a string→number flip in 5.1), the
plan is to revert to the Phase 2.2 commit's parent and record the finding here._
