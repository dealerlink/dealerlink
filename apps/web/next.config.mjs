import { withSentryConfig } from '@sentry/nextjs';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load env from the workspace root so all apps share one .env.local file.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const isDev = process.env.NODE_ENV !== 'production';

// ---------------------------------------------------------------------------
// HTTP security headers (Stage C Day C.4, SECURITY_AUDIT.md F-2)
// ---------------------------------------------------------------------------
// A pragmatic, functionality-preserving Content-Security-Policy plus the
// standard hardening headers that SaaS security scanners check for.
//
// CSP notes — deliberately permissive where Next/shadcn require it:
//   - script-src allows 'unsafe-inline' because Next.js App Router injects
//     inline bootstrap/hydration scripts (no nonce pipeline in Phase 1); dev
//     additionally needs 'unsafe-eval' (React Refresh) and a ws: connection
//     (HMR). Production drops both eval and ws.
//   - style-src allows 'unsafe-inline' because Tailwind/shadcn and next/font
//     inject inline <style>.
//   - img-src allows data:/blob:/https: — tenant logos are base64 data URIs
//     today (DEV.16) and DO Spaces (https) later; product images may be https.
//   - connect-src allows the Sentry browser-SDK ingest hosts (Axiom + Better
//     Stack are server-side only). HMR websocket is dev-only.
//   - framing is denied (frame-ancestors 'none' + X-Frame-Options: DENY),
//     object-src 'none', base-uri/form-action 'self'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io${isDev ? ' ws: http://localhost:*' : ''}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // HSTS — harmless over http (browsers honour it only over https).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Minimal Permissions-Policy: deny the high-risk device APIs we never use.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dealerlink/design-tokens', '@dealerlink/schemas', '@dealerlink/db'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    // The report's intuitive URL is /reports/outstanding-receivables, but the
    // page lives at /reports/outstanding. Redirect so bookmarked/shared links
    // don't 404 (UX finding I-5). `permanent: true` emits a 308 (permanent).
    return [
      {
        source: '/reports/outstanding-receivables',
        destination: '/reports/outstanding',
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.digitaloceanspaces.com',
      },
    ],
  },
  // ── e2e test infrastructure, filed here because Next gives it nowhere else ──
  //
  // DEV.105 / F.52. `onDemandEntries` is read ONLY by `next dev`. `next build`
  // and `next start` ignore it entirely, so nothing here can reach production —
  // it is test infrastructure that happens to live in a product config file,
  // which is a filing problem rather than a scope one. Recorded as a deliberate
  // scope call in DEVIATIONS.md rather than left implicit.
  //
  // WHAT IT FIXES. In dev, Next keeps a small buffer of compiled route entries
  // and evicts the rest; the defaults are `pagesBufferLength: 5` and
  // `maxInactiveAge: 60s`. The verify suite visits ~40 routes over ~16-19
  // minutes, so with a 5-entry buffer almost every route is evicted and
  // recompiled several times in a single run. Measured, one local run:
  // `/login` compiled 5x, `/dashboard` 5x, `/dealers/[id]` 4x,
  // `/quotations/[id]` 4x. CI run 34375881563 shows the same shape —
  // `/dealers` and `/dealers/[id]` compiled 3x each, with module counts
  // varying between compiles, which is eviction and rebuild rather than a
  // server restart.
  //
  // Each of those recompiles costs 8-16s on CI and lands on whichever test
  // touches the route next. That is the whole of the known-flaky six: a first
  // hit longer than the 15s `expect` budget, asserted against a page that has
  // not committed its navigation yet. It is also why a one-shot warm-up pass
  // could not fix this on its own — eviction simply discarded the warm-up.
  //
  // The values below are sized to outlast a suite run, not tuned: a buffer
  // comfortably larger than the route count, and an inactivity window longer
  // than the longest run. The intent is that every route compiles exactly once
  // per dev-server lifetime.
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 100,
  },
  experimental: {
    typedRoutes: false,
    // Required on Next 14 so `instrumentation.ts` (Sentry init) runs at boot.
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      '@node-rs/argon2',
      'postgres',
      'pg',
      'lucia',
      '@lucia-auth/adapter-drizzle',
    ],
  },
};

// `withSentryConfig` wires the Sentry bundler plugin (source maps, client
// config auto-load, tunnelling). It needs no auth token to build — source-map
// upload is simply skipped when SENTRY_AUTH_TOKEN is absent (dev + CI).
export default withSentryConfig(nextConfig, {
  silent: true,
  // No source-map widening / monitors without an authenticated project.
  widenClientFileUpload: false,
});
