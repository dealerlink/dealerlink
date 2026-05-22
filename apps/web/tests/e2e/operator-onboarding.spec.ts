/**
 * Operator onboarding E2E — closes R.12 (deferred from Day 4, DEV.13).
 *
 * ── Scenario ──────────────────────────────────────────────────────────────
 * A platform operator provisions a brand-new tenant from scratch and the new
 * tenant's admin then signs in.
 *
 *  1. Login as operator@dealerlink.test.
 *  2. Navigate to /admin/tenants and open the "New tenant" form.
 *  3. Fill the provisioning form (slug, legal/display name, GSTIN + PAN,
 *     state, registered address, bank details, initial admin user).
 *  4. Submit — the operator lands on the new tenant's detail page.
 *  5. The "credentials shown once" banner exposes the admin email + the
 *     generated temporary password.
 *  6. The new tenant appears in the /admin/tenants list.
 *  7. Sign out, then sign in as the freshly-created admin using the
 *     temporary password. The new admin is FORCED through the
 *     password-rotation screen (must_change_password = true) before reaching
 *     the app; after rotating, they land on the dashboard.
 *  8. The new admin reaches the dashboard — an empty workspace (no seeded
 *     pipeline data), confirming tenant isolation from `demo`/`sample`.
 *
 * ── Isolation (A2.2) ──────────────────────────────────────────────────────
 * Every created entity is suffixed with a unique per-run id and the slug is
 * "newtenant-<run>", so the spec is idempotent and never collides with a
 * previous run (slug, GSTIN, and admin email are all unique).
 *
 * ── Force-password-change (Stage C Day C.1, closes DEV.56) ─────────────────
 * CLAUDE.md §6 / ADR-010 specify a force-password-change screen gated by
 * `users.must_change_password`. As of Stage C Day C.1 the rotation route
 * (app/(auth)/change-password) ships and the (app)/admin layouts enforce it.
 * This spec now verifies the real behaviour: login with the temporary
 * password lands on /change-password, and only after rotating does the new
 * admin reach the dashboard. (Was a carried-forward gap; see DEVIATIONS.md
 * DEV.56 and docs/STAGE_C_HANDOFF.md.)
 */
import { expect, test } from '@playwright/test';

import { loginAsOperator, SEEDED_USERS } from './helpers';

const RUN = Date.now().toString(36);
const SLUG = `newtenant-${RUN}`;
const LEGAL_NAME = `New Tenant Solar Distributors ${RUN} Pvt Ltd`;
const DISPLAY_NAME = `New Tenant Solar ${RUN}`;
const ADMIN_EMAIL = `newadmin-${RUN}@newtenant.test`;
const ADMIN_NAME = `New Admin ${RUN}`;

/** GSTIN mod-36 check character for a 14-char prefix (state+PAN+entity+'Z'). */
const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstinCheckChar(prefix14: string): string {
  let sum = 0;
  let factor = 1;
  for (let i = 0; i < 14; i += 1) {
    const v = GSTIN_CHARSET.indexOf(prefix14[i]!);
    const p = v * factor;
    sum += Math.floor(p / 36) + (p % 36);
    factor = factor === 1 ? 2 : 1;
  }
  return GSTIN_CHARSET[(36 - (sum % 36)) % 36]!;
}

// A unique, checksum-valid GSTIN: state 27 (Maharashtra) + a PAN built from
// the run timestamp + entity digit + 'Z' + computed check character.
const PAN = `AABCA${String(Date.now() % 10000).padStart(4, '0')}Z`;
const GSTIN_PREFIX = `27${PAN}1Z`;
const GSTIN = GSTIN_PREFIX + gstinCheckChar(GSTIN_PREFIX);

