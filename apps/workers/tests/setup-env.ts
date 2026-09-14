/**
 * Vitest setup for apps/workers — environment only.
 *
 * This replaces `setup-chromium.ts`, which pointed Puppeteer at an
 * arm64-runnable Chromium (DEV.89) AND, incidentally, loaded the repo-root env
 * files. The Chromium half went with the cutover; the env half is still needed,
 * because the db client reads `DATABASE_URL` on first query and vitest does not
 * inherit the shell's dotenv (DEV.88 records the same gap in packages/db).
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

const repoRoot = path.resolve(__dirname, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });
