# Typst spike — F.38 Day 25

**Verdict: all four spikes PASS. Typst is viable, including the load-bearing
byte-determinism claim. Provisioning is workable but has one concrete blocker in
the devcontainer and one decision to make.**

Typst **0.15.1**, `aarch64-unknown-linux-musl`, on the arm64 devcontainer.
Everything below was measured; nothing is quoted from documentation.

---

## 2.1 Rupee — PASS

Rendered `₹1,23,456.00` and `₹98,76,543.21`, then extracted the text back out of
the produced PDF with `pdfjs-dist`:

```
TEXT: "Rupee glyph testAmount: ₹1,23,456.00Grand total: ₹98,76,543.21Plain ASCII control: Rs. 1,23,456.00"
U+20B9 (₹) occurrences in extracted text: 2
```

Both glyphs render **and survive extraction as U+20B9**, with Indian digit
grouping intact. This is the exact pair of failures that disqualified
`@react-pdf/renderer` — issue #3168 (₹ rendering as `1`) and #3047 (garbled text
extraction with registered fonts). **Typst shares neither, with no font
registration required.**

For comparison, the Chromium references carry 1–2 ₹ glyphs each and also extract
cleanly, so this is parity, not an improvement.

## 2.2 Page numbering — PASS, and it removes a constraint

`counter(page)` in a page footer across a forced 3-page document:

```
page 1: "First page contentPage 1 of 3"
page 2: "Second page contentPage 2 of 3"
page 3: "Third page contentPage 3 of 3"
```

**This removes the constraint that forced DEV.37 — but DEV.37 is NOT superseded yet, and must not be written up as such until F.38 actually lands.** Chromium is still the pipeline; this is a spike with an open provisioning blocker. That deviation records that "Page X of Y" was
implemented through Chromium's `footerTemplate` because it was _the only
mechanism that could count pages_. Typst counts pages natively in the document
language, so IF F.38 lands, Day 26 can put the footer in the template where the
rest of the layout lives, and `renderPdfFromHtml`'s `footerTemplate` parameter has
no Typst equivalent to carry forward. The supersession entry belongs to the day
the pipeline changes, not to this one.

> The Day 25 plan cites "DEV.38" for this, at `docs/F38_TYPST_PLAN.md` lines 42,
> 77 and 123. The page-footer deviation is **DEV.37**. And DEV.38 is stranger
> than a mis-citation: **it has no entry in `DEVIATIONS.md` at all** — the ids
> 38, 41 and 42 are gaps — although it is referenced as real from
> `PROJECT_PLAN.md:90`, `BUILD_PROMPTS.md:2972` and
> `packages/db/src/seeds/day8.ts:309,535`, which describe it as a Day 8 seed
> cross-tenant dealer bug. So the entry was never written. Flagged, not fixed:
> writing a missing historical deviation is not this day's work, and a new entry
> must NOT be numbered 38.

## 2.3 Byte determinism — PASS, _conditionally_, and the condition is mandatory

**This is the claim the whole migration rests on, so both halves are recorded.**

Naive — same input, two renders two seconds apart — **DIFFERS**, in exactly 88
bytes out of 9,821. Content streams are byte-identical (same length, xref offsets
unchanged); every differing byte is metadata:

- `/ModDate` and `/CreationDate`
- XMP `xmp:ModifyDate` / `xmp:CreateDate`
- `xmpMM:InstanceID`, `xmpMM:DocumentID`, and the trailer `/ID[...]`

Pinned — `SOURCE_DATE_EPOCH=1700000000`, or equivalently
`--creation-timestamp` — **BYTE-IDENTICAL**:

| render                                | result                           |
| ------------------------------------- | -------------------------------- |
| simple document, two renders 2s apart | identical (`md5 9a566087…` both) |
| **500-serial document**, two renders  | identical                        |
| `--creation-timestamp` flag form      | identical                        |
| stdin→stdout pipe vs file-based       | identical                        |

**The condition is not optional and must be written into Day 27's snapshot
tests.** Unpinned, the timestamp _and the document ID derived from it_ change on
every render, so a snapshot test would fail on every run. Pinned, output is
reproducible across processes and across documents of any size. Typst documents
the variable as the reproducible-builds standard `SOURCE_DATE_EPOCH`.

## 2.4 Long serial list — PASS, better than required

500 serials in a table:

```
page 1: 180 serials  SN-2026-00001 .. SN-2026-00180
page 2: 188 serials  SN-2026-00181 .. SN-2026-00368
page 3: 132 serials  SN-2026-00369 .. SN-2026-00500
```

Contiguous, no serial lost or duplicated. With `table.header(...)` — which
repeats by default — the header row appears on **all 3 pages**, and extraction
confirms **500 serials, 500 unique, all present**. 26 serials fit on one page.

Chromium's production dispatch note puts 500 serials on **2** pages versus
Typst's 3 in this spike, but that is a layout difference (a bare 4-column table
here versus the production template's), not a capability difference. Day 26
authors against the real layout.

## 2.5 Provisioning — workable, with one blocker and one decision

|                      |                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- |
| Binary               | 48.6 MB uncompressed, 16.2 MB as shipped (`.tar.xz`)                                   |
| Linkage              | **static** — `ldd` reports "not a dynamic executable"                                  |
| Invocation from Node | `typst compile - -` over **stdin→stdout**, no temp files, byte-identical to file-based |
| Render time          | 8 ms simple · 10 ms (26 serials) · **31 ms (500 serials)**                             |

