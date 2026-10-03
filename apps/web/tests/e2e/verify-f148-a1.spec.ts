/**
 * F.148 A.1 — issue → show-once → check-in → revoke, wired.
 *
 * ## WHY THIS SPEC EXISTS AND WHY IT IS NOT OPTIONAL
 *
 * **Nothing in this repository exercises `operatorAction` end to end.** The
 * admin unit tests cover `credentials.ts` and `schemas.ts` — pure functions —
 * so before this spec, issuance and revocation were typed, lint-clean, covered
 * by the unit suites, and **had never run**.
 *
 * That is F.169's shape exactly. The seed that never advanced
 * `document_counters` passed typecheck, lint, and 85 + 224 + 224 unit tests,
 * and was found only by an end-to-end spec — because every unit test either
 * inserted rows directly or rolled back. "Exercised indirectly is how a write
 * path ships broken."
 *
 * ## THE TWO ASSERTIONS BEYOND THE HAPPY PATH
 *
 * 1. **The show-once value is NOT recoverable.** The UI claims "we store a
 *    digest, this cannot be recovered". **An unasserted claim is the F.169
 *    shape** — so this reloads the page and confirms the token is gone from it.
 * 2. **A revoked token's check-in fails with the SAME 401 as an unknown one.**
 *    The route's four-identical assertion covers the response shape; this covers
 *    the LIFECYCLE, which is where a revocation that does not take would
 *    actually show up — a revoke that wrote `revoked_at` to the wrong row, or a
 *    resolution that cached, would both pass the route test and fail here.
 */
import { expect, test } from '@playwright/test';

import { loginAsOperator } from './helpers';

const LABEL = `e2e-${Date.now()}`;

/**
 * The slug the BASE SEED writes, and the one every other e2e authenticates
 * against (`helpers.ts`'s `TenantSlug` is `'demo' | 'sample'`). Read from the
 * seed rather than chosen from the screen: a spec that picks its fixture by
 * appearance is order-dependent by construction.
 */
const TENANT_SLUG = 'demo';

