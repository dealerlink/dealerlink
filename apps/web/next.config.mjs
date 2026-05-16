import { withSentryConfig } from '@sentry/nextjs';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load env from the workspace root so all apps share one .env.local file.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dealerlink/design-tokens', '@dealerlink/schemas', '@dealerlink/db'],
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
