/**
 * F.5a — delivery addresses for existing dealers.
 *
 * ## WHY THIS IS ITS OWN MODULE AND RUNS LATE
 *
 * It appends to tenants that already exist rather than creating anything, so it
 * runs AFTER every other seed module and BEFORE `pin-created-at.ts` — the same
 * position and the same argument as `client-demo.ts`. Two reasons that matters:
 *
 * 1. **It cannot shift a pinned document number.** Nothing here allocates a
 *    document counter, but running late means that stays true even if a future
 *    edit adds one by accident.
 * 2. **It cannot disturb what upstream modules select.** F.134 recorded that the
 *    seeds index into list queries with no `ORDER BY`, so the physical row order
 *    of `products` and `dealers` decides what lands on a document. This module
 *    inserts into `dealer_addresses` only — a table no earlier module reads and no
 *    current document renders — so it cannot move the 14 reference PDFs. That was
 *    verified by rendering them before and after, not assumed.
 *
 * ## THE FIXTURE'S POINT IS THE CROSS-STATE ADDRESS
 *
 * A dealer whose delivery addresses are all in its registered state demonstrates
 * nothing: the multi-site case and the single-site case look identical. So each
 * seeded dealer gets its registered-state address AND one in a different state.
 * That is what makes "ship to this dealer's other site" expressible, and it is
 * the corpus F.129 (the dispatch-note delivery address) and F.5b (Ship-To GSTIN
 * state cross-check) will need.
 *
 * **It does NOT create a §10(1)(b) document.** No PI or order here records a
 * delivery arrangement — the corpus stays uniformly arrangement (a), which the
 * invariant test asserts and which keeps every stored classification unchanged.
 * The seeded (b) chain is a separate deliverable in its own tenant (D-11).
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import { dealerAddresses, dealers, tenants } from '../schema';

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

/**
 * Addresses to give each seeded dealer, as offsets from its own state.
 *
 * `crossState` is chosen per dealer below so it is never equal to the dealer's
 * registered state — a same-state "cross" address would make the fixture silently
 * useless, and nothing downstream would notice.
 */
const HOME = {
  label: 'Registered office',
  addressLine1: 'Survey 44/2, Ring Road',
  city: 'Head office',
  pincode: '400001',
  isDefault: true,
};
const AWAY = {
  label: 'Project site warehouse',
  addressLine1: 'Warehouse B, Logistics Park',
  city: 'Site',
  pincode: '560100',
  isDefault: false,
};

/** A state that is definitely not `state`, for the cross-state address. */
function otherState(state: string): string {
  // Two candidates so no dealer's own state can be picked. Opaque codes only —
  // CLAUDE.md §5 forbids storing a full state name.
  return state === 'KA' ? 'TN' : 'KA';
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Seeding dealer delivery addresses (F.5a)');
  const tenantRows = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .orderBy(tenants.slug);

  let created = 0;
  for (const t of tenantRows) {
    // Ordered, unlike the older seed modules — F.134's finding is that an
    // unordered list select makes the corpus depend on physical row order. New
    // code does not add to that.
    const dealerRows = await db
      .select({ id: dealers.id, state: dealers.state, displayName: dealers.displayName })
      .from(dealers)
      .where(sql`tenant_id = ${t.id}`)
      .orderBy(dealers.dealerCode);

    // Idempotent: skip a tenant that already has addresses, so a partial run
    // cannot double up. A full `db:seed` truncates `dealers` CASCADE first, which
    // removes these rows transitively, so the guard only matters for a targeted
    // re-run of this module alone.
    const [existing] = await db
      .select({ id: dealerAddresses.id })
      .from(dealerAddresses)
      .where(sql`tenant_id = ${t.id}`)
      .limit(1);
    if (existing) {
      console.log(`  · ${t.slug}: addresses already present — skipping`);
      continue;
    }

    // The first three dealers per tenant, not all of them: enough to exercise the
    // picker and the cross-state case without inflating a corpus every render and
    // every report iterates.
    for (const d of dealerRows.filter((x) => x.state).slice(0, 3)) {
      const home = d.state!.toUpperCase();
      const away = otherState(home);
      await db.insert(dealerAddresses).values([
        { tenantId: t.id, dealerId: d.id, ...HOME, state: home },
        { tenantId: t.id, dealerId: d.id, ...AWAY, state: away },
      ]);
      created += 2;
    }
    console.log(`  · ${t.slug}: ${dealerRows.filter((x) => x.state).slice(0, 3).length} dealer(s)`);
  }

  console.log(`✓ Seeded ${created} dealer addresses.`);
  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
