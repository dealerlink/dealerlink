/**
 * Test helpers for asserting on Postgres errors after the drizzle-orm 0.45.2
 * bump (F.2a / Day 21).
 *
 * drizzle-orm >= 0.44 wraps every driver error in a `DrizzleQueryError` whose
 * own `.message` is a generic `"Failed query: ..."`; the postgres.js
 * `PostgresError` — which carries the constraint name, the `RAISE` message and
 * the SQLSTATE `.code` — is moved to `.cause`. Assertions that regex-match the
 * top-level `err.message` (or `String(err)`) therefore no longer see the pg
 * detail. These helpers walk the cause chain so the assertions keep checking
 * the *real* constraint/behaviour, not the wrapper.
 */
import { expect } from 'vitest';

/** Concatenated message text across an error and its `.cause` chain. */
export function errChainText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && cur != null; depth++) {
    if (typeof cur === 'object' && 'message' in cur) {
      parts.push(String((cur as { message: unknown }).message));
    } else {
      parts.push(String(cur));
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.join(' | ');
}

/**
 * Assert that `p` rejects and that the error's full cause chain matches
 * `pattern`. Replaces `await expect(p).rejects.toThrow(/pattern/)` for DB
 * errors, which only matched the (now-wrapped) top-level message.
 */
export async function expectDbReject(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  let threw = false;
  try {
    await p;
  } catch (err) {
    threw = true;
    caught = err;
  }
  expect(threw, `expected promise to reject matching ${pattern}`).toBe(true);
  expect(errChainText(caught)).toMatch(pattern);
}
