# Stage C — Validation Prompts

Stage C runs from May 21 to May 27, 2026 (6 working days + 1 buffer absorbed by C.0 sprawl). Goal: validate the Stage B build is production-ready, deploy staging environment, close the two known feature gaps (force-password-change, state normalization), security + performance audit, and prepare for Stage D production deploy.

**Pilot target:** Production live Wednesday, June 3, 2026.
**Staging available to pilot customer:** Monday, May 25, 2026 (after C.2 wraps).

## Schedule

| Stage C Day   | Date               | Focus                                                           | Status      |
| ------------- | ------------------ | --------------------------------------------------------------- | ----------- |
| C.0           | Thu-Fri May 21-22  | DO staging deploy + DNS + SSL + DEV.63 architectural correction | ✅ Done     |
| Doc hygiene   | Sat May 23 morning | STAGE_C_HANDOFF evolution, ADR-013, CLAUDE.md cleanup           | ✅ Done     |
| C.1           | Sat May 23         | Force-password-change build (closes DEV.56)                     | ✅ Done     |
| **C.2**       | **Sun May 24**     | **State code normalization (closes DEV.33)**                    | **Current** |
| C.3           | Mon May 25         | Pilot staging handoff + UX walkthrough                          | ⏳          |
| C.4           | Tue May 26         | Security audit (RLS + roles + secrets)                          | ⏳          |
| C.5           | Wed May 27         | Performance testing + Stage D handoff                           | ⏳          |
| Stage D start | Thu May 28         | Production environment provisioning                             | —           |

---

## Stage C Day C.0 — Staging Deploy (✅ Complete — May 21-22, 2026)

Retrospective: this day was originally scoped as a single day. It ran into roughly 1.5 calendar days due to surfacing latent bugs that local Docker development could not have caught.

**Commits:** 10189ab → 55350fb (and follow-up fixes)

**What shipped:**

- DO Managed Postgres provisioned in BLR1 (PG 16, ~$15/month)
- DO App Platform with web (basic-xs) + workers (basic-xxs, custom Dockerfile) — total ~$30/month
- Cloudflare DNS (gray-cloud, DNS-only)
- Let's Encrypt SSL on apex + demo.staging + sample.staging subdomains
- staging.dealerlink.in fully reachable with all routes working
- All 4 PDF paths functional (quotation, PI, payment receipt, dispatch note)
- Critical-path E2E (27 steps) passes against staging in 48.6s

**Deviations logged (DEV.57-67):**

- DEV.57: managed-PG role ALTER
- DEV.58-59: pg-boss TLS chain
- DEV.60: apex-domain hardcoding
- DEV.61: connection-pool caps
- DEV.62: db client created a new pool on every access in production
- DEV.63: PDF rendering architectural correction — moved from web subprocess to pg-boss queue per CLAUDE.md §7 line 336 (now promoted to ADR-013)
- DEV.64: .do/app.yaml ↔ deployed-spec sync workflow gap
- DEV.65: corepack signature check failure → switched to npm install -g pnpm
- DEV.66: cold-start timeout adjusted to 120s
- DEV.67: idle-recycle widened to 45 minutes; worker sizing flagged for Stage D

---

## Doc Hygiene Pass (✅ Complete — May 23, 2026)

Brief mid-stream pass after C.0 to align docs with reality.

**Commits:** ad21d3a → 1078826

**What shipped:**

- `docs/STAGE_C_HANDOFF.md` evolved with "Stage C Progress (Living)" + "Carried-Forward To Stage D" sections
- `CLAUDE.md` line 151 (hosting) clarified + "Last reviewed" stamp added
- `DECISIONS.md` ADR-013 added (Puppeteer queue isolation as permanent structural constraint, promotes DEV.63)
- `PROJECT_PLAN.md` changelog entry for 2026-05-23

---

## Stage C Day C.1 — Force-Password-Change (✅ Complete — May 23, 2026)

