# Day 25 captures — the operator sign-off record

**These are historical evidence, not a test baseline. Nothing should assert
against them.** The baseline lives in `docs/pdf-references/`.

These are the 14 reference PDFs captured on Day 25 and reviewed at the Day 26
sign-off gate. The operator approved the Typst templates against **these exact
files**, via the side-by-side artifact at `docs/typst-comparison/index.html` and
the classification in `docs/TYPST_DIFF.md`. They are kept so that the approval
remains reconstructible: a sign-off that cannot be re-examined is not a record.

## Why they are not the baseline

They were captured **before** F.67 pinned the seed clock, against a database
whose dates moved daily and whose serial numbers were randomised per reseed. Two
of them carry serials (`DSP13-0d0f-…`) derived from a tenant uuid that no longer
exists, so no seed can reproduce them. `docs/TYPST_DIFF.md` records the full
comparison; the short version is that they agree with a current render on every
money figure, every document number and every date on the face of the document,
and cannot agree on the serials or the footer.

Day 27 Phase 1 re-captured the baseline against the pinned seed. That re-capture
is what the snapshot tests assert against.

## Provenance

|                     |                                                                        |
| ------------------- | ---------------------------------------------------------------------- |
| Captured            | Day 25, from the Chromium pipeline (`/usr/bin/chromium`, Chromium 152) |
| Seed                | `pnpm db:seed` **before** F.67 — wall-clock dates, randomised serials  |
| Approved            | Day 26 sign-off gate, after the `REV n` badge fix                      |
| Recovered here from | `main` at the Day 27 branch point, hash-verified against git           |

## The artifact as it was reviewed

`docs/typst-comparison/` is regenerated whenever the templates or the
references change, so the version the operator actually reviewed is the one at
commit `d19cfb5` (`main`, immediately before Day 27). Recover it with:

```bash
git show d19cfb5:docs/typst-comparison/index.html > /tmp/day26-signoff.html
git checkout d19cfb5 -- docs/typst-comparison   # or the whole directory
```

The PDFs in this directory, that artifact, and `docs/TYPST_DIFF.md` at that
commit are together the record of what was approved.

Do not delete these. Do not update them. If a future change makes them look
wrong, that is expected — they record what was approved, on the day it was
approved.
