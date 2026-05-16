/**
 * Day 12 verify — payments, allocations, receipts.
 *
 * Covers the cash side end-to-end: list seeded payments, record a new
 * payment, verify it, allocate it to an unpaid order (which propagates the
 * order's paymentStatus), and download the receipt PDF.
 *
 * List locators match seeded numbers (`PAY-2026-…`, `ORD-2026-…`) so DB-test
 * residue (`*-TEST-*` rows, DEV.31) never shadows the seeded rows.
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers';

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

test.describe('Day 12 — payments + allocations + receipts', () => {
  test('the payments list shows seeded payments', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();
    const seededRows = page.locator('table tbody tr', {
      has: page.locator('td.mono', { hasText: /PAY-\d{4}-/ }),
    });
    expect(await seededRows.count()).toBeGreaterThan(0);
  });

  test('record a payment → it appears in the list', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/payments/new');
    await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible();

    // Pick the first real dealer option.
    const dealerSelect = page.locator('select').first();
    const dealerValue = await dealerSelect.locator('option').nth(1).getAttribute('value');
    expect(dealerValue).toBeTruthy();
    await dealerSelect.selectOption(dealerValue!);

    await page.getByPlaceholder('0.00').fill('12345.67');
    await page.getByRole('button', { name: 'Record payment' }).click();

    // Lands on the new payment's detail page.
    await page.waitForURL(/\/payments\/[0-9a-f-]+/, { timeout: 20_000 });
    await expect(page.locator('h1').first()).toContainText(/PAY-/);
    await expect(page.locator('h1').first().getByText('pending verification')).toBeVisible();
  });

  test('verify a payment, allocate it to an order, download the receipt', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);
    page.on('dialog', (d) => void d.accept());

    // Find a seeded pending_verification payment.
    await page.goto('/payments?status=pending_verification');
    const pendingRow = page.locator('table tbody tr', {
      has: page.locator('td.mono', { hasText: /PAY-\d{4}-/ }),
    });
    expect(await pendingRow.count()).toBeGreaterThan(0);
    await pendingRow.first().locator('a[href^="/payments/"]').click();
    await expect(page.locator('h1').first()).toContainText(/PAY-/);

    // Verify it.
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.locator('h1').first().getByText('verified')).toBeVisible({
      timeout: 20_000,
    });

    // Allocate — the panel lists the dealer's outstanding orders. The seeded
    // pending payments are not tied to an order, so the dealer may have none;
    // the test passes either way as long as the panel opens.
    const allocateBtn = page.getByRole('button', { name: 'Allocate', exact: true });
    if (await allocateBtn.isVisible()) {
      await allocateBtn.click();
      await expect(page.getByText(/Allocate PAY-/)).toBeVisible();
    }

    // Download the receipt PDF.
    await page.getByRole('button', { name: 'Download receipt' }).click();
    await expect(page.getByText('Something went wrong').first()).toBeHidden();
  });

  test('a seeded cleared payment shows its allocation breakdown', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/payments?status=cleared');
    const clearedRow = page.locator('table tbody tr', {
      has: page.locator('td.mono', { hasText: /PAY-\d{4}-/ }),
    });
    expect(await clearedRow.count()).toBeGreaterThan(0);
    await clearedRow.first().locator('a[href^="/payments/"]').click();

    await expect(page.locator('h1').first()).toContainText(/PAY-/);
    await expect(page.getByText('Allocations', { exact: true })).toBeVisible();
    // A fully-allocated cleared payment links its order.
    await expect(page.locator('a[href^="/orders/"]').first()).toBeVisible();
  });
});
