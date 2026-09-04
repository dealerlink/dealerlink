# Dealerlink

Multi-tenant B2B distributor CRM SaaS.

## Quick Start

Development happens inside a dev container, so the host only needs Docker,
VS Code, and Git. The full toolchain (Node 20.18.0, pnpm 9.15.9, Postgres 16
client, Chromium, doctl) ships in the image. See `SETUP.md` for the detailed
walkthrough.

### Prerequisites

- Docker Desktop (running)
- VS Code + the Dev Containers extension (`ms-vscode-remote.remote-containers`)
- Git

### Setup

```bash
# 1. Clone on the host, then open the folder in VS Code and
#    "Reopen in Container" (F1 → Dev Containers: Reopen in Container).
#    The container auto-installs deps (pnpm install + playwright:install)
#    and starts Postgres + pgAdmin.
#
# Everything below runs in the VS Code integrated terminal (inside the container):

# 2. Copy env template and fill in values
cp .env.example .env.local
# The template's DATABASE_URL / DATABASE_DIRECT_URL already use host `postgres`
# (the Compose service name), which is correct inside the container.
# Generate SESSION_SECRET:
openssl rand -hex 32

# 3. Run migrations
pnpm db:migrate

# 4. Seed sample data
pnpm db:seed

# 5. Start the dev server
pnpm dev
```

App runs at http://localhost:3000 (port forwarded to the host)
Worker runs separately: `pnpm dev:workers`
pgAdmin runs at http://localhost:5050

## Documentation

- **`CLAUDE.md`** — implementation guide (read this before contributing)
- **`docs/DECISIONS.md`** — architecture decision records
- **`docs/Dealerlink Detailed BRD v1.0.docx`** — business requirements
- **`docs/dealerlink-architecture-v4.html`** — visual architecture

## Tech Stack

Next.js 14 (App Router) · TypeScript · PostgreSQL 16 · Drizzle ORM · Lucia Auth · pg-boss · Puppeteer · Tailwind · shadcn/ui · TanStack Table · Tremor.
See `CLAUDE.md` §3 for the locked stack.
