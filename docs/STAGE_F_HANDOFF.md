# STAGE_F_HANDOFF.md — New Session Kickoff

> Paste the block in section 4 into a fresh Claude Code session. Sections 1–3
> are for you; section 5 is your verification checklist.

---

## 1. What this session is

Stage F, Day 19 — the opening day of Phase 2. Deliberately small: security
patches and two audits. **No feature work.** It exists to close a Critical CVE
before 90+ dev-days of new code land on top of it, and to answer two schema
questions that determine the scope of Days 22 and 23.

---

## 2. Before you paste the prompt

These must be in the repo, because the prompt references them:

- [ ] `docs/PHASE_2_PLAN_v2.md`
- [ ] `docs/STAGE_F_BUILD_v2.md`
- [ ] `docs/client-evidence/` containing the five client screenshots, named
      `01-swipe-invoice.png` … `05-tally-voucher.png`
- [ ] `docs/STAGE_F_HANDOFF.md` (this file)

Commit them first. Day 20's prompt cites screenshot 2 and Day 21 cites
screenshot 5 by filename.

---

## 3. Open items this session does NOT decide

Carry these forward; they are due later:

| Item                                                        | Due by              | Note                                                    |
| ----------------------------------------------------------- | ------------------- | ------------------------------------------------------- |
| Scanned serial not in the system — reject or quick-add?     | Day 40 (serial ADR) | Recommend reject; silent creation destroys traceability |
| Fewer scans than line quantity — partial dispatch or block? | Day 40              | Partial dispatch already exists                         |
| GSP selection (ClearTax vs Masters India)                   | Day 51              | Commercial track, running in parallel                   |
| Client's Tally masters export                               | Day 30 (F.11)       | Requested from client                                   |

---

## 4. The prompt

