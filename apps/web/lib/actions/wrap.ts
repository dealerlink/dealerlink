import { withOperator, withTenant, type DrizzleTx } from '@dealerlink/db';
import { headers } from 'next/headers';
import { z } from 'zod';

import { requireRole, type AuthContext } from '@/lib/auth/require-role';
import { AppError, isAppError, type AppErrorCode } from '@/lib/errors';
import { runWithLogContext } from '@/lib/observability/als';
import { setSentryTenant } from '@/lib/observability/context';
import { impersonationTenantId } from '@/lib/tenant/context';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string } };

type TenantRole = 'admin' | 'sales' | 'accounts' | 'dispatch';

interface TenantActionCtx<I> {
  tx: DrizzleTx;
  auth: AuthContext;
  input: I;
  /** True when this call is made while an operator is impersonating a tenant. */
  impersonating: boolean;
}

interface OperatorActionCtx<I> {
  tx: DrizzleTx;
  auth: AuthContext;
  input: I;
}

function clientMeta() {
  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  const userAgent = h.get('user-agent') ?? null;
  const requestId = h.get('x-request-id') ?? crypto.randomUUID();
  return { ip, userAgent, requestId };
}

function toActionError(err: unknown): { code: AppErrorCode; message: string } {
  if (isAppError(err)) return { code: err.code, message: err.message };
  // Don't leak internal messages to clients
  const message =
    err instanceof Error && err.message.startsWith('[lucia]')
      ? 'Internal authentication error'
      : 'Something went wrong. Please try again.';
  return { code: 'INTERNAL', message };
}

/**
 * Wraps a tenant Server Action with the full Day 3 contract:
 *   1. Caller must have one of `allowedRoles` (operator never allowed here).
 *   2. Caller must be tied to a tenant (operators impersonating count).
 *   3. Zod-validated input.
 *   4. A `withTenant()` transaction so RLS + audit triggers see the right
 *      tenant/user/ip/UA.
 *   5. Operator read-only view (ADR-014): if an operator is impersonating a
 *      tenant, the action is REFUSED before its body runs (READ_ONLY). The DB
 *      then independently forces every `withTenant` read-only via the resolver
 *      (belt #2), so even reads run in a read-only Postgres transaction.
 *   6. Errors are normalized to `{ ok: false, error: {code, message} }`.
 *
 * Example:
 *   export const updateDealer = tenantAction(
 *     ['admin', 'sales'],
 *     z.object({ id: z.string().uuid(), name: z.string().min(2) }),
 *     async ({ tx, auth, input }) => {
 *       await tx.update(dealers).set({ name: input.name }).where(eq(dealers.id, input.id));
 *       return { id: input.id };
 *     },
 *   );
 */
export function tenantAction<I, O>(
  allowedRoles: TenantRole[],
  inputSchema: z.ZodType<I>,
  fn: (ctx: TenantActionCtx<I>) => Promise<O>,
): (raw: unknown) => Promise<ActionResult<O>> {
  return async (raw) => {
    try {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid input', {
          meta: { issues: parsed.error.issues },
        });
      }

      // Operator read-only view (ADR-014) — belt #1, app layer.
      // If an operator is impersonating a tenant, REFUSE every tenantAction
      // before its body runs. This is deterministic and statement-order
      // independent: it stops not just DB writes (also blocked at the DB by
      // belt #2 / SET TRANSACTION READ ONLY) but the side-channel writes the
      // DB guard cannot see — pg-boss PDF/email enqueues run on a SEPARATE
      // connection (see lib/queue/client.ts), so they must be cut off here at
      // the source rather than relying on a later in-transaction write to trip.
      const impersonatingTenant = impersonationTenantId();
      if (impersonatingTenant) {
        // Confirm it really is an operator (tenant users can't hold the
        // httpOnly cookie, but never trust the cookie alone).
        await requireRole(['operator']);
        throw new AppError(
          'READ_ONLY',
          'Read-only operator view: changes are disabled while viewing a tenant.',
        );
      }

      const auth: AuthContext = await requireRole(allowedRoles);

      const tenantId = auth.user.tenantId;
      if (!tenantId) {
        throw new AppError('FORBIDDEN', 'No tenant context for this action');
      }

      // Tag the Sentry scope so any error inside this action is attributable
      // to a tenant.
      setSentryTenant({ tenantId });

      const { ip, userAgent, requestId } = clientMeta();

      // Seed the ALS log context so every log line inside the action carries
      // tenant / user / request id without threading them through.
      const data = await runWithLogContext(
        { requestId, tenantId, userId: auth.user.id, role: auth.user.role },
        () =>
          withTenant(
            tenantId,
            async (tx) =>
              fn({
                tx,
                auth,
                input: parsed.data,
                // An impersonating operator never reaches here — tenantAction
                // refuses above. So a body that runs is always a real tenant
                // user. The flag is retained for the ctx shape / call sites.
                impersonating: false,
              }),
            {
              userId: auth.user.id,
              ip,
              userAgent,
            },
          ),
      );

      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: toActionError(err) };
    }
  };
}

/**
 * Same as `tenantAction` but for platform-operator actions. Sets
 * `app.user_id` only; `app.tenant_id` stays empty. Used by /admin routes.
 */
export function operatorAction<I, O>(
  inputSchema: z.ZodType<I>,
  fn: (ctx: OperatorActionCtx<I>) => Promise<O>,
): (raw: unknown) => Promise<ActionResult<O>> {
  return async (raw) => {
    try {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid input', {
          meta: { issues: parsed.error.issues },
        });
      }
      const auth = await requireRole(['operator']);
      const { ip, userAgent, requestId } = clientMeta();
      const data = await runWithLogContext(
        { requestId, userId: auth.user.id, role: auth.user.role },
        () =>
          withOperator(auth.user.id, async (tx) => fn({ tx, auth, input: parsed.data }), {
            ip,
            userAgent,
          }),
      );
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: toActionError(err) };
    }
  };
}
