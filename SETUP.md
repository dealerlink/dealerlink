# SETUP.md — Dealerlink Local Development Setup

> **Purpose:** Get a fresh machine ready to develop Dealerlink. Cross-platform (macOS, Windows, Linux).
>
> **Time required:** 30–60 minutes depending on what's already installed.
>
> **Companion files:**
> - `CLAUDE.md` — implementation guide
> - `README.md` — project overview and daily commands
> - `docker-compose.yml` — service definitions
> - `.env.example` — environment variable template

---

## Prerequisites

| Tool | Required version | Why |
|---|---|---|
| **Node.js** | v20.x LTS | Application runtime (web + workers) |
| **pnpm** | v9.x | Package manager (faster than npm, workspace-aware) |
| **Docker Desktop** | Any recent | Local Postgres + pgAdmin via docker-compose |
| **Git** | Any recent | Source control |
| **PowerShell 7** *(Windows only)* | v7.x | Modern shell with cross-platform compatibility |

### Optional but recommended

- **VS Code** with extensions: ESLint, Prettier, Tailwind CSS IntelliSense, Drizzle Kit
- **TablePlus** or **DBeaver** — visual Postgres client (alternative to pgAdmin)

---

## Installation by OS

### macOS

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install tools
brew install node@20
brew install git
brew install --cask docker  # Docker Desktop

# Install pnpm via npm (after Node)
npm install -g pnpm@9

# Verify
node --version    # v20.x
pnpm --version    # 9.x
docker --version
git --version
```

### Windows

Use PowerShell 7 (install first if you only have Windows PowerShell 5.1):

```powershell
# Install PowerShell 7
winget install --id Microsoft.PowerShell -e

# Restart terminal, then continue in pwsh

# Install tools
winget install --id OpenJS.NodeJS.LTS -e         # Node 20 LTS
winget install --id Git.Git -e
winget install --id Docker.DockerDesktop -e

# Install pnpm via npm (restart terminal first so node is on PATH)
npm install -g pnpm@9

# Verify
node --version
pnpm --version
docker --version
git --version
```

**Windows-specific extras:**

```powershell
# Set Git line endings to LF on commit, native on checkout
git config --global core.autocrlf input
git config --global init.defaultBranch main

# Optional: add Defender exclusions for performance (run as admin)
Add-MpPreference -ExclusionPath "C:\dev\dealerlink\node_modules"
Add-MpPreference -ExclusionPath "C:\dev\dealerlink\.next"
```

**WSL2 requirement:** Docker Desktop on Windows requires WSL2. After installing Docker Desktop, launch it once manually and complete the WSL2 setup wizard.

### Linux (Ubuntu/Debian)

```bash
# Install Node 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Install other tools
sudo apt update
sudo apt install -y git docker.io docker-compose

# Install pnpm
npm install -g pnpm@9

# Add yourself to docker group (logout/login after)
sudo usermod -aG docker $USER

# Verify
node --version
pnpm --version
docker --version
git --version
```

---

## Project Setup

### 1. Clone the repository

```bash
# Choose a project location
mkdir -p ~/projects                    # macOS/Linux
# OR
mkdir -p C:\dev                        # Windows

cd ~/projects                          # macOS/Linux
# OR
cd C:\dev                              # Windows

# Clone
git clone git@github.com:<your-username>/dealerlink.git
cd dealerlink
```

If SSH isn't configured, use HTTPS:
```bash
git clone https://github.com/<your-username>/dealerlink.git
```

### 2. Install dependencies

```bash
pnpm install
```

This installs all workspace packages. Takes 1–3 minutes on first run.

### 3. Start local Postgres

```bash
docker compose up -d
```

This starts two containers:
- `dealerlink-postgres` on port 5432
- `dealerlink-pgadmin` on port 5050 (UI for inspecting the DB)

Wait 15–20 seconds for Postgres to initialize, then verify:

```bash
docker compose ps
# dealerlink-postgres should show "healthy"
```

Verify extensions are loaded:

```bash
docker compose exec postgres psql -U dealerlink -d dealerlink_dev -c "SELECT extname FROM pg_extension;"
# Should list: plpgsql, uuid-ossp, pg_trgm, btree_gin
```

### 4. Configure environment variables

Copy the template:

```bash
cp .env.example .env.local
# Windows PowerShell:
Copy-Item .env.example .env.local
```

Generate a secure session secret:

```bash
# macOS/Linux:
openssl rand -hex 32

# Windows PowerShell (no openssl needed):
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

Open `.env.local` in your editor and:

