# Cross-architecture byte-determinism check (F.38 / F.66)

**The question:** does Typst produce byte-identical PDFs for the same input on
arm64 and x86-64, with `SOURCE_DATE_EPOCH` pinned?

**Why it has to be answered before Day 26, not on Day 27.** Reference PDFs are
captured in the devcontainer, which is **arm64**. CI snapshot tests run on GitHub
runners, which are **x86-64**. If the two architectures disagree, every snapshot
test fails on its first run with no useful signal, and the fix is not in the test
harness — it is that **references must be produced in CI rather than locally**,
which changes Day 25's output, not Day 27's.

## How it works

`fixture.typ` is rendered with `SOURCE_DATE_EPOCH=1700000000` and the resulting
PDF hashed. `expected-sha256.txt` holds the hash recorded on **arm64**, and the
`typst-determinism` job in `.github/workflows/verify.yml` re-renders on x86-64 and
compares. A mismatch fails the job with both hashes printed.

The fixture is not a trivial document, deliberately — a minimal one could be
byte-stable while a realistic one is not. It exercises the rupee sign
(the U+20B9 glyph itself — the amount is a literal, so no grouping logic is
exercised), `counter(page)` in a footer, a table with a repeating header
spanning a page break, and a 300-entry serial list (the highest-risk layout in
the real document set).

## Pinned versions, and why both matter

|                     |                                        |
| ------------------- | -------------------------------------- |
| Typst               | **0.15.1** — pinned in the workflow    |
| `SOURCE_DATE_EPOCH` | **1700000000** — pinned in both places |

**Both pins are load-bearing.** Unpinned, `SOURCE_DATE_EPOCH` lets the timestamp
and the `DocumentID` derived from it change every render (88 differing metadata
bytes, measured in `docs/TYPST_SPIKE.md` §2.3). A different Typst version may
legitimately change layout or PDF structure, which would change the hash without
anything being wrong.

## Re-recording the hash

Any edit to `fixture.typ`, or a Typst upgrade, changes the hash. Re-record it on
**arm64** (so the recorded value keeps representing the capture environment):

```bash
SOURCE_DATE_EPOCH=1700000000 typst compile fixture.typ /tmp/fixture.pdf
sha256sum /tmp/fixture.pdf
```

Then update `expected-sha256.txt` and let CI confirm x86-64 still agrees. **Do not
re-record from the CI side** — that would make the check tautological.
