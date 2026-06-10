# Pilot Monitoring — how to keep an eye on a live tenant

> Audience: Dealerlink operators supporting a live pilot (currently UMA TRADING
> COMPANY / `umatrading`). This explains the three ways to observe a tenant, when
> to use each, and the privacy line we hold.

## Privacy principle (read first)

A pilot's commercial data — their dealers, prices, quotations, orders, payments —
**is theirs**. We look at it for **support and oversight**, never to browse
casually. Prefer the least-intrusive tool that answers the question:
metrics/logs before record contents; the audit trail before opening their
workspace. Every time you open a tenant's workspace it is **logged** (operator
id, tenant, time — entry and exit). Treat that log as something the customer
could ask to see.

We also keep it honest by construction: the operator view is **read-only** and
**cannot be turned into a write** (see "Read-only guarantee" below and ADR-014).

---

## The three tools, least- to most-intrusive

### 1. Observability — Axiom / Sentry / Better Stack (no tenant data)

Use **first** for "is the app healthy / did something error / is it up?".

- **Axiom** — structured app logs (request ids, tenant id, route, errors). Good
  for "did their PDF render fail", "are emails sending", latency.
- **Sentry** — exceptions with tenant/user/route tags (PII scrubbed). Good for
  "did they hit a bug", stack traces.
- **Better Stack** — uptime pings on `/health` (free tier ~3 min, see DEV.76).

These show **behaviour and health**, not record contents. Reach for them for
anything that isn't "I need to see the actual data they entered".

### 2. Audit log — who did what, when (metadata, not a data browser)

Use to answer "what changed and who changed it", and "who (which operator)
viewed this tenant and when".

- `audit_log` — every INSERT/UPDATE/DELETE on tenant tables, with actor, IP, UA,
  and before/after (secrets redacted). Tenant-scoped.
- `access_log` — sensitive **views** + operator access events:
  - `operator_impersonation_view` — an operator opened the tenant workspace
  - `operator_impersonation_exit` — and left it

Query "which operator viewed this tenant, and for how long":

```sql
SELECT al.accessed_at, al.action, u.email AS operator, al.ip, al.user_agent
FROM access_log al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.tenant_id = '<tenant-uuid>'
  AND al.action IN ('operator_impersonation_view', 'operator_impersonation_exit')
ORDER BY al.accessed_at DESC;
```

(Run via the admin DB connection / `psql`; access_log is tenant-scoped under RLS.)

### 3. "Enter workspace" — the read-only operator view (most intrusive)

Use **only** when you genuinely need to see what the tenant sees — e.g. "they
say their quotation total looks wrong", "walk me through what they created",
hands-on support. This opens **their actual workspace**, read-only.

**How:**

1. Operator console → **Tenants** → open the tenant → **Enter workspace**.
2. You land in the tenant's app with a persistent amber banner:
   **"Operator impersonation — viewing &lt;tenant&gt; as read-only. Mutations are
   blocked."**
3. Browse their dealers, pipeline, quotations, orders, payments, dispatches —
   exactly as they're laid out for the tenant.
4. **Exit impersonation** (button in the banner) returns you to the operator
   console and clears the session.

**What you can and cannot do:**

- ✅ Read every record the tenant can see.
- ❌ Create/edit/delete anything — every action is refused with a read-only
  error.
- ❌ Generate/download PDFs or send emails from the view — these are state
  changes (they enqueue a job + write a document), so they're blocked too. To
  inspect a document, look at what they already generated, or ask them.
- ❌ See any **other** tenant — the view is scoped to the one tenant you entered
  (and that entry is the one that was audited).

**This is logged.** Entering writes an `operator_impersonation_view` row;
exiting writes `operator_impersonation_exit`. Don't enter "just to look around".

---

## Read-only guarantee (why this is safe) — ADR-014

The view deliberately crosses the tenant-isolation boundary, so it's defended in
depth and never weakens isolation for anyone else:

- **App layer:** while impersonating, every tenant write-action is refused
  before it runs (so nothing — not even an async PDF/email enqueue — fires).
- **Database layer:** every query the operator makes runs in a
  `SET TRANSACTION READ ONLY` transaction, so Postgres itself refuses any write
  on any table, regardless of code path.
- **No special powers:** the view reads through the same restricted DB role
  (`dealerlink_app`, no RLS bypass) scoped to the tenant — exactly like a tenant
  user. There is no superuser/BYPASSRLS path.
- **Isolation intact:** normal tenant users are completely unaffected; one
  tenant still can never see another.

If you ever find a way to change data from inside the read-only view, that's a
security bug — **stop and report it**, don't use it.

---

## Quick decision guide

| You want to know…                            | Use                               |
| -------------------------------------------- | --------------------------------- |
| Is the app up / erroring / slow?             | Better Stack, Sentry, Axiom       |
| Did a specific action fail / why?            | Axiom (logs), Sentry (trace)      |
| What changed, and who changed it?            | `audit_log`                       |
| Which operator viewed this tenant, when?     | `access_log` (impersonation rows) |
| What does the tenant actually see on screen? | **Enter workspace** (read-only)   |
