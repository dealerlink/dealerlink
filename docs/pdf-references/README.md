# PDF reference baseline — captured against the pinned seed

These are the 14 reference PDFs the Typst snapshot tests assert against. They
were captured from the **Chromium pipeline** on Day 27, immediately before that
pipeline was removed, against a seed whose clock is pinned (F.67).

**This is a one-way door.** Phase 3 of Day 27 deletes the pipeline that produced
these files. They cannot be regenerated. If they are wrong, the only recovery is
`git revert` on the Chromium removal.

For the Day 25 captures — the operator sign-off record, which is _not_ a test
baseline — see `docs/pdf-references-day25-signoff/`.

## How they were produced

|                 |                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Commit          | branch `day-27-recapture-and-cutover`, cut from `main` @ `d19cfb5`                                    |
| Seed            | `pnpm db:seed` (ends with `pin-created-at.ts`) + `long-serial-fixture.sql`                            |
| `SEED_EPOCH`    | `2026-09-11T17:30:00.000Z` — the default in `packages/db/src/seeds/clock.ts`                          |
| Renderer        | `apps/workers/scripts/capture-references.ts`                                                          |
| Capture command | `cd apps/workers && pnpm exec tsx scripts/capture-references.ts --manifest scripts/typst-matrix.json` |
| Addressing      | `(tenant slug, document number)` — never by uuid, per DEV.119                                         |

One command captures all 14. The branded and unbranded cases need different
`tenant_settings.logo_url` state, so the script orders the passes, applies the
branded fixture's logo between them, and restores the tenant's original value in
a `finally`. Day 25 did this by hand across two runs; that is not a procedure to
rely on when the output is a one-way door.

## Reproducibility — what was verified, and what cannot be

**Verified: 14/14 content-identical across two full reseeds and two independent
captures** — the extracted text _and_ the baseline position of every text item.
That is the property a baseline needs.

**Byte-identity is unobtainable from Chromium, for two reasons, neither of them
document content:**

1. **`/CreationDate` and `/ModDate`** are stamped with wall-clock time by Skia.
   Puppeteer's `page.pdf()` exposes no way to pin them.
2. **Tagged-PDF structure element ids** (`/ID (node00000135)`) come from a
   counter that is per browser process, not per document, so the same document
   captured twice gets different node ids.

This is not a defect in the capture; it is the property that disqualified
Chromium from snapshot testing in the first place, and one of the reasons F.38
chose Typst. Typst renders **are** byte-stable (14/14 across two reseeds), so the
byte-level baseline for the snapshot tests is Typst-to-Typst; these references
are the content baseline and the cross-renderer check.

## A defect this verification caught

The first re-capture differed from the first capture on exactly two of the 14
files, by exactly one text item: `12:06` against `12:07`, in the footer of the
two `DSP-REF-*` dispatch notes.

`long-serial-fixture.sql` inserts its rows **after** `pnpm db:seed` has run its
`pin-created-at` pass, so nothing pinned them and `created_at` defaulted to
`now()`. That reaches the document: `generatedAt` resolves to the source row's
`created_at`, so the footer showed the minute the fixture happened to run. The
fixture now sets its own timestamps from its business date, matching the rule
`pin-created-at.ts` applies to seeded rows.

Worth stating plainly, because it is the argument for the check existing at all:
**the wrong baseline would have looked completely fine.** One minute in one
footer on two files, in a set of 14, behind a one-way door.

## Coverage

Unchanged from Day 25 — four document paths, branded and unbranded, intra- and
inter-state, single-line through 500 serials. `capture-results.json` records
per-case provenance. Round-off is still not represented, because the feature does
not exist (F.6).