test.describe('Operator onboarding — provision a tenant from scratch (R.12)', () => {
  test.setTimeout(5 * 60_000);

  test('operator provisions a tenant and its admin can sign in', async ({ page }) => {
    page.setDefaultTimeout(15_000);

    // ── 1. Login as operator ─────────────────────────────────────────────
    await test.step('1. login as operator', async () => {
      await loginAsOperator(page);
      await expect(page).toHaveURL(/admin/);
    });

    // ── 2. Open the New tenant form ──────────────────────────────────────
    await test.step('2. open the New tenant form', async () => {
      await page.goto('/admin/tenants');
      await page
        .getByRole('link', { name: /New tenant/i })
        .first()
        .click();
      await page.waitForURL(/\/admin\/tenants\/new/);
      await expect(page.getByRole('heading', { name: 'New tenant' })).toBeVisible();
    });

    // ── 3. Fill the provisioning form ────────────────────────────────────
    await test.step('3. fill the provisioning form', async () => {
      await page.locator('input[name="slug"]').fill(SLUG);
      // Slug availability is checked debounced — wait for the "available" state.
      await expect(page.getByText('Available', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await page.locator('input[name="legalName"]').fill(LEGAL_NAME);
      await page.locator('input[name="displayName"]').fill(DISPLAY_NAME);
      await page.locator('input[name="gstin"]').fill(GSTIN);
      await page.locator('input[name="pan"]').fill(PAN);
      await page.locator('select[name="state"]').selectOption('Maharashtra');
      await page.locator('input[name="addressLine1"]').fill('1 Solar Park Road');
      await page.locator('input[name="addressCity"]').fill('Pune');
      await page.locator('input[name="addressPincode"]').fill('411001');
      await page.locator('select[name="addressState"]').selectOption('Maharashtra');
      await page.locator('input[name="bankAccountName"]').fill(LEGAL_NAME);
      await page.locator('input[name="bankAccountNumber"]').fill('50200099887766');
      await page.locator('input[name="bankIfsc"]').fill('HDFC0001234');
      await page.locator('input[name="bankBranch"]').fill('FC Road, Pune');
      await page.locator('input[name="adminFullName"]').fill(ADMIN_NAME);
      await page.locator('input[name="adminEmail"]').fill(ADMIN_EMAIL);
      // The form validates on blur (react-hook-form mode:'onBlur'); blurring
      // the last field runs the resolver over every value so `isValid` flips
      // true and the submit button enables.
      await page.locator('input[name="adminEmail"]').blur();
    });

    // ── 4. Submit ────────────────────────────────────────────────────────
    await test.step('4. submit — land on the tenant detail page', async () => {
      const createBtn = page.getByRole('button', { name: 'Create tenant' });
      await expect(createBtn).toBeEnabled({ timeout: 15_000 });
      await createBtn.click();
      await page.waitForURL(/\/admin\/tenants\/[0-9a-f-]+/, { timeout: 30_000 });
    });

    // ── 5. Capture the temporary password from the credentials banner ────
    let tempPassword = '';
    await test.step('5. credentials banner shows the temporary password', async () => {
      await expect(page.getByText(/temporary credentials/i)).toBeVisible({ timeout: 15_000 });
      const row = page.getByText('Temporary password', { exact: true }).locator('..');
      tempPassword = (await row.locator('span.mono').first().innerText()).trim();
      expect(tempPassword.length).toBeGreaterThanOrEqual(8);
      await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
    });

    // ── 6. The tenant appears in the list ────────────────────────────────
    await test.step('6. the new tenant appears in the tenants list', async () => {
      await page.goto('/admin/tenants');
      await expect(page.getByText(DISPLAY_NAME).first()).toBeVisible({ timeout: 15_000 });
    });

    // ── 7. Sign in as the new admin — forced through rotation ────────────
    const NEW_PASSWORD = `Rotated9!${RUN}`;
    await test.step('7. the new admin signs in with the temporary password', async () => {
      await page.context().clearCookies();
      await page.goto(`/login?tenant=${SLUG}`);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[type="password"]', tempPassword);
      await page.click('button[type="submit"]');
      // must_change_password is set on operator-provisioned admins, so login
      // routes to the rotation screen — NOT the dashboard (DEV.56 closed).
      await page.waitForURL(/change-password/, { timeout: 20_000 });
    });

    await test.step('7b. the admin rotates the temporary password', async () => {
      await page.locator('#currentPassword').fill(tempPassword);
      await page.locator('#newPassword').fill(NEW_PASSWORD);
      await page.locator('#confirmPassword').fill(NEW_PASSWORD);
      await page.getByRole('button', { name: /Update password/i }).click();
      // Flag cleared → the admin finally reaches the dashboard.
      await page.waitForURL(/dashboard/, { timeout: 20_000 });
    });

    // ── 8. The new workspace is empty (tenant isolation) ─────────────────
    await test.step('8. the new tenant workspace is empty — isolated from demo', async () => {
      await page.goto(`/pipeline?tenant=${SLUG}`);
      await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();
      // A brand-new tenant has no deals — none of demo's seeded cards leak in.
      await expect(page.locator('section[data-stage] a[href^="/pipeline/"]')).toHaveCount(0);
      // Sanity: this is genuinely a different login than the demo seed users.
      expect(ADMIN_EMAIL).not.toBe(SEEDED_USERS.demo.admin.email);
    });
  });
});