Render time is the headline number: **milliseconds against Chromium's seconds**,
with no browser process, no warm-up, and no memory ceiling of the kind DEV.67's
OOM forced.

**This is NOT a repeat of DEV.89, and that distinction is the point.** DEV.89 is
one x86-64-only binary (`@sparticuz/chromium`) that cannot run on arm64. Typst
publishes **`aarch64-unknown-linux-musl` and `x86_64-unknown-linux-musl` from the
same release tag**, both statically linked. The divergence axis is _handled_,
not traded.

### The blocker: the devcontainer cannot unpack the release

`xz` is **not installed**, and neither is `sudo`, `cargo`, `7z` or `bsdtar`.
Typst ships Linux builds only as `.tar.xz`. Getting the binary here required a
pure-JS xz decoder from npm as a workaround — **fine for a throwaway spike,
not acceptable as the provisioning story.** Fix before Day 27: add `xz-utils`
to the devcontainer image (one line), or vendor the extracted binary.

### The decision: which distribution channel

- **npm `typst` package — REJECTED, and check this before anyone proposes it.**
  It has the right shape (per-platform `optionalDependencies`:
  `@typst-community/typst-linux-arm64`, `-linux-x64`, …) but it is
  **abandoned**: latest is `0.10.0-8`, last published **2023-12-18**, five minor
  versions behind, and community-maintained rather than official.
- **Official GitHub release, pinned by version, per arch — recommended.** Both
  Linux arches exist for `v0.15.1`. Pin the tag and checksum the download.

Per environment: **devcontainer (arm64)** — needs `xz-utils`, then unpack the
aarch64 musl build. **GitHub runners (x86-64)** — `xz` is present in
`ubuntu-latest`, so `tar -xJf` works directly; cache the binary by version like
the Playwright browser cache already is. **DO workers (x86-64)** — add the static
binary to the image; it replaces a Chromium install, so the layer gets
dramatically smaller, and per ADR-013 the custom Dockerfile exists only because
of Chromium.

---

## What this spike did NOT establish

- **Visual fidelity.** Nothing here compares a Typst render against a reference
  document. That is Day 26, and the Day 26 sign-off gate.
- **The production layout.** The spike documents are throwaway fixtures, not the
  four templates. The 500-serial page count will change with the real layout.
- **Fonts.** The spike used Typst's defaults. The production documents use Inter
  and IBM Plex Mono (CLAUDE.md §3), and font embedding was not tested — it is
  the most likely source of a Day 26 visual difference.
- **x86-64 behaviour.** Everything was measured on arm64. Byte-determinism
  _across architectures_ was not tested, and it matters: if references are
  captured on one arch and CI snapshots run on another, they must agree. **Test
  this before Day 27 writes snapshot tests.**
- **Anything about `packages/tax`.** Untouched, per the guardrail. No number on
  any document changes in F.38.

## Recommendation

**Proceed to Day 26.** The three things most likely to block do not block: ₹
renders and extracts, page counting is native, and byte-determinism is
obtainable with a pinned timestamp. Provisioning is a solved problem with one
image change and one pinning decision, and it is strictly better than the
Chromium situation it replaces.

Two things to settle first, both cheap: install `xz-utils` in the devcontainer,
and check byte-determinism across arm64 and x86-64.

---

# Addendum — cross-architecture determinism, answered

**Question:** does Typst produce byte-identical output for the same input on arm64
and x86-64 with `SOURCE_DATE_EPOCH` pinned?

**Answer: YES. Byte-identical.** Verified as a standing CI check rather than a
one-off measurement — `apps/workers/scripts/typst-determinism/` plus the
`typst-determinism` job in `.github/workflows/verify.yml`.

|                        |                                                                    |
| ---------------------- | ------------------------------------------------------------------ |
| arm64 (devcontainer)   | `06713a310aa01b092a8c5e4d067aa3050123fc03b4d87a2c831c1e3048a404d5` |
| x86-64 (GitHub runner) | **same hash — job PASS in 6s**                                     |
| fixture                | 2 pages, 300 unique serials, 3 ₹ glyphs, repeating table header    |
| local reproducibility  | 1 distinct hash across 3 arm64 renders                             |

**Why this was worth answering before Day 26 rather than on Day 27.** References
are captured in the arm64 devcontainer; CI snapshot tests run on x86-64 runners.
Had the two disagreed, every snapshot test would have failed on its first run with
no useful signal, and the remedy would not have been in the test harness — it
would have been that **references must be produced in CI rather than locally**,
which changes Day 25's output, not Day 27's. That risk is now closed: local
capture is sound.

The fixture is deliberately non-trivial, because a minimal document could be
byte-stable while a realistic one is not. It exercises the rupee sign
(the U+20B9 glyph itself — the amount is a literal, so no grouping logic is
exercised), `counter(page)` in a footer, a table with a repeating header
spanning a page break, and a 300-entry serial list.

**Two pins, both load-bearing**, and the check exists partly to keep them honest:
Typst `0.15.1` and `SOURCE_DATE_EPOCH=1700000000`. A Typst upgrade may legitimately
change layout and therefore the hash — re-record from **arm64**, never from the CI
side, which would make the check tautological.

**What this still does not cover:** determinism across Typst _versions_ (by
design — a version bump is expected to change the hash), and determinism of the
real templates, which do not exist yet. It covers the axis that would have
invalidated the approach.
