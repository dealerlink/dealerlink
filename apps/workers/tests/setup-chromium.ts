/**
 * Vitest setup for apps/workers — makes the Puppeteer render pipeline runnable
 * in an arm64 devcontainer.
 *
 * DEV.89: `@sparticuz/chromium` (the production/dev Linux Chromium in
 * browser.ts) ships an x86-64 binary. On an arm64 devcontainer it extracts and
 * `existsSync` succeeds, so browser.ts hands it to puppeteer — which then dies
 * with `rosetta error: failed to open elf at /lib64/ld-linux-x86-64.so.2`. The
 * render smoke test's "No Chromium executable" skip guard does not catch this
 * (the binary exists; it just cannot run on this arch), so the suite goes red.
 *
 * Fix: point puppeteer at the arm64 Chromium that Playwright already installs
 * under ~/.cache/ms-playwright/chromium-<version>/chrome-linux/chrome.
 * browser.ts honours PUPPETEER_EXECUTABLE_PATH first, so this is a clean
 * override.
 *
 * Scoped to arm64: on x64 the override is a no-op and `@sparticuz/chromium`
 * stays the intended dev/prod binary. Also a no-op if the env var is already
 * set. No production code path changes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.PUPPETEER_EXECUTABLE_PATH && process.arch !== 'x64') {
  const exe = findPlaywrightChromium();
  if (exe) process.env.PUPPETEER_EXECUTABLE_PATH = exe;
}

function findPlaywrightChromium(): string | undefined {
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base)) {
    // Prefer the full Chromium build over the headless_shell variant.
    if (!dir.startsWith('chromium-') || dir.includes('headless')) continue;
    const exe = path.join(base, dir, 'chrome-linux', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}
