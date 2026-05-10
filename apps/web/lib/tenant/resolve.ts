import { db, tenants } from '@dealerlink/db';
import { eq } from 'drizzle-orm';

export type TenantBrief = {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
};

export async function resolveTenantBySlug(slug: string): Promise<TenantBrief | null> {
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
 * Read the tenant slug from either the request host (production: `<slug>.dealerlink.in`)
 * or the `?tenant=` query param (dev convenience). Returns null when no slug
 * can be determined.
 */
export function extractTenantSlug(host: string | null, queryParam: string | null): string | null {
  if (queryParam) return queryParam.toLowerCase();
  if (!host) return null;
  const noPort = host.split(':')[0] ?? '';
  // Skip localhost / IPs / bare apex domain
  if (noPort.endsWith('dealerlink.in')) {
    const parts = noPort.split('.');
    if (parts.length >= 3 && parts[0] !== 'app' && parts[0] !== 'admin' && parts[0] !== 'www') {
      return parts[0]!.toLowerCase();
    }
  }
  return null;
}
