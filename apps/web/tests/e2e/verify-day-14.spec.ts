/**
 * Day 14 verify — async email through the pg-boss path.
 *
 * Drives the Email-PDF flow on a seeded quotation end to end: the action
 * renders the PDF, writes a `queued` email_delivery_log row, and enqueues a
 * pg-boss `send-email` job. The UI surfaces "queued for delivery" — the
 * async-first contract (R.13). The worker→sent transition and the inbound
 * webhook are covered by integration tests (handler + webhook specs); a
 * Playwright run cannot host the workers process or forge Svix headers.
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers';

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded user needs password rotation');
  }
}

test.describe('Day 14 — async email dispatch', () => {
  test('admin queues a quotation PDF email through the pg-boss path', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    // Open a seeded quotation (QT-2026-…) — DB-test residue never shadows it.
    await page.goto('/quotations');
    const seededRow = page
      .locator('table tbody tr', { has: page.locator('td', { hasText: /QT-\d{4}-/ }) })
      .first();
    if ((await seededRow.count()) === 0) {
      test.skip(true, 'No seeded quotations');
    }
    await seededRow.locator('a[href^="/quotations/"]').first().click();
    await page.waitForURL(/\/quotations\/[0-9a-f-]+$/);

    // Open the Email-PDF panel and submit. Scope to the panel (the smallest
    // div holding both the email input and the panel heading) so the "Send"
    // button is not confused with the quotation's own send action.
    await page.getByRole('button', { name: 'Email PDF' }).click();
    const panel = page
      .locator('div')
      .filter({ has: page.locator('input[type="email"]') })
      .filter({ hasText: 'Email quotation PDF' })
      .last();
    await expect(panel).toBeVisible();
    await panel.locator('input[type="email"]').fill('verify-day14@example.test');
    await panel.getByRole('button', { name: 'Send' }).click();

    // Async-first: the UI confirms the email was QUEUED, not "sent".
    await expect(page.getByText(/queued for delivery/i)).toBeVisible({ timeout: 60_000 });
  });
});
