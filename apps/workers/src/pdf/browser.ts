/**
 * Puppeteer browser lifecycle for the PDF pipeline.
 *
 * One Chromium process is shared across every render job (per
 * docs/PDF_PIPELINE.md: "warm pool of 1"). This module owns that singleton
 * and the policies that keep it healthy:
 *
 *  - Lazy launch    — Chromium starts on the first `getBrowser()` call, not
 *                     at process boot.
 *  - Idle recycle   — if the browser has been unused for > IDLE_LIMIT_MS it
 *                     is closed and re-launched on the next request, so a
 *                     quiet worker does not hold a Chromium process forever.
 *  - Page-count cap — Chromium leaks memory slowly; the process is recycled
 *                     after RENDER_LIMIT pages (docs/PDF_PIPELINE.md says
 *                     "restart Chromium every 100 renders").
 *  - Crash recovery — a dead/disconnected browser is detected and replaced.
 *
 * Production (Linux container, Stage D) uses @sparticuz/chromium's slim
 * Chromium build. In dev we fall back to a system Chromium install — see
 * `resolveExecutable()`.
 */
import { existsSync } from 'node:fs';

import type { Browser } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';

/** Recycle the Chromium process after this many pages — memory-leak guard. */
const RENDER_LIMIT = 100;
/** Close an idle browser after this long with no render. */
const IDLE_LIMIT_MS = 10 * 60 * 1000;

interface BrowserState {
  browser: Browser;
  pagesOpened: number;
  lastUsed: number;
}

let state: BrowserState | null = null;
/** Guards against two jobs launching Chromium concurrently. */
let launching: Promise<BrowserState> | null = null;

interface LaunchConfig {
  executablePath: string;
  args: string[];
  headless: boolean;
}

/**
 * Resolve a Chromium executable + launch args.
 *
 *  1. `PUPPETEER_EXECUTABLE_PATH` — explicit override, always wins.
 *  2. @sparticuz/chromium — the production path (Linux container). Loaded
 *     dynamically so a dev machine without a compatible binary does not
 *     crash at import time.
 *  3. A system Chromium/Chrome install — the dev fallback.
 *
 * The `--no-sandbox --disable-dev-shm-usage` flags are required for running
 * Chromium inside the Stage D Droplet/container (docs/PDF_PIPELINE.md).
 */
async function resolveLaunchConfig(): Promise<LaunchConfig> {
  const baseArgs = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

  const override = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (override && existsSync(override)) {
    return { executablePath: override, args: baseArgs, headless: true };
  }

  // Production: @sparticuz/chromium ships a slim Chromium suited to
  // serverless/container Linux. Its binary pack is Linux-only, so only
  // attempt it there — on dev machines (Windows/macOS) it would extract an
  // unrunnable binary. Non-Linux always falls through to system Chromium.
  if (process.platform === 'linux') {
    try {
      const mod = await import('@sparticuz/chromium');
      const chromium = mod.default;
      const execPath = await chromium.executablePath();
      if (execPath && existsSync(execPath)) {
        return {
          executablePath: execPath,
          args: [...chromium.args, ...baseArgs],
          headless: true,
        };
      }
    } catch {
      // Fall through to the system-Chromium dev path.
    }
  }

  const sysPath = resolveSystemChromium();
  if (!sysPath) {
    throw new Error(
      'No Chromium executable found. Set PUPPETEER_EXECUTABLE_PATH, install ' +
        'Google Chrome, or run on a platform supported by @sparticuz/chromium.',
    );
  }
  return { executablePath: sysPath, args: baseArgs, headless: true };
}

/** Best-effort lookup of a system Chrome/Chromium install for dev use. */
function resolveSystemChromium(): string | null {
  const candidates = [
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function launch(): Promise<BrowserState> {
  const config = await resolveLaunchConfig();
  const browser = await puppeteer.launch({
    executablePath: config.executablePath,
    args: config.args,
    headless: config.headless,
  });
  return { browser, pagesOpened: 0, lastUsed: Date.now() };
}

async function disposeState(s: BrowserState): Promise<void> {
  try {
    await s.browser.close();
  } catch {
    // Already dead — nothing to clean up.
  }
}

/**
 * Get the shared browser, launching or recycling it as the lifecycle
 * policies require. Callers must `closePage()` every page they open.
 */
export async function getBrowser(): Promise<Browser> {
  // Recycle a stale or over-used instance before handing it out.
  if (state) {
    const idle = Date.now() - state.lastUsed > IDLE_LIMIT_MS;
    const overUsed = state.pagesOpened >= RENDER_LIMIT;
    const dead = !state.browser.connected;
    if (idle || overUsed || dead) {
      const old = state;
      state = null;
      await disposeState(old);
    }
  }

  if (state) {
    state.lastUsed = Date.now();
    return state.browser;
  }

  // Single-flight: concurrent callers share one launch.
  if (!launching) {
    launching = launch();
  }
  try {
    state = await launching;
  } finally {
    launching = null;
  }
  state.lastUsed = Date.now();
  return state.browser;
}

/** Record that a page was opened — feeds the RENDER_LIMIT recycle policy. */
export function notePageOpened(): void {
  if (state) {
    state.pagesOpened += 1;
    state.lastUsed = Date.now();
  }
}

/**
 * Pre-warm Chromium at worker boot (DEV.66) by triggering
 * @sparticuz/chromium's one-time binary extraction to /tmp — the dominant
 * cold-start cost on the small `basic-xxs` worker — WITHOUT spawning a Chromium
 * process. A full launch at boot stalled the 512 MB worker, so this warms only
 * the extraction: it's light (no RAM spike, can't hang on a DevTools
 * handshake), and the first real render then pays only a fast spawn against the
 * already-extracted binary. The extraction is cached for the container
 * lifetime, so renders after the idle-recycle stay fast too.
 *
 * No-op off Linux: dev uses a system Chrome that needs no extraction, and
 * @sparticuz/chromium's binary pack is Linux-only.
 */
export async function warmChromium(): Promise<void> {
  if (process.platform !== 'linux') return;
  const mod = await import('@sparticuz/chromium');
  await mod.default.executablePath();
}

/** Close the shared browser (graceful worker shutdown / tests). */
export async function shutdownBrowser(): Promise<void> {
  if (state) {
    const old = state;
    state = null;
    await disposeState(old);
  }
}