```
You are opening Stage F (Phase 2) of the Dealerlink build. Stage B closed at
Day 18 with the tag stage-b-complete. This is Day 19.

Stage F is a ~96-150 dev-day phase driven by a real prospect evaluation:
Maharudra Agencies, currently running Swipe + TallyPrime Silver. Full context
is in docs/PHASE_2_PLAN_v2.md and docs/STAGE_F_BUILD_v2.md. Read both before
starting, along with CLAUDE.md, PROJECT_PLAN.md, DEVIATIONS.md,
docs/SECURITY_AUDIT.md and docs/BUILD_PROMPT_TEMPLATE.md.

TODAY IS AUDIT AND PATCH ONLY. No features. No opportunistic refactoring.
If you find yourself writing a new module, stop — it belongs to a later day.

==========================================================
PHASE 0 — Preliminary
==========================================================
P.1. Run `pnpm preflight`. Confirm green before touching anything.
P.2. Run `pnpm verify` and record the current spec count. You will assert the
     same count plus one at closeout.
P.3. Read docs/SECURITY_AUDIT.md findings F-1 through F-4 in full.
P.4. Confirm you are on a clean working tree at or after tag stage-b-complete.

==========================================================
PHASE 1 — Security remediation (task F.1)
==========================================================
1.1. F-1: upgrade Next.js from 14.2.18 to the latest 14.2.x patch (>= 14.2.35).
     Closes CVE-2025-29927 (middleware auth bypass) plus the Server Component
     DoS and SSRF highs. Do NOT move to 15.x — out of scope.
     COMMIT THIS ALONE before any other change, so it can be reverted
     independently: `fix(deps): upgrade next to <version> for CVE-2025-29927`
1.2. Run the full suite after the upgrade. Fix any breakage today, do not
     defer it. Pay particular attention to middleware, route handlers and
     Server Actions — the CVE is in the middleware auth path, so that code is
     the most likely to shift.
1.3. F-4: upgrade drizzle-orm to the latest patch within the same major.
     Regenerate types. Run `pnpm db:check` and confirm zero migration drift.
1.4. F-2: add HTTP security headers and a Content-Security-Policy.
     CSP in REPORT-ONLY mode with a report endpoint that logs violations —
     a CSP that breaks the app on day one of Stage F is worse than no CSP.
     Also add: X-Frame-Options DENY, X-Content-Type-Options nosniff,
     Referrer-Policy, Permissions-Policy, HSTS.
1.5. F-3: rate-limit the login endpoint. Per-IP and per-email counters,
     progressive backoff, lockout after N failures. Use existing
     Postgres/pg-boss infrastructure — do NOT add Redis. Log failed attempts
     to the audit trail.
1.6. Tests: (a) rate limiter blocks after threshold and releases after the
     window; (b) lockout messaging does not leak whether an email exists;
     (c) smoke test asserting security headers on a page response.
1.7. Update docs/SECURITY_AUDIT.md marking F-1 through F-4 closed with dates.

==========================================================
PHASE 2 — Audit A: tax invoice (task F.2)
==========================================================
2.1. Determine definitively whether a GST tax invoice document type exists.
     Check: document_counters doc types, generated_documents types, the PDF
     template directory under apps/workers/src/templates/, tenant_settings
     bank-detail usage, and every route under the orders and dispatch modules.
     Note the contradiction to resolve: docs/PILOT_GETTING_STARTED.md
     describes the cycle as quotation -> PI -> order -> payment -> dispatch ->
     delivered with no invoice step, and packages/db/src/schema/dispatch.ts
     comments say a dispatch is explicitly NOT a tax invoice. But
     tenant_settings bank fields are documented as printing on "every tax
     invoice."
2.2. Also confirm whether the tax engine stores per-line GST rate and HSN on
     order_lines / quotation_lines. Day 20 groups by both and cannot proceed
     if either is missing.
2.3. Write docs/TAX_INVOICE_AUDIT.md:
     - VERDICT: EXISTS / DOES NOT EXIST / PARTIAL
     - If not EXISTS: precisely what is missing — schema, counter series,
       template, route, server action, permissions
     - A day-sized build spec for the gap, estimated in hours
     - Per-line rate and HSN storage: CONFIRMED / MISSING, with column names
2.4. Do NOT build the invoice today. Audit only.

==========================================================
PHASE 3 — Audit B: Ship-To GSTIN (task F.5 scoping)
==========================================================
3.1. Ship-To is a DEALER in this schema, not a separate address entity —
     performa_invoices.shipToDealerId and dispatches.shipToDealerId both
     reference dealers. Confirm this is still true.
3.2. Determine whether dealers has a GSTIN column, and if so: is it required,
     is the format validated, and is the checksum validated?
3.3. Context for why this matters: GSTN Advisory No. 661, effective 1 Aug 2026,
     mandates Ship-To GSTIN in all Bill-To / Ship-To e-way bill transactions.
     Dealerlink's three-party model makes this the main path, not an edge case.
3.4. Append a "Ship-To GSTIN" section to docs/TAX_INVOICE_AUDIT.md:
     - Column exists: YES / NO, with the column name and constraints
     - Validation present: format / checksum / state-code cross-check
     - Remaining work for F.5, estimated in hours
3.5. Do NOT implement the validation today.

==========================================================
PHASE 4 — PROJECT_PLAN.md Stage F table (AUTOMATED, NOT MANUAL)
==========================================================
The user does not want this table hand-edited. Generate it from a checked-in
source of truth and validate it programmatically.

4.1. Create docs/stage-f-tasks.json as the single source of truth. One object
     per task with exactly these fields:
     { "id": "F.1", "task": "...", "subPhase": "SP0", "days": "19",
       "status": "pending", "completedDate": null, "notes": null }
     Populate all 30 tasks (F.1 through F.30) EXACTLY as listed in the
     revised task table in docs/STAGE_F_BUILD_v2.md. Do not paraphrase task
     names, do not renumber, do not reorder, do not invent tasks.

4.2. Create scripts/sync-project-plan.ts:
     - Reads docs/stage-f-tasks.json
     - Renders a markdown table matching the EXISTING column format used by
       Stage B in PROJECT_PLAN.md — read that section first and mirror it
       exactly rather than inventing a new format
     - Replaces only the content between the markers
       <!-- STAGE_F_TASKS:START --> and <!-- STAGE_F_TASKS:END -->
       in PROJECT_PLAN.md, creating the section with those markers under a new
       "## Stage F — Phase 2" heading if absent
     - Touches NOTHING outside those markers — Stage A through E content must
       be byte-identical before and after. Assert this in the script itself by
       comparing everything outside the marker block pre and post write, and
       throw if it differs
     - Supports --check mode: renders and diffs without writing, exits 1 on
       mismatch
     - Idempotent: a second run produces zero diff

4.3. Verify no heading collision. PROJECT_PLAN.md already reserves Stage C
     (Validation), Stage D (Production), Stage E (Launch). If a "Stage F"
     heading already exists for another purpose, STOP and report it rather
     than overwriting.

4.4. Add root package.json scripts:
     "plan:sync": runs the script
     "plan:check": runs it with --check
4.5. Add plan:check to the pnpm verify chain so a drifted table fails CI.
4.6. Run pnpm plan:sync. Then run it a second time and confirm zero diff.
4.7. Write tests for the sync script:
     - Renders all 30 rows
     - Content outside the markers is unchanged (byte comparison)
     - Idempotency: two runs produce identical output
     - --check exits 1 when the table is stale
     - Refuses to run if the markers are malformed or nested
4.8. Document the workflow in docs/RUNBOOKS.md: "Updating the Stage F task
     table" — edit the JSON, run pnpm plan:sync, never hand-edit the table.

4.9. From Day 20 onward, marking a task complete means editing
     docs/stage-f-tasks.json and running pnpm plan:sync. Add this to
     docs/BUILD_PROMPT_TEMPLATE.md so every future day follows it.

==========================================================
PHASE 5 — verify-day-19 spec
==========================================================
5.1. Create apps/web/tests/e2e/verify-day-19.spec.ts asserting:
     - App boots on the upgraded Next.js
     - Security headers present on an authenticated page response
     - Login rate-limit triggers after threshold and releases after the window
     - Operator impersonation still works end to end (must not be caught by
       the rate limiter)
5.2. Add verify-day-19 to the pnpm verify chain.

==========================================================
PHASE 6 — Closeout (per docs/BUILD_PROMPT_TEMPLATE.md)
==========================================================
6.1. pnpm preflight
6.2. pnpm verify — previous count plus one, plus plan:check green
6.3. pnpm typecheck, pnpm lint, pnpm build, pnpm test
6.4. Mark F.1 and F.2 complete in docs/stage-f-tasks.json with today's date
     and brief notes, then run pnpm plan:sync. Do NOT hand-edit the table.
6.5. Add the PROJECT_PLAN.md changelog entry for Day 19 (the changelog is
     outside the markers, so this one line is a normal edit).
6.6. Append Day 19 deviations to DEVIATIONS.md.
6.7. Commit: `fix(security): day 19 — CVE-2025-29927 remediation, CSP,
     login rate-limit + tax invoice and ship-to GSTIN audits`
6.8. Push.
6.9. Print a summary that leads with the two audit verdicts — they determine
     the scope of Days 22 and 23.

==========================================================
GUARDRAILS
==========================================================
- The Next.js upgrade is its own commit, made first.
- No feature work. No refactoring that is not required by the upgrade.
- CSP starts report-only. Do not enforce today.
- Rate limiting must not break operator impersonation — verify explicitly.
- No new runtime dependencies beyond version bumps. The sync script may add
  dev dependencies if genuinely needed.
- The sync script must never write outside its markers. If you cannot prove
  that assertion holds, do not ship the script.
- Money rules per CLAUDE.md §19 still apply even though today touches no money.
- If the tax invoice audit returns PARTIAL, describe the partial state
  precisely. "Sort of exists" is not a usable verdict.

==========================================================
WHEN DONE
==========================================================
- State the TAX INVOICE VERDICT prominently
- State the SHIP-TO GSTIN VERDICT prominently
- Confirm F-1 through F-4 closed, with the Next.js version from the lockfile
- Confirm pnpm plan:check passes and that a second pnpm plan:sync is a no-op
- Confirm Stage A-E content in PROJECT_PLAN.md is unchanged
- Tell me Day 19 is complete and Day 20 (multi-rate GST summary) is next
```

