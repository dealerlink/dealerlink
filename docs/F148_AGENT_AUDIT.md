<!-- prettier-ignore-start -->
# F.148 — pre-build audit: what exists on our side today

> ## PROVENANCE — read this before the report
>
> **Audited by:** the `code-auditor` subagent (`.claude/agents/`), 2026-10-03,
> invoked by the main thread on five questions set by the operator ahead of
> writing the F.148 agent spec.
>
> **Transcribed by:** the main thread, **VERBATIM and uncompressed.** Everything
> below the rule is the agent's own words, byte for byte as returned. Nothing was
> shortened, reordered, re-headed or paraphrased. Only this header is mine.
>
> **The agent had `Read`, `Grep` and `Glob` only.** It reads code; it cannot
> edit, run a command, or observe a running system. It was told explicitly not to
> propose, design or recommend anything, because the operator writes the spec from
> this and a proposal in it would contaminate that.
>
> ### THE INSTRUMENT CAVEAT, WHICH MATTERS MORE HERE THAN USUAL
>
> **The agent has no `Bash`, so it could not run `git grep -n`** — this project's
> required first instrument for any existence claim (CLAUDE.md §11.1 ruling 8).
> It had only the Claude Code `Grep` shim, which DEV.117 and DEV.118 established
> **fails silently on a file containing a NUL byte**: it exits with no output and
> no warning, which is indistinguishable from a true absence.
>
> It was therefore required to rest every negative-existence claim on an
> **affirmative enumeration** — a `Glob` listing, a barrel file, a directory read
> in full — rather than on an empty search, and to **name the instrument** behind
> each claim (ruling 7). Its own opening paragraph states that it did so and
> labels its corroboration-only searches as such. **Read those labels**: where it
> says a `Grep` emptiness is the evidence, the claim is weaker than where it says
> it enumerated and read.
>
> ### WHAT THE MAIN THREAD RE-DERIVED WITH THE STRONGER INSTRUMENT
>
> Not a review of the report — a check of the enumerations the spec will lean on
> hardest, run with `git grep -n` and direct file reads, which the agent could not
> do. **All four held:**
>
> 1. **Exactly two `fetch(` call sites** in non-test application source, at the
>    cited lines — `apps/workers/src/email/resend-client.ts:114` and
>    `apps/web/app/api/health/route.ts:129`. `git grep -nE '\bfetch\('` over
>    `apps/web/{lib,app}`, `apps/workers/src` and `packages`.
> 2. **Exactly three routes** under `apps/web/app/api/`, via
>    `git ls-files 'apps/web/app/api/**/route.ts'`: `health`,
>    `internal/sentry-test`, `webhooks/resend`.
> 3. `apps/web/app/api/internal/sentry-test/route.ts:21-22` gates on
>    `ctx.user.role !== 'operator'` and returns **404 rather than 403** "so the
>    endpoint's existence is not disclosed" — i.e. a session gate, not a machine
>    one.
> 4. `packages/db/src/client.ts:77-78` and `:91-92`: `db` connects as
>    **`dealerlink_app` — RLS-enforced**; `adminDb` connects as **`dealerlink`
>    (SUPERUSER, BYPASSRLS)**. That is the load-bearing fact under question 3.
>
> ### TWO STANDING CAVEATS
>
> 1. **This is EVIDENCE, NOT A DECISION** (CLAUDE.md §10.4). Nothing here is
>    agreed, scoped or approved. The spec is the operator's.
> 2. **It is a SNAPSHOT of 2026-10-03, at `main` = `242ea0b`.** It will drift. Any
>    citation taken from it into the spec should be re-checked at that point rather
>    than inherited — §11.1 ruling 6 exists because a carried-forward citation
>    looks exactly as authoritative as a checked one.
>
> **Section 5 — "what I could NOT determine" — is as load-bearing as the other
> four** and was commissioned that way. It is where the floor is missing.

---

# F.148 pre-build audit — what exists on our side today

**Scope note on instruments.** No Bash, so no `git grep -n`. Every negative below rests on an enumeration I obtained and read in full (a `Glob` listing, a barrel file, a directory of SQL files, or the complete set of `process.env.*` reads / `fetch(` call sites). Where I used a `Grep` whose emptiness is the evidence, I say so and label it corroboration only.

**Documents that state answers to these questions.** While grepping I saw the F.148 design and the "nothing exists yet" claim stated in `/workspace/docs/PLAN_REVISION_PARITY_LIST.md:92-108` and `:221`, `/workspace/docs/stage-f-tasks.json` rows F.11/F.148/F.154, `/workspace/docs/COMMERCIAL.md:293`, `/workspace/docs/STAGE_F_BUILD_v3.md:217`. I did not read any of them as a basis; each verdict below was reached from code and from directory enumerations, and I report the doc agreement only as a doc claim. No document was excluded from me in the invocation.

---

## 1. What already talks to something OUTSIDE this repo

**VERDICT: EXISTS — five outbound dependencies plus a sixth (Axiom) the question did not name. The failure/no-data distinction is PARTIAL and the gaps are named per item.**

**Complete enumeration of outbound HTTP in application source.** `Grep` for `\bfetch\(|https?://` over `{apps/web/lib,apps/web/app,apps/workers/src,packages}/**/*.{ts,tsx}` returned exactly **two** `fetch(` call sites in the whole repo:

- `/workspace/apps/workers/src/email/resend-client.ts:114` — Resend `POST /emails`
- `/workspace/apps/web/app/api/health/route.ts:129` — Resend `GET /domains` liveness ping

Everything else outbound is SDK-mediated (`@sentry/node`, `@sentry/nextjs`, `@axiomhq/js`) or a subprocess (`typst`) or a Postgres connection (pg-boss). The remaining `https://` hits in that enumeration are: Google Fonts `<link rel="preconnect">` in three legacy `.tsx` templates, and `dealerlink.in` URL builders.

### 1.1 Resend — outbound send

`/workspace/apps/workers/src/email/resend-client.ts`

- **(a) Retry:** none inside the client. Retry lives one layer out, in two places: the queue policy `EMAIL_QUEUE_RETRY = { retryLimit: 5, retryBackoff: true }` at `/workspace/apps/workers/src/queue/boss.ts:19-22` (mirrored for the web enqueue side at `/workspace/apps/web/lib/queue/client.ts:24`), and the decision of *whether* to re-throw at `/workspace/apps/workers/src/email/handler.ts:146-154`. Only `RETRYABLE_CODES = ['RATE_LIMITED']` (`resend-client.ts:27`) re-throws; everything else marks the row `failed` and returns normally.
- **(b) Timeout:** **none.** `fetch` at line 114 passes no `signal` and no `AbortSignal.timeout`. A hung Resend connection hangs the job until Node's default socket behaviour or pg-boss's own job expiry intervenes. This is the one outbound call in the repo with no time bound.
- **(c) Failure surface:** a classified `EmailSendError` (`classifyError`, lines 63-86) → `email_delivery_log.status = 'failed'` + `error_message` (handler lines 157-160) → the row is what the UI reads. Sentry capture happens via `instrumentJobHandler` (`/workspace/apps/workers/src/observability/sentry.ts:60-78`) only for throws that escape, i.e. only the retryable path. **A permanent Resend failure reaches Sentry via no path at all** — it is swallowed into a DB column.
- **(d) Failure vs success-with-no-data: DISTINGUISHED, explicitly.** Three separate states:
  - key absent → synthetic success. `resend-client.ts:97-110`: `if (!apiKey) { … return { providerMessageId: devId } }` with a `dev-`-prefixed id and the log line `'email (dev): RESEND_API_KEY unset — message not actually sent'`. A `dev-` id in `provider_message_id` is the marker that the send never happened.
  - transport failure → `EmailSendError('RATE_LIMITED', 'Network error reaching Resend: …')` (lines 137-143). Note this classifies **every** network error as retryable.
  - 200 with a body that carries no id → its own error: `resend-client.ts:149-152`, `throw new EmailSendError('UNKNOWN', 'Resend response missing message id')`. This is the clearest example in the repo of "succeeded but returned nothing" being treated as a failure rather than as a null.

