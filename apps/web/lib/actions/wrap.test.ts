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
const impersonationTenantId = vi.fn<() => string | null>();
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
// A fixed request id, so the ref in the client message is predictable.
const REQUEST_ID = 'aabbccdd-1111-4222-8333-444455556666';
vi.mock('next/headers', () => ({
  headers: () => ({ get: (k: string) => (k === 'x-request-id' ? REQUEST_ID : null) }),
}));
vi.mock('@/lib/observability/als', () => ({
  runWithLogContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/observability/context', () => ({ setSentryTenant: vi.fn() }));
const reportError = vi.fn();
vi.mock('@/lib/observability/log', () => ({
  reportError: (...a: unknown[]) => reportError(...a),
}));

import { AppError } from '@/lib/errors';

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

/**
 * F.170 — the real error is REPORTED, the client message stays generic, and a
 * designed refusal is not reported.
 *
 * Every assertion here has a control: the point of F.170 is that the previous
 * behaviour produced NO trace of an unexpected throw anywhere, so a test that only
 * checked the client message would have passed before the change as well.
 */
describe('tenantAction — error telemetry (F.170)', () => {
  const schema = z.object({ v: z.string() });

  it('REPORTS a non-AppError throw, with the action, tenant, user and request id', async () => {
    requireRole.mockResolvedValue(salesAuth);
    impersonationTenantId.mockReturnValue(null);
    const boom = new Error('relation "invoices" violates unique constraint');
    const action = tenantAction(['sales'], schema, async () => {
      throw boom;
    });

    const r = await action({ v: 'x' });

    // THE ASSERTION THE WHOLE ROW EXISTS FOR. Before F.170 this was never called.
    expect(reportError).toHaveBeenCalledTimes(1);
    const [reported, context] = reportError.mock.calls[0]!;
    expect(reported).toBe(boom);
    expect(context).toMatchObject({
      action: 'tenantAction',
      requestId: REQUEST_ID,
      tenantId: 'tenant-A',
      userId: 'u-1',
    });

    // And the client still learns nothing about the database.
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INTERNAL');
      expect(r.error.message).not.toContain('invoices');
      expect(r.error.message).not.toContain('constraint');
    }
  });

  it('puts a short REF in the client message, and it leaks nothing', async () => {
    requireRole.mockResolvedValue(salesAuth);
    impersonationTenantId.mockReturnValue(null);
    const action = tenantAction(['sales'], schema, async () => {
      throw new Error('internal detail');
    });

    const r = await action({ v: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // First eight hex characters of the request id, dashes stripped.
      expect(r.error.message).toBe('Something went wrong (ref: aabbccdd). Please try again.');
      // It greps against the full id that was logged, which is what makes it useful.
      expect(REQUEST_ID.replace(/-/g, '')).toContain('aabbccdd');
      // And it is not the tenant, the user or the error.
      expect(r.error.message).not.toContain('tenant-A');
      expect(r.error.message).not.toContain('u-1');
      expect(r.error.message).not.toContain('internal detail');
    }
  });

  it('does NOT report a designed AppError refusal, and adds no ref to it', async () => {
    requireRole.mockResolvedValue(salesAuth);
    impersonationTenantId.mockReturnValue(null);
    const action = tenantAction(['sales'], schema, async () => {
      throw new AppError('CONFLICT', 'Order ORD-1 is not confirmed.');
    });

    const r = await action({ v: 'x' });

    // Reporting these would bury the genuine INTERNAL throws in expected noise.
    expect(reportError).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('CONFLICT');
      // Verbatim, and with no reference number — it is already actionable.
      expect(r.error.message).toBe('Order ORD-1 is not confirmed.');
      expect(r.error.message).not.toContain('ref:');
    }
  });

  it('does NOT report a validation failure either — Zod refusals are designed', async () => {
    requireRole.mockResolvedValue(salesAuth);
    impersonationTenantId.mockReturnValue(null);
    const action = tenantAction(['sales'], schema, async () => 'unreachable');

    const r = await action({ v: 123 });

    expect(reportError).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION');
  });

  it('reports even when the throw happens BEFORE the tenant is known', async () => {
    // requireRole itself failing with a non-AppError: tenantId and userId are null,
    // but the request id and the action name still identify the call. This is the
    // case the hoist above the try exists for.
    requireRole.mockRejectedValue(new Error('session store unreachable'));
    impersonationTenantId.mockReturnValue(null);
    const action = tenantAction(['sales'], schema, async () => 'unreachable');

    const r = await action({ v: 'x' });

    expect(reportError).toHaveBeenCalledTimes(1);
    const [, context] = reportError.mock.calls[0]!;
    expect(context).toMatchObject({ action: 'tenantAction', requestId: REQUEST_ID });
    expect((context as Record<string, unknown>)['tenantId']).toBeNull();
    expect(r.ok).toBe(false);
  });
});
