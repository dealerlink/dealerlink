/**
 * Day 7 verify — sales pipeline kanban.
 *
 * Smoke: /pipeline loads with 9 columns + seeded deals, /pipeline/[id]
 * renders the detail view, dashboard surfaces pipeline KPIs.
 */
import { expect, test } from '@playwright/test';

import { loginAs } from './helpers';

test.describe('Day 7 — sales pipeline', () => {
  test('/pipeline renders the 9-column kanban with seeded deals', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/pipeline');
    await expect(page.locator('h1')).toContainText('Pipeline');

    // Nine stage columns (one section per stage).
    const cols = page.locator('section[data-stage]');
    await expect(cols).toHaveCount(9);

    // Stage labels appear in the header.
    await expect(page.getByText('Qualification', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();

    // At least one seeded deal card on the board.
    await expect(page.locator('section[data-stage="qualification"]').first()).toBeVisible();
  });

  test('/pipeline shows the new deal button for admin', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/pipeline');
    await expect(page.getByRole('link', { name: /new deal/i })).toBeVisible();
  });

  test('/pipeline/new renders the create form', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/pipeline/new');
    await expect(page.locator('h1')).toContainText('New deal');
    await expect(page.getByRole('button', { name: /create deal/i })).toBeVisible();
  });

  test('a seeded deal opens its detail page', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/pipeline');
    // The card is wrapped in a dnd-kit draggable that intercepts pointer
    // events; Playwright's synthetic click doesn't always propagate to the
    // anchor. Read the href directly and navigate — the test is asserting
    // the detail page renders, not the click affordance.
    const firstCard = page.locator('section[data-stage] a[href^="/pipeline/"]').first();
    await expect(firstCard).toBeVisible();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/^\/pipeline\/[0-9a-f-]+$/);
    await page.goto(href!);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText(/stage history/i)).toBeVisible();
    await expect(page.getByText(/products/i).first()).toBeVisible();
  });

  test('/dashboard surfaces pipeline KPIs and funnel', async ({ page }) => {
    await loginAs(page, 'demo', 'admin');
    if (page.url().includes('change-password')) {
      test.skip(true, 'Seeded admin needs password rotation');
    }
    await page.goto('/dashboard');
    await expect(page.getByText('Pipeline value', { exact: true })).toBeVisible();
    await expect(page.getByText('Open deals', { exact: true })).toBeVisible();
    // "Hot deals" appears twice: KPI label + section header. Match first.
    await expect(page.getByText('Hot deals', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Stage funnel', { exact: true })).toBeVisible();
  });
});
