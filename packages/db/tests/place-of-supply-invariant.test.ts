/**
 * F.5a — the place-of-supply invariant, asserted for the first time.
 *
 * ## THIS IS THE ASSERTION NOTHING MADE BEFORE TODAY
 *
 * F.105 audited how `place_of_supply` is derived and its own finding was blunt:
 * "No test asserts the invariant" (`docs/F105_AUDIT.md:330-337`). The closest
 * thing that existed, `apps/web/tests/e2e/verify-day-16.spec.ts:122-123`,
 * DEFENDS ITSELF against bad data in its row selection rather than asserting the
 * rule — so it passes whether the rule holds or not. F.103 then fixed eight
 * literal `place_of_supply` values in the seeds without adding the assertion,
 * because until ADR-016 there was no single rule to assert: the derivation was
 * "the ship-to state", and a test restating that would only have re-expressed
 * the one line of production code it was watching.
 *
 * With two branches there is a rule worth checking, and it is the regression
 * guard for the whole day: **for every SEEDED PI and order, `place_of_supply`
 * equals the state that the row's own recorded `delivery_arrangement` selects.**
 * This is what would have caught F.103's corrupted fixtures four months earlier.
 *
 * "Seeded" is the scope criterion 8 names, and it is load-bearing rather than
 * convenient — see `SEEDED_NUMBER` below, which explains what is outside it, why,
 * and what was filed instead of being fixed here.
 *
 * ## WHY IT IS A CORPUS TEST AND NOT A UNIT TEST
 *
 * `packages/tax/tests/place-of-supply.test.ts` already proves the pure function
 * branches correctly. That cannot prove the COLUMN agrees with it — that the two
 * write sites persist what they derived, that the copy-forward at
 * `status-transitions.ts` carries the arrangement with the state it selected, and
 * that no seed writes a state its own arrangement contradicts. Those are the half
 * of the change F.103 demonstrated nobody catches by reading.
 *
 * ## A DISAGREEMENT HERE IS A FINDING, NEVER A REASON TO RELAX THE ASSERTION
 *
 * If this fails, one of three things is true and all three are worth knowing: a
 * write site derived one state and stored another; the copy-forward dropped the
 * arrangement; or a seed wrote an inconsistent pair. Widening the assertion, or
 * excluding the offending rows, converts a finding into a silence (CLAUDE.md
 * §11.1 rulings 1 and 4).
 *
 * Runs per tenant because RLS scopes every query to `app.tenant_id`.
 */
import { resolvePlaceOfSupply } from '@dealerlink/tax';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import { orders, performaInvoices, tenants } from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
const tenantIds: { id: string; slug: string }[] = [];

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const rows = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants);
  for (const r of rows) tenantIds.push(r);
  if (tenantIds.length === 0) throw new Error('no seeded tenants — run pnpm db:seed');
});

afterAll(async () => {
  await client?.end({ timeout: 5 });
});

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

type Row = {
  docNumber: string;
  arrangement: string | null;
  placeOfSupply: string;
  billToState: string | null;
  shipToState: string | null;
};

/**
 * A SEEDED document number: `<PREFIX>-<fiscal year>-<sequence>`, e.g.
 * `PI-2026-0003`. This is the scope of the invariant, and criterion 8 names it —
 * "for every SEEDED PI and order".
 *
 * ## THE SCOPE IS POSITIVE, NOT AN EXCLUSION LIST, AND THAT IS DELIBERATE
 *
 * Other files in this suite fabricate PIs and orders in their own setup with
 * numbers like `PI-TEST-muj7yg26vt99`, `PI-DSP-…`, `PI-PAYTEST-…`. Because the
 * suite shares one dev database (DEV.91), those rows are visible here, and 25 of
 * them violate this invariant: they hardcode `placeOfSupply: 'MH'` while their
 * dealers sit in `AS`. That is a real defect in those fixtures — the same shape
 * F.103 fixed in `day12.ts`/`day13.ts`, in a place F.103 did not reach — and it
 * is FILED as its own row rather than fixed here (CLAUDE.md §11.2).
 *
 * Two reasons this is a scope and not a silence. First, those rows are DIRECT
 * INSERTS in test setup, not documents written through `convertQuotationToPi` or
 * `updatePi`, so asserting the invariant over them tests the fabricator rather
 * than the product. Second, the filter is an affirmative PATTERN rather than a
 * list of prefixes to skip: a list would silently drop the next fixture prefix
 * anybody adds, whereas a pattern admits only properly numbered documents and so
 * needs no maintenance (ruling 7 — prefer affirmative enumeration to inference
 * from an absence).
 *
 * `excluded` is reported on every run so the scoping can never become invisible.
 */
const SEEDED_NUMBER = /^[A-Z]+-\d{4}-\d{4}$/;

