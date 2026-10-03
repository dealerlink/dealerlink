# Logging Surface — All 8 Streams

> **Scope:** Mandatory logging streams, schemas, retention, and the `/health` contract. Back to [CLAUDE.md](../CLAUDE.md).

These are mandatory. Each has its own table (or external system) and writer pattern.

| #   | Log                                       | Storage  | Written by                                               | Retention                   |
| --- | ----------------------------------------- | -------- | -------------------------------------------------------- | --------------------------- |
| 1   | **Domain audit** (`audit_log`)            | Postgres | Postgres triggers on Order, Payment, Dispatch, Inventory | Forever                     |
| 2   | **Email content** (`email_log`)           | Postgres | Outbound from app, inbound from Resend webhook           | Forever                     |
| 3   | **Auth events** (`auth_events`)           | Postgres | Lucia hooks: login, logout, failed pwd, pwd change       | 1 year                      |
| 4   | **Email delivery** (`email_delivery_log`) | Postgres | Worker render+send pipeline + Resend webhook handler     | 90 days                     |
| 5   | **Sensitive access** (`access_log`)       | Postgres | Next.js middleware on dealer/payment/export routes       | 1 year                      |
| 6   | **Document generation** (`document_log`)  | Postgres | Worker writes after each PDF render                      | Forever (GST audit)         |
| 7   | **App stdout/stderr**                     | Axiom    | `pino` logger piped from both Node processes             | 30 days                     |
| 8   | **Errors**                                | Sentry   | Sentry SDK in both processes                             | 30–90 days (Sentry default) |

## `audit_log` schema

```ts
export const auditLog = pgTable('audit_log', {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(), // 'order' | 'payment' | ...
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(), // 'create' | 'update' | 'delete'
  before: jsonb('before'), // null on create
  after: jsonb('after'), // null on delete
  changedBy: uuid('changed_by'),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
  // ip, user agent for traceability
  ip: text('ip'),
  userAgent: text('user_agent'),
});
```

Implement via Postgres triggers — application code does not write directly. This guarantees no audit gaps if a developer forgets to log.

## `access_log` write pattern

A Next.js middleware at `app/(app)/dealers/[id]/middleware.ts` (or equivalent route handler logic) writes a row when:

- A dealer detail page is viewed
- A payment record is viewed
- A CSV/Excel export is downloaded
- A dispatch is opened

Don't log every page hit — only sensitive surfaces.

## `/health` endpoint contract

> **F.176 (2026-10-03) — THE DETAIL IS NOW BEHIND A BEARER TOKEN.** An
> unauthenticated caller — which includes the Better Stack uptime monitor and the
> DO App Platform health check — receives only:
>
> ```json
> { "status": "ok", "timestamp": "2026-10-03T...", "detail": "withheld" }
> ```
>
> with the same HTTP code as before (200, or 503 when `status` is `down`). **The
> checks all still run**; only the serialisation changes, so the monitor's
> contract is unchanged.
>
> The full body below requires `Authorization: Bearer $HEALTH_TOKEN`, matching
> the `HEALTH_TOKEN` env on the web component. **It fails closed:** with the env
> unset, nobody gets the detail.
>
> **Why:** `rls.missing` and `auditTrigger.missing` are named arrays of tables
> lacking tenant isolation or an audit trail. They are empty when nothing is
> wrong and non-empty exactly when something is — so the endpoint published a map
> of unprotected tables at the moment it was most useful to an attacker. A field
> that leaks only when you are vulnerable is worse than one that always leaks.
>
> **Also changed:** `version` no longer falls back to the literal `"dev"`. It is
> the real build identifier when `SENTRY_RELEASE` or `NEXT_PUBLIC_GIT_SHA` is
> set, and otherwise `null` with `versionSource: "unset"` — because production
> reported `"dev"`, which is a claim about the environment rather than a fact
> about the build.

```ts
// app/api/health/route.ts
GET /api/health → 200 OK with JSON:
{
  "status": "ok" | "degraded" | "down",
  "checks": {
    "db": { "ok": true, "latencyMs": 12 },
    "queue": { "ok": true, "depth": 3, "oldestJobAgeSeconds": 8 },
    "worker": { "ok": true, "lastHeartbeatSeconds": 4 },
    "inboundEmail": { "ok": true, "lastReceivedSeconds": 1200 }
  },
  "version": "<git-sha>",
  "timestamp": "2026-05-07T..."
}
```

Worker writes a heartbeat to a `worker_heartbeat` row every 30s. Health endpoint checks the timestamp.
