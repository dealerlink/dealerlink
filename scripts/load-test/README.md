# Load-test harness (Stage C Day C.5)

Empirical performance + load testing against the live **staging** environment
(`staging.dealerlink.in`), to inform the Stage D production sizing decisions
(DEV.61 DB tier, DEV.66/67 worker sizing).

> **Profile: pilot-realistic, non-destructive** (operator-approved, C.5).
> No deliberate-OOM stress, no 20/40-concurrent PDF bursts, no forced
> redeploy. The intent is to measure steady-state behaviour at realistic
> pilot load (≤5 concurrent users, a small PDF burst, a few concurrent
> workflows) — not to find the absolute breaking point, which is already
> characterised in DEV.61 (DB connection ceiling) and DEV.66/67 (cold
> Chromium launch).

## Running

```bash
# 1. Capture login session cookies (writes .sessions.json, gitignored).
node scripts/load-test/session.mjs

# 2. GET-based latency tests (cookie + fetch).
node scripts/load-test/baseline.mjs      # single user, 5 iters → results-baseline.json
node scripts/load-test/light-load.mjs    # 5 users / 120s   → results-light.json
node scripts/load-test/db-load.mjs       # 10 users / 60s   → results-db.json

# 3. Server-Action-backed flows (real browser via Playwright).
node scripts/load-test/pdf-load.mjs      # cold sample + 10-concurrent ×3 → results-pdf.json
node scripts/load-test/workflow-load.mjs # 3 concurrent write chains      → results-workflow.json
```

Env overrides: `LOADTEST_APEX` (default `staging.dealerlink.in`),
`LOADTEST_DURATION_S`, `LOADTEST_USERS`.

## Design notes

- **Auth.** Login is a Lucia Server Action; `session.mjs` drives a real
  browser to log in on each tenant subdomain and extracts the
  `dealerlink_session` cookie. The GET tests reuse that cookie over `fetch`
  (accurate TTFB + body transfer, light enough for real concurrency). The
  write / PDF tests drive a real browser, because replaying Server Actions
  over raw fetch (action ids, RSC payloads) is fragile.
- **Latencies include this machine → BLR1 RTT.** They are end-user-shaped
  numbers, not server-internal timings; the `/api/health` `responseMs` (and
  its `db.latencyMs`) is the server-internal corroboration.
- **Monitoring.** `/api/health` snapshots before/after each test +
  `doctl apps logs <id> web|workers --type run` for the test window are the
  resource-pressure corroboration (App Platform component CPU/mem are not
  cleanly exposed via doctl on the basic tier).

See `FINDINGS.md` for the captured results and `findings-pdf.md` for the
PDF-specific sizing analysis.
