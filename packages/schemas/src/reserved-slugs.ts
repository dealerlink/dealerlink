/**
 * Reserved tenant slugs — the canonical list of subdomains a tenant
 * cannot claim. Closes DEV.73 (Stage D Day D.2): tenant provisioning
 * formerly validated slug *format* only, so an operator could create
 * a tenant with slug `app` / `admin` / `www` etc.; the row would
 * persist but be **unreachable** because the routing layer
 * (`apps/web/lib/tenant/resolve.ts` `RESERVED_SUBDOMAINS`) hard-codes
 * those three to the operator console.
 *
 * **This set is a SUPERSET of the routing reservation** — it bans
 * the three routing-reserved names AND infrastructure subdomains
 * we may use later (`mail` for inbound email, `staging` for the
 * environment, `api` / `docs` / `status` for future service surfaces,
 * etc.). The narrower routing set stays where it is — its job is
 * "which subdomain resolves to operator vs tenant"; this set's job
 * is "which slug can a tenant claim at creation time." Single source
 * of truth lives **here** so future additions are a code commit, not
 * a config drift.
 *
 * **Edge-safe.** This module exports a plain `Set<string>` and a
 * pure function; no DB / node-only imports. It is therefore safe
 * for the Edge middleware bundle if we ever want the routing layer
 * to import from it.
 */

export const RESERVED_SLUGS: ReadonlySet<string> = new Set<string>([
  // Routing-reserved (mirrors apps/web/lib/tenant/resolve.ts).
  'admin',
  'app',
  'www',
  // Apex / marketing-site convention.
  'blog',
  'docs',
  'status',
  'support',
  'help',
  // Email + protocol-level (`mail.dealerlink.in` is the inbound
  // domain per CLAUDE.md §2; the rest are common MX/SMTP names
  // a tenant should never be able to shadow).
  'mail',
  'smtp',
  'pop',
  'imap',
  // Environment / infra subdomains we already use or could use
  // (staging.dealerlink.in / *.staging.dealerlink.in is live today).
  'staging',
  'api',
  'ftp',
  // Asset / CDN conventions.
  'cdn',
  'media',
  'static',
  'assets',
]);

/**
 * Case-insensitive reservation check. The DB stores the slug
 * lowercased, but tenant-creation validation runs **before** lower-
 * casing has been applied — a user typing "App" must be rejected
 * with the same error as "app".
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
