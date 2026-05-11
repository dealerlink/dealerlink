/**
 * Day 2 verify — login for a seeded user, dashboard shows.
 *
 * Credentials live in helpers.ts which mirrors packages/db/src/seeds/index.ts.
 */
import { expect, test } from '@playwright/test';

import { loginAs } from './helpers';

test.describe('Day 2 — auth + dashboard', () => {
  test('login → dashboard greeting', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    // If forced to change password, mark this as a soft check rather than fail.
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin requires password rotation — covered in day 4 spec');
    }
    await expect(page.locator('h1')).toContainText(/Good\s+(morning|afternoon|evening)/);
  });
});