### 1.2 Resend — inbound webhook (does it reach outward?)

`/workspace/apps/web/app/api/webhooks/resend/route.ts` + `/workspace/apps/web/lib/email/resend-webhook.ts`. **No outbound call.** It is purely a receiver: verify (svix), persist, apply. Its relevance here is as the only machine-authenticated endpoint — see §2.

Failure-vs-no-data in the receiver, which is directly analogous to what an agent will face:
- `verifyResendWebhook` returns `{ ok: false, error: 'RESEND_INBOUND_WEBHOOK_SECRET is not configured' }` (`resend-webhook.ts:45-48`) — **not configured** is a distinct `error` string from **bad signature** (line 68) and from **missing headers** (line 53). Three distinguishable negatives.
- `processResendEvent` distinguishes *matched nothing* from *failed*: `{ matched: false, note: 'event carries no data.email_id' }` (line 171) and `{ matched: false, note: \`no email_delivery_log row for ${emailId}\` }` (line 180) are successes-with-no-data, carried in `webhook_events.processing_error` by `markWebhookProcessed`, while a throw is caught in the route (`route.ts:78-85`) and also written to the same column. **A reader of `processing_error` cannot tell a benign unmatched event from a thrown bug — both land in the same text column — and both answer HTTP 200.** The route comments the 200 as deliberate (lines 79-81, 87-88).

### 1.3 Sentry

- Workers init: `/workspace/apps/workers/src/observability/sentry.ts:17-31`. Web init: `/workspace/apps/web/sentry.server.config.ts:14-23`, `sentry.client.config.ts`, `sentry.edge.config.ts`, loaded by `/workspace/apps/web/instrumentation.ts`.
- Reporter: `/workspace/apps/web/lib/observability/log.ts:19-31` (`reportError`), which `console.error`s a structured line **and** calls `Sentry.captureException`. Called from `/workspace/apps/web/lib/actions/wrap.ts:97` for every non-`AppError` throw in a tenant or operator action.
- **(a) Retry / (b) timeout:** both delegated to the SDK; nothing in repo configures either. The only time bound we own is `Sentry.flush(2000)` on shutdown — `/workspace/apps/workers/src/observability/sentry.ts:81-87`, wrapped in a `try {} catch {}` whose comment is "Flush failures must not block shutdown".
- **(c) Failure surface:** none. A failed Sentry transmission is invisible: there is no `onError` hook, no log line, no counter. The parallel `console.error` in `reportError` is what makes an error visible regardless.
- **(d) Distinguishable?** **Nothing distinguishes it.** `enabled: Boolean(dsn)` (sentry.ts:21, sentry.server.config.ts:16) means an unset DSN is a silent no-op by design — "Graceful no-op when SENTRY_DSN is unset (dev)" (sentry.ts:9). From inside the process, "Sentry is off" and "Sentry is on and dropping events" are the same observable: nothing. There is one deliberate probe for this: `/workspace/apps/web/app/api/internal/sentry-test/route.ts`, operator-gated, 404 for everyone else — and its comment says the point is that the error is visible "regardless of whether a DSN is configured" (line 28-29), i.e. it tests our wiring, not Sentry's receipt.

### 1.4 pg-boss

- Workers side: `/workspace/apps/workers/src/queue/boss.ts` — `startBoss()` lines 38-80, connects on `DATABASE_DIRECT_URL ?? DATABASE_URL` (line 27), strips `sslmode=` and forces `ssl: { rejectUnauthorized: false }` (lines 48-66), caps the pool from `PGBOSS_POOL_MAX` (lines 62-63), registers `instance.on('error', …)` → `logger.error({ err }, 'pg-boss error')` (lines 67-69), then `createQueue` for each of `ALL_QUEUES`.
- Web side: `/workspace/apps/web/lib/queue/client.ts` — `supervise: false` (line 56), instance cached on `globalThis` (lines 26-29, 75-80), same TLS and pool handling, `boss.on('error', …)` → `logger.error({ err }, 'pg-boss (web) error')` (lines 60-62).
- Job runner: `/workspace/apps/workers/src/index.ts:41-69` — four `boss.work()` registrations and two `boss.schedule()` crons, each handler wrapped in `instrumentJobHandler`.
- **Complete queue enumeration** (from `/workspace/packages/schemas/src/email.ts:15-21`, four constants and one `ALL_QUEUES` array): `send-email`, `render-pdf`, `validity-expiry`, `pdf-cleanup`. No fifth queue exists.
- **(a) Retry:** per-queue, declarative. `send-email` gets `retryLimit: 5, retryBackoff: true`. `render-pdf` gets **none**, deliberately — `/workspace/apps/web/lib/queue/client.ts:88-97`: "No retry: the web caller blocks on a bounded poll, so a failed render should surface fast as a timeout rather than re-attempt in the background (DEV.63)."
- **(b) Timeout:** none on enqueue or on connect beyond postgres-js defaults. `connect_timeout: 10` exists on the `@dealerlink/db` clients (`/workspace/packages/db/src/client.ts:39,65`) but pg-boss builds its own pool and sets no equivalent.
- **(c) Failure surface:** `initBoss`/`startBoss` throw if neither DB URL is set (`client.ts:33`, `boss.ts:28-30`); runtime pool errors go to the `error` event handler and nowhere else.
- **(d) Failure vs success-with-no-data: NOT DISTINGUISHED, and this is the sharpest instance in the repo.** `boss.send()` returns `string | null`; both wrappers type it honestly — `enqueueEmailJob(): Promise<string | null>` (`client.ts:83`) and `enqueueRenderPdfJob(): Promise<string | null>` (`client.ts:94`), each documented "Returns the pg-boss job id (or null)". **Both call sites discard the return value entirely**: `/workspace/apps/web/lib/email/send.ts:73` (`await enqueueEmailJob({ … });`) and `/workspace/apps/web/lib/pdf/render-request.ts:86-91` (`await enqueueRenderPdfJob({ … });`). A `null` — pg-boss declining to create the job — is observationally identical to a successful enqueue at every call site. For email it then surfaces as a row stuck at `status='queued'` forever; for PDF it surfaces 15s (or 120s in prod) later as the generic timeout at `render-request.ts:111`.

### 1.5 Typst binary resolution

`/workspace/apps/workers/src/pdf/typst.ts:38-49`

```ts
export function resolveTypstBinary(): string {
  const fromEnv = process.env.TYPST_BIN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('sh', ['-c', 'command -v typst'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'typst binary not found. Set TYPST_BIN or put `typst` on PATH. ' +
        'The workers image installs it; see docs/RUNBOOKS.md R26 for the pinned version.',
    );
  }
}
```

