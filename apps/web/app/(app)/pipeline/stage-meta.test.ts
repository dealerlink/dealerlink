/**
 * Guards against drift between the client-side STAGE_NUMBER /
 * clientAllowedTargets in stage-meta.ts and the authoritative state
 * machine in @dealerlink/db. The duplication is intentional — the DB
 * package transitively imports `postgres` so its runtime exports cannot
 * be pulled into client components — but it must stay in sync.
 */
import {
  DEAL_ALLOWED_TRANSITIONS,
  DEAL_STAGE_NUMBER,
  dealAllowedTargets,
  type DealStage,
} from '@dealerlink/db';
import { describe, expect, it } from 'vitest';

import { STAGES, STAGE_NUMBER, clientAllowedTargets } from './stage-meta';

const STAGES_LIST = STAGES.map((s) => s.key);

describe('stage-meta — parity with @dealerlink/db', () => {
  it('STAGE_NUMBER matches DEAL_STAGE_NUMBER for every stage', () => {
    for (const s of STAGES_LIST) {
      expect(STAGE_NUMBER[s]).toBe(DEAL_STAGE_NUMBER[s]);
    }
  });

  it('clientAllowedTargets(stage, "sales") matches dealAllowedTargets for forward moves', () => {
    for (const s of STAGES_LIST) {
      const client = [...clientAllowedTargets(s, 'sales')].sort();
      const server = [...dealAllowedTargets(s, 'sales')].sort();
      expect(client).toEqual(server);
    }
  });

  it('clientAllowedTargets(stage, "admin") matches dealAllowedTargets for forward + reverse', () => {
    for (const s of STAGES_LIST) {
      const client = [...clientAllowedTargets(s, 'admin')].sort();
      const server = [...dealAllowedTargets(s, 'admin')].sort();
      expect(client).toEqual(server);
    }
  });

  it('every stage has an ALLOWED_TRANSITIONS entry in the DB package', () => {
    for (const s of STAGES_LIST) {
      expect(DEAL_ALLOWED_TRANSITIONS[s as DealStage]).toBeDefined();
    }
  });
});
