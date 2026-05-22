/**
 * Stage C Day C.1 verify — force-password-change (closes DEV.56).
 *
 * Proves the must_change_password trapdoor end-to-end:
 *
 *   1. An operator provisions a fresh tenant + admin (admin gets a temporary
 *      password and must_change_password = true).
 *   2. The admin signs in with the temporary password → routed to
 *      /change-password (NOT the dashboard).
 *   3. While the flag is set, navigating to any app route bounces back to
 *      /change-password — the "force".
 *   4. Rotating the password clears the flag → the admin reaches /dashboard.
 *   5. Signing in again with the NEW password works and lands on /dashboard
 *      directly (no rotation screen).
 *   6. Signing in with the OLD temporary password fails.
 *
 * Self-contained: every entity is suffixed with a unique per-run id, so the
 * spec is idempotent and never collides with a previous run or the seed.
 */
import { expect, test } from '@playwright/test';

import { loginAsOperator } from './helpers';

const RUN = Date.now().toString(36);
const SLUG = `pwrotate-${RUN}`;
const LEGAL_NAME = `Rotate Co ${RUN} Pvt Ltd`;
const DISPLAY_NAME = `Rotate Co ${RUN}`;
const ADMIN_EMAIL = `rotateadmin-${RUN}@rotate.test`;
const ADMIN_NAME = `Rotate Admin ${RUN}`;
const NEW_PASSWORD = `Rotated9!${RUN}`;

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

const PAN = `AABCR${String(Date.now() % 10000).padStart(4, '0')}Z`;
const GSTIN_PREFIX = `27${PAN}1Z`;
const GSTIN = GSTIN_PREFIX + gstinCheckChar(GSTIN_PREFIX);

test.describe('Stage C Day C.1 — force-password-change (DEV.56)', () => {
  test.setTimeout(5 * 60_000);

  test('a provisioned admin is forced to rotate before reaching the app', async ({ page }) => {
    page.setDefaultTimeout(15_000);

    // ── Provision a fresh tenant + admin as operator ─────────────────────
    let tempPassword = '';
    await test.step('operator provisions a fresh tenant + admin', async () => {
      await loginAsOperator(page);
      await page.goto('/admin/tenants/new');
      await expect(page.getByRole('heading', { name: 'New tenant' })).toBeVisible();

      await page.locator('input[name="slug"]').fill(SLUG);
      await expect(page.getByText('Available', { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.locator('input[name="legalName"]').fill(LEGAL_NAME);
      await page.locator('input[name="displayName"]').fill(DISPLAY_NAME);
      await page.locator('input[name="gstin"]').fill(GSTIN);
      await page.locator('input[name="pan"]').fill(PAN);
      await page.locator('select[name="state"]').selectOption('Maharashtra');
      await page.locator('input[name="addressLine1"]').fill('2 Rotation Lane');
      await page.locator('input[name="addressCity"]').fill('Pune');
      await page.locator('input[name="addressPincode"]').fill('411002');
      await page.locator('select[name="addressState"]').selectOption('Maharashtra');
      await page.locator('input[name="bankAccountName"]').fill(LEGAL_NAME);
      await page.locator('input[name="bankAccountNumber"]').fill('50200011223344');
      await page.locator('input[name="bankIfsc"]').fill('HDFC0004321');
      await page.locator('input[name="bankBranch"]').fill('FC Road, Pune');
      await page.locator('input[name="adminFullName"]').fill(ADMIN_NAME);
      await page.locator('input[name="adminEmail"]').fill(ADMIN_EMAIL);
      await page.locator('input[name="adminEmail"]').blur();

      const createBtn = page.getByRole('button', { name: 'Create tenant' });
      await expect(createBtn).toBeEnabled({ timeout: 15_000 });
      await createBtn.click();
      await page.waitForURL(/\/admin\/tenants\/[0-9a-f-]+/, { timeout: 30_000 });

      await expect(page.getByText(/temporary credentials/i)).toBeVisible({ timeout: 15_000 });
      const row = page.getByText('Temporary password', { exact: true }).locator('..');
      tempPassword = (await row.locator('span.mono').first().innerText()).trim();
      expect(tempPassword.length).toBeGreaterThanOrEqual(8);
    });

    // ── 1. Temp-password login routes to the rotation screen ─────────────
    await test.step('login with the temporary password lands on /change-password', async () => {
      await page.context().clearCookies();
      await page.goto(`/login?tenant=${SLUG}`);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[type="password"]', tempPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL(/change-password/, { timeout: 20_000 });
    });

    // ── 2. The flag forces a redirect from any other route ───────────────
    await test.step('navigating elsewhere bounces back to /change-password', async () => {
      await page.goto(`/dashboard?tenant=${SLUG}`);
      await page.waitForURL(/change-password/, { timeout: 20_000 });
      // Sanity: the rotation form is actually on screen.
      await expect(page.locator('#newPassword')).toBeVisible();
    });

    // ── 3. Rotating the password clears the flag → dashboard ─────────────
    await test.step('rotating the password unlocks the app', async () => {
      await page.goto(`/change-password?tenant=${SLUG}`);
      await page.locator('#currentPassword').fill(tempPassword);
      await page.locator('#newPassword').fill(NEW_PASSWORD);
      await page.locator('#confirmPassword').fill(NEW_PASSWORD);
      await page.getByRole('button', { name: /Update password/i }).click();
      await page.waitForURL(/dashboard/, { timeout: 20_000 });
    });

    // ── 4. Re-login with the NEW password goes straight to the dashboard ─
    await test.step('the new password logs in directly (flag cleared)', async () => {
      await page.context().clearCookies();
      await page.goto(`/login?tenant=${SLUG}`);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[type="password"]', NEW_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard/, { timeout: 20_000 });
    });

    // ── 5. The OLD temporary password no longer works ────────────────────
    await test.step('the old temporary password is rejected', async () => {
      await page.context().clearCookies();
      await page.goto(`/login?tenant=${SLUG}`);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[type="password"]', tempPassword);
      await page.click('button[type="submit"]');
      // Scoped to the error text — `getByRole('alert')` alone also matches
      // Next's empty route-announcer div.
      await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/login/);
    });
  });
});
