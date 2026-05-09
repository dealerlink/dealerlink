# Dealerlink
Multi-tenant B2B distributor CRM SaaS.
## Quick Start
### Prerequisites
- Node 20+
- pnpm 9+
- Docker Desktop running (with WSL2 backend on Windows)
- PowerShell 7 recommended on Windows
### Setup
```powershell
# 1. Install dependencies (after package.json is created in Stage B)
pnpm install
# 2. Start local Postgres
docker compose up -d
# 3. Copy env template and fill in values
Copy-Item .env.example .env.local
# Generate SESSION_SECRET (PowerShell):
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
# 4. Run migrations (after schema is created in Stage B)
pnpm db:migrate
# 5. Seed sample data (after seed scripts are created in Stage B)
pnpm db:seed
# 6. Start the dev server (after Next.js app is scaffolded in Stage B)
pnpm dev
```
App runs at http://localhost:3000
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