- **(a) Retry:** none, and the comment states the policy as a design rule (lines 32-36): "There is deliberately no download-on-demand: a renderer that fetches a binary at run time is neither hermetic nor auditable."
- **(b) Timeout:** none on either `execFileSync`. `renderTypstPdf` (lines 79-117) runs `execFileSync(typst, [...], { cwd: work, stdio: 'pipe', env: { …process.env, SOURCE_DATE_EPOCH } })` with no `timeout` option. A wedged typst blocks the worker thread indefinitely.
- **(c) Failure surface:** a thrown `Error` with a remediation sentence and a runbook pointer. It propagates out of `runRenderPdf` → `instrumentJobHandler` → Sentry + pg-boss, or out of `render-cli.ts` as `{"ok":false,"error":"…"}` on stdout with exit 1 (`/workspace/apps/workers/src/pdf/render-cli.ts:70-75`). The `finally` at `typst.ts:114-116` removes the mkdtemp work directory on every path.
- **(d) Distinguishable?** **Yes, and it is the best-modelled case in the repo.** Three outcomes are separable: `TYPST_BIN` set (trusted, returned unchecked — note it is *not* stat'd, so a bad path fails later inside `execFileSync` with a different error), found on PATH, and not found (a named error). It does **not** distinguish "typst ran and produced zero-byte output" — `readFileSync(out)` at line 113 would return an empty Buffer and the caller would store it. Nothing checks `buffer.length`.
- **Provisioning asymmetry worth recording:** `TYPST_BIN` appears in the complete `process.env` enumeration (below) at `typst.ts:39`, `apps/workers/scripts/render-typst.ts:50`, `scripts/install-typst.mjs:51` — and in **neither** DO app spec. Production resolves it from PATH, installed by `/workspace/apps/workers/Dockerfile:38-50` (version `0.15.1`, sha256-pinned, `typst --version` as the build-time assertion).

### 1.6 `/api/health` — the component checks

`/workspace/apps/web/app/api/health/route.ts`. Six checks, run in `Promise.all` at lines 310-317: `db`, `migrations`, `auditTrigger`, `rls`, `resend`, `queue`. Aggregated by `aggregate()` (lines 280-284): any `down` → `down` → HTTP 503; any `degraded` → `degraded` → HTTP 200. `skipped` contributes nothing.

- **(a) Retry:** none, on any check. One attempt each per request; the "retry" is the next poll (DO health check `period_seconds: 30`, `failure_threshold: 3` — `/workspace/.do/app.production.yaml:44-50`).
- **(b) Timeout — and the file's own header comment is wrong about this.** Lines 22-23 claim "Checks run in PARALLEL, each behind its own timeout … the worst case is bounded by the slowest single timeout (the Resend ping, 3s)". In fact only **two of six** have a bound:
  - `dbCheck` — `withTimeout(run, 2000, { status: 'down', latencyMs: 2000, error: 'timeout' })`, line 63, using the `Promise.race` helper at lines 43-50.
  - `resendCheck` — `signal: AbortSignal.timeout(3000)`, line 131.
  - `migrationsCheck` (66-76), `auditTriggerCheck` (78-92), `rlsCheck` (94-118), `queueCheck` (164-189) have **no timeout**. All four are `adminDb` queries, so their only bound is postgres-js `connect_timeout: 10` plus however long the statement runs. The endpoint's worst case is therefore unbounded, not 3s.
- **(c) Failure surface:** two bodies, gated on a bearer token (lines 327-337). Unauthenticated: `{ status, timestamp, detail: 'withheld' }`. Authenticated: `{ status, version, versionSource, checks, timestamp, uptimeSeconds, responseMs, detail: 'full' }`. Rate-limited: `{ status: 'rate_limited', resetAt }` + 429 + three `X-RateLimit-*` headers (lines 296-308). The rate limiter itself fails **open** (`/workspace/apps/web/lib/rate-limit.ts:51-54`).
- **(d) Failure vs success-with-no-data — mixed, and the distinctions that exist are the most reusable thing in the repo for F.148:**
  - **`resendCheck` is the one check that models all three states.** `if (!key) return { status: 'skipped', message: 'RESEND_API_KEY not set' }` (line 126) — *unconfigured* is a fourth status value, neither ok nor down. `res.ok` → `ok`. HTTP 401 with `body?.name === 'restricted_api_key'` → **`ok` with `keyScope: 'sending-only'`** (lines 144-153), on the reasoning in the comment at 136-143: that exact response proves authentication succeeded and only scope is narrowed. Any other 401, or any other non-2xx → `degraded`. Transport throw → `degraded` with `error: err.message`. Five outcomes, four of them named in the body.
  - **`queueCheck` conflates two things it cannot see.** `{ status: 'skipped', message: 'pg-boss not initialised' }` when the `pgboss` schema is absent (lines 183-186, keyed off the error message containing `'pgboss.job'` or `'does not exist'` — a string match, not the `42P01` SQLSTATE the comment names). Otherwise it reports depth: `> 500 → down`, `> 100 → degraded`, else `ok` (line 179). **An empty result set yields `{ status: 'ok', depthByType: {} }`, which is also what a perfectly idle healthy queue yields — and is also what you get when the workers process is dead and nothing is enqueuing.** Nothing in the six checks observes worker liveness at all; a dead worker is detected only indirectly, as a backlog crossing 100.
  - **`migrationsCheck` makes zero a failure on purpose:** `status: n > 0 ? 'ok' : 'down'` (line 72). Zero rows is treated as broken, not as empty.
  - **`rlsCheck`/`auditTriggerCheck` make absence a failure by set difference**, not by row count: `missing = EXPECTED_RLS_TABLES.filter(t => !status[t])` (line 113) against the six-name constant at lines 33-40, and `required = ['tenants','users']` at line 86. A table that returns no row is `missing`, identically to a table that returns a row with RLS off.
  - **`build()` (lines 271-277) is the repo's explicit precedent for "absent ≠ a value":** `{ version: null, versionSource: 'unset' }` rather than the string `'dev'`, with the reasoning at 265-269 — "`'dev'` is a CLAIM about the environment; `null` with a named source is the truth." Asserted at `/workspace/apps/web/app/api/health/route.test.ts:117-131`.
  - The consumer side has the matching discipline: `/workspace/scripts/merge-status.mjs:213-239` returns four distinguishable shapes — `{ reachable: false, error }`, `{ reachable: true, withheld: true, status }`, `{ reachable: true, httpError }`, and the parsed body with `applied: body.checks?.migrations?.applied ?? null` and the comment "Absent is distinct from zero and is reported as such." It bounds itself with `AbortSignal.timeout(20_000)` (line 222). `/workspace/scripts/verify-deploy.mjs:55-75` does the same for `doctl`: `DOCTL_ERROR` and `TIMEOUT` are separate phases from the four terminal ones, with `TIMEOUT_MS = 15 * 60 * 1000` and `POLL_MS = 15 * 1000`.

### 1.7 Axiom — the sixth dependency, not in the question and not in `/api/health`

`/workspace/apps/web/lib/observability/events.ts` and `/workspace/apps/workers/src/observability/events.ts`.

- Lazy cached client, lines 67-85 (web). **It is the only outbound dependency with an error hook:** `onError: (err) => { logger.warn({ err }, 'axiom: ingest failed'); }` (lines 78-80), added because "the SDK would otherwise swallow that into its default console.error sink, invisible in our structured logs… (DEV.75)".
- `trackEvent` (lines 99-129) is fire-and-forget with two layers of catch: `void Promise.resolve(axiom.ingest(…)).catch(…)` plus a synchronous `try/catch`, each logging a `warn`. No timeout, no retry. Falls back to `logger.info` when not production or unconfigured (line 128).
- Not checked by `/api/health`. An Axiom outage is invisible except as `warn` lines in the very log stream that may be the thing failing.

### 1.8 DO Spaces — a declared dependency that throws

`/workspace/apps/workers/src/pdf/store.ts:35-37, 80-84`. `spacesConfigured()` reads `DO_SPACES_KEY`/`DO_SPACES_SECRET`/`DO_SPACES_BUCKET`; if all three are set, `storeRenderedPdf` takes the `storage = 'spaces'` branch and calls `uploadToSpaces`, which is `Promise.reject(new Error('DO Spaces upload is a Stage D activation (DEV.16) — not implemented in Phase 1.'))`. Neither DO spec sets those three vars (see the complete spec read of `/workspace/.do/app.production.yaml`), so the branch is unreachable in production — but it is reachable by setting three env vars, and it fails by throwing, not by falling back.

### 1.9 Dead outbound reachability in the legacy HTML templates

`/workspace/apps/workers/src/templates/{quotation,dispatch-note,payment-receipt}.tsx` each render `<link rel="preconnect" href="https://fonts.googleapis.com" />` plus a Google Fonts stylesheet (quotation.tsx:63-66, dispatch-note.tsx:75-78, payment-receipt.tsx:62-65). **These are not on the production path.** `renderQuotationHtml` / `buildQuotationHtml` / `renderDispatchNoteHtml` / `buildDispatchNoteHtml` / `renderPaymentReceiptHtml` / `buildPaymentReceiptHtml`: the complete call-site enumeration (`Grep` for all six names, repo-wide, unlimited) shows callers only in `apps/workers/tests/quotation-template.test.ts`, `apps/workers/tests/payment-receipt-template.test.ts`, `templates/performa-invoice.tsx:293` (which delegates to `renderQuotationHtml`), and the files' own internal uses. `/workspace/apps/workers/src/jobs/render-pdf.ts:166-172` imports only the five `load*PdfData` loaders. The `tsx` files are live for their loaders and dead for their JSX.

---

## 2. What an outbound-only machine caller would need from our side

### 2.a A token issued per tenant — **VERDICT: DOES NOT EXIST**

**Complete enumeration of every token/secret/credential mechanism in the repo.** Built from three enumerations: the 24-module schema barrel `/workspace/packages/db/src/schema/index.ts:5-28`, the complete set of `process.env.*` reads across `{apps,packages,scripts}/**/*.{ts,tsx,mjs}` (one `Grep -o`, read in full), and the 3-file API route listing.

| Mechanism | Generated | Stored | Compared | Rotated |
|---|---|---|---|---|
| `tenant_settings.inbound_email_token` | `generateInboundToken()` = `randomBytes(16).toString('hex')`, `/workspace/apps/web/lib/admin/credentials.ts:44-46`. Called from `/workspace/apps/web/lib/actions/admin/create-tenant.ts:91` and `/workspace/apps/web/lib/actions/admin/inbound-token.ts:34` | `tenant_settings.inboundEmailToken` (`/workspace/packages/db/src/schema/tenant-settings.ts:60`), with a partial unique index `tenant_settings_inbound_token_uq` (lines 73-75) | **NOWHERE.** See below | Yes — `regenerateInboundToken`, `operatorAction`, `/workspace/apps/web/lib/actions/admin/inbound-token.ts:22-55` |
| `inbound_token_history` | written by the same rotation action, lines 37-41, `expiresAt = now + 7d` | `/workspace/packages/db/src/schema/inbound-token-history.ts:13-28`, indexed `(token, expires_at)` at line 26 | **NOWHERE** | n/a (it *is* the rotation record) |
| Resend webhook signature | by Resend/Svix, outside the repo | `RESEND_INBOUND_WEBHOOK_SECRET` env (both DO specs; `/workspace/.github/workflows/verify.yml:69` carries a test value) | `new Webhook(secret).verify(rawBody, {svix-id, svix-timestamp, svix-signature})`, `/workspace/apps/web/lib/email/resend-webhook.ts:56-61`. HMAC over the **raw body**, read before any parse (`route.ts:38`) | No rotation code |
| `HEALTH_TOKEN` | manually, outside the repo | env only; declared `type: SECRET` at `/workspace/.do/app.production.yaml:79` and `/workspace/.do/app.yaml:70`, with the spec comment noting it is declared but **not applied** (production.yaml:77-78) | `secretEquals` → `timingSafeEqual` over SHA-256 digests, `/workspace/apps/web/app/api/health/route.ts:240-244`; bearer extracted by `/^Bearer\s+(.+)$/i` at line 256. Fails closed when unset (lines 253-255) | No rotation code |
| Session cookie | Lucia, `/workspace/apps/web/lib/auth/lucia.ts:33-47`. Name `dealerlink_session`, `secure` from `sessionCookieSecure()`, `sameSite: 'lax'`, `domain: '.dealerlink.in'` in production | `sessions` table via `DrizzlePostgreSQLAdapter(adminDb, sessions, users)` (line 12) | `lucia.validateSession(sessionId)`, `/workspace/apps/web/lib/auth/session.ts:41`; attributes Zod-parsed at `lucia.ts:48-58` | Lucia rotates on `result.session.fresh` (`session.ts:53-60`) |
| Temporary user password | `generateTemporaryPassword()`, `/workspace/apps/web/lib/admin/credentials.ts:14-41` | argon2 hash in `users.password_hash` | `/workspace/apps/web/lib/auth/password.ts` | forced by `users.must_change_password` |
| Impersonation cookie | `dealerlink_impersonation`, `/workspace/apps/web/lib/tenant/context.ts:16, 30-32` | httpOnly cookie, value is a tenant id | re-verified against the operator role at `/workspace/apps/web/lib/actions/wrap.ts:157-166` | n/a |
| `SESSION_SECRET` | — | declared `type: SECRET` in both DO specs (`app.production.yaml:82, 192`; `app.yaml:73, 175`) | **read by no code.** It is absent from the complete `process.env.*` enumeration | — |

**The finding.** `inbound_email_token` is the closest existing thing to a per-tenant machine credential, and **it has a write path, a rotation path, a grace-window table, two indexes built for lookup, and a UI that renders the address — and no comparison site anywhere.** The evidence is an enumeration, not an empty search: `Grep` for `inboundEmailToken|inboundTokenHistory` restricted to `**/*.{ts,tsx,sql}` returned 43 lines, which I read in full. Every one is a generate, an insert, an update, a select-for-display, a seed literal, a type, an index, or a test. `processResendEvent` correlates events by `provider_message_id` instead (`/workspace/apps/web/lib/email/resend-webhook.ts:174-181`, comment at 164-166: "globally unique — no tenant scope needed"). The `(token, expires_at)` index at `inbound-token-history.ts:26` is an index for a query no code performs.

So: the pattern for *minting, storing uniquely, rotating with a grace window, and surfacing* a per-tenant secret **EXISTS and is complete**. The pattern for *presenting one and being authenticated by it* **DOES NOT EXIST** for any per-tenant secret. The only presented-secret comparison in the repo is `HEALTH_TOKEN`, which is one global value, and the only signed-request verification is Svix, whose secret is also global.

**Two further env vars declared in the DO specs and read by nothing** (same `process.env.*` enumeration): `BETTERSTACK_SOURCE_TOKEN` (`app.production.yaml:110`, `:207`) — the `@logtail/pino` transport was removed per the comment at `/workspace/apps/workers/src/observability/logger.ts:6-13` — and `PDF_EAGER_WARM` (`app.production.yaml:234`), whose reader was deleted on Day 27 per `/workspace/apps/workers/src/index.ts:73-77` ("The env var is gone with it"). Both are live-spec drift.

### 2.b An endpoint a machine polls — **VERDICT: DOES NOT EXIST**

**Complete route enumeration.** `Glob apps/web/app/**/route.ts` → **3 files**, read in full. `Glob apps/web/app/api/**/*.ts` → the same 3 plus `health/route.test.ts`. `Glob apps/web/app/**/{page,layout}.tsx` → 56 files, paths read in full; none is an API surface.

| Route | Method | Auth | Authenticates a machine? |
|---|---|---|---|
| `/api/health` (`route.ts:286`) | GET | none required; optional `Authorization: Bearer` gates the `detail` only. Rate-limited 60/min/IP by `checkRateLimit({ scope: 'health', key: ip, … })` (line 295). Excluded from middleware by the matcher at `/workspace/apps/web/middleware.ts:107` | **Partly.** A shared bearer, not a per-caller identity. No tenant scope. It is the only route that authorises a non-browser caller by a secret it holds |
| `/api/webhooks/resend` (`route.ts:35`) | POST | Svix HMAC over the raw body, `RESEND_INBOUND_WEBHOOK_SECRET`. Excluded from middleware by the same matcher | **Yes — the only one.** Route comment: "PUBLIC by necessity — Resend calls it from their infrastructure with no Dealerlink session. The Svix signature IS the authentication" (lines 12-16). Replay-protected by a unique index on `(provider, payload->>'id')` (`resend-webhook.ts:98-101, 126-134`) |
| `/api/internal/sentry-test` (`route.ts:19`) | GET | Lucia session + `ctx.user.role !== 'operator'` → **404**, not 403, "so the endpoint's existence is not disclosed" (lines 21-24) | No — a human operator session |

There is no versioned API namespace, no export endpoint, no polling endpoint, no long-poll or cursor endpoint, and no route that resolves a tenant from a credential. The middleware matcher (`middleware.ts:107`) names exactly two API exclusions: `api/health` and `api/webhooks`.

### 2.c A shape for what it returns — **VERDICT: PARTIAL (shapes exist; none is a data-export shape)**

Complete enumeration of machine-readable response shapes in the repo:

1. **`/api/health`, authorised** — `{ status, version, versionSource, checks: { db, migrations, auditTrigger, rls, resend, queue }, timestamp, uptimeSeconds, responseMs, detail: 'full' }` (route.ts:328-336). Errors are per-component, inside `checks`: each component is `{ status: 'ok'|'degraded'|'down'|'skipped', …free-form keys }` via `interface ComponentCheck { status: CheckStatus; [k: string]: unknown }` (lines 28-31). An error becomes a sibling string field `error`, a shortfall becomes `missing: string[]`, an unconfigured dependency becomes `status: 'skipped'` + `message`. **There is no error code vocabulary** — `error` is always `(err as Error).message`.
2. **`/api/health`, unauthorised** — `{ status, timestamp, detail: 'withheld' }`. The key set is pinned by test: `expect(Object.keys(body).sort()).toEqual(['detail','status','timestamp'])` (`route.test.ts:82`), with a nine-entry forbidden-substring list asserted against the **serialised** body (`route.test.ts:41-51, 76-78`) precisely so a renamed or re-nested field is still caught.
3. **`/api/health`, rate-limited** — `{ status: 'rate_limited', resetAt }`, HTTP 429 (lines 297-307).
4. **`/api/webhooks/resend`** — three shapes: `{ error: 'signature verification failed' }` + 400 (route.ts:56), `{ ok: true, duplicate: true }` (line 72), `{ ok: true }` (line 89). Note the asymmetry: a *verification* failure is a 400 with an `error` key; a *processing* failure is a 200 with `{ ok: true }` and the reason written only to `webhook_events.processing_error`.
5. **`/api/internal/sentry-test`** — `{ error: 'Not found' }` + 404, or an uncaught throw.
6. **`render-cli` stdout** — `{"ok":true, generatedDocumentId, filename, sizeBytes}` or `{"ok":false, error}` with exit 1 (`/workspace/apps/workers/src/pdf/render-cli.ts:62, 72`). One JSON line, newline-terminated.
7. **Server Action results** — `ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: AppErrorCode; message: string } }` (`/workspace/apps/web/lib/actions/wrap.ts:15-17`). **This is the only coded error vocabulary in the repo**; codes seen in use include `VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `READ_ONLY`, `INTERNAL` (`/workspace/apps/web/lib/errors.ts`). Two properties matter for a machine caller: a non-`AppError` throw is normalised to a generic `INTERNAL` message with an 8-hex-char `ref:` derived from the request id (`wrap.ts:99-103`), and the real error is sent to `reportError` (line 97) — so the caller gets a correlation handle and no detail. But the transport is React Server Actions, not HTTP+JSON, and it is reachable only with a session cookie.

Three distinct error idioms coexist: `{ ok, error: { code, message } }` (actions), `{ error: string }` + HTTP status (webhook/sentry-test), and `{ status, …, error?: string }` per component (health). Nothing reconciles them.

---

## 3. Where tenant scoping breaks when the caller is a machine

**VERDICT: EXISTS — three distinct non-session scoping mechanisms, all of which pay for themselves with RLS bypass except one.**

The GUC contract: `/workspace/packages/db/src/rls/00-helpers.sql:11-19` defines `app_current_tenant()` = `NULLIF(current_setting('app.tenant_id', true), '')::uuid` and `app_current_user()` likewise. Policies read those. `/workspace/packages/db/src/rls/00-app-role.sql:20` creates `dealerlink_app LOGIN NOSUPERUSER NOBYPASSRLS` and its comment states the invariant: "RLS only applies to non-superuser, non-BYPASSRLS roles, so the application MUST use this role at runtime."

Two clients, two roles — `/workspace/packages/db/src/client.ts`:
- `db` (lines 82-89) → `DATABASE_URL` → `dealerlink_app`, **RLS enforced**. Comment at 80: "Always set `app.tenant_id` inside a transaction before tenant-scoped queries."
- `adminDb` (lines 99-106) → `DATABASE_DIRECT_URL ?? DATABASE_URL` → `dealerlink` / `doadmin`, **SUPERUSER, BYPASSRLS**. Comment at 92-96: "Reserved for trusted server-side code that genuinely needs to cross tenant boundaries… Never expose its results to client-side code without an explicit tenant check."

**Which tables RLS even covers — affirmative enumeration.** `Glob packages/db/src/rls/*` → 28 files: 2 setup (`00-app-role.sql`, `00-helpers.sql`) and **26 table policy files**, which I read as a list. Absent from that list, and therefore carrying **no RLS at all**: **`tenants`**, **`sessions`**, **`rate_limit`**. (`/workspace/apps/web/lib/tenant/context.ts:108-109` states the same for `tenants` in a comment, and `getTenantById` at lines 112-124 relies on it, querying `tenants` on the RLS-enforced `db` client with no GUC set and succeeding.) Also note: `Grep` for `ENABLE ROW LEVEL SECURITY` across `/workspace/packages/db/migrations` returned **zero** hits — RLS is not in the 22 drizzle migration SQL files at all; it is applied by the custom runner `/workspace/packages/db/src/migrate.ts:48-52`, which `readdirSync`-sorts and `client.unsafe()`-applies every `.sql` in `src/rls/`, then every `.sql` in `src/triggers/` (one file, `audit-log.sql`).

### 3.1 pg-boss jobs

**The tenant travels in the payload. Nothing validates it.**

- `RenderPdfPayload = { documentType, documentId, tenantId, userId }` — `/workspace/apps/workers/src/jobs/render-pdf.ts:103-110`. `runRenderPdf` calls `withTenant(payload.tenantId, async (tx) => { … }, { userId: payload.userId })` (lines 138-210). **This is the only job that sets the GUC**, and it does it from an unverified payload field: whoever can enqueue chooses the tenant.
- `EmailJobPayload = { tenantId, emailLogId }` — the handler does **not** use `withTenant`. `/workspace/apps/workers/src/email/handler.ts` performs eight `adminDb` operations (lines 49, 76, 87, 100, 108, 133, 149, 157) with no GUC anywhere. Its compensating control is an explicit application-level check: `if (row.tenantId !== payload.tenantId) { … status: 'failed', errorMessage: 'Job tenant does not match the log row' … return { status: 'failed', …, reason: 'tenant_mismatch' } }` (lines 86-92). Attachment loading is scoped by an explicit `and(eq(generatedDocuments.tenantId, tenantId), eq(generatedDocuments.id, docId))` (line 52) — a hand-written predicate standing in for the policy.
- `validity-expiry` — `/workspace/apps/workers/src/jobs/validity-expiry.ts:44-57`: two `adminDb` UPDATEs with **no tenant predicate at all**, deliberately cross-tenant, `.returning({ tenantId })` to attribute afterwards. The header comment states it: "Runs as the BYPASSRLS workers role across all tenants in one statement; the per-row audit trigger… records each expiry (system-attributed — no acting user)."
- `pdf-cleanup` — `/workspace/apps/workers/src/jobs/pdf-cleanup.ts:29-39`: same shape, cross-tenant `adminDb` UPDATE, no GUC, no tenant predicate.

**Cost:** two of four jobs bypass RLS entirely with no tenant predicate (by design, for cross-tenant sweeps); one bypasses RLS and compensates with a hand-written equality check plus an id-mismatch guard; one uses `withTenant` and therefore gets RLS, but trusts an attacker-chosen `tenantId` if the enqueue path is ever reachable by an untrusted caller. Audit attribution survives in all four, because `withTenant` sets `app.user_id` and the trigger reads `app_current_user()` (`/workspace/packages/db/src/triggers/audit-log.sql:75`); for the two sweeps it is NULL and the row is system-attributed.

### 3.2 The seeds

**Build their own client on the superuser URL, then set the GUC by hand for the trigger's benefit, not for RLS's.**

- `/workspace/packages/db/src/seeds/index.ts:24` — `const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;` then `drizzle(postgres(url), { schema, casing: 'snake_case' })`. The same two lines recur in every seed entry point: `day5.ts:26`, `day6.ts:40`, `day7.ts:38`, `day8.ts:40`, `day11.ts:49`, `day12.ts:52`, `day13.ts:56`, `client-demo.ts:97`, `multi-rate.ts:103`, `third-party-delivery.ts:70`, `dealer-addresses.ts:41`, `pin-created-at.ts:53` (complete list, from the `process.env.*` enumeration). `smoke-auth.ts:22` reads `DATABASE_URL` only. `seeds/invoices.ts:44` imports `adminDb` directly.
- The GUC is set manually inside the transaction — `/workspace/packages/db/src/seeds/day13.ts:152-156`:
  ```ts
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as DrizzleTx;
    await rawTx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await rawTx.execute(sql`SELECT set_config('app.user_id', ${actorId}, true)`);
    await rawTx.execute(sql`SELECT set_config('app.read_only', '', true)`);
  ```
  and every `WHERE` still carries `tenant_id = ${tenantId}` explicitly (e.g. line 165) because the policy is not enforcing anything for this role.

**Cost:** full RLS bypass. The GUCs are set so the audit trigger attributes correctly and so the seed looks like the application, not because they constrain anything. Every scope is a hand-written predicate.

### 3.3 `adminDb`

**Complete enumeration of non-test `adminDb` call sites** (`Grep` for `adminDb` over `{apps,packages}/**/*.{ts,tsx}`, unlimited, read in full; test files excluded by hand from the same list):

| Site | What establishes scope | Cost |
|---|---|---|
| `/workspace/apps/web/lib/auth/lucia.ts:12` | nothing — by-primary-key lookup before tenant is known. Comment lines 8-11: "session validation must look up the user row by id BEFORE we know which tenant context to set" | bypass; justified on "no enumeration risk" |
| `/workspace/apps/web/app/api/health/route.ts:57,68,80,96,166` | nothing — catalog/system queries | bypass; no tenant data touched |
| `/workspace/apps/web/lib/email/resend-webhook.ts:115,140,174,228` | nothing — correlation by globally-unique `provider_message_id` | bypass; the webhook has no tenant identity until the row matches |
| `/workspace/apps/web/app/admin/page.tsx:24-38`, `admin/tenants/page.tsx:16`, `admin/tenants/[id]/page.tsx:25-52`, `admin/tenants/[id]/users/page.tsx:22-25` | operator session + `/admin` layout gate + middleware operator-scope gate | bypass, intentional. Comment at `admin/page.tsx:19`: "adminDb bypasses RLS — necessary for cross-tenant metrics" |
| `/workspace/apps/workers/src/email/handler.ts` ×8, `jobs/validity-expiry.ts` ×2, `jobs/pdf-cleanup.ts` ×1 | see §3.1 | bypass |
| `/workspace/apps/workers/scripts/resolve-document.ts:85` | CLI arg | bypass |
| `/workspace/packages/db/src/seeds/invoices.ts` ×9 | hand-written `tenant_id` predicates | bypass |

### 3.4 The PDF render path — the closest existing "machine does work for one tenant"

`/workspace/apps/workers/src/jobs/render-pdf.ts:138` is the single clean precedent: `withTenant(payload.tenantId, …, { userId: payload.userId })`, with the whole body — loader, `resolveGeneratedAt`, `buildViewModel`, `storeRenderedPdf` — running on the `tx` inside it. RLS is **enforced** here (it is the `db` client; `withTenant` is built on `db.transaction` at `/workspace/packages/db/src/with-tenant.ts:87`), the audit trigger sees `app.user_id`, and `storeRenderedPdf` writes under policy.

Three details a machine caller inherits:
- `withTenant` consults a globally-registered read-only resolver (`with-tenant.ts:39-66, 86`). Outside a request it must return false; `forcedReadOnly()` catches a throwing resolver and returns `false` — the comment at 61-65 says a faulty resolver "must never grant write access", and the fail-safe direction is "not forced", i.e. **writes remain allowed**. A worker or an agent-facing path gets no read-only protection from this mechanism.
- The GUCs are set with `set_config(..., true)` — transaction-local, so nothing leaks back to the pool (`with-tenant.ts:97-101`, comment at 73-74).
- The read layer is already session-free. `/workspace/apps/web/lib/queries/generated-documents.ts:51, 76` — `return tx ? run(tx) : withTenant(tenantId, run);` — takes a `tenantId` parameter and opens its own scope if no transaction is supplied. A caller that can produce a trusted tenant id can use the query helpers unchanged. **What does not exist is anything that establishes that the tenant id is trusted** outside `requireRole` → `auth.user.tenantId` (`/workspace/apps/web/lib/actions/wrap.ts:168-172`).

### 3.5 Anything else

- **`withOperator`** — `/workspace/packages/db/src/with-tenant.ts:123-136`. Sets `app.tenant_id` to the **empty string**, which `app_current_tenant()` turns into NULL, so every tenant policy evaluates `tenant_id = NULL` → no rows. Operator actions that need tenant rows re-set the GUC by hand mid-transaction: `bindTenantContext` at `/workspace/apps/web/lib/actions/admin/inbound-token.ts:13-15` is the pattern — an `operatorAction` reaching into one tenant by issuing its own `set_config`. It runs on the RLS-enforced `db` client, so this is the one non-session-authenticated path that **keeps** RLS while choosing a tenant.
- **`getTenantContext`** — `/workspace/apps/web/lib/tenant/context.ts:71-79`: a bare `db.transaction` + `set_config('app.tenant_id', …)` to read `tenant_settings`, scoped from the middleware-supplied `x-dealerlink-tenant-slug` header, with no session involved at that point. The slug→id resolution before it (`resolveTenantBySlug`) works without any scope because `tenants` has no RLS.
- **The middleware is edge-only and string-only** (`/workspace/apps/web/middleware.ts:7-13`): it cannot resolve a Lucia session (DEV.68), so it contributes host/slug headers and nothing else. Its matcher excludes `api/health` and `api/webhooks`.
- **Rate limiting** is keyed by `${scope}:${key}` on the RLS-free `rate_limit` table via the `db` client (`/workspace/apps/web/lib/rate-limit.ts:31-55`), and **fails open** on DB error (lines 51-54). `/api/health` keys it on an IP derived from `x-forwarded-for` (route.ts:291-294).

---

## 4. What exists of Tally integration — **VERDICT: DOES NOT EXIST**

### Directories enumerated to establish the search space

- `Glob apps/*/package.json` → **2** workspaces: `apps/web`, `apps/workers`.
- `Glob packages/*/package.json` → **4** packages: `design-tokens`, `db`, `schemas`, `tax`. No fifth package.
- `Glob apps/workers/src/**/*.ts` → **24** files, full list read. Modules: `email/`(2), `jobs/`(3), `lib/`(2), `observability/`(5), `pdf/`(6), `queue/`(1), `templates/`(4), `index.ts`. No integration, agent, tally, xml or export module.
- `Glob apps/web/app/**/route.ts` → **3**. `Glob apps/web/app/**/{page,layout}.tsx` → **56**, paths read.
- `/workspace/packages/db/src/schema/index.ts:5-28` — the one allowed barrel, read in full: **24 exported schema modules** (`tenant`, `tenant-settings`, `user`, `session`, `document-counter`, `audit-log`, `auth-events`, `access-log`, `rate-limit`, `email-delivery-log`, `webhook-events`, `inbound-token-history`, `dealer`, `dealer-address`, `product`, `inventory`, `deal`, `quotation`, `performa-invoice`, `order`, `invoice`, `payment`, `dispatch`, `generated-document`). **None is a Tally, integration, sync, outbox, mapping or export module.**
- `/workspace/packages/schemas/src/index.ts:1-13` — **13 exported modules**. None Tally-related.
- `/workspace/packages/schemas/src/email.ts:15-21` — the complete queue set: `send-email`, `render-pdf`, `validity-expiry`, `pdf-cleanup`. **No Tally queue, no sync queue, no outbox queue.**
- `Glob packages/db/migrations/**` → **22** `.sql` migrations (`0000`–`0021`) + snapshots. `Glob packages/db/src/rls/*` → **26** table policy files. No Tally table in either.
- `Glob {apps,packages}/*/tests/**/*.ts` → 37 files; `Glob apps/web/tests/e2e/*.ts` → 31 files. Both lists read in full. **No Tally test.**

### Term-by-term hits

**`Tally`/`tally`** — `Grep [Tt]ally` over `**/*.{ts,tsx,sql,json,js,mjs,yml,yaml}`, unlimited, read in full. Every hit classified:

| Hit | Class |
|---|---|
| `apps/workers/src/jobs/validity-expiry.ts:30,49,57` — `function tally(…)` and two calls | **(d) unrelated** — the English verb; a per-tenant counter helper |
| `apps/workers/tests/setup-env.ts:5` ("incidentally"), `packages/db/tests/place-of-supply-invariant.test.ts:189` ("accidentally"), `packages/schemas/src/email.ts:69` ("accidentally") | **(d) unrelated** — substring of adverbs |
| `packages/tax/src/round.ts:10` — "standard accounting software (Tally, Zoho)" | **(a) comment/doc mention** |
| `packages/tax/src/summary.ts:75` and `packages/tax/tests/summary.test.ts:41` — "cannot resolve a Tally ledger, which is what F.11 needs the table for" | **(a) comment mention** of a future requirement |
| `apps/web/lib/reports/gst-summary.ts:36` — "Tally ledgers are organised on, and they carry no tax amounts" | **(a) comment mention** |
| `apps/web/lib/actions/invoices/round-off.test.ts:175` — "their Tally voucher carries" | **(a) comment mention** of client evidence |
| `docs/stage-f-tasks.json:244,253,262,339,1369,1679` + ~20 omitted long lines | **(a) plan rows** — F.11, F.148, F.154 |

Zero **(b)** placeholders and zero **(c)** real code.

**`XML`/`xml`** — `Grep \b[Xx][Mm][Ll]\b` over `**/*.{ts,tsx,sql,js,mjs,yml,yaml,typ}`, unlimited, read in full: **8 hits, all the MIME type `image/svg+xml`** — `apps/workers/scripts/render-typst.ts:165,167`, `apps/workers/src/pdf/view-model.ts:218`, `apps/web/app/admin/tenants/[id]/tenant-detail-sections.tsx:636,649,652,705`, one long line in `apps/workers/scripts/branded-tenant-fixture.sql:24`. **(d) unrelated.** No XML builder, no XML serialiser, no XML dependency in application code.

**Port `9000`** — `Grep 9000` over `**/*.{ts,tsx,sql,js,mjs,yml,yaml,json,typ,md}`, unlimited, read in full. Code hits: `packages/db/src/seeds/day6.ts:130` (`% 9000000`, serial generation), `packages/db/src/seeds/day5.ts:216` (`9000000000 +`, phone numbers), `packages/tax/tests/compute.test.ts:145,191,473,728` (money and percentage literals) — all **(d) unrelated**. Doc hits: `docs/PLAN_REVISION_PARITY_LIST.md:92,96,99`, `docs/stage-f-tasks.json:1679` and three omitted long lines, `DEVIATIONS.md:6403` (a byte offset) — **(a) plan/doc**. Plus `.vitest-report.json` and `PROJECT_PLAN.md` generated artefacts.

**`voucher`** — `Grep [Vv]oucher`, 20 files. Code files: `apps/workers/tests/invoice-render.test.ts`, `apps/workers/src/templates/invoice.tsx`, `apps/web/lib/actions/invoices/round-off.ts`, `round-off.test.ts`, `packages/db/src/seeds/multi-rate.ts`. All **(a) comment mentions** of the client's Rs 557.02 reference voucher (CLAUDE.md `docs/CLIENT_CONTEXT.md` context) — I spot-checked `round-off.test.ts:175` and it is a comment. There is no `voucher` identifier, table, column or type: `voucher` is absent from the 24-module schema barrel and from the 13-module schemas barrel.

**`ledger`** — `Grep [Ll]edger` over `**/*.{ts,tsx,sql,js,mjs,yml,yaml,typ}`, unlimited, read in full: **4 hits**, all comments — `apps/web/lib/reports/gst-summary.ts:36`, `apps/web/tests/e2e/verify-day-f55.spec.ts:8` ("Option A's ledger", unrelated metaphor), `packages/tax/src/summary.ts:75`, `packages/tax/tests/summary.test.ts:41`. **(a)**. No `ledger` table, column or type.

**`stock item`/`stockitem`** — `Grep [Ss]tock[ _]?[Ii]tem`, repo-wide, unlimited, read in full: **8 hits, zero in code** — `docs/STAGE_F_BUILD_v3.md:217`, `docs/PLAN_REVISION_PARITY_LIST.md:108,221`, `docs/COMMERCIAL.md:293`, `docs/stage-f-tasks.json:249` + one omitted long line, `PROJECT_PLAN.md:126,196` (generated). **(a)**.

**Doc claim, labelled as such.** `docs/PLAN_REVISION_PARITY_LIST.md:92-108` describes the Tally HTTP interface (port 9000, no authentication, `localhost:9000`) and the F.148 read-path split; `docs/stage-f-tasks.json:1369` and `:1679` carry the F.148 rows. These agree with the verdict that nothing is built. I reached DOES NOT EXIST from the ten enumerations above, not from them.

---

## 5. What I could NOT determine

**Things my instruments cannot reach at all:**

1. **Whether `tenants`, `sessions` and `rate_limit` actually lack RLS in the live databases.** I established it from the complete 26-file `src/rls/` listing and from `migrate.ts` applying exactly that directory. If a policy was ever applied out-of-band by `doctl`/psql, I would not see it. The live check exists — `rlsCheck` at `route.ts:94-118` — but it only tests the six names in `EXPECTED_RLS_TABLES` (lines 33-40), which does not include those three, so even the running system does not answer this.
2. **Whether `dealerlink_app` really is `NOBYPASSRLS` on the managed clusters.** `00-app-role.sql:28-41` contains an explicit escape hatch: if `ALTER ROLE` raises `insufficient_privilege` it `RAISE NOTICE`s and continues, "assuming role was created with correct attrs". On DO Managed Postgres that exception path is the expected one. A role created wrong would be silently tolerated.
3. **Whether `HEALTH_TOKEN` is set on either DO app.** The spec declares it with no value and the comment at `app.production.yaml:77-78` says explicitly "DECLARED HERE, NOT APPLIED". `merge-status.mjs` would report "detail withheld" either way. I cannot `curl`.
4. **Whether `SENTRY_DSN`, `AXIOM_TOKEN`, `RESEND_API_KEY`, `RESEND_INBOUND_WEBHOOK_SECRET` are set, valid, or scoped as the code assumes.** The `restricted_api_key` branch at `route.ts:144-153` encodes a belief about the production key's scope that only a live call confirms.
5. **Actual timeout behaviour of the four unbounded `/api/health` checks, the unbounded Resend `fetch`, and the unbounded `execFileSync(typst)`.** I can state that no timeout is configured in code; I cannot state what Node, postgres-js, the DO load balancer or the DO health-check `timeout_seconds: 5` do first. The 5-second DO health check against an endpoint with four unbounded queries is a real interaction I cannot measure.
6. **What `pg-boss.send()` returns `null` for in v10.** I report that both call sites discard it and that the wrappers type it `string | null`; I did not read the pg-boss source or lockfile to establish the exact null conditions.
7. **Anything requiring the client's environment**: whether their TallyPrime HTTP interface is reachable, what it returns on an empty ledger list versus an error, whether it distinguishes the two at all, what their ledger and stock-item names are, and whether a VPS beside it can reach `dealerlink.in` outbound.
8. **Runtime behaviour of the `withTenant` read-only resolver outside a request.** `with-tenant.ts:37` asserts "Outside a request (workers, seeds, cron) the resolver must return false" — I found the registration mechanism (`setReadOnlyResolver`) and the fail-safe catch, but I did not trace where the web app registers it, so I cannot confirm whether a resolver is ever installed in a process that also runs non-request work.

**Where my instrument might have lied to me:**

9. **Every claim above that rests on a `Grep` whose output I read as a complete population** is only as good as ripgrep's traversal of untracked and ignored files. I have no `git grep` to cross-check, so I cannot confirm whether any Tally-related work exists in a path excluded by `.gitignore` or `.rgignore`. My mitigation was to prefer `Glob` directory listings and barrel files — which are positive evidence — for every structural negative, and to use `Grep` for term hunting only. The DEV.117 NUL-byte failure mode specifically affects the shell `grep` shim, which I have no Bash to reach; my `Grep` is ripgrep-backed. But I cannot *prove* from inside this session that it enumerated everything.
10. **Three `Grep` results were truncated as "Omitted long matching line"** — specifically in `docs/stage-f-tasks.json`, `PROJECT_PLAN.md` and the `.vitest-report.json` files. I classified those as plan/doc/generated without reading the full lines. If a Tally **implementation path** were named inside one of those long JSON lines I would have seen the filename only if it happened to fall in the visible prefix. This does not affect the code verdict (established by directory enumeration), but it means I cannot claim to have read the plan rows in full.
11. **`inboundEmailToken` enumeration was glob-restricted** to `**/*.{ts,tsx,sql}`. A comparison site written in `.mjs`, `.js`, or SQL outside that pattern would have been missed. I consider this low risk — `Glob scripts/*.{ts,mjs,js}` returned 13 files, none email- or token-comparison related — but it is a restriction, not a universe.
12. **I did not read the 56 page/layout files.** I read their paths. A machine-polled data surface implemented as a `page.tsx` returning JSON would not have been found by that enumeration. I judge it implausible but it is unverified.
13. **I did not read `docs/PLAN_REVISION_PARITY_LIST.md`, `docs/stage-f-tasks.json`, `docs/COMMERCIAL.md` or `docs/STAGE_F_BUILD_v3.md`.** I saw fragments via grep. If the operator wants the existing F.148 scoping prose reconciled against this audit, that is a separate read I did not perform.

**A documentation inaccuracy I found while auditing, reported as a finding rather than acted on:** `/workspace/apps/web/app/api/health/route.ts:22-23` claims every check runs behind its own timeout and that the worst case is bounded by the 3s Resend ping. Four of the six checks have no timeout. The comment is load-bearing for anyone sizing the DO `timeout_seconds: 5`.

<!-- prettier-ignore-end -->