test.describe('F.148 A.1 — agent token lifecycle', () => {
  test('issue, show once, check in, revoke', async ({ page, request }) => {
    test.setTimeout(120_000);

    let tenantId = '';
    let token = '';

    await test.step('1. open the seeded tenant as operator', async () => {
      await loginAsOperator(page);
      await page.goto('/admin/tenants');

      /**
       * ASSERT THE ROW EXISTS BEFORE CLICKING, and that is a correction.
       *
       * TWO selectors were wrong before this one, and the rule is what made
       * the difference between them.
       *
       * **First:** `.first().click()` on `getByRole('link', { name: /Demo/ })`.
       * Nothing matched, so the click waited out the **entire 120-second
       * budget** and reported `Test timeout of 120000ms exceeded` — which reads
       * as a slow or hung app when the fact was a selector matching nothing.
       *
       * **Second:** a count assertion on `locator('li, tr')`. Also wrong — the
       * list row is a `div` with a Tailwind grid class — but it failed in
       * **15 seconds** with `locator resolved to 0 elements, unexpected value
       * "0"`. Same defect, a twelfth of the time, and the message named the
       * cause. **The rule earned itself on its first run.**
       *
       * **Now:** a `data-testid` on the row. Not coupled to element type, to
       * Tailwind classes, or to display copy — only to the slug, which is what
       * the seed writes. See docs/TESTING.md.
       */
      const row = page.getByTestId(`tenant-row-${TENANT_SLUG}`);
      await expect(row, `no row for the seeded tenant "${TENANT_SLUG}"`).toHaveCount(1);

      // ADDRESSED BY SEEDED SLUG, not by display text. `TENANT_SLUG` is the
      // value the base seed writes and every other e2e logs in with. Picking a
      // tenant by how it looks on screen is how a spec becomes order-dependent
      // (F.134's shape).
      await row.getByRole('link', { name: 'Open' }).first().click();
      await page.waitForURL(/\/admin\/tenants\/[0-9a-f-]{36}/);
      tenantId = page.url().split('/admin/tenants/')[1]!.split(/[?#]/)[0]!;
      expect(tenantId).toMatch(/^[0-9a-f-]{36}$/);
    });

    await test.step('2. issue a token', async () => {
      await page.getByRole('button', { name: /Issue token/i }).click();
      await page.getByLabel(/What is this installation/i).fill(LABEL);
      await page.getByRole('button', { name: /^Issue$/ }).click();

      const panel = page.getByTestId('agent-token-once');
      await expect(panel).toBeVisible({ timeout: 20_000 });

      // SHOW-ONCE IS STATED AS A PROPERTY, not an apology. Assert the wording,
      // because the wording is the decision: "we store a digest" tells the
      // operator something true about how their credential is protected.
      await expect(panel).toContainText(/store a\s+digest/i);
      await expect(panel).toContainText(/cannot be recovered/i);

      const shown = (await panel.locator('.mono').first().textContent())?.trim() ?? '';
      expect(shown).toMatch(/^[A-Za-z0-9_-]{43}$/);
      token = shown;
    });

    await test.step('3. the token is NOT recoverable after a reload', async () => {
      // The UI claims show-once. An unasserted claim is the F.169 shape.
      await page.reload();
      await expect(page.getByTestId('agent-token-once')).toHaveCount(0);
      // And it is nowhere else on the page either — not in a data attribute,
      // not in a hidden field, not in the serialised props.
      const html = await page.content();
      expect(html).not.toContain(token);
      // The token's LABEL is still listed, so this is not passing because the
      // section failed to render.
      await expect(page.getByText(LABEL, { exact: false }).first()).toBeVisible();
    });

    await test.step('4. the agent can check in with it', async () => {
      const res = await request.get('/api/agent/checkin', {
        headers: { authorization: `Bearer ${token}`, 'x-agent-version': 'e2e-1.0.0' },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.tenantId).toBe(tenantId);
      expect(body.scope).toBe('read');
    });

    await test.step('5. the check-in shows on the screen, bucketed and not exact', async () => {
      await page.reload();
      const row = page.locator('li', { hasText: LABEL });
      const seen = row.getByTestId('agent-token-lastseen');
      // "within the last 15 minutes" — never a timestamp. `last_seen_at` is a
      // lower bound by one throttle window, so an exact-looking value would be
      // false precision (F.139 / F.176's family).
      await expect(seen).toContainText(/within the last 15 minutes/i);
      await expect(seen).not.toContainText(/\d{2}:\d{2}/);
      await expect(seen).toContainText('e2e-1.0.0');
    });

    await test.step('6. revoke it', async () => {
      const row = page.locator('li', { hasText: LABEL });
      await row.getByRole('button', { name: /Revoke/i }).click();
      await expect(row.getByTestId('agent-token-revoked')).toBeVisible({ timeout: 20_000 });
      // THE ROW STAYS. A revoked token absent from the UI is indistinguishable
      // from one never issued, which puts the screen and `audit_log` in
      // disagreement with no way to settle it.
      await expect(page.getByText(LABEL, { exact: false }).first()).toBeVisible();
      await expect(row).toContainText(/revoked/i);
    });

    await test.step('7. a REVOKED token is rejected exactly like an UNKNOWN one', async () => {
      // The lifecycle assertion. The route's four-identical test covers the
      // response shape; this is where a revoke that wrote to the wrong row, or
      // a resolution that cached, would actually surface.
      const fingerprint = async (bearer: string) => {
        const res = await request.get('/api/agent/checkin', {
          headers: { authorization: `Bearer ${bearer}` },
        });
        return {
          status: res.status(),
          wwwAuthenticate: res.headers()['www-authenticate'] ?? null,
          body: await res.text(),
        };
      };

      const revoked = await fingerprint(token);
      const unknown = await fingerprint('f148-e2e-definitely-not-a-token');

      expect(revoked.status).toBe(401);
      // IDENTICAL, not merely both 401 — the distinction between "revoked" and
      // "never existed" would confirm a valid token value.
      expect(revoked).toEqual(unknown);
      expect(JSON.parse(revoked.body)).toEqual({ error: 'unauthorized' });
    });
  });
});
