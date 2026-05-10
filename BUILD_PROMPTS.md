# BUILD_PROMPTS.md — Claude Code Daily Build Prompts

> **Purpose:** Day-by-day prompts for Claude Code during Stage B (the 3.5-week build). Each day is a focused session with a clear deliverable.
>
> **How to use:**
> 1. Open Claude Code in your `dealerlink` repo
> 2. Confirm `CLAUDE.md` is at the repo root (Claude Code reads it automatically)
> 3. Copy-paste the day's prompt below into Claude Code
> 4. Stay near the keyboard for the first ~30 minutes — Claude Code may ask clarifying questions
> 5. After the deliverable is done, **update `PROJECT_PLAN.md`** to tick the day's task and add the date
>
> **Companion files:**
> - `CLAUDE.md` — implementation guide (Claude Code's primary reference)
> - `DECISIONS.md` — locked decisions
> - `PROJECT_PLAN.md` — task tracker
> - `SETUP.md` — local dev setup

---

## Day 1 — Repo Scaffold + Design System Foundation

**Goal:** Get a Next.js app running at `localhost:3000` with the Dealerlink design tokens, fonts, and base layout (Sidebar + Topbar + Shell). At end of day, you should be able to navigate the empty shell and see the design system in place.

**Estimated time:** 4–6 hours of Claude Code work + ~1 hour of your review

**Deliverable:** A running Next.js app with no functional features but the complete visual foundation, ready for Day 2 to add auth.

### Prompt for Claude Code

```
You are implementing Day 1 of the Dealerlink build per the day-by-day plan in CLAUDE.md §17.

PRIMARY REFERENCES (read in order, do not skip):
1. CLAUDE.md — your authoritative implementation guide (especially §0 brand naming, §3 tech stack, §4 project structure, §5 design system, §19 engineering standards)
2. DECISIONS.md — the 8 ADRs that locked our architecture
3. docs/Distribyte.html — the visual prototype to match pixel-perfectly (note: this file says "Distribyte" but the product is "Dealerlink" per CLAUDE.md §0; silently use Dealerlink in all output)
4. docs/screens-extra.jsx and docs/tweaks-panel.jsx — additional prototype screens
5. docs/dealerlink-architecture-v4.html — architecture overview

DAY 1 SCOPE:

Phase 1 — Monorepo scaffold
1. Initialize pnpm workspace at the repo root with workspaces: apps/web, apps/workers, packages/db, packages/schemas, packages/tax, packages/design-tokens
2. Create root package.json with pnpm version 9 enforced via "packageManager" field
3. Create pnpm-workspace.yaml listing the workspaces
4. Add .npmrc with: shamefully-hoist=false, strict-peer-dependencies=true
5. Set up TypeScript with strict mode + noUncheckedIndexedAccess + exactOptionalPropertyTypes (per CLAUDE.md §19.1)
6. Set up ESLint (with import/order rule, no-floating-promises, no-explicit-any as error)
7. Set up Prettier with 2-space indent, single quotes, no semicolons (or semicolons — match shadcn/ui defaults, your call but be consistent)
8. Set up Husky + lint-staged for pre-commit hooks (run lint + typecheck on staged files)
9. Add .vscode/settings.json (format on save, ESLint auto-fix) and .vscode/extensions.json (recommended extensions per SETUP.md)

Phase 2 — Next.js app scaffold
10. In apps/web, scaffold a Next.js 14 App Router app with TypeScript
11. Install Tailwind v3 and configure it
12. Install shadcn/ui with the "new-york" style (most aligned with the prototype's editorial aesthetic). Initialize with `pnpm dlx shadcn-ui@latest init` and configure it to use the design tokens from packages/design-tokens
13. Set up next/font for Inter and IBM Plex Mono (per CLAUDE.md §4 typography rules)
14. Create app/globals.css with the CSS variables from CLAUDE.md §4 (--ink, --paper, --line, --accent, etc.)
15. Configure Tailwind to use the CSS variables (theme.extend.colors maps to var(--ink) etc.)
16. Create a tailwind.config.ts that registers the custom font families and applies font-feature-settings: "tnum", "zero" to the .mono class

Phase 3 — Base layout (no auth yet)
17. Create the App Shell at apps/web/components/shell/:
    - Sidebar.tsx — 232px wide, with the navigation items from the prototype (Dashboard, Pipeline, Dealers, Catalog, Inventory, Quotations, Orders, Payments, Dispatch, Reports, Settings)
    - Topbar.tsx — with placeholder for tenant name, search, user menu (no functionality yet)
    - Shell.tsx — wraps Sidebar + Topbar + main content area
18. Create app/(app)/layout.tsx that uses Shell
19. Create placeholder pages for each navigation item (just the route + a heading like "Pipeline (coming soon)") in apps/web/app/(app)/<route>/page.tsx
20. Match the prototype's hairline borders, paper background, and dense layout from docs/Distribyte.html. NO drop shadows on cards, NO rounded-2xl. Use box-shadow: inset 0 0 0 1px var(--line) for cards. 6px corner radius.

Phase 4 — Design system primitives
21. Create packages/design-tokens with:
    - tokens.css (the CSS variables)
    - tailwind-preset.ts (the Tailwind preset that exports color/font/spacing tokens)
22. Restyle key shadcn/ui components to match the prototype: Button, Input, Badge, Card. Add a "StatusPill" component with 6 status variants (em/am/ro/in/mu/ink) per CLAUDE.md §4
23. Create apps/web/lib/format/index.ts with a formatINR(value, options) utility that auto-scales to lakh/crore at the right thresholds (per CLAUDE.md §4 typography rules and the prototype's display style)

Phase 5 — Verification
24. Run `pnpm dev` from apps/web. Verify the app loads at localhost:3000 with the sidebar visible, fonts rendering, and design tokens applied
25. Verify `pnpm typecheck` and `pnpm lint` both pass with zero errors/warnings
26. Make an initial commit: `feat(scaffold): day 1 — monorepo, design system, base layout`

GUARDRAILS:
- Follow CLAUDE.md §14 ("What NOT to Do") strictly. No Zustand. No Recharts. No Instrument Serif.
- The prototype files say "Distribyte" — silently use "Dealerlink" everywhere
- Do NOT scaffold auth, database, or any business logic today. Day 2 handles auth.
- Do NOT use mock data beyond placeholder strings. Real data comes with the database in Day 2.
- If any decision is ambiguous, default to the locked answer in DECISIONS.md or CLAUDE.md. Don't ask me unless truly blocked.

WHEN DONE:
- Print a summary of what was created
- List any deviations from the plan with reasons
- Tell me what to verify visually before moving to Day 2
- Suggest the commit message for the work
```

### Verification checklist for you (after Claude Code finishes)

- [ ] `pnpm dev` starts without errors at http://localhost:3000
- [ ] Sidebar shows all 11 navigation items in the right order (Dashboard, Pipeline, Dealers, Catalog, Inventory, Quotations, Orders, Payments, Dispatch, Reports, Settings)
- [ ] Sidebar is exactly 232px wide
- [ ] Background is warm paper (#F7F7F4), not white
- [ ] Borders are hairline (1px), not shadows
- [ ] Inter font loads (UI text) and IBM Plex Mono loads (try inspecting any number)
- [ ] Clicking each navigation item routes to the right placeholder page
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] Browser console has no errors
- [ ] Compare side-by-side to `docs/Distribyte.html` opened in another tab — the shell layout should match closely

### Update PROJECT_PLAN.md after Day 1

Mark `B.1` as ✅, add today's date, and append to the changelog:

```markdown
| YYYY-MM-DD | B.1 Day 1 complete — monorepo scaffold, design tokens, base layout running at localhost:3000 | — |
```

---

## Day 2 — Auth + Database Foundation

*Will be added when Day 1 is complete. Each day's prompt is finalized after the prior day so we can adjust based on what was learned.*

**Tentative goal:** Drizzle schema for tenant/user/role + Lucia auth + login screen rendering + ability to log in with seeded credentials.

---

## How to Use This File Going Forward

After each day's work:

1. **You** verify the deliverable against the checklist
2. **You** update `PROJECT_PLAN.md` to tick the task and add the date
3. **You** ask me to add the next day's prompt to this file (I'll write it informed by what just happened)
4. **You** commit the day's work with a Conventional Commit message
5. **You** start the next day's session with a fresh Claude Code context

This rhythm keeps each day clean, verifiable, and recoverable if something needs to be redone.

---

*Last updated: May 2026 · Day 1 prompt only · subsequent days added progressively*
