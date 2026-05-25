// Resolves Playwright's chromium launcher from apps/web's node_modules
// (@playwright/test is a devDependency there, not at the repo root), so the
// repo-root load-test scripts can drive a real browser for login + the
// Server-Action-backed flows (PDF render, write workflows) that are
// impractical to replay over raw fetch.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export async function getChromium() {
  const pwPath = require.resolve('@playwright/test', {
    paths: ['C:/dev/dealerlink/apps/web', process.cwd()],
  });
  const mod = await import(pathToFileURL(pwPath).href);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (typeof chromium?.launch !== 'function') {
    throw new Error('Could not resolve Playwright chromium launcher from apps/web.');
  }
  return chromium;
}
