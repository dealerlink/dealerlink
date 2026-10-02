import { withOperator, withTenant, type DrizzleTx } from '@dealerlink/db';
import { headers } from 'next/headers';
import { z } from 'zod';

import { requireRole, type AuthContext } from '@/lib/auth/require-role';
import { AppError, isAppError, type AppErrorCode } from '@/lib/errors';
import { runWithLogContext } from '@/lib/observability/als';
// NOT the DOM global of the same name: a missing import here resolved silently to
// `window.reportError`, which takes one argument, and typecheck reported only
// "Expected 1 arguments, but got 2".
import { reportError } from '@/lib/observability/log';
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

/** Short, greppable handle shown to the user and logged beside the real error. */
function refFrom(requestId: string | null): string | null {
  return requestId ? requestId.replace(/-/g, '').slice(0, 8) : null;
}

/**
 * Normalise a thrown error into the client payload, and REPORT the real one.
 *
 * ## THE CLIENT MESSAGE STAYS GENERIC. THAT IS NOT THE DEFECT. (F.170)
 *
 * The original comment here — "Don't leak internal messages to clients" — is
 * right and is unchanged in effect: a Postgres error carries table and column
 * names, and this is a multi-tenant product. **What was wrong is that the real
 * error went NOWHERE.** Both catch sites discarded it, so an unexpected throw in
 * any tenant write path produced a generic sentence for the user, nothing in the
 * server output, and nothing in Sentry — because the action CATCHES the error and
 * returns a value, so the Next.js/Sentry instrumentation never sees a throw either.
 *
 * Measured cost of that: F.169's seed/counter collision took roughly an hour to
 * diagnose by reproducing the action's body statement by statement, for a defect a
 * single log line would have named instantly. Before the e2e surfaced the message
 * text, every cause — a reconciliation failure, a unique violation, a status
 * refusal — was the identical `Timeout 30000ms exceeded`.
 *
 * ## ONLY NON-AppError THROWS ARE REPORTED, AND THAT IS DELIBERATE
 *
 * An `AppError` is a DESIGNED refusal whose message the user already sees and can
 * act on — `CONFLICT` from `assertOrderReconciles`, `VALIDATION` from a Zod
 * failure, `READ_ONLY` from an impersonating operator. Reporting those would bury
 * the genuine `INTERNAL` throws in expected noise, which is the failure mode that
 * makes an alerting channel worthless. "Log everything" is the easy wrong answer.
 *
 * ## THE REF IS IN THE MESSAGE, AND IT LEAKS NOTHING
 *
 * The user sees `Something went wrong (ref: a1b2c3d4). Please try again.` It is the
 * first eight hex characters of the request id, which is either the inbound
 * `x-request-id` or a UUID generated for this call — **it encodes nothing about the
 * tenant, the data or the error.** It turns a support conversation from "something
 * went wrong" into a log lookup. The FULL request id is logged, and an eight-char
 * prefix greps against it.
 *
 * It is attached only to `INTERNAL`, never to a designed refusal: a `CONFLICT`
 * message is already actionable and a reference number on it is noise.
 */
function toActionError(
  err: unknown,
  context: Record<string, unknown> & { requestId: string | null },
): { code: AppErrorCode; message: string } {
  if (isAppError(err)) return { code: err.code, message: err.message };

  // The real error, server-side only. `reportError` routes to Sentry AND keeps a
  // structured console line, so this is visible in DO Logs and in the dev terminal.
  // The ALS log context does NOT reach here — `runWithLogContext` wraps only the
  // action body — so every field is passed explicitly.
  reportError(err, context);

  const ref = refFrom(context.requestId);
  const isLucia = err instanceof Error && err.message.startsWith('[lucia]');
  const base = isLucia ? 'Internal authentication error' : 'Something went wrong';
  const message = ref ? `${base} (ref: ${ref}). Please try again.` : `${base}. Please try again.`;
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
    // HOISTED ABOVE THE try ON PURPOSE. `requestId` was declared inside it, so it
    // was not in scope in the catch — the ref could not be shown and the log could
    // not be correlated. Reading the headers cannot throw.
    const { ip, userAgent, requestId } = clientMeta();
    let tenantIdForLog: string | null = null;
    let userIdForLog: string | null = null;
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

      tenantIdForLog = tenantId;
      userIdForLog = auth.user.id;

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
      return {
        ok: false,
        error: toActionError(err, {
          action: 'tenantAction',
          requestId,
          tenantId: tenantIdForLog,
          userId: userIdForLog,
        }),
      };
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
    // Same hoist as tenantAction, for the same reason: the catch needs requestId.
    const { ip, userAgent, requestId } = clientMeta();
    let userIdForLog: string | null = null;
    try {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid input', {
          meta: { issues: parsed.error.issues },
        });
      }
      const auth = await requireRole(['operator']);
      userIdForLog = auth.user.id;
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
      return {
        ok: false,
        error: toActionError(err, {
          action: 'operatorAction',
          requestId,
          userId: userIdForLog,
        }),
      };
    }
  };
}