**Commits:** b3e36e7 → 56c19fd

**What shipped:**

- `must_change_password` flag implemented (column was already present from Day 4; today wired the UX flow)
- `/change-password` route + form with strength meter, rule checklist, sign-out escape
- Layout-level enforcement (Lucia session requires DB lookup; not Edge-runtime friendly per DEV.68)
- Operator-onboarding spec rewritten to assert real forced flow
- New `verify-day-c1.spec.ts` covers full trapdoor (forced redirect from any route → rotate → unlock; old temp rejected)
- Password policy: min 8, 1 upper, 1 number, 1 special (per CLAUDE.md §6, stricter than prompt suggested — DEV.69)

**Closures:** DEV.56 ✅ closed.
**New deviations:** DEV.68 (layout-level enforcement, not Edge middleware), DEV.69 (stricter password policy than prompt).
**Tests:** verify 54/54 (53 prior + verify-day-c1). ~715 unit tests.

---

## Stage C Day C.2 — State Code Normalization (Current — Sunday May 24)

**Goal:** Normalize state storage from full names (`"Maharashtra"`) to 2-letter ISO 3166-2:IN codes (`"MH"`) across all 6 tables that store state strings. Tax engine parity must hold: every order's CGST/SGST/IGST totals are byte-identical before and after migration. Closes DEV.33.

**Estimated time:** 4-5 hours

**Deliverable:** All state columns store 2-letter codes. UI dropdowns show "Maharashtra" but submit "MH". Tax engine continues to work (inter-state determination is now case-insensitive 2-letter compare). Migration is reversible. All Day 1-18 E2E specs still pass. Critical-path E2E on staging still passes.

### Prompt for Claude Code

````
You are implementing Stage C Day C.2 of the Dealerlink build. Stage C Day C.1 (force-password-change) completed yesterday (commits b3e36e7..56c19fd). Today closes DEV.33 (carried forward since Stage B Day 11): the state code normalization from full names to 2-letter ISO 3166-2:IN codes.

CRITICAL CONTEXT — TAX ENGINE PARITY:
The tax engine (packages/tax) reads tenantState and placeOfSupply as opaque strings. Inter-state determination is `tenantState !== placeOfSupply`. As long as both sides of the comparison use the same format, the math is correct. Today's migration must preserve this invariant. The Day 9 parity test (every seeded quotation's stored totals match recomputation) MUST still pass after migration.

PRELIMINARY:
P.1. `pnpm preflight` confirms 17 green checks.
P.2. Read CLAUDE.md §5 (place of supply) — confirm the rule still says "consistent format on both sides."
P.3. Read DEVIATIONS.md DEV.33 — the gap this day closes.
P.4. Read packages/tax/src/state.ts — the existing `isInterState` helper. Today does NOT change this function; it stays opaque-string-compare.
P.5. Read packages/db/src/schema/ for every table that has a state column:
   - tenant_settings.state
   - dealers.state
   - quotations.tenant_state_at_issue + quotations.place_of_supply
   - performa_invoices.tenant_state_at_issue + performa_invoices.place_of_supply
   - orders.tenant_state_at_issue + orders.place_of_supply
   - dispatches: confirm whether it stores state (probably inherited via order)
P.6. Read apps/web/lib/states.ts (if exists) — the state list used by UI dropdowns.
P.7. Read the existing parity test in packages/db/tests/ for quotations — today's migration must not break it.

PRIMARY REFERENCES:
1. CLAUDE.md §5 (state format, tax engine contract)
2. DEVIATIONS.md DEV.33 (the gap)
3. ISO 3166-2:IN — canonical 2-letter codes for Indian states (28 states + 8 UTs)
4. packages/tax/src/state.ts (the engine's contract — DON'T change it)
5. Day 9 parity test (must still pass)

==========================================================
TRACK A — STATE NORMALIZATION (CHUNKED — 5 chunks)
==========================================================

CHUNK C2a — State lookup helper + canonical list
---------------------------------

