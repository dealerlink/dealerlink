# SETUP.md — Dealerlink Local Development Setup

> **Purpose:** Get a fresh machine ready to develop Dealerlink using the
> project's dev container. The container carries the entire toolchain (Node,
> pnpm, Postgres client, Chromium, doctl, …) so your host only needs Docker,
> VS Code, and Git.
>
> **Time required:** 15–30 minutes, most of it the first container build.
>
> **Companion files:**
>
> - `CLAUDE.md` — implementation guide
> - `README.md` — project overview and daily commands
> - `.devcontainer/` — dev container definition (image, services, secrets mount)
> - `docker-compose.yml` — Postgres + pgAdmin service definitions
> - `.env.example` — environment variable template

---

## Prerequisites

Everything is provisioned inside the dev container, so the host machine needs
only three things:

| Tool                         | Required version | Why                                                                        |
| ---------------------------- | ---------------- | -------------------------------------------------------------------------- |
| **Docker Desktop**           | Any recent       | Builds and runs the dev container + Postgres/pgAdmin services              |
| **VS Code**                  | Any recent       | Editor that drives the container                                           |
| **Dev Containers extension** | Any recent       | `ms-vscode-remote.remote-containers` — opens the repo inside the container |
| **Git**                      | Any recent       | Clone the repo on the host before opening it in the container              |

Install the Dev Containers extension from the VS Code Marketplace (search
"Dev Containers", publisher **Microsoft**), or from the command line:

```bash
code --install-extension ms-vscode-remote.remote-containers
```

Everything else — Node 20.18.0, pnpm 9.15.9, Postgres 16 client (`psql`,
`pg_dump`), Chromium for Puppeteer/Playwright, `doctl`, `jq`, and the Claude
Code CLI — comes baked into the image (`.devcontainer/Dockerfile`). Do **not**
install Node, pnpm, or a Node version manager on the host; the pinned versions
live in the image and are guaranteed to match production.

> **macOS note:** Docker Desktop is the reference host. The container is
> Linux (`node:20.18.0-bookworm-slim`) regardless of host OS, so the dev
> experience is identical whether the host is macOS, Linux, or Windows.

---

## Project Setup

### 1. Clone the repository (on the host)

```bash
git clone git@github.com:<your-username>/dealerlink.git
cd dealerlink
```

If SSH isn't configured, use HTTPS:

```bash
git clone https://github.com/<your-username>/dealerlink.git
```

### 2. (Optional) Place production/staging secrets on the host

The container mounts `~/.dealerlink` from the host **read-only** at
`/home/node/.dealerlink` (see `.devcontainer/docker-compose.yml`). This is only
needed for the deploy/ops runbooks (R17–R20) that read
`$DEALERLINK_SECRETS/<env>-secrets.txt`. Day-to-day feature work does not need
it — skip this step if you're not touching production infra.

If you do need it, create the directory on the host so the mount has something
to bind:

```bash
mkdir -p ~/.dealerlink
# drop staging-secrets.txt / production-secrets.txt here (never commit them)
```

`$DEALERLINK_SECRETS` defaults to `~/.dealerlink`; override it only if you keep
the files elsewhere.

### 3. Open the repo in the container

1. Open the cloned folder in VS Code (`code .`).
2. VS Code detects `.devcontainer/` and prompts **"Reopen in Container"** —
   click it. (Or run **Dev Containers: Reopen in Container** from the command
   palette, `F1`.)

On the first open, VS Code builds the image and starts the Compose project.
This pulls the base image, installs the toolchain, and starts two service
containers:

- `dealerlink-postgres` — Postgres 16 (health-checked; the app container waits
  for it)
- `dealerlink-pgadmin` — pgAdmin UI

When the container is ready, VS Code runs the `postCreateCommand` automatically:

```
pnpm install --frozen-lockfile && pnpm playwright:install
```

That installs all workspace dependencies and the Playwright browsers. First run
takes a few minutes; subsequent opens are fast because the pnpm store,
Playwright cache, and Claude config live in named volumes that survive rebuilds.

**All commands from here on run in the VS Code integrated terminal, which is a
shell _inside_ the container.**

### 4. Configure environment variables

Copy the template:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

1. **Database URLs.** The template already points at hostname **`postgres`** (the
   Compose service name, reachable from inside the container) — so no change is
   needed for the default containerized setup. Only if you run Postgres directly
   on the host instead should you switch `postgres` back to `localhost`.

2. **Generate a session secret** (`openssl` is on PATH in the container):

   ```bash
   openssl rand -hex 32
   ```

   Paste the result over `replace_with_64_char_hex_string` in `SESSION_SECRET`.

