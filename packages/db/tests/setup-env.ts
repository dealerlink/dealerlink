/**
 * Vitest setup file for packages/db — loads the database connection env BEFORE
 * any test module (and therefore the lazy `@dealerlink/db` client) evaluates.
 *
 * Fixes DEV.88: the db test files read `APP_DATABASE_URL` / `DATABASE_URL`
 * straight off `process.env` with a `localhost:5432` fallback. Post
 * Windows-host → devcontainer migration (commit cef54d8), Postgres is the
 * compose service `postgres`, not `localhost`, so from a clean shell every
 * DB-touching suite failed with `ECONNREFUSED 127.0.0.1:5432`.
 *
 * Precedence (dotenv never overrides an already-set var, so first-writer wins):
 *   1. Real exported env / CI env      — already in process.env, wins.
 *   2. repo-root `.env.local`          — developer's gitignored dev config.
 *   3. `packages/db/.env.test`         — committed, compose-host baseline that
 *                                        makes a clean-shell run work with no
 *                                        setup. Contains dev/test creds only.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '../..');

// 2. Developer override (if present). Sets DATABASE_URL / DATABASE_DIRECT_URL.
loadEnv({ path: path.join(repoRoot, '.env.local') });
// 3. Committed baseline. Fills anything the above did not set — crucially
//    APP_DATABASE_URL, which `.env.local` does not define.
loadEnv({ path: path.join(pkgRoot, '.env.test') });

// The db tests read APP_DATABASE_URL (app role). `.env.local` only defines
// DATABASE_URL, so if a developer relies solely on it, map it across. `.env.test`
// already sets APP_DATABASE_URL, so this only matters when .env.local wins.
if (!process.env.APP_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.APP_DATABASE_URL = process.env.DATABASE_URL;
}
