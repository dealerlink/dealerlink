/**
 * Whether auth cookies (the Lucia session cookie and the operator
 * impersonation cookie) carry the `Secure` attribute.
 *
 * MUST NOT be derived from `NODE_ENV`. Two problems with the old
 * `secure: NODE_ENV === 'production'`:
 *
 *   1. `NODE_ENV` is inlined into client bundles at build time, so it couples a
 *      server-side security decision to a build flag. That is what forced the
 *      "hybrid" `next start` + `NODE_ENV=development` workaround (DEV.87) and
 *      made `next start` unusable for the verify run over plain HTTP.
 *   2. It conflates transport security with build mode. They are independent:
 *      staging/prod serve HTTPS and want secure cookies; a devcontainer served
 *      over plain `http://localhost` needs them non-secure or the browser
 *      drops the session cookie and auth silently breaks.
 *
 * Instead read an explicit, SERVER-ONLY env var at runtime.
 *
 * FAIL SAFE: secure UNLESS `SESSION_COOKIE_SECURE` is exactly the string
 * `'false'`. A missing/unset/empty var yields `true`, so a production or
 * staging deploy that simply never sets the var can NEVER silently emit an
 * insecure cookie. Insecure cookies require an explicit, deliberate opt-out
 * that only the devcontainer/test env files carry.
 *
 * `SESSION_COOKIE_SECURE` is not a `NEXT_PUBLIC_*` var and is only referenced
 * from server modules, so Next never exposes it to the client bundle.
 */
export function sessionCookieSecure(): boolean {
  return process.env.SESSION_COOKIE_SECURE !== 'false';
}
