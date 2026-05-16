/**
 * Day 15 verify — Reports module.
 *
 * Covers the role-scoped report surface, a live filter change, and the
 * server-action CSV export. Report *correctness* (totals arithmetic, GST
 * parity against stored columns) is pinned by the vitest suite in
 * lib/reports/*.test.ts — a Playwright run cannot assert money math cheaply.
 */
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from './helpers';

async function skipIfPasswordRotation(page: Page): Promise<void> {
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded user needs password rotation');
  }
}

test.describe('Day 15 — reports', () => {
  test('admin sees all four reports', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/reports');
    for (const name of [
      'Sales Summary',
      'Outstanding Receivables',
      'Inventory Valuation',
      'GST Summary',
    ]) {
      await expect(page.getByRole('link', { name, exact: false })).toBeVisible();
    }
  });

  test('sales sees only sales summary + outstanding; GST summary is blocked', async ({ page }) => {
    await loginAs(page, 'demo', 'sales');
    await skipIfPasswordRotation(page);

    await page.goto('/reports');
    await expect(page.getByRole('link', { name: 'Sales Summary' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Outstanding Receivables' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Inventory Valuation' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'GST Summary' })).toHaveCount(0);

    // A direct URL to a forbidden report 404s — no GST heading renders.
    await page.goto('/reports/gst-summary');
    await expect(page.getByRole('heading', { name: 'GST Summary' })).toHaveCount(0);
  });

  test('dispatch sees only inventory valuation', async ({ page }) => {
    await loginAs(page, 'demo', 'dispatch');
    await skipIfPasswordRotation(page);

    await page.goto('/reports');
    await expect(page.getByRole('link', { name: 'Inventory Valuation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sales Summary' })).toHaveCount(0);
  });

  test('a report renders a table and reacts to a filter change', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/reports/sales-summary');
    await expect(page.getByRole('heading', { name: 'Sales Summary' })).toBeVisible();
    // Seed data has sales this fiscal year, so the table renders.
    await expect(page.locator('table')).toBeVisible();

    // Changing the group-by filter re-runs the server query.
    await page.selectOption('#filter-groupBy', 'dealer');
    await expect(page).toHaveURL(/groupBy=dealer/);
    await expect(page.locator('th', { hasText: 'Dealer' }).first()).toBeVisible();
  });

  test('CSV export downloads a headered file', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    await skipIfPasswordRotation(page);

    await page.goto('/reports/outstanding');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download CSV/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^outstanding-demo-.*\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    // BOM-prefixed; first line is the column headers.
    expect(body.replace(/^﻿/, '').split('\r\n')[0]).toContain('Dealer');
  });
});