/** Every PI or order in one tenant, joined to both parties' states. */
async function load(tenantId: string, which: 'pi' | 'order'): Promise<Row[]> {
  return asTenant(tenantId, async (tx) => {
    const t = which === 'pi' ? performaInvoices : orders;
    const rows = await tx
      .select({
        docNumber: which === 'pi' ? performaInvoices.piNumber : orders.orderNumber,
        arrangement: t.deliveryArrangement,
        placeOfSupply: t.placeOfSupply,
        billToState: sql<string | null>`bt.state`,
        shipToState: sql<string | null>`st.state`,
      })
      .from(t)
      .innerJoin(sql`dealers bt`, sql`bt.id = ${t.billToDealerId}`)
      .innerJoin(sql`dealers st`, sql`st.id = ${t.shipToDealerId}`);
    return rows as Row[];
  });
}

describe('F.5a — place_of_supply agrees with the arrangement that selected it', () => {
  for (const which of ['pi', 'order'] as const) {
    const label = which === 'pi' ? 'performa_invoices' : 'orders';

    it(`${label}: every seeded row's stored place_of_supply is the state its arrangement selects`, async () => {
      const offenders: string[] = [];
      const excluded: string[] = [];
      let checked = 0;
      for (const t of tenantIds) {
        for (const r of await load(t.id, which)) {
          if (!SEEDED_NUMBER.test(r.docNumber)) {
            excluded.push(`${t.slug}/${r.docNumber}`);
            continue;
          }
          checked++;
          if (r.billToState == null || r.shipToState == null) {
            // A dealer with no state cannot satisfy the invariant either way, and
            // production refuses to create such a document — `loadDealerForDocument`
            // throws rather than substituting a state (pi/helpers.ts:152-154). So
            // this is reported as an offender rather than skipped: skipping it is
            // how a corpus defect becomes invisible.
            offenders.push(`${t.slug}/${r.docNumber}: a party has no state`);
            continue;
          }
          const expected = resolvePlaceOfSupply({
            arrangement: r.arrangement,
            shipToState: r.shipToState,
            billToState: r.billToState,
          }).toUpperCase();
          if (r.placeOfSupply.trim().toUpperCase() !== expected) {
            offenders.push(
              `${t.slug}/${r.docNumber}: stored ${r.placeOfSupply}, ` +
                `arrangement ${r.arrangement ?? 'NULL(=a)'} selects ${expected} ` +
                `(billTo ${r.billToState}, shipTo ${r.shipToState})`,
            );
          }
        }
      }
      // Reported unconditionally, so the scoping is visible in a passing run and
      // not only when something fails. If this list ever contains a properly
      // numbered document, the pattern is wrong.
      if (excluded.length > 0) {
        console.log(
          `  [scope] ${label}: ${excluded.length} non-seeded row(s) excluded — ` +
            `fabricated by other tests in this suite (DEV.91). First few: ` +
            excluded.slice(0, 3).join(', '),
        );
      }
      // Named rather than counted, so a failure says WHICH document and why.
      expect(offenders, `${checked} seeded ${label} rows checked`).toEqual([]);
      // Guards the vacuous pass twice over: an empty corpus would satisfy the
      // loop above, and a pattern that accidentally matched nothing would too.
      //
      // A LOWER BOUND RATHER THAN THE EXACT COUNT, on purpose. A clean seed gives
      // 68 PIs and 48 orders as F.5a's A.0 census measured it, but R-5's lesson is
      // that corpus counts drift with every seed addition, and a test that must be
      // edited whenever a chain is added is a test that gets edited carelessly.
      // The exact figures belong in the deviation entry, where they are dated.
      expect(checked, `${label} must not be empty — run pnpm db:seed`).toBeGreaterThan(20);
    });
  }

  it('the corpus is uniformly arrangement (a), as A.0 measured it', async () => {
    // A.0's party census found all eight differing-party documents carrying
    // place_of_supply = the ship-to state, i.e. arrangement (a). This is the
    // sentence ADR-016 cites for "nothing existing reclassifies", so it is
    // asserted rather than left in a deviation entry where it cannot fail.
    //
    // It is NOT a claim that (b) never occurs — it is a claim about the SEEDED
    // corpus. When a (b) chain is seeded, this expectation changes with it, and
    // that is the point: the day that introduces a (b) document should have to
    // come here and say so.
    const arrangements = new Set<string>();
    for (const t of tenantIds) {
      for (const which of ['pi', 'order'] as const) {
        for (const r of await load(t.id, which)) {
          // Same seeded-only scope as above, and for the same reason: a fixture
          // fabricated by another test in this suite says nothing about the seed.
          if (!SEEDED_NUMBER.test(r.docNumber)) continue;
          arrangements.add(r.arrangement ?? 'NULL');
        }
      }
    }
    expect([...arrangements].sort()).toEqual(['NULL']);
  });
});
