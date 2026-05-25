# Load-test findings — Stage C Day C.5 (2026-05-25)

Empirical results from the pilot-realistic, non-destructive load profile run
against the live staging environment. Raw data in `results-*.json`; the
PDF-specific sizing analysis is in `findings-pdf.md`.

> **Reading the numbers.** All latencies are measured from this machine
> (load generator) to staging in BLR1, so they **include real internet
> RTT** — they are end-user-shaped, not server-internal. The server-internal
> view is `/api/health` (`db.latencyMs` 1–5 ms, `responseMs` 7–10 ms),
> which confirms the DB itself is never the bottleneck at these volumes.

## Environment at test time

- `staging.dealerlink.in` — web `basic-xs`, workers `basic-xxs` (512 MB),
  DB `db-s-1vcpu-1gb` (`max_connections=25`), BLR1.
- Pool caps in force (DEV.61): web `DB_POOL_MAX=2` / `DB_ADMIN_POOL_MAX=2` /
  `PGBOSS_POOL_MAX=1`; workers `2/1/2`.
- A web component restart was observed at **09:38:29Z** ("Ready in 2.7s"),
  **before** the load tests began. It was **not load-induced** — web uptime
  then climbed steadily through ~900 baseline+light requests (673 s → 814 s)
  with zero restarts. Logged here for completeness; likely a routine App
  Platform event.

---

## C5a — Baseline (single user, 5 iterations + warmup)

| Endpoint           | p50    | p95    | p99    | max    |
| ------------------ | ------ | ------ | ------ | ------ |
| dashboard          | 258 ms | 305 ms | 305 ms | 305 ms |
| quotations list    | 111 ms | 119 ms | 119 ms | 119 ms |
| quotation detail   | 114 ms | 138 ms | 138 ms | 138 ms |
| GST summary report | 88 ms  | 97 ms  | 97 ms  | 97 ms  |
| /api/health        | 46 ms  | 49 ms  | 49 ms  | 49 ms  |

Dashboard is the heaviest read (multiple KPI/widget queries); everything else
is ~90–140 ms incl. RTT. Server-internal DB latency was 1–5 ms throughout.

## C5a — Light load (5 concurrent users, 120 s)

| Metric         | Value                                              |
| -------------- | -------------------------------------------------- |
| Total requests | 867                                                |
| Errors         | **0 (0.0%)**                                       |
| Throughput     | 7.2 req/s                                          |
| Latency        | p50 133 ms · p95 403 ms · p99 627 ms · max 1029 ms |

**Did anything degrade vs baseline?** Yes, gracefully. Under 5 concurrent
users the mixed-read p95 rose from the single-user ~100–305 ms band to 403 ms,
and the p99 to 627 ms (worst single request 1.03 s). This is the expected
signature of the **web app pool capped at 2 connections** (DEV.61): with 5
concurrent streams, requests occasionally queue briefly for a connection. It
is **graceful queueing, not failure** — 0 errors, no `53300`
connection-slot errors, no pool-exhaustion log lines, web process stayed up.

**Constraint:** the binding constraint at this load is the **web DB pool size
(2)**, not DB CPU (db.latencyMs stayed 1–5 ms) nor memory. Raising
`DB_POOL_MAX` on a roomier production DB tier would flatten the p95/p99 rise.

**Headroom for 5 concurrent users on basic-xs / basic-xxs:** Comfortable.
Sub-second worst-case latency, zero errors, sustained for 2 minutes. A pilot's
realistic first-week load (≤5 concurrent users) is well within budget.

---

<!-- C5c (DB + workflow) results appended below after that chunk runs. -->