A1.1. Create packages/schemas/src/states.ts (or update if exists) with canonical ISO 3166-2:IN state list:

```typescript
export const INDIAN_STATES = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CH: 'Chandigarh',
  CT: 'Chhattisgarh', // some sources use CG; ISO 3166-2:IN uses CT
  DH: 'Dadra and Nagar Haveli and Daman and Diu', // merged UT
  DL: 'Delhi',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JK: 'Jammu and Kashmir',
  JH: 'Jharkhand',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MP: 'Madhya Pradesh',
  MH: 'Maharashtra',
  MN: 'Manipur',
  ML: 'Meghalaya',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  PY: 'Puducherry',
  PB: 'Punjab',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UT: 'Uttarakhand',
  WB: 'West Bengal',
} as const;

export type IndianStateCode = keyof typeof INDIAN_STATES;
export type IndianStateName = typeof INDIAN_STATES[IndianStateCode];
````

A1.2. Create helpers:

- `getStateName(code: IndianStateCode): IndianStateName` — for UI display
- `getStateCodeFromName(name: string): IndianStateCode | null` — for migration script (handles edge cases: case-insensitive, trimmed, common misspellings if any)
- `isValidStateCode(code: string): code is IndianStateCode` — for validation
- `normalizeStateInput(input: string): IndianStateCode | null` — accepts code OR name, returns canonical code (for backwards-compat input handling)

A1.3. Add a normalization-coverage test:

- For each seeded value currently in the DB (Maharashtra, Karnataka, Gujarat, Tamil Nadu, Rajasthan, Assam, Uttar Pradesh, etc.), verify `getStateCodeFromName(value)` returns a non-null code
- This is the migration safety net — if any seeded value doesn't map cleanly, we surface it now, not mid-migration

A1.4. Verify pnpm typecheck green.

COMMIT C2a: `feat(states): chunk a — canonical state codes + normalization helpers`

## CHUNK C2b — Migration script (data migration, not schema change)

A2.1. Create packages/db/migrations/000X_normalize_state_codes.sql (Drizzle migration):

The migration runs as a single transaction with three phases:

**Phase 1 — Update each state column from name to code:**

```sql
BEGIN;

-- Update tenant_settings.state
UPDATE tenant_settings
SET state = CASE state
  WHEN 'Maharashtra' THEN 'MH'
  WHEN 'Karnataka' THEN 'KA'
  WHEN 'Gujarat' THEN 'GJ'
  WHEN 'Tamil Nadu' THEN 'TN'
  WHEN 'Rajasthan' THEN 'RJ'
  WHEN 'Assam' THEN 'AS'
  WHEN 'Uttar Pradesh' THEN 'UP'
  -- (extend with ALL 36 states/UTs to handle any future seed data)
  -- (use the full INDIAN_STATES mapping from C2a)
  ELSE state -- leave unchanged if already a code or unknown
END;

-- Same UPDATE for dealers.state
-- Same UPDATE for quotations.tenant_state_at_issue + place_of_supply
-- Same UPDATE for performa_invoices.tenant_state_at_issue + place_of_supply
-- Same UPDATE for orders.tenant_state_at_issue + place_of_supply
-- (Check if dispatches has state columns; if so, same UPDATE)

-- Phase 2 — Tighten CHECK constraints to require 2-letter codes
ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_state_check;
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_state_check
  CHECK (state ~ '^[A-Z]{2}$');

-- Same CHECK tightening for all other tables with state columns

