// F.38 / F.66 — cross-architecture byte-determinism fixture.
//
// Rendered on arm64 (devcontainer) and x86-64 (GitHub runner) with
// SOURCE_DATE_EPOCH pinned to the same value. If the two SHA-256 hashes differ,
// Typst output is architecture-dependent and snapshot tests cannot compare a
// locally-captured reference against a CI render — which changes where
// references must be produced, not just how they are tested.
//
// Deliberately exercises the features the real documents depend on, because a
// trivial document could be byte-stable while a realistic one is not:
//   - the rupee sign (U+20B9) and Indian digit grouping
//   - counter(page) in a footer, across a forced page break
//   - a table with a repeating header, spanning pages
//   - a long generated serial list, the highest-risk layout in the document set
//
// DO NOT EDIT without re-recording expected-sha256.txt on BOTH architectures.
// Any change to this file changes the hash.

#set page(
  width: 210mm, height: 297mm, margin: 15mm,
  footer: context [
    #set align(center)
    #set text(size: 8pt)
    Page #counter(page).display() of #counter(page).final().first() · DSP-DET-0001
  ],
)
#set text(size: 9pt)

= Determinism fixture

Amount: ₹1,23,456.00 · Grand total: ₹98,76,543.21 · Round off: ₹0.40

#table(
  columns: (1fr, 1fr, 1fr, 1fr),
  stroke: 0.4pt,
  table.header([*Serial*], [*Serial*], [*Serial*], [*Serial*]),
  ..range(1, 301).map(i => [DET-SN-#("00000" + str(i)).slice(-5)]),
)