3. Add your **Resend API key**: `RESEND_API_KEY=re_xxxxxxxx` (from
   https://resend.com/api-keys).

4. Add your **Sentry DSN** if you want error capture locally
   (`SENTRY_DSN=` / `NEXT_PUBLIC_SENTRY_DSN=`); the SDKs no-op cleanly when
   blank, so this is optional for dev.

5. Generate a **Resend inbound webhook secret** (`RESEND_INBOUND_WEBHOOK_SECRET`):

   ```bash
   node -e "console.log('whsec_' + require('crypto').randomBytes(32).toString('base64url'))"
   ```

   This server-only secret signs/verifies inbound Resend webhook events
   (delivery, bounce, open, click). In **local dev** any generated value
   works — the webhook integration tests sign their fixtures with the same
   secret. In **production**, replace it with the signing secret Resend shows
   when you create the webhook endpoint (see `docs/RUNBOOKS.md` → "Setting up
   Resend webhook in production").

   ⚠️ Never expose this via a `NEXT_PUBLIC_*` variable — it is server-only.

Leave the deferred-to-Phase-2 variables (DO Spaces, Axiom) commented out.

### 5. Run database migrations

```bash
pnpm db:migrate
```

This applies all pending Drizzle migrations to the containerized database.

Verify the extensions loaded (the image ships `psql` 16, so connect directly —
there is no `docker` CLI inside the container):

```bash
psql "$DATABASE_DIRECT_URL" -c "SELECT extname FROM pg_extension;"
# Should list: plpgsql, uuid-ossp, pg_trgm, btree_gin
```

### 6. Seed sample data

```bash
pnpm db:seed
```

This creates 2 demo tenants, ~500 inventory items, 30 deals, and other seed
data per `CLAUDE.md` §13.

### 7. Start the dev servers

In two VS Code terminals (both inside the container):

```bash
# Terminal 1 — web app
pnpm dev
# App runs at http://localhost:3000

# Terminal 2 — workers (Puppeteer + pg-boss)
pnpm dev:workers
```

Or both at once:

```bash
pnpm dev:all
```

Ports **3000** (web), **5050** (pgAdmin), and **5432** (Postgres) are forwarded
to the host automatically (`.devcontainer/devcontainer.json`), so open them in
your host browser as usual.

### 8. Verify everything works

Open in your browser:

| URL                              | What you should see                                                   |
| -------------------------------- | --------------------------------------------------------------------- |
| http://localhost:3000            | Dealerlink login screen                                               |
| http://localhost:5050            | pgAdmin login (use `dev@dealerlink.local` / `dev_password_change_me`) |
| http://localhost:3000/api/health | JSON with `status: "ok"` and DB/queue checks                          |

Sign in with the seeded admin credentials (printed by the seed script).

> **pgAdmin → Postgres:** when adding the server in pgAdmin, use host
> **`postgres`** (the Compose service name), port `5432`, user `dealerlink`,
> password `dev_password_change_me`.

### 9. (Optional) Receiving Resend webhooks locally

Outbound email works locally with no extra setup — without a real
`RESEND_API_KEY` the worker logs a dev fallback and marks the email `sent`.

**Inbound** Resend webhooks (delivery / bounce / open / click events) need a
publicly reachable URL, because Resend calls `POST /api/webhooks/resend` from
their infrastructure. Three options:

- **Option A — ngrok tunnel (recommended).** Run ngrok on the **host** (not in
  the container) against the forwarded port:

  ```bash
  ngrok http 3000
  ```

  Use the printed `https://<id>.ngrok-free.app/api/webhooks/resend` as the
  endpoint URL in the Resend dashboard (Webhooks → Add Endpoint). Copy the
  signing secret Resend generates into `RESEND_INBOUND_WEBHOOK_SECRET`.

- **Option B — preview deployment.** Point the Resend webhook at a deployed
  preview environment instead of localhost.

- **Option C — skip locally.** Webhook handling is covered by the integration
  tests (`apps/web/lib/email/resend-webhook.test.ts`), which sign fixtures with
  your local secret. Defer real webhook testing to staging (Stage D). The
  outbound path is unaffected.

See `docs/RUNBOOKS.md` → "Setting up Resend webhook in production".

---

## Daily Commands

Run all of these in a VS Code terminal inside the container.

| Command            | What it does                            |
| ------------------ | --------------------------------------- |
| `pnpm dev`         | Start Next.js web app                   |
| `pnpm dev:workers` | Start workers process                   |
| `pnpm dev:all`     | Start both concurrently                 |
| `pnpm typecheck`   | Run TypeScript type checking            |
| `pnpm lint`        | Run ESLint                              |
| `pnpm test`        | Run Vitest unit tests                   |
| `pnpm test:e2e`    | Run Playwright E2E tests                |
| `pnpm db:migrate`  | Apply pending migrations                |
| `pnpm db:rollback` | Roll back the last migration            |
| `pnpm db:seed`     | Reset and seed sample data              |
| `pnpm db:studio`   | Open Drizzle Studio (visual DB browser) |
| `pnpm format`      | Auto-format all files with Prettier     |

Postgres and pgAdmin are started and stopped by VS Code together with the dev
container — you do **not** run `docker compose up` yourself. To stop them,
close the container window (**Dev Containers: Reopen Folder Locally**) or quit
VS Code.

---

## Common Issues

| Issue                                                          | Fix                                                                                                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **App can't reach the database / `ECONNREFUSED ::1:5432`**     | Your `.env.local` `DATABASE_URL` points at `localhost`. Inside the container it must use host `postgres` (the template default; see step 4).    |
| **"Reopen in Container" doesn't appear**                       | Ensure the Dev Containers extension is installed and Docker Desktop is running, then run **Dev Containers: Reopen in Container** from `F1`.     |
| **Container build fails on first open**                        | Confirm Docker Desktop has enough resources and network access (the image pulls PGDG + doctl release assets). Retry with **Rebuild Container**. |
| **Postgres not ready / app waits forever**                     | The app service waits for the Postgres healthcheck. Give it 15–20s; if it never goes healthy, **Rebuild Container**.                            |
| **`pnpm: command not found` in a terminal**                    | You opened a host terminal, not the container's. Reopen the folder in the container, or use the VS Code integrated terminal.                    |
| **Migrations fail with "permission denied for schema public"** | RLS may be blocking; check that the migration role has `BYPASSRLS` or runs as superuser (`DATABASE_DIRECT_URL` uses the `dealerlink` role).     |
| **Worker keeps restarting**                                    | Check `pnpm dev:workers` output; usually a missing env var or DB connection issue.                                                              |
| **`git` reports "dubious ownership"**                          | The image already runs `git config --global --add safe.directory /workspace`; if you mounted elsewhere, add that path the same way.             |
| **Native module ABI errors**                                   | Rebuild native deps: `pnpm install --force`. The image pins Node 20.18.0, so ABI drift shouldn't happen unless you changed the image.           |

---

## Resetting Your Local Environment

For a **logical reset** (wipe app data, re-seed) — run inside the container:

```bash
pnpm db:seed        # truncates and re-seeds sample data
```

For a **full database wipe** (drop the Postgres volume entirely), the data
lives in the `postgres-data` named volume, which the container can't remove
from inside. From a **host** terminal, with the container stopped:

```bash
docker compose down -v     # deletes the postgres-data volume
```

Then reopen the folder in the container (VS Code brings Postgres back up fresh)
and re-run:

```bash
pnpm db:migrate
pnpm db:seed
```

---

## IDE Setup (VS Code)

The dev container installs its recommended extensions automatically
(`.devcontainer/devcontainer.json` → `customizations.vscode.extensions`):

- Prettier — Code formatter
- ESLint
- Tailwind CSS IntelliSense
- Drizzle
- Error Lens
- Code Spell Checker
- TypeScript Nightly
- Prisma

Format-on-save and ESLint auto-fix are configured for the workspace, and the
integrated terminal defaults to bash.

---

## Updating Your Environment

When pulling new changes from `main` (inside the container):

```bash
git pull
pnpm install                  # in case dependencies changed
pnpm db:migrate               # apply any new migrations
```

If `.devcontainer/` itself changed (new tool, new base image), rebuild the
container: **Dev Containers: Rebuild Container** from `F1`.

When the team adds a new env variable, it'll be added to `.env.example`.
Compare your `.env.local` against it:

```bash
diff <(grep -v '^#' .env.example | sort) <(grep -v '^#' .env.local | sort)
```

---

## Getting Help

1. **Check `CLAUDE.md`** — most decisions are documented there
2. **Check `DECISIONS.md`** — for "why did we do it this way?"
3. **Check the BRD** — for "what should this feature do?"
4. **Check the design prototype** (`docs/Distribyte.html`) — for "what should this screen look like?"
5. Open an issue if none of the above answers your question

---

_Last updated: September 2026 · devcontainer setup · Phase 1_