1. Replace `replace_with_64_char_hex_string` with the generated secret
2. Add your **Resend API key**: `RESEND_API_KEY=re_xxxxxxxx` (from https://resend.com/api-keys)
3. Add your **Sentry DSN**: `SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx` (from sentry.io)

Leave the deferred-to-Phase-2 variables (DO Spaces, Axiom, RESEND_INBOUND_WEBHOOK_SECRET) commented out.

### 5. Run database migrations

```bash
pnpm db:migrate
```

This applies all pending Drizzle migrations to your local database.

### 6. Seed sample data

```bash
pnpm db:seed
```

This creates 2 demo tenants, ~500 inventory items, 30 deals, and other seed data per `CLAUDE.md` §13.

### 7. Start the dev servers

In two separate terminal windows:

```bash
# Terminal 1 — web app
pnpm dev
# App runs at http://localhost:3000

# Terminal 2 — workers (Puppeteer + pg-boss)
pnpm dev:workers
```

You can also start both at once:

```bash
pnpm dev:all
```

### 8. Verify everything works

Open in your browser:

| URL | What you should see |
|---|---|
| http://localhost:3000 | Dealerlink login screen |
| http://localhost:5050 | pgAdmin login (use `dev@dealerlink.local` / `dev_password_change_me`) |
| http://localhost:3000/api/health | JSON with `status: "ok"` and DB/queue checks |

Sign in with the seeded admin credentials (printed by the seed script).

---

## Daily Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start Next.js web app |
| `pnpm dev:workers` | Start workers process |
| `pnpm dev:all` | Start both concurrently |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run Vitest unit tests |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:rollback` | Roll back the last migration |
| `pnpm db:seed` | Reset and seed sample data |
| `pnpm db:studio` | Open Drizzle Studio (visual DB browser) |
| `docker compose up -d` | Start Postgres + pgAdmin |
| `docker compose down` | Stop Postgres + pgAdmin (preserves data) |
| `docker compose down -v` | Stop and **delete all DB data** (use with care) |
| `pnpm format` | Auto-format all files with Prettier |

---

## Common Issues

| Issue | Fix |
|---|---|
| **Port 5432 already in use** | You have another Postgres running. Stop it, OR change port in `docker-compose.yml` to `5433:5432` and update `DATABASE_URL` |
| **Docker daemon not running** | Start Docker Desktop; on Linux: `sudo systemctl start docker` |
| **`pnpm: command not found`** | Restart terminal, or `source ~/.zshrc` / `source ~/.bashrc` |
| **Permission errors on Linux Docker** | `sudo usermod -aG docker $USER` then logout/login |
| **pgAdmin can't connect to "postgres"** | In pgAdmin add server, use host = `host.docker.internal` (Mac/Win) or container name `postgres` |
| **`pnpm install` is slow on Windows** | Add Defender exclusion for `node_modules` (see Windows section above) |
| **Migrations fail with "permission denied for schema public"** | RLS may be blocking; check that the migration role has `BYPASSRLS` or runs as superuser |
| **Worker keeps restarting** | Check `pnpm dev:workers` output; usually missing env var or DB connection issue |
| **Hot reload not working in Next.js** | Try restarting the dev server; on Windows, file system events can be flaky in WSL paths |

---

## Resetting Your Local Environment

If your local DB gets into a bad state, nuke and reseed:

```bash
docker compose down -v        # deletes the volume
docker compose up -d           # fresh Postgres
sleep 15                       # wait for it to be ready
pnpm db:migrate
pnpm db:seed
```

---

## IDE Setup (VS Code)

The repo includes `.vscode/extensions.json` recommending:

- ESLint
- Prettier - Code formatter
- Tailwind CSS IntelliSense
- Drizzle Kit
- Error Lens

VS Code will prompt to install these on first open. Click "Install All" for the best experience.

The repo also includes `.vscode/settings.json` with sensible defaults:
- Format on save (Prettier)
- ESLint auto-fix on save
- Tailwind class-name sorting

---

## Updating Your Environment

When pulling new changes from main:

```bash
git pull
pnpm install                  # in case dependencies changed
pnpm db:migrate               # apply any new migrations
```

When the team adds a new env variable, it'll be added to `.env.example`. Compare your `.env.local` against it:

```bash
# macOS/Linux:
diff <(grep -v '^#' .env.example | sort) <(grep -v '^#' .env.local | sort)

# Windows PowerShell:
Compare-Object (Get-Content .env.example | Where-Object {$_ -notmatch '^#'} | Sort-Object) (Get-Content .env.local | Where-Object {$_ -notmatch '^#'} | Sort-Object)
```

---

## Getting Help

1. **Check `CLAUDE.md`** — most decisions are documented there
2. **Check `DECISIONS.md`** — for "why did we do it this way?"
3. **Check the BRD** — for "what should this feature do?"
4. **Check the design prototype** (`docs/Distribyte.html`) — for "what should this screen look like?"
5. Open an issue if none of the above answers your question

---

*Last updated: May 2026 · Phase 1 setup*
