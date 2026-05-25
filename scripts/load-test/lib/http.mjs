// Timed, cookie-authenticated fetch helpers for the GET-based load tests.
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { config, SESSIONS_FILE } from './config.mjs';

/** Load the cookies captured by session.mjs. Throws a friendly error if absent. */
export async function loadSessions() {
  try {
    const raw = await readFile(SESSIONS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    throw new Error(
      'No .sessions.json found. Run `node scripts/load-test/session.mjs` first to capture login cookies.',
    );
  }
}

/**
 * Timed GET. Reads the full body so the measured latency includes body
 * transfer (the SSR HTML is the payload that matters for these pages).
 * Returns { ok, status, ms, bytes, authFailed, error }.
 *
 * `authFailed` is set when the request is redirected to /login — i.e. the
 * session cookie was not accepted — so a silent auth failure can never be
 * mistaken for a fast 200.
 */
export async function timedGet(url, cookie, { timeoutMs = 60_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { 'user-agent': 'dealerlink-loadtest/1.0' };
  if (cookie) headers.cookie = `${config.cookieName}=${cookie}`;
  const start = performance.now();
  try {
    const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
    const body = await res.arrayBuffer();
    const ms = performance.now() - start;
    const authFailed = res.url.includes('/login');
    return {
      ok: res.ok && !authFailed,
      status: res.status,
      ms,
      bytes: body.byteLength,
      authFailed,
      error: null,
    };
  } catch (err) {
    const ms = performance.now() - start;
    return {
      ok: false,
      status: 0,
      ms,
      bytes: 0,
      authFailed: false,
      error: err.name === 'AbortError' ? `timeout>${timeoutMs}ms` : String(err.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a page's HTML (authenticated) and return the text body. */
export async function getHtml(url, cookie) {
  const headers = { 'user-agent': 'dealerlink-loadtest/1.0' };
  if (cookie) headers.cookie = `${config.cookieName}=${cookie}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  return { status: res.status, url: res.url, html: await res.text() };
}

/** Extract up to `limit` unique uuid ids that follow `/<segment>/` in HTML. */
export function scrapeIds(html, segment, limit = 50) {
  const re = new RegExp(`/${segment}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`, 'g');
  const ids = new Set();
  let m;
  while ((m = re.exec(html)) && ids.size < limit) ids.add(m[1]);
  return [...ids];
}
