# Typst golden files

**These are NOT the Chromium reference contract.** That is `docs/pdf-references/`, whose
14 PDFs were captured from the pre-Day-27 Chromium pipeline and exist to prove that two
independent renderers agree about the same document. The capture tool is gone and those
files are a one-way door (`docs/pdf-references/README.md`).

A golden file here is a **self-snapshot**: this repository's own Typst output, frozen so
that an unintended change to it fails loudly. It proves reproducibility and guards
against regression. It proves nothing about cross-renderer agreement, and it must never
be described as though it did — `docs/F3_F4_SPEC.md` §1 calls conflating the two a
category error.

## Why the first one exists (F.4, D-6)

All 14 Chromium references are single-rate 18%, structurally: `multi-rate.ts` appends its
chains after `day13` so nothing pre-existing can pick up those products. So **no
reference document exercises the multi-rate path at all**, and a green
`pdf-snapshots.test.ts` after F.4 proves only that nothing else broke. This is the
evidence that the feature works.

## Contents

| File                                                | What it is                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `quotation__QT-2026-0017__inter__multi-rate.txt`    | The extracted body text, whitespace-squashed exactly as `pdf-snapshots.test.ts` squashes it |
| `quotation__QT-2026-0017__inter__multi-rate.sha256` | `sha256` of the rendered PDF bytes                                                          |

**Text and bytes both, deliberately.** The text reviews as a readable diff — a reviewer
can see which figure moved. The hash carries the byte claim without committing a binary
whose movement nobody can read. Text alone would freeze content and miss layout; a binary
alone would be unreviewable.

## The document

`QT-2026-0017`, demo tenant, inter-state (MH → RJ). Three lines over **two** HSN codes:
85414300 at 18%, 85414300 at 5%, 85359090 at 18%. Two HSN codes, **three** table rows —
which is the case the (HSN, rate) pair key exists for, and the one a table keyed on HSN
alone could not represent without losing a rate or inventing a blended one.

## Regenerating

**Do not regenerate to make a test pass.** A failure here means the renderer's output
moved; the question is why, and the answer belongs to whoever changed it. Regenerating
first destroys the evidence that would have answered it.

When a change is intended, the golden is rewritten as part of that change, with the
reason in the commit message, and the two-reseed reproducibility check re-run before it
is trusted — the same check every reference render gets. This one was generated
2026-09-24 and confirmed identical across two independent `pnpm db:seed` runs.
