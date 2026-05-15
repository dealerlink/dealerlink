/**
 * Day 10 verify — quotation PDF pipeline.
 *
 * Opens a seeded quotation, downloads its PDF (rendered by the workers
 * `render-cli` subprocess), and asserts the bytes are a real PDF. Then
 * re-downloads (served from the cached generated_documents row) and
 * regenerates as admin.
 *
 * Note: PDF generation spawns a Chromium render — these tests are slower
 * than the other verify specs; the 60s spec timeout (playwright.config.ts)
 * covers it.
 */
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { loginAs } from './helpers';

/**
 * Open a seeded QT- quotation whose dealer resolves cleanly (Bill-To is a
 * real name, not the "—" placeholder). DB-test runs can leave residual
 * quotations behind (DEV.31); this walks the list until it finds a usable
 * one so the PDF render has a complete payload.
 */
async function openSeededQuotation(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/quotations');
  const links = page
    .locator('table tbody tr', { has: page.locator('td.mono', { hasText: /QT-\d{4}-/ }) })
    .locator('a[href^="/quotations/"]');
  const hrefs = (
    await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')))
  )
    .filter((h): h is string => !!h && /^\/quotations\/[0-9a-f-]+$/.test(h))
    .slice(0, 10);
  expect(hrefs.length).toBeGreaterThan(0);

  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.locator('h1').first()).toContainText(/QT-/);
    // The Bill-To name sits under the "Bill to" label in the Parties card.
    const billTo = page
      .locator('section', { hasText: 'Parties' })
      .getByText('Bill to')
      .locator('..');
    const name = (await billTo.textContent())?.replace('Bill to', '').trim() ?? '';
    if (name && !name.startsWith('—')) return;
  }
  throw new Error('verify-day-10: no seeded quotation with a resolvable dealer found');
}

test.describe('Day 10 — quotation PDF', () => {
  test('Download PDF produces a real PDF file', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await openSeededQuotation(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 55_000 });
    await page.getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^QT-.*\.pdf$/);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const bytes = readFileSync(filePath);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // PDF magic bytes.
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  test('re-download serves the cached PDF and shows the generated timestamp', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await openSeededQuotation(page);

    // First download generates (or reuses) the PDF.
    const first = page.waitForEvent('download', { timeout: 55_000 });
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await first;

    // After a refresh the page reports the last-generated time and offers
    // the admin-only Regenerate action.
    await page.reload();
    await expect(page.getByText(/Last generated:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate PDF' })).toBeVisible();

    // A second download succeeds — served from the cached row.
    const second = page.waitForEvent('download', { timeout: 55_000 });
    await page.getByRole('button', { name: 'Download PDF' }).click();
    const cached = await second;
    expect(cached.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test('admin can regenerate the PDF', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await openSeededQuotation(page);

    // Ensure a PDF exists so the Regenerate button is shown.
    const first = page.waitForEvent('download', { timeout: 55_000 });
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await first;
    await page.reload();

    page.on('dialog', (d) => {
      void d.accept();
    });
    await page.getByRole('button', { name: 'Regenerate PDF' }).click();
    await expect(page.getByText('PDF regenerated.')).toBeVisible({ timeout: 55_000 });
  });
});
