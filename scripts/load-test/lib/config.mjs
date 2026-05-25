// Shared configuration for the C.5 load-test harness.
//
// Targets the live STAGING environment by default. The apex host serves the
// operator/login surface; tenant app pages live on the per-tenant subdomain
// (tenant routing resolves <slug>.<apex> → tenant <slug>, see DEV.60). All
// hosts are overridable via env so the same harness can be pointed at a
// future production environment.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APEX = process.env.LOADTEST_APEX ?? 'staging.dealerlink.in';

export const config = {
  apex: APEX,
  apexUrl: `https://${APEX}`,
  // Per-tenant app hosts.
  tenantUrl: (slug) => `https://${slug}.${APEX}`,
  demoUrl: `https://demo.${APEX}`,
  sampleUrl: `https://sample.${APEX}`,
  healthUrl: `https://${APEX}/api/health`,
  cookieName: 'dealerlink_session',
  // Seeded throwaway credentials (docs/STAGE_C_HANDOFF.md §7). NOT production.
  users: {
    demo: {
      admin: { email: 'admin@demo.test', password: 'password123' },
      sales: { email: 'sales@demo.test', password: 'password123' },
      accounts: { email: 'accounts@demo.test', password: 'password123' },
      dispatch: { email: 'dispatch@demo.test', password: 'password123' },
    },
    sample: {
      admin: { email: 'admin@sample.test', password: 'password123' },
    },
  },
};

const __dirname = dirname(fileURLToPath(import.meta.url));
// Captured session cookies — gitignored (a live session token, even for a
// throwaway seed user, should never be committed).
export const SESSIONS_FILE = join(__dirname, '..', '.sessions.json');
