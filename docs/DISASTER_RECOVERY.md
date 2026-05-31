# Disaster Recovery — Dealerlink Production Database

> **Scope.** Backup, point-in-time recovery (PITR), and restore for the
> production Managed Postgres cluster `dealerlink-production-db`
> (`6e0f1d36-d651-44d0-a062-ddf82e844812`, db-s-1vcpu-2gb, PG 16, BLR1).
>
> **Status.** Backup config **verified** and a full restore **rehearsed** in
> Stage D Day D.3 (2026-05-31) — a throwaway clone was forked from the latest
> production backup, verified, and destroyed. Production was never touched.
> The step-by-step recovery procedure is **R20** in `docs/RUNBOOKS.md`.

---

## 1. Backups — verified

DO Managed Postgres takes **daily automated backups** of the production
cluster. Verified 2026-05-31 via `doctl databases backups <cluster-id>`:

- **6 daily backups present**, oldest 2026-05-26 (cluster creation day),
  newest 2026-05-31 — daily at ~05:11 UTC.
- **Retention:** the managed-tier default (≈7 days; the backup set is a rolling
  window — the oldest currently coincides with cluster creation because the
  cluster is <7 days old).
- No operator action was needed to enable them — daily backups are on by
  default for managed clusters.

> **Pre-migration manual backup (operational rule).** Before every schema
> migration, the R17 runbook still expects a `pg_dump` snapshot as a fast local
> rollback. The automated daily backup + PITR is the safety net; the pre-migration
> dump is the belt to that's suspenders.

---

## 2. Point-in-time recovery (PITR) — available

DO Managed Postgres supports restoring to a **new** cluster from either the
latest backup or a specific timestamp inside the backup window:

```
doctl databases create <new-name> \
  --engine pg --version 16 --region blr1 --size <slug> --num-nodes 1 \
  --restore-from-cluster-name dealerlink-production-db \
  [--restore-from-timestamp "2026-05-31 06:00:00 +0000 UTC"]   # omit → latest backup
```

- `doctl databases create` **only ever creates a new cluster** — there is no
  in-place restore that could clobber production. The source cluster is read
  only during the fork.
- Omitting `--restore-from-timestamp` uses the **most recent backup**.
- Supplying a timestamp recovers to that point within the backup window — this
  is the PITR granularity (effectively to the most recent WAL checkpoint DO
  retains, on the order of minutes).

---

## 3. RTO / RPO

| Objective | Target | Reality (measured / derived in D.3)                                                                                                                                                                                               |
| --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPO**   | ≤ 24 h | **≤ 24 h** worst case (daily backup); **≤ minutes** with PITR to the most recent retained WAL.                                                                                                                                    |
| **RTO**   | ≤ 1 h  | **~6 min** to provision the restored cluster from backup (measured D.3), + a few minutes to re-point the app (`DATABASE_URL` / `DATABASE_DIRECT_URL` in the App Platform spec via R18) → **~10–15 min total, comfortably < 1 h**. |

**RTO breakdown:**

1. **Provision + restore the new cluster** — **~6 min measured** (D.3 rehearsal:
   `dealerlink-restore-test` created 08:42:50 UTC, `online` 08:48:41 UTC =
   5 min 51 s; db-s-1vcpu-1gb fork of the ~50 MB dataset). A prod-sized 2 GB
   target with more data would be somewhat longer but still well inside the hour.
2. **Re-point the app** — update `DATABASE_URL` (app role) + `DATABASE_DIRECT_URL`
   (doadmin) to the new cluster and apply via `pnpm sync-spec:production` (R18).
   The app redeploys; `/api/health` confirms `db: ok`. ~3–5 min.
3. **DNS/cert** — unaffected (the app host doesn't change). No DNS work.

---

## 4. The D.3 restore rehearsal (proof)

What was done on 2026-05-31 to prove the backup is restorable:

1. Created `dealerlink-restore-test` (db-s-1vcpu-1gb, blr1) with
   `--restore-from-cluster-name dealerlink-production-db` (latest backup).
2. Waited for the fork to reach `online` — **5 min 51 s** (08:42:50 → 08:48:41
   UTC).
3. Whitelisted the operator IP on the fork firewall (it inherited the source's
   app-only firewall), connected to the restored `dealerlink_production`
   database as `doadmin`, and verified: connectivity, **17 drizzle migrations
   applied** (matches production), the seeded **operator user present**
   (1 user, 0 tenants — the correct pre-Stage-E production state), and every
   core table queryable. _(Production has no tenant data yet — Stage E — so the operator
   account is the canary that real rows were restored, not an empty schema.)_
4. **Destroyed** `dealerlink-restore-test` immediately
   (`doctl databases delete`), confirmed gone via `doctl databases list`. No
   orphan cluster left running.
5. Production cluster untouched throughout (read-only source of the fork).

> An untested backup is not a backup. This rehearsal is the test; re-run it if
> the backup tooling or DB tier ever changes materially.

---

## 5. Recovery procedure

The operator-facing step-by-step is **R20** in `docs/RUNBOOKS.md`
("Production DB disaster recovery"). It references this rehearsal as the proof
that the procedure works.
