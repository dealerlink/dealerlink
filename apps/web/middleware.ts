import { NextResponse, type NextRequest } from 'next/server';

import { resolveRequestScope } from '@/lib/tenant/resolve';

// ============================================================================
// MIDDLEWARE — request scope resolution
// ----------------------------------------------------------------------------
// Next.js 14 middleware runs on the Edge runtime. We CANNOT touch Drizzle or
// the Lucia DB adapter here. We do string-only work:
//   1. Resolve the request scope (tenant slug or operator) from host + ?tenant.
//   2. Set X-Dealerlink-Scope + X-Dealerlink-Tenant-Slug request headers
//      so downstream Server Components can read them without re-parsing.
//   3. Gate the (app)/* and /admin routes to the correct scope.
//
// Actual tenant existence + role checks happen in (app)/layout.tsx and
// /admin/layout.tsx via getTenantContext() / getCurrentUser().
// ============================================================================

const PROTECTED_APP_PREFIXES = [
  '/dashboard',
  '/pipeline',
  '/dealers',
  '/catalog',
  '/inventory',
  '/quotations',
  '/orders',
  '/payments',
  '/dispatch',
  '/reports',
  '/settings',
];

function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isLocalHost(host: string | null): boolean {
  const noPort = (host ?? '').split(':')[0]?.toLowerCase() ?? '';
  return (
    noPort === 'localhost' ||
    noPort === '127.0.0.1' ||
    noPort.endsWith('.localhost') ||
    noPort === ''
  );
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const host = req.headers.get('host');
  const tenantQuery = searchParams.get('tenant');
  const adminFlag = searchParams.get('admin') === '1';

  const scope = resolveRequestScope(host, tenantQuery, adminFlag);
  const local = isLocalHost(host);

  // Pass-through headers so Server Components can read scope cheaply.
  const requestHeaders = new Headers(req.headers);
  // Stamp a request id at the edge — the Node runtime seeds it into the ALS
  // log context (als.ts) so every log line for this request correlates.
  if (!requestHeaders.has('x-request-id')) {
    requestHeaders.set('x-request-id', crypto.randomUUID());
  }
  requestHeaders.set('x-dealerlink-scope', scope.kind);
  if (scope.kind === 'tenant') {
    requestHeaders.set('x-dealerlink-tenant-slug', scope.slug);
  } else {
    requestHeaders.delete('x-dealerlink-tenant-slug');
  }

  // Production: enforce subdomain isolation strictly. The (app) shell is
  // only valid on a tenant subdomain; /admin is only valid on the operator
  // host. In dev there is no subdomain, so we let the (app) and /admin
  // layouts do the real auth-aware routing and only middleware-redirect when
  // the gate is unambiguous.
  if (!local) {
    if (isProtectedAppPath(pathname) && scope.kind !== 'tenant') {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
    if (isAdminPath(pathname) && scope.kind !== 'operator') {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Bypass static assets, /_next, favicon, and public API routes
// (/api/health, /api/webhooks/* — the latter is signature-verified, not
// session-gated, so tenant-scope middleware must not touch it).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|api/health|api/webhooks|.*\\..*).*)'],
};
