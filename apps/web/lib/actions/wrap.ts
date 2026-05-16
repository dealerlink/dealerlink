import { withOperator, withTenant, type DrizzleTx } from '@dealerlink/db';
import { headers } from 'next/headers';
import { z } from 'zod';

import { requireRole, type AuthContext } from '@/lib/auth/require-role';
import { AppError, isAppError, type AppErrorCode } from '@/lib/errors';
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
  return { ip, userAgent };
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
 *   5. Operator-impersonation calls run with `readOnly: true`, which the
 *      audit trigger enforces by raising on any mutation.
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

      // Allow operator role IFF impersonating a tenant; otherwise only the
      // four tenant roles may invoke a tenantAction.
      const impersonatingTenant = impersonationTenantId();
      let auth: AuthContext;
      if (impersonatingTenant) {
        auth = await requireRole(['operator']);
      } else {
        auth = await requireRole(allowedRoles);
      }

      const tenantId = impersonatingTenant ?? auth.user.tenantId;
      if (!tenantId) {
        throw new AppError('FORBIDDEN', 'No tenant context for this action');
      }

      // Tag the Sentry scope so any error inside this action is attributable
      // to a tenant.
      setSentryTenant({ tenantId });

      const { ip, userAgent } = clientMeta();

      const data = await withTenant(
        tenantId,
        async (tx) =>
          fn({
            tx,
            auth,
            input: parsed.data,
            impersonating: !!impersonatingTenant,
          }),
        {
          userId: auth.user.id,
          ip,
          userAgent,
          readOnly: !!impersonatingTenant,
        },
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
      const { ip, userAgent } = clientMeta();
      const data = await withOperator(
        auth.user.id,
        async (tx) => fn({ tx, auth, input: parsed.data }),
        { ip, userAgent },
      );
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: toActionError(err) };
    }
  };
}
