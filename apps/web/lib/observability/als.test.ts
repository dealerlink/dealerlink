import { describe, expect, it } from 'vitest';

import { getLogContext, runWithLogContext, updateLogContext } from './als';

describe('AsyncLocalStorage log context', () => {
  it('exposes the context set at the entry point', () => {
    runWithLogContext({ tenantId: 't-1', userId: 'u-1', requestId: 'r-1' }, () => {
      expect(getLogContext()).toEqual({ tenantId: 't-1', userId: 'u-1', requestId: 'r-1' });
    });
  });

  it('returns an empty context when none is running', () => {
    expect(getLogContext()).toEqual({});
  });

  it('propagates the context across await boundaries', async () => {
    await runWithLogContext({ tenantId: 't-async' }, async () => {
      await Promise.resolve();
      async function deeplyNested(): Promise<string | undefined> {
        await new Promise((r) => setTimeout(r, 1));
        return getLogContext().tenantId;
      }
      expect(await deeplyNested()).toBe('t-async');
    });
  });

  it('isolates context between concurrent runs', async () => {
    const a = runWithLogContext({ tenantId: 'A' }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return getLogContext().tenantId;
    });
    const b = runWithLogContext({ tenantId: 'B' }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return getLogContext().tenantId;
    });
    expect(await Promise.all([a, b])).toEqual(['A', 'B']);
  });

  it('updateLogContext merges into the active store', () => {
    runWithLogContext({ requestId: 'r-1' }, () => {
      updateLogContext({ userId: 'u-late' });
      expect(getLogContext()).toEqual({ requestId: 'r-1', userId: 'u-late' });
    });
  });

  it('updateLogContext is a safe no-op outside any run', () => {
    expect(() => updateLogContext({ userId: 'u' })).not.toThrow();
  });
});
