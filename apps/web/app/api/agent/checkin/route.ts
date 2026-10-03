import { db, tenantSettings, withTenant } from '@dealerlink/db';
// SUBPATH, not the barrel. `agent-token` imports `node:crypto`, and the barrel
// is on the Edge path (DEV.158). A subpath is reachable only by a caller that
// names it, and this file declares `runtime = 'nodejs'` below.
import { resolveAgentToken, touchAgentToken } from '@dealerlink/db/agent-token';
import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { shieldCheck, SHIELD_LIMIT } from '@/lib/agent/shield';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * `GET /api/agent/checkin` — F.148 A.1. **The first machine-caller path in this
 * codebase that resolves a TENANT from a credential.**
 *
 * The two existing machine callers are tenant-agnostic by design: the Resend
 * webhook authenticates with a Svix signature and uses `adminDb` throughout,
 * declining to scope at all, and `/api/health`'s detail token identifies nobody.
 * This is the new thing, and it is the row's main risk — not the Tally protocol.
 *
 * ## WHAT IT DOES
 *
 * The agent polls this to say "I am alive, here is my version", and learns which
 * tenant its token is bound to so an operator can confirm an installation is
 * pointed at the right company. **It returns no Tally data and asks for none** —
 * the masters fetch is Gate T work (B-1: no real TallyPrime is reachable).
 *
 * ## THE TWO LIMITS, AND THEY ARE NOT THE SAME THING
 *
 * 1. `shieldCheck` — pre-auth, IP-keyed, **in-process, no store**. It must exist
 *    unconditionally, so it cannot depend on a database that may be the thing
 *    under pressure. See `lib/agent/shield.ts`.
 * 2. `checkRateLimit` — post-auth, **keyed on the TOKEN, never the IP**, because
 *    agents share NATs and IPs change while the thing to bound is an
 *    INSTALLATION. Generous, so a trip is a signal rather than noise, and it may
 *    soft-fail open. See the posture note in `lib/rate-limit.ts`.
 *
 * ## 401, NOT 404 — AND IDENTICAL ACROSS ALL FOUR REJECTIONS
 *
 * `internal/sentry-test` returns 404 so its existence is not disclosed, and that
 * precedent does NOT transfer: its existence IS the secret, where this route is
 * published in an installer and in the agent's own config. Concealing a route we
 * ship is theatre, paid for in the agent's ability to classify its own failure —
 * which acceptance criterion 4 requires and §6's self-reporting depends on.
 *
 * So: one 401, byte-identical for **absent, malformed, unknown and revoked**.
 * The caller gets the one bit it can act on; the revoked-versus-never-existed
 * distinction stays server-side on `agent_tokens.revoked_at`, where the operator
 * sees it. Same split as F.176.
 *
 * **Unknown and revoked are identical BY CONSTRUCTION, not by care:** the
 * revocation predicate lives in the SQL WHERE clause (`resolveAgentToken`), so a
 * revoked token simply fails to match. There is no second branch that could
 * acquire a different body, a different header or a different cost later.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The ONE rejection. Constructed in one place so the four cases cannot diverge. */
function reject(): NextResponse {
  return NextResponse.json(
    { error: 'unauthorized' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  );
}

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const shield = shieldCheck(ip);
  if (!shield.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      {
        status: 429,
        headers: {
          'Retry-After': String(shield.retryAfterSec),
          'X-RateLimit-Limit': String(SHIELD_LIMIT),
        },
      },
    );
  }

  // Absent or malformed: rejected without a database round trip. That timing
  // difference reveals only that no bearer token was presented, which the caller
  // already knows — it says nothing about any token VALUE.
  const presented = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!presented) return reject();

  const resolved = await resolveAgentToken(presented);
  if (!resolved) return reject(); // unknown AND revoked, same path, same response.

  // POST-AUTH LIMIT, KEYED ON THE TOKEN. Generous: a polling agent should never
  // see this, so a trip means something is wrong on their machine (F.189) and is
  // worth surfacing rather than absorbing.
  const rl = await checkRateLimit({
    scope: 'agent-checkin',
    key: resolved.tokenId,
    limit: 120,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000))),
          'X-RateLimit-Limit': '120',
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const version = req.headers.get('x-agent-version');

  // EVERYTHING FROM HERE IS RLS-ENFORCED. `withTenant` sets app.tenant_id and
  // uses the `dealerlink_app` connection. The resolution above is the ONE exempt
  // statement in this path (spec §3) — measured, not asserted:
  // `rg -n adminDb` over the agent's paths returns `agent-token.ts` once.
  //
  // THE HEARTBEAT IS IN HERE, and it was not until the measurement was taken.
  // It ran on `adminDb`, which made the exemption two statements wide while the
  // docblock claimed one. It does not need the privilege: the tenant is known by
  // now, so RLS additionally constrains the UPDATE to that tenant's rows.
  // It is also THROTTLED — see `HEARTBEAT_THROTTLE`; every write here fires the
  // audit trigger, and a per-minute poll would bury real revocations.
  const settings = await withTenant(resolved.tenantId, async (tx) => {
    await touchAgentToken(tx, resolved.tokenId, version && version.length <= 64 ? version : null);
    const [row] = await tx
      .select({ gstin: tenantSettings.gstin })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, resolved.tenantId))
      .limit(1);
    return row ?? null;
  });

  return NextResponse.json({
    ok: true,
    tenantId: resolved.tenantId,
    scope: resolved.scope,
    // Lets an operator confirm the installation is bound to the company they
    // think it is — the cheapest answer to "is the agent pointed at the right
    // tenant", which is otherwise a database question.
    tenantConfigured: settings !== null,
    serverTime: new Date().toISOString(),
    // NO TALLY INSTRUCTION. The masters fetch is Gate T (B-1), and an empty
    // field here would read as "nothing to do" rather than "not built yet".
  });
}

// `db` is imported so the RLS-enforced connection is the one in scope for any
// future query added here; `withTenant` uses it internally.
void db;
