// Capture login session cookies for the load tests.
//
// Logs in as each seeded role on its tenant subdomain via a real browser
// (login is a Lucia Server Action — far more robust to drive than to replay),
// extracts the `dealerlink_session` cookie, and writes them to .sessions.json
// (gitignored). Re-run whenever the cookies expire or staging is re-seeded.
//
//   node scripts/load-test/session.mjs
import { writeFile } from 'node:fs/promises';

import { config, SESSIONS_FILE } from './lib/config.mjs';
import { getChromium } from './lib/playwright.mjs';

/** Log in once in a fresh context; return the session cookie value. */
async function capture(browser, baseUrl, slug, email, password) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    // The ?tenant= query is a no-op on a real subdomain (resolved by host),
    // harmless to include for parity with the e2e helpers.
    await page.goto(`${baseUrl}/login?tenant=${slug}`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard|admin|change-password/, { timeout: 60_000 });
    if (page.url().includes('change-password')) {
      throw new Error(`${email} unexpectedly requires password rotation`);
    }
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === config.cookieName);
    if (!session) throw new Error(`no ${config.cookieName} cookie after login as ${email}`);
    return session.value;
  } finally {
    await context.close();
  }
}

async function main() {
  const chromium = await getChromium();
  const browser = await chromium.launch({ headless: true });
  const out = { capturedAt: new Date().toISOString(), apex: config.apex, demo: {}, sample: {} };
  try {
    for (const [role, creds] of Object.entries(config.users.demo)) {
      process.stdout.write(`  demo/${role} … `);
      out.demo[role] = await capture(browser, config.demoUrl, 'demo', creds.email, creds.password);
      console.log('ok');
    }
    for (const [role, creds] of Object.entries(config.users.sample)) {
      process.stdout.write(`  sample/${role} … `);
      out.sample[role] = await capture(
        browser,
        config.sampleUrl,
        'sample',
        creds.email,
        creds.password,
      );
      console.log('ok');
    }
  } finally {
    await browser.close();
  }
  await writeFile(SESSIONS_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${SESSIONS_FILE}`);
}

main().catch((err) => {
  console.error('session capture failed:', err.message ?? err);
  process.exit(1);
});