-- Phase 3 — Verify all rows now match the constraint (will throw if any don't)
-- The ALTER TABLE ADD CONSTRAINT enforces this automatically

COMMIT;
```

A2.2. CRITICAL — Generate the migration via a programmatic script, not by hand:

- Create scripts/generate-state-migration.ts (TypeScript script using @dealerlink/db + @dealerlink/schemas/states)
- Script generates the SQL by iterating over INDIAN_STATES (so all 36 entries are covered)
- This eliminates "we forgot Telangana" risk
- Output is captured into the migration file
- Document the script's purpose in a header comment

A2.3. Test the migration locally:

- Take a snapshot of current state values: `pg_dump --table=tenant_settings --table=dealers ... > pre-migration-snapshot.sql`
- Apply migration: `pnpm --filter @dealerlink/db db:migrate`
- Verify: every state column matches `^[A-Z]{2}$` regex
- Verify: row counts unchanged (no data loss)

A2.4. CRITICAL — Run the Day 9 tax parity test BEFORE and AFTER migration:

- The parity test (packages/db/tests/quotation-engine-parity.test.ts) re-derives every seeded quotation's totals and asserts they match the stored values
- Pre-migration: parity passes (well-established)
- Post-migration: parity MUST still pass
- If parity fails after migration, the tax engine's inter-state determination changed for at least one row — STOP and investigate
- Tax engine itself doesn't change today; only the data feeding it does

A2.5. Reversibility:

- Create a corresponding rollback migration (in case staging deploy needs to revert)
- Rollback maps codes back to names — same CASE statement, inverted
- Document in the migration's header how to roll back

A2.6. Verify pnpm typecheck + pnpm test green.

COMMIT C2b: `feat(states): chunk b — migration normalizes state names to ISO 3166-2:IN codes`

## CHUNK C2c — UI layer updates (dropdowns, filters, displays)

A3.1. State input dropdowns — every form that captures state:

- Dealer creation/edit form (apps/web/app/(app)/dealers/...)
- Tenant settings form (operator app: apps/web/app/(admin)/tenants/...)
- Quotation builder (when user selects Ship-To dealer, state is derived; no manual state input here typically)
- PI creation form (Ship-To dealer selection; state is derived)
- Order/Dispatch forms (inherit from PI/Order; no manual state input)

For dropdowns: show full name to user, submit code. Use `<option value="MH">Maharashtra</option>` pattern.

A3.2. State display formatters — every place state is shown to user:

- Dealer detail page: show "Maharashtra (MH)" or just "Maharashtra" depending on context
- Quotation/PI/Order detail pages: same
- PDF templates (Day 10 templates): show full name (more professional on invoices)
- Dashboard widgets: where state appears as a column, show code (compact)

Use the `getStateName()` helper consistently. Don't hardcode display strings.

A3.3. Filter dropdowns:

- Reports module (Day 15 GST summary report filters by place_of_supply): dropdown shows names, filters by code
- Dealer list filters: same pattern

A3.4. Search:

- If any search inputs accept state names as free-text, they need to normalize input via `normalizeStateInput()` (accepts either name or code)
- This is a backwards-compat measure — operator typing "Maharashtra" or "MH" both find the right rows

A3.5. Tests:

- Snapshot test for one form that shows state dropdown — verify options render with name labels + code values
- Integration: submit dealer form with state value "MH" — verify stored value is "MH"
- Integration: GST summary report filter by "Maharashtra" — verify it filters to rows where state='MH'

COMMIT C2c: `feat(states): chunk c — UI dropdowns + displays + filters use canonical codes`

## CHUNK C2d — Validation layer + Zod schema updates

A4.1. Zod schemas — every input schema that accepts a state:

- packages/schemas/src/dealer.ts: state field changes from `z.string()` to `z.enum([Object.keys(INDIAN_STATES) as IndianStateCode[]])`
- packages/schemas/src/tenant.ts: same
- packages/schemas/src/quotation.ts, performa-invoice.ts, etc.: same for tenant_state_at_issue and place_of_supply fields

This gives Zod-level validation: any state input must be a valid code.

A4.2. Backwards-compat input handler (for any code that might receive a name instead of a code):

- In input boundaries (server actions, API routes), pre-process state values through `normalizeStateInput()` before Zod validation
- This handles old browser sessions that might submit names from cached HTML

A4.3. Tax engine — DOES NOT CHANGE:

- packages/tax/src/state.ts stays opaque-string-compare
- The engine receives `"MH"` vs `"KA"` instead of `"Maharashtra"` vs `"Karnataka"`
- Either way, `tenantState !== placeOfSupply` returns the same result
- Verify the parity test passes (this is A2.4 from C2b; verify again here as a regression check)

A4.4. Tests:

- Zod schema rejects unknown state codes
- Zod schema rejects state names (forces canonical format at boundary)
- Backwards-compat handler accepts both codes and names, normalizes to codes
- Tax engine still produces identical output for all seeded quotations

COMMIT C2d: `feat(states): chunk d — Zod validation enforces canonical codes`

## CHUNK C2e — Documentation + DEV.33 closure + closeout

A5.1. Update CLAUDE.md §5:

- Replace any references to "full state names" with "2-letter ISO 3166-2:IN codes"
- Add example: "Tenant in MH selling to dealer with place_of_supply=KA → inter-state, IGST applies"
- Update "Last reviewed" stamp to 2026-05-24

A5.2. Update DEVIATIONS.md:

- Mark DEV.33 as ✅ Closed by Stage C Day C.2 (2026-05-24)
- Add closure note with migration approach + parity confirmation

A5.3. Update docs/STAGE_C_HANDOFF.md:

- Mark C.2 as ✅ in the "Stage C Progress (Living)" section
- Update DEV.33 status from "in progress — C.2" to "✅ Closed — C.2"

A5.4. Update docs/STRUCTURE.md or similar:

- Document the INDIAN_STATES constant location and usage pattern
- Note: all state input/output goes through helpers; never hardcode

A5.5. Update PDF templates if any hardcode state names:

- Check apps/workers/src/templates/ for hardcoded state names
- If any exist, replace with `getStateName(record.state)` calls

A5.6. Run full validation suite (this is the gate):

- pnpm preflight green
- pnpm typecheck, pnpm lint, pnpm test (all green, especially the parity test)
- pnpm verify (54/54 + new verify-day-c2 if added; or stays at 54/54 if no new spec)
- Critical-path E2E against staging (deferred per C.0 plan, but run it now since this migration is high-stakes)

A5.7. Verify staging readiness:

- PROJECT_PLAN.md mark C.2 ✅ with date
- Final commit: `feat(states): Stage C Day C.2 complete — state codes normalized (closes DEV.33)`
- Push to main
- Verify staging redeploys cleanly + migration applies to staging DB
- Run smoke check on staging: load a quotation detail page, verify state shows as full name in UI

COMMIT C2e: as above

==========================================================
GUARDRAILS (STAGE C DAY C.2)
==========================================================

- Tax engine parity test MUST pass post-migration. This is the single most important verification of the day. If parity fails, STOP and investigate — do not proceed with closeout.

- The migration is REVERSIBLE. Generate the rollback migration alongside the forward migration.

- packages/tax/src/state.ts stays opaque-string-compare. We don't tighten the engine to be code-only — it works with any consistent format. The tightening is at the application boundary (Zod schemas, UI dropdowns).

- ALL six tables with state columns must migrate atomically in a single transaction. No mixed-format state.

- CHECK constraints tighten after migration. This prevents future writes from inserting non-code values.

- UI dropdowns show full names to users (UX), submit codes to backend (data integrity). Use the helpers consistently.

- Don't hardcode state name strings anywhere. Always go through `getStateName()`.

- The migration script must be programmatically generated (TypeScript → SQL) to ensure all 36 states are covered. Don't write the CASE statement by hand.

- Backwards-compat input handlers accept both names and codes — for cached browser sessions, integration partners, manual data entry. Internal storage is always codes.

WHEN DONE:

- Print summary, 5 chunk commits
- Confirm: DEV.33 ✅ closed
- Confirm: Day 9 parity test passes post-migration (every seeded quotation's totals match)
- Confirm: pnpm verify 54/54 (or 55/55 with verify-day-c2 if added)
- Confirm: critical-path E2E passes on staging post-deploy
- Confirm: all 36 states covered in mapping (run a coverage assertion)
- Confirm: UI dropdowns show names + submit codes
- Tell me Stage C Day C.2 is complete and Day C.3 (pilot staging handoff + UX walkthrough) is next

````

### Verification checklist (for the human operator after Claude Code completes)

#### Tax engine parity (MOST IMPORTANT)
- [ ] Day 9 parity test passes — every seeded quotation's stored totals match recomputation
- [ ] Spot-check: pick 3 seeded orders (one intra-state, one inter-state, one with discount) — totals unchanged

#### Migration correctness
- [ ] Every state column matches `^[A-Z]{2}$` regex post-migration
- [ ] Row counts in all 6 affected tables unchanged
- [ ] CHECK constraints applied
- [ ] Rollback migration exists and is documented

```powershell
# Run these to verify
docker compose exec postgres psql -U dealerlink -d dealerlink_dev -c "SELECT 'tenant_settings' AS tbl, state FROM tenant_settings UNION ALL SELECT 'dealers', state FROM dealers UNION ALL SELECT 'quotations.tenant_state', tenant_state_at_issue FROM quotations UNION ALL SELECT 'quotations.place_of_supply', place_of_supply FROM quotations UNION ALL SELECT 'orders.place_of_supply', place_of_supply FROM orders;"
# Every state should be exactly 2 chars, uppercase
````

#### UI verification

- [ ] Open `/dealers/new` → state dropdown shows "Maharashtra" labels with "MH" values (View source if needed)
- [ ] Submit a new dealer with state "MH" → stored as "MH" in DB
- [ ] Open existing dealer detail → state displays as "Maharashtra" (not "MH")
- [ ] PDF generation works → state shows as full name on invoice

#### Backwards compatibility

- [ ] All Day 1-18 E2E specs continue to pass
- [ ] Critical-path E2E passes on staging
- [ ] Existing seed users can still login and use the app normally

#### Documentation

- [ ] CLAUDE.md §5 updated (codes, not names)
- [ ] DEVIATIONS.md DEV.33 marked ✅ closed
- [ ] STAGE_C_HANDOFF.md C.2 marked ✅
- [ ] STRUCTURE.md or equivalent documents the state code pattern

#### Quality gates

- [ ] `pnpm preflight` green
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm verify` all green
- [ ] Staging redeploy successful + migration applied to staging DB
- [ ] PROJECT_PLAN.md C.2 ✅

---

## Stage C Day C.3 — Pilot Staging Handoff + UX Walkthrough (Monday May 25)

_Will be added when C.2 is complete. Provide staging credentials to pilot customer with onboarding guide. Operator (you) does 2-hour walkthrough first, captures findings to docs/UX_FINDINGS.md. Pilot evaluates over the day, captures their findings. Both feed into C.4-C.5._

## Stage C Day C.4 — Security Audit (Tuesday May 26)

_Will be added when C.3 is complete. RLS verification across all tenant-scoped tables, role enforcement audit, secrets inventory, OWASP top-10 checklist for public-facing routes, Sentry PII scrubbing verification, audit log completeness verification._

## Stage C Day C.5 — Performance Testing + Stage D Handoff (Wednesday May 27)

_Will be added when C.4 is complete. Load test against staging (PDF generation, concurrent dispatches, payment allocations, pg-boss queue depth), worker instance sizing decision per DEV.67, final docs/STAGE_D_HANDOFF.md generated._

---

## Stage D — Production Deployment (May 28 - May 31)

_Detailed prompts added at the close of Stage C. Stage D provisions production environment (separate DO project, larger instance sizes, real Resend domain + DKIM, production observability DSNs, backup configuration)._

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts added at the close of Stage D. Provision pilot tenant in production, training session prep, final dry run, go-live Wednesday June 3._
