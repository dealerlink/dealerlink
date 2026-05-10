import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

loadEnv({ path: path.resolve(__dirname, '../../.env.local') });
loadEnv({ path: path.resolve(__dirname, '../../.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set for drizzle-kit');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
