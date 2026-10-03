// FROM THE IMPORT-FREE SUBPATH — not the barrel, and not `/agent-token`.
//
// This file is reached from a `'use client'` component, and TWO earlier
// attempts broke `pnpm build`:
//
//   `@dealerlink/db/agent-token` -> `node:crypto`  (crypto in a browser bundle)
//   `@dealerlink/db`             -> `client.ts` -> `postgres` -> `net`
//
// **The second is the finding worth keeping: the BARREL IS NOT CLIENT-SAFE AT
// ALL.** It pulls the Postgres driver, so "import it from the barrel" is not a
// safe default for anything under `use client` — only for server code.
//
// `./agent-token-constants` imports NOTHING, which is why it has its own
// subpath and why this import is safe in any runtime.
import {
  HEARTBEAT_THROTTLE_MINUTES,
  STALE_AFTER_MINUTES,
} from '@dealerlink/db/agent-token-constants';

/**
 * How to render `agent_tokens.last_seen_at` — F.148.
 *
 * ## IT RETURNS A BUCKET, NOT A TIMESTAMP, AND THAT IS THE POINT
 *
 * `last_seen_at` is a **LOWER BOUND**: the heartbeat only writes when the stored
 * value is older than one throttle window, so an agent may have checked in up to
 * 15 minutes more recently than the column says.
 *
 * The operator asked for a column that SAYS it is a lower bound. This returns one
 * that IS one. **A timestamp with a caveat still hands the reader an
 * exact-looking value to anchor on**, and the caveat is the first thing that gets
 * skimmed; a bucket gives them nothing to anchor on that the data does not
 * support.
 *
 * Same family as `status: ok` reading as healthy (F.139) and `version: 'dev'`
 * reading as a build (F.176) — **solved by removing the false precision rather
 * than by annotating it.**
 *
 * ## THREE STATES, AND THE FIRST IS NOT A KIND OF THE SECOND
 *
 * - `never` — `last_seen_at IS NULL`. The agent was never installed, or has
 *   never been able to reach us. **A different support conversation** from an
 *   agent that stopped, and rendering it as an empty cell or an epoch would merge
 *   the two.
 * - `recent` — within one throttle window. The strongest statement the data
 *   supports is "within the last 15 minutes"; it cannot support "2 minutes ago".
 * - `stale` — older than `STALE_AFTER_MINUTES`, which is DERIVED as four
 *   throttle windows rather than being a parallel constant.
 */
export type LastSeenState = 'never' | 'recent' | 'ok' | 'stale';

export interface LastSeen {
  state: LastSeenState;
  /** Operator-facing text. Never an exact time for a value that is not exact. */
  label: string;
  /** True when this warrants attention on the screen. */
  attention: boolean;
}

export function describeLastSeen(lastSeenAt: Date | null, now = new Date()): LastSeen {
  if (!lastSeenAt) {
    return {
      state: 'never',
      label: 'Never checked in',
      attention: true,
    };
  }

  const minutes = Math.floor((now.getTime() - lastSeenAt.getTime()) / 60_000);

  if (minutes <= HEARTBEAT_THROTTLE_MINUTES) {
    return {
      state: 'recent',
      label: `Checked in within the last ${HEARTBEAT_THROTTLE_MINUTES} minutes`,
      attention: false,
    };
  }

  const approx = (() => {
    // FLOOR, NOT ROUND, and the reason is directional rather than cosmetic.
    //
    // `last_seen_at` is a lower bound on RECENCY, so the computed age is an
    // UPPER bound on elapsed time: the column may say 60 minutes when the true
    // gap was 45. **Flooring moves the displayed figure toward the truth;
    // rounding can move it further away** (44 minutes would round up to 45 and
    // overstate a staleness already overstated by the throttle).
    //
    // It also makes the granularity real: two ages inside one window land in
    // the same bucket, which rounding does not guarantee — 37 and 44 straddle
    // the 37.5 midpoint and would read differently despite being 7 minutes
    // apart. Found by the test that asserts exactly that.
    if (minutes < 120)
      return `about ${Math.floor(minutes / HEARTBEAT_THROTTLE_MINUTES) * HEARTBEAT_THROTTLE_MINUTES} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `about ${hours} hours ago`;
    return `about ${Math.floor(hours / 24)} days ago`;
  })();

  // The "±" is not decoration: it is the throttle window, and it is the reason
  // this reads "about". A reader who wants to know how approximate can see it.
  const label = `${approx} (±${HEARTBEAT_THROTTLE_MINUTES} min)`;

  return minutes > STALE_AFTER_MINUTES
    ? { state: 'stale', label: `No contact — ${label}`, attention: true }
    : { state: 'ok', label, attention: false };
}
