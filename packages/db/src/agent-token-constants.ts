/**
 * F.148 — the agent heartbeat's timing constants, in a module with **NO
 * IMPORTS AT ALL**, and that emptiness is the entire design.
 *
 * ## WHY THEY ARE NOT IN `agent-token.ts`
 *
 * They were, and it broke the build — for the THIRD time in this row, from a
 * new direction each time:
 *
 * 1. The barrel re-exported `agent-token.ts`, which imports `node:crypto`, and
 *    `lib/tenant/resolve.ts` imports the barrel and is inlined into the Edge
 *    middleware bundle. `UnhandledSchemeError` (DEV.158).
 * 2. Fixed by a subpath export, so only a caller that NAMES it can reach it.
 * 3. **Then a `'use client'` component named it** — `agent-tokens-section.tsx`
 *    wanted two numbers to render a bucketed age, imported them from the
 *    subpath, and dragged `node:crypto` into a BROWSER bundle. Same error, same
 *    shape, a different runtime.
 *
 * The lesson is not "be careful with imports". It is that **a module importing a
 * Node built-in cannot also be the home of values that non-Node code needs** —
 * and these are two integers and a string that any runtime may want. So they
 * live here, where there is nothing to drag in, and both sides import from the
 * side that suits them: `agent-token.ts` for the SQL, the barrel for the numbers.
 *
 * **This is F.191's argument, demonstrated three times.** A lint rule forbidding
 * `node:*` across `packages/db/src/**` with an explicit allowlist would have
 * caught all three at the file that caused them, in seconds, instead of in a
 * two-minute webpack trace three hops away.
 */

/**
 * HOW OFTEN THE HEARTBEAT MAY WRITE, in minutes. The single source for both the
 * throttle and the staleness threshold.
 */
export const HEARTBEAT_THROTTLE_MINUTES = 15;

/** Postgres interval literal, built from the number above rather than typed twice. */
export const HEARTBEAT_THROTTLE = `${HEARTBEAT_THROTTLE_MINUTES} minutes`;

/**
 * WHEN AN AGENT COUNTS AS STALE — **DERIVED, NOT A PARALLEL CONSTANT.**
 *
 * A literal `60` that happens to be four times fifteen is a relationship held in
 * someone's head. Tighten the throttle to five minutes and that 60 silently
 * becomes twelve times the write interval; loosen it to thirty and the threshold
 * starts firing on healthy agents. **The multiple is the fact worth keeping, so
 * the multiple is what is written down.**
 *
 * FOUR TIMES, because `last_seen_at` is a LOWER BOUND: an agent may have checked
 * in up to one throttle window more recently than the column says, so any
 * threshold must clear that window with room to spare. Four gives three missed
 * check-ins before anyone is alarmed, which is the difference between "their
 * network blipped" and "the agent is gone".
 *
 * Enforced by a test rather than by this comment — `tests/agent-token.test.ts`.
 */
export const STALE_AFTER_MINUTES = HEARTBEAT_THROTTLE_MINUTES * 4;
