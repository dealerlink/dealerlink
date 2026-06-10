/**
 * Operator read-only view — belt #1 (app layer, ADR-014).
 *
 * Proves that `tenantAction` REFUSES every action while an operator is
 * impersonating a tenant, BEFORE the action body runs — so no mutation, and
 * crucially no side-channel write (e.g. a pg-boss PDF/email enqueue that runs
 * on a separate connection the DB read-only guard can't see), can fire.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// --- Mocks for the request-bound dependencies of wrap.ts -------------------
const impersonationTenantId = vi.fn<[], string | null>();
const requireRole = vi.fn();
const withTenant = vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
  fn({}),
);

vi.mock('@/lib/tenant/context', () => ({ impersonationTenantId: () => impersonationTenantId() }));
vi.mock('@/lib/auth/require-role', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));
vi.mock('@dealerlink/db', () => ({
  withTenant: (tenantId: string, fn: (tx: unknown) => Promise<unknown>) => withTenant(tenantId, fn),
  withOperator: (_userId: string, fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
vi.mock('next/headers', () => ({ headers: () => ({ get: () => null }) }));
vi.mock('@/lib/observability/als', () => ({
  runWithLogContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/observability/context', () => ({ setSentryTenant: vi.fn() }));

import { tenantAction } from './wrap';

const operatorAuth = { user: { id: 'op-1', tenantId: null, role: 'operator' } };
const salesAuth = { user: { id: 'u-1', tenantId: 'tenant-A', role: 'sales' } };

afterEach(() => {
  vi.clearAllMocks();
});

describe('tenantAction — operator read-only view (belt #1)', () => {
  it('refuses with READ_ONLY and never runs the body while impersonating', async () => {
    impersonationTenantId.mockReturnValue('tenant-A');
    requireRole.mockResolvedValue(operatorAuth); // operator confirmed

    const body = vi.fn(async () => ({ id: 'should-not-happen' }));
    const action = tenantAction(['admin', 'sales'], z.object({ name: z.string() }), body);

    const result = await action({ name: 'new name' });

    expect(result).toEqual({
      ok: false,
      error: { code: 'READ_ONLY', message: expect.stringContaining('Read-only operator view') },
    });
    // The action body must NEVER execute — this is what blocks pg-boss
    // enqueues / any side-effect during impersonation.
    expect(body).not.toHaveBeenCalled();
    // And we never even open a tenant transaction.
    expect(withTenant).not.toHaveBeenCalled();
    // It was gated on the operator role.
    expect(requireRole).toHaveBeenCalledWith(['operator']);
  });

  it('runs the body normally for a real tenant user (not impersonating)', async () => {
    impersonationTenantId.mockReturnValue(null);
    requireRole.mockResolvedValue(salesAuth);

    const body = vi.fn(async () => ({ id: 'dealer-1' }));
    const action = tenantAction(['admin', 'sales'], z.object({ name: z.string() }), body);

    const result = await action({ name: 'Acme' });

    expect(result).toEqual({ ok: true, data: { id: 'dealer-1' } });
    expect(body).toHaveBeenCalledTimes(1);
    expect(withTenant).toHaveBeenCalledTimes(1);
    // Gated on the tenant roles, not operator.
    expect(requireRole).toHaveBeenCalledWith(['admin', 'sales']);
  });

  it('rejects invalid input before touching auth or the body', async () => {
    impersonationTenantId.mockReturnValue(null);
    requireRole.mockResolvedValue(salesAuth);

    const body = vi.fn(async () => ({ ok: true }));
    const action = tenantAction(['admin'], z.object({ name: z.string() }), body);

    const result = await action({ name: 123 });

    expect(result.ok).toBe(false);
    expect(body).not.toHaveBeenCalled();
  });
});
