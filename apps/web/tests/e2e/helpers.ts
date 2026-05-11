import type { Page } from '@playwright/test';

// Single source of truth for seeded test credentials.
// MUST stay in sync with packages/db/src/seeds/index.ts.
// If the seed password changes, update both places together.
export const SEEDED_USERS = {
  demo: {
    admin: { email: 'admin@demo.test', password: 'password123' },
    sales: { email: 'sales@demo.test', password: 'password123' },
    accounts: { email: 'accounts@demo.test', password: 'password123' },
    dispatch: { email: 'dispatch@demo.test', password: 'password123' },
  },
  sample: {
    admin: { email: 'admin@sample.test', password: 'password123' },
    sales: { email: 'sales@sample.test', password: 'password123' },
    accounts: { email: 'accounts@sample.test', password: 'password123' },
    dispatch: { email: 'dispatch@sample.test', password: 'password123' },
  },
  operator: { email: 'operator@dealerlink.test', password: 'password123' },
} as const;

type TenantSlug = 'demo' | 'sample';
type TenantRole = keyof typeof SEEDED_USERS.demo;

export async function loginAs(page: Page, tenant: TenantSlug, role: TenantRole): Promise<void> {
  const user = SEEDED_USERS[tenant][role];
  await page.goto(`/login?tenant=${tenant}`);
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|change-password|inventory|pipeline/, { timeout: 10_000 });
}

export async function loginAsOperator(page: Page): Promise<void> {
  const user = SEEDED_USERS.operator;
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/admin/, { timeout: 10_000 });
}
