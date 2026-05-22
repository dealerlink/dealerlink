import { db, tenants } from '@dealerlink/db';
import { eq } from 'drizzle-orm';

export type TenantBrief = {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
};

/**
 * Resolved request scope. Either:
 *  - `kind: 'tenant'` → a tenant subdomain or `?tenant=<slug>` is set.
 *  - `kind: 'operator'` → the request targets the operator app (`admin.` or
 *    `app.` subdomain, or localhost with no tenant param).
 */
export type RequestScope = { kind: 'tenant'; slug: string } | { kind: 'operator' };

const RESERVED_SUBDOMAINS = new Set(['admin', 'app', 'www']);

/**
 * The apex domain the deployment serves tenants under. Defaults to the
 * production apex. Non-production environments set NEXT_PUBLIC_APP_DOMAIN to
 * their own apex (e.g. `staging.dealerlink.in`) so that:
 *   - the apex host itself           → operator
 *   - `<slug>.<apex>`                → tenant <slug>
 * Without this, a `staging.` prefix makes the apex (`staging.dealerlink.in`)
 * look like tenant `staging`, and tenant subdomains gain an extra label.
 * It is a NEXT_PUBLIC_* var so it is inlined into the Edge middleware bundle.
 */
function apexDomain(): string {
  return (process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'dealerlink.in').toLowerCase();
}

/**
 * String-only resolution from host + query param. Suitable for Next.js
 * Edge middleware (no DB access).
 *
 * Rules:
 *   <slug>.dealerlink.in     → { kind: 'tenant', slug }
 *   admin.dealerlink.in      → { kind: 'operator' }
 *   app.dealerlink.in        → { kind: 'operator' }
 *   www.dealerlink.in        → { kind: 'operator' }    (apex)
 *   dealerlink.in            → { kind: 'operator' }    (apex)
 *   localhost   ?tenant=<s>  → { kind: 'tenant', slug: <s> }
 *   localhost   (no param)   → { kind: 'operator' }
 *   localhost   ?admin=1     → { kind: 'operator' }    (explicit override)
 */
export function resolveRequestScope(
  host: string | null,
  queryParam: string | null,
  adminQueryFlag = false,
): RequestScope {
  const normalizedQuery = queryParam?.trim().toLowerCase() || null;

  // Local-dev path: localhost / 127.0.0.1 / *.localhost
  const noPort = (host ?? '').split(':')[0]?.toLowerCase() ?? '';
  const isLocal =
    noPort === 'localhost' ||
    noPort === '127.0.0.1' ||
    noPort.endsWith('.localhost') ||
    noPort === '';

  if (isLocal) {
    if (adminQueryFlag) return { kind: 'operator' };
    if (normalizedQuery && isValidSlug(normalizedQuery)) {
      return { kind: 'tenant', slug: normalizedQuery };
    }
    return { kind: 'operator' };
  }

  // Production hostnames — resolved relative to the configured apex domain.
  const apex = apexDomain();
  if (noPort === apex) return { kind: 'operator' }; // apex itself
  if (noPort.endsWith('.' + apex)) {
    const prefix = noPort.slice(0, noPort.length - apex.length - 1);
    const sub = prefix.split('.')[0]!; // leftmost label is the tenant slug
    if (RESERVED_SUBDOMAINS.has(sub)) return { kind: 'operator' };
    if (isValidSlug(sub)) return { kind: 'tenant', slug: sub };
  }

  // Unknown host: fall back to operator (login screen with generic branding)
  return { kind: 'operator' };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/**
 * DB lookup. Server Components only — not safe in Edge middleware.
 */
export async function resolveTenantBySlug(slug: string): Promise<TenantBrief | null> {
  if (!isValidSlug(slug)) return null;
  const [row] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      legalName: tenants.legalName,
      displayName: tenants.displayName,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return row ?? null;
}

/**
 * Legacy shim kept so Day 2 callers compile while we migrate them to
 * `resolveRequestScope`. Returns the slug or null.
 */
export function extractTenantSlug(host: string | null, queryParam: string | null): string | null {
  const scope = resolveRequestScope(host, queryParam);
  return scope.kind === 'tenant' ? scope.slug : null;
}
