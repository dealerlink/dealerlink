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

## C5b — PDF generation (summary; full analysis in `findings-pdf.md`)

- Cold render **5.5 s**, warm **2.4–3.5 s** — confirms DEV.67 (not 60–90 s).
  Single/sequential renders are excellent; the pilot's ≤10-PDFs/hour load is
  served fast.
- **10-concurrent burst ×3 reps failed 4/10, 1/10, 7/10** (120 s timeouts).
  The 512 MB worker **OOM-restarted ≥2× mid-test** (10:08:38Z, 10:25:41Z; no
  deploy, no crash log = OOM-kill fingerprint). Web `DB_POOL_MAX=2` also
  serializes renders 2-in-flight, compounding the timeouts.
- **Sizing call:** bump workers to `basic-xs` (1 GB, ~+\$7/mo) for production +
  raise `DB_POOL_MAX` on a roomier prod DB tier. `basic-xxs` not recommended.

---

## C5c — DB connection-pool load (10 concurrent dashboard users, 60 s)

| Metric         | Value                                                 |
| -------------- | ----------------------------------------------------- |
| Total requests | 469                                                   |
| Errors         | **0 (0.0%)** — no `53300`, no auth failures           |
| Throughput     | 7.7 req/s                                             |
| Latency        | p50 1228 ms · p95 1665 ms · p99 2045 ms · max 2164 ms |

The dashboard is the heaviest read; under 10 concurrent users its p50 rises from
the 258 ms single-user baseline to ~1.2 s (≈5×), p99 to ~2 s. This is the
`DB_POOL_MAX=2` cap (DEV.61) serializing 10 streams through 2 connections — but
it is **graceful: zero errors, no connection-slot (`53300`) failures, no pool
leak.** This validates the DEV.62 global-pool fix under real concurrency (a
per-access pool leak would have blown the 25-connection budget in seconds). The
binding constraint is pool size, not DB CPU (`db.latencyMs` stayed 1–5 ms).

**Stage D:** 10 concurrent users on the basic tier = no failures, ~1.2 s p50.
Raising `DB_POOL_MAX` on a roomier production DB tier flattens this back toward
the single-user baseline.

## C5c — Multi-user concurrent-write isolation (3 demo + 1 sample writers)

Concurrent draft-quotation creation (deliberately **not** "Save & send" — that
renders a PDF; this isolates the write/transaction path). Each create atomically
bumps the per-tenant `document_counters` QT row inside a `withTenant` transaction
— the app's sharpest isolation/deadlock contention point. 8 creates across 4
concurrent workers (3 demo roles + 1 sample tenant), wall 9.3 s.

| Assertion                                      | Result                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| No errors / deadlocks (8/8 creates ok)         | **PASS**                                                                          |
| Demo QT numbers all unique (no counter race)   | **PASS** (QT-2026-0024…0029)                                                      |
| Cross-tenant RLS holds under concurrent writes | **PASS** (a sample quotation does not render from a demo session, and vice-versa) |

- **Transaction isolation is correct under concurrency.** Six concurrent demo
  creates produced six gapless, unique QT numbers — the document counter's
  atomic increment serializes correctly with no collision or lost write. The
  sample tenant got its own independent sequence (QT-2026-0018/0019), confirming
  per-tenant counter isolation.
- **RLS holds while both tenants write concurrently.** A cross-tenant
  quotation-by-id read renders the not-found page (no QT number, no detail
  chrome) — never the other tenant's data. (Note: the first run's status-only
  check false-positived because Next's `notFound()` returns HTTP 200; the check
  now inspects the rendered body. The detail query is also tenant-scoped in code:
  `getQuotationById(tenantId, id)` → `notFound()`.)
- **Cross-user interference is mild + graceful.** The first concurrent wave of 4
  writes took ~5–6 s each (pool=2 + counter-lock contention); the second wave
  ~2 s. No failures.

### Side note — web component restart at 09:38 (not load-induced)

The web component started fresh at 09:38:29Z — this matches the 09:33 deployment
(commit `0216cb3`) completing, not a load event. Web uptime then climbed steadily
through every test (no further web restarts). Only the **workers** component
restarted under load (C5b, OOM).
