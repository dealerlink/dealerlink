/**
 * Stage C Day C.2 verify — state-code normalization (DEV.33 / DEV.70).
 *
 * The contract: state is STORED as an ISO 3166-2:IN 2-letter code, but the UI
 * shows the full name and the dropdowns submit the code. These checks prove
 * both ends against the seeded demo tenant.
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers';

const FULL_NAMES = /Maharashtra|Assam|Karnataka|Tamil Nadu|Gujarat|Uttar Pradesh|Rajasthan/;

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded admin needs password rotation');
  }
}

test.describe('Stage C Day C.2 — state codes', () => {
  test('the dealer state dropdown shows full names and submits codes', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/dealers/new');
    // The option a human reads is "Maharashtra"; the value submitted is "MH".
    const option = page.getByRole('option', { name: 'Maharashtra', exact: true });
    await expect(option).toHaveAttribute('value', 'MH');
    await expect(page.getByRole('option', { name: 'Karnataka', exact: true })).toHaveAttribute(
      'value',
      'KA',
    );
  });

  test('a dealer detail page renders its state as a full name', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/dealers');
    await page.locator('table tbody tr a[href^="/dealers/"]').first().click();
    await expect(page).toHaveURL(/\/dealers\/[0-9a-f-]+/);
    // The Address section shows the full state name, never a bare 2-letter code.
    await expect(page.getByText(FULL_NAMES).first()).toBeVisible();
  });

  test('the GST summary report shows place of supply as full names', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/reports/gst-summary');
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.getByText(FULL_NAMES).first()).toBeVisible();
  });
});
