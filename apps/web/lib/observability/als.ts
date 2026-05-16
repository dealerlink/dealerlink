/**
 * Request-scoped context via AsyncLocalStorage (Day 17, chunk 17b).
 *
 * The logger needs `tenantId` / `userId` / `requestId` / `route` on every line
 * without threading them through every function signature. ALS carries that
 * context across `await` boundaries within a single request: a handler calls
 * `runWithLogContext(ctx, fn)` once at the entry point, and any `logger.*`
 * call deep inside `fn` — however many awaits down — reads the same store.
 *
 * Node-only (`node:async_hooks`); this module is never imported by client
 * code. The Edge middleware cannot use ALS, so it instead stamps an
 * `x-request-id` header that the Node runtime seeds into the store.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  route?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Run `fn` with `ctx` as the active log context for its whole async tree. */
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run({ ...ctx }, fn);
}

/** The active context, or an empty object when none is running. */
export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}

/**
 * Merge values into the active context. No-op when no context is running, so
 * it is always safe to call (e.g. once the user resolves mid-request).
 */
export function updateLogContext(patch: LogContext): void {
  const store = storage.getStore();
  if (store) Object.assign(store, patch);
}
