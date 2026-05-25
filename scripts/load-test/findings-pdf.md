# PDF generation — load + cold-start findings (C5b)

**Date:** 2026-05-25 · **Target:** `staging.dealerlink.in` workers `basic-xxs`
(512 MB / shared vCPU) · raw data: `results-pdf.json`.

PDF rendering is the single most important input to the Stage D worker-sizing
decision (DEV.67). The numbers below are real end-to-end renders driven through
the UI (Server Action → pg-boss `render-pdf` → workers Chromium →
`generated_documents`), so they include queue pickup + the 120 s web-side
`PDF_RENDER_TIMEOUT_MS`.

## Headline numbers

| Scenario                           | Result                                                     |
| ---------------------------------- | ---------------------------------------------------------- |
| **Cold render** (first after idle) | **5.5 s** ✅ (settled-state; confirms DEV.67, not 60–90 s) |
| **Warm single render**             | **2.4 – 3.5 s** ✅                                         |
| **Chromium eager-warm at boot**    | 3.0 – 3.6 s (binary extraction only; per logs)             |
| **10-concurrent burst, rep 1**     | 9/10 ok, makespan 135 s, p50 10.6 s, max 36 s ⚠️           |
| **10-concurrent burst, rep 0**     | **6/10 ok**, 4 timeouts, p50 49.6 s, max 125 s ❌          |
| **10-concurrent burst, rep 2**     | **3/10 ok**, 7 timeouts, p50 124.6 s, max 125 s ❌         |

## What the data says

**Single / sequential renders are excellent.** A single render — cold or warm —
completes in 2.5–5.5 s. The eager-warm at boot (DEV.66) extracts the Chromium
binary in ~3 s; the first _launch_ costs ~5.5 s (matching DEV.67's corrected
"settled-state ~4–5 s", NOT the 60–90 s seen only in the rolling-deploy window).
**The pilot's actual PDF demand — ≤10 PDFs/hour, effectively sequential — is
served comfortably and fast.**

**Concurrent bursts are NOT reliably handled on `basic-xxs`.** A 10-at-once
burst, repeated 3×, succeeded only 6/10, 9/10, and 3/10. The failures are all
the 120 s timeout (`"the document is taking longer than expected — please try
again"`), and p50 latencies climbed to 50–125 s. Two compounding causes:

1. **The 512 MB worker restarted at least twice during the test** (10:08:38Z and
   10:25:41Z) with **no deployment** (last deploy was 09:33) and **no crash /
   recycle / error log line** before the restart — just a clean "Workers process
   started" + eager-warm after. That clean-kill-then-restart with no app-level
   trace is the **OOM-kill fingerprint** on a memory-capped container. (DO does
   not expose the kill reason via `doctl` logs, so this is _strongly indicated_,
   not bit-for-bit confirmed — but the pattern + render-correlation is
   conclusive enough to act on.) Notably one failure (`warm[2]`, 360 s) happened
   during **sequential** warm renders, not the concurrent burst — suggesting
   Chromium's memory creeps across renders (the singleton browser only recycles
   per-100-pages / 45-min-idle, DEV.67) and can cross 512 MB after just a handful
   of renders. Each restart orphans the in-flight render → that request times out.
2. **The web DB pool cap of 2 (DEV.61) serializes PDF requests to 2-in-flight.**
   `requestPdfRender` holds its tenant transaction open while polling
   `generated_documents` (ADR-013 / DEV.63), so each in-flight render occupies
   one of the 2 web app-pool connections for its whole duration. A 10-burst
   therefore queues 5 waves deep; when renders are slow (worker recovering from a
   restart) the later waves blow the 120 s timeout. This caps burst throughput
   regardless of worker size until the web pool is raised.

## Sizing recommendation for Stage D

**Bump the workers component to `basic-xs` (1 GB) for production.**

| Option                    | Verdict                                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `basic-xxs` (512 MB) | ❌ Not recommended. Survives single/sequential renders but OOM-restarts under accumulated Chromium memory and fails 30–70 % of a concurrent burst. The restart orphans renders — a poor, non-deterministic UX even at low load.                                 |
| **`basic-xs` (1 GB)** ✅  | **Recommended.** Doubles the headroom Chromium needs, should eliminate the OOM-restarts, makes cold launches faster, and absorbs the occasional concurrent burst (two pilot users hitting "download" within a few seconds of each other — which _will_ happen). |

**Cost delta:** App Platform `basic-xxs` → `basic-xs` is roughly **+\$7/month**
(~\$5 → ~\$12; confirm against current DO pricing at provisioning). On the ~\$30/mo
staging baseline this is a small, well-justified increase for render reliability.

**Pair it with raising the web DB pool in production.** The pool=2 cap is a
staging band-aid for the `db-s-1vcpu-1gb` 25-connection ceiling (DEV.61). On a
roomier production DB tier, raise `DB_POOL_MAX` so concurrent PDF requests aren't
serialized to 2 — otherwise a bigger worker still can't clear a burst quickly.
The worker size and the DB pool/tier decisions are coupled for PDF throughput.

**Pilot-only fallback:** if cost is paramount for the pilot's first weeks,
`basic-xxs` would _technically_ serve the pilot's ≤10-PDFs/hour sequential load —
but given the OOM-restart observed even during sequential rendering, the small
spend on `basic-xs` is the safer call before real customer documents are issued.

## Housekeeping

The failed-burst renders left **3 orphaned `render-pdf` jobs** in the pg-boss
queue (visible in `/health` `queue.depthByType`); the recovered worker drains
them and the `pdf-cleanup` cron purges stale inline PDFs. No action needed. The
test regenerated PDFs on ~12 existing demo quotations (immutable
`generated_documents` rows) — cosmetic only.