---

## 5. Your verification checklist

### Security

- [ ] `grep '"next":' apps/web/package.json` shows ≥ 14.2.35
- [ ] `git log --oneline -n 3` shows the Next.js bump as its own commit
- [ ] Response headers on an authenticated page include CSP (report-only),
      X-Frame-Options, HSTS
- [ ] 10 rapid failed logins → lockout with a non-enumerating message
- [ ] Lockout releases after the window
- [ ] Operator impersonation works end to end
- [ ] `docs/SECURITY_AUDIT.md` shows F-1 through F-4 closed

### Audits

- [ ] `docs/TAX_INVOICE_AUDIT.md` gives an unambiguous verdict
- [ ] Per-line GST rate and HSN storage confirmed (Day 20 depends on it)
- [ ] Ship-To GSTIN section states whether `dealers.gstin` exists and what
      validation is present

### PROJECT_PLAN automation — the part that matters

- [ ] `docs/stage-f-tasks.json` has 30 tasks, F.1 through F.30
- [ ] Task names match `STAGE_F_BUILD_v2.md` exactly — spot-check five
- [ ] `pnpm plan:sync` twice produces zero diff on the second run
- [ ] `pnpm plan:check` passes
- [ ] `git diff stage-b-complete -- PROJECT_PLAN.md` shows changes **only**
      inside the marker block plus the one changelog line
- [ ] Stage A through E sections are byte-identical
- [ ] `plan:check` is in the `pnpm verify` chain
- [ ] `docs/RUNBOOKS.md` documents the edit-JSON-then-sync workflow
- [ ] `docs/BUILD_PROMPT_TEMPLATE.md` updated so future days use it

### Standard

- [ ] `pnpm verify` = previous count + 1, all green
- [ ] All quality gates green
- [ ] Commit pushed
