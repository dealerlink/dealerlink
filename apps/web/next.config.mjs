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
    serverComponentsExternalPackages: [
      '@node-rs/argon2',
      'postgres',
      'pg',
      'lucia',
      '@lucia-auth/adapter-drizzle',
    ],
  },
};

export default nextConfig;
