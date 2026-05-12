# Testing Approach

> **Scope:** Test stack, coverage targets, and the mandatory RLS isolation pattern. Back to [CLAUDE.md](../CLAUDE.md).

| Layer            | Tool                                 | What to test                                                                                 |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Unit             | **Vitest**                           | Tax math (`packages/tax/`), `formatINR`, GSTIN validation, Zod schemas                       |
| Integration      | **Vitest + testcontainers-postgres** | Database operations against a real Postgres with RLS active                                  |
| E2E              | **Playwright**                       | Login → create deal → generate quote → confirm order → dispatch (one happy path per persona) |
| Component visual | Optional, **Chromatic** Phase 2      | —                                                                                            |

**Coverage targets:** 90%+ on `packages/tax/`, 70%+ on Server Actions, smoke E2E for each role's primary workflow.

**RLS test pattern** is mandatory: for every table, write a test that asserts a query as Tenant A cannot see Tenant B's data. This catches the entire class of multi-tenant data leak bugs.
