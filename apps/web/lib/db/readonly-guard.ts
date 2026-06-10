import 'server-only';

import { setReadOnlyResolver } from '@dealerlink/db';
import { cookies } from 'next/headers';

/**
 * Operator read-only view — belt #2 registration (ADR-014).
 *
 * Wires the DB-level force-read-only resolver (packages/db/with-tenant.ts) to
 * the web request: whenever the operator impersonation cookie is present, EVERY
 * `withTenant` transaction in the request becomes read-only at the Postgres
 * level (`SET TRANSACTION READ ONLY`), independent of whether the caller passed
 * `{ readOnly: true }`.
 *
 * Why a cookie check is sufficient and safe:
 *   - The `dealerlink_impersonation` cookie is httpOnly and is ONLY ever set by
 *     `enterImpersonation`, which is gated to the `operator` role. A tenant user
 *     can neither obtain nor forge it.
 *   - The resolver can only ADD restriction (force read-only); it never relaxes
 *     it. So even an unexpected cookie would only make the session MORE
 *     restricted, never escalate writes. Fail-safe by direction.
 *
 * `cookies()` is a request-scoped API. Outside a request (workers, seeds, cron)
 * it throws — `forcedReadOnly()` in packages/db swallows that and treats it as
 * "not forced", so non-request DB work is unaffected.
 *
 * Imported for its side effect from `instrumentation.ts` (nodejs runtime) so it
 * is registered once at process start, before any request runs.
 */
const IMPERSONATION_COOKIE = 'dealerlink_impersonation';

setReadOnlyResolver(() => cookies().get(IMPERSONATION_COOKIE)?.value != null);
