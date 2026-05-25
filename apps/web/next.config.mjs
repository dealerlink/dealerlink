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
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dealerlink/design-tokens', '@dealerlink/schemas', '@dealerlink/db'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.digitaloceanspaces.com',
      },
    ],
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
