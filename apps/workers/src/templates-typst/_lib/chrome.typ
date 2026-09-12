// Shared document chrome for the Dealerlink Typst templates (F.38, Day 26).
//
// Factored rather than copied into each template: the four HTML templates this
// replaces accumulated their inconsistencies precisely by copying (the PI does
// not even have its own document shell — it delegates to the quotation's).
//
// NOTHING HERE COMPUTES A NUMBER. Every money value is read from the JSON the
// loader produced, which reads it from a stored column. Per CLAUDE.md, money is
// read and never recomputed; a template that does arithmetic is a bug.

// ── Units ──────────────────────────────────────────────────────────────────
// `styles.ts` is a print stylesheet and states every size in CSS px. A CSS px
// is 1/96in and a point is 1/72in, so a size copied across unchanged comes out
// a third too large — which is exactly what the first pass did: body text set
// at 9pt against the reference's 9px (6.75pt), enough to collide the Qty and
// Unit Price columns of a three-line quotation.
//
// So every size below is written as `px(n)` with n taken verbatim from the
// stylesheet, and the conversion happens in one place. Keep it that way: a
// bare `pt` in this file is either a deliberate exception or a bug.
#let px(n) = n * 0.75pt

// ── Palette, transcribed from templates/styles.ts :root ────────────────────
// These are the document tokens, NOT Tailwind's slate/indigo ramp. The first
// pass used the latter and shifted every border, every muted label and the
// accent itself — #4F46E5 is a visibly more violet indigo than the deep
// #3730A3 the references carry.
#let ink = rgb("#0B0F1A")
#let ink-2 = rgb("#1A2030")
#let muted = rgb("#6B7280")
#let line-col = rgb("#E3E3DC")
#let line-2 = rgb("#D5D5CC")
#let accent = rgb("#3730A3")
#let tile = rgb("#FBFBF8")
#let emerald = rgb("#047857")

// Body face. The HTML asks for Inter and falls back; Inter is not installed in
// any of our environments, so the references render in Liberation Sans. Using
// it explicitly here matches the reference rather than introducing a third
// face. See docs/TYPST_DIFF.md — fonts are the largest classified difference.
#let body-font = ("Liberation Sans", "DejaVu Sans")
#let mono-font = ("Liberation Mono", "DejaVu Sans Mono")

// ── Money ──────────────────────────────────────────────────────────────────
// Money and dates arrive ALREADY FORMATTED as strings, by the same
// `formatMoney` / `formatDocDate` helpers the HTML templates use (see
// render-typst.ts). Indian digit grouping and the `06-Sept-2026` date form both
// come from Intl, and reimplementing that here would manufacture a class of
// difference unrelated to layout. It also makes "never compute in a template"
// structural: by the time a value arrives it is a string, so arithmetic on it
// is impossible. Raw numerics survive as `*Raw` where a comparison is needed.
#let money(s) = text(font: mono-font, s)
#let rupees(s) = text(font: mono-font, "₹" + s)

// ── Card primitives ────────────────────────────────────────────────────────
// The HTML uses bordered, 5px-radius cards for the party / terms / bank blocks
// and a heavy-bordered one for the receipt's headline amount. Factored so the
// four templates share one definition rather than four drifting copies.
#let card(body, heavy: false, fill-col: white, pad-x: 12, pad-y: 9) = box(
  width: 100%,
  fill: fill-col,
  stroke: (if heavy { px(2) + ink } else { px(1) + line-col }),
  radius: px(if heavy { 6 } else { 5 }),
  inset: (x: px(pad-x), y: px(pad-y)),
  body,
)

/// A row of cards that all take the height of the tallest — the party tiles.
///
/// The HTML gets this free: `.parties` is a flex row and `.party` is
/// `flex: 1`, so the three tiles stretch to the tallest. Typst has no stretch
/// alignment, and `height: 100%` inside an auto-height grid row resolves
/// against the PAGE, not the row — which silently turned every one-page
/// document into three. So the height is measured instead: lay the bodies out
/// at the width they will actually get, take the maximum, and give every card
/// that height.
#let card-row(bodies, gutter: 12, pad-x: 11, pad-y: 9, fill-col: tile) = layout(size => {
  let n = bodies.len()
  let w = (size.width - px(gutter) * (n - 1)) / n
  let h = calc.max(..bodies.map(b => measure(box(width: w - 2 * px(pad-x), b)).height))
  grid(
    columns: (1fr,) * n,
    column-gutter: px(gutter),
    ..bodies.map(b => box(
      width: 100%,
      height: h + 2 * px(pad-y),
      fill: fill-col,
      stroke: px(1) + line-col,
      radius: px(5),
      inset: (x: px(pad-x), y: px(pad-y)),
      b,
    ))
  )
})

/// `.titlecaps` — 8px, 0.12em tracking, uppercase, semibold, muted.
#let caps-label(s) = text(
  size: px(8),
  weight: 600,
  fill: muted,
  tracking: px(8 * 0.12),
  upper(s),
)

/// A dark-header data table (`.items`).
///
/// `total-cells` is a FULL ROW, rendered inside the same table rather than as a
/// separate grid underneath — that is what keeps its figures aligned with the
/// columns above them. Rendering it separately is how the first attempt at this
/// produced "38,67,240.006,96,103.2045,63,343.20".
#let data-table(columns: (), aligns: (), header: (), rows: (), total-cells: none) = {
  let n = rows.len()
  table(
    columns: columns,
    align: aligns,
    // 6px is the stylesheet's cell padding; the extra 3px stands in for the
    // half-leading CSS puts INSIDE the first and last line box of a cell and
    // Typst puts nowhere — without it each body row came out ~5pt short, which
    // walked the totals row 20pt up the page on a three-line quotation.
    inset: (x: px(7), y: px(6 + 3)),
    // Header band, then `.items tbody tr:nth-child(even)` zebra striping — y=0
    // is the header, so the even body rows are y=2, 4, …
    fill: (_, y) => if y == 0 { ink } else if y <= n and calc.even(y) { tile } else { none },
    stroke: (x, y) => (
      // 1px hairline under each body row; the 2px rule above the totals row.
      bottom: if y == 0 { none }
        else if total-cells != none and y == n { px(2) + ink }
        else if y <= n { px(1) + line-col }
        else { none },
    ),
    table.header(
      ..header.map(h => text(
        size: px(8),
        weight: 600,
        fill: white,
        tracking: px(8 * 0.05),
        upper(h),
      ))
    ),
    ..rows.flatten(),
    ..(if total-cells != none { total-cells } else { () }),
  )
}

/// The light-indigo informational callout (`.advance-note`).
#let callout(body) = box(
  width: 100%,
  fill: rgb("#EEF2FF"),
  stroke: px(1) + rgb("#C7D2FE"),
  radius: px(5),
  inset: (x: px(12), y: px(8)),
  text(size: px(9.5), weight: 600, fill: accent, body),
)

/// A row of labelled values inside a card — METHOD / REFERENCE / etc.
/// (`.receipt-meta`, whose values are 9.5px semibold.)
#let meta-row(items) = card(
  pad-x: 12,
  pad-y: 10,
  grid(
    columns: items.map(_ => 1fr),
    ..items.map(it => [
      #caps-label(it.at(0))
      #v(px(1))
      #text(size: px(9.5), weight: 600, font: (if it.len() > 2 and it.at(2) { mono-font } else { body-font }), it.at(1))
    ])
  ),
)

/// Party contents WITHOUT the caps label — for use inside a `card`, which
/// supplies its own label. Mirrors PartyBlock.tsx exactly: display name, legal
/// name only when it differs, each address line on its own line, optional
/// contact, then GSTIN with an em-dash fallback.
#let party-body(party, note: none) = [
  #if party == none [
    #text(size: px(9), fill: muted, style: "italic", if note != none { note } else { "Ship-To same as Bill-To" })
  ] else [
    #text(size: px(10.5), weight: 700, party.name)
    #if party.legalName != party.name [
      #linebreak()
      #text(size: px(9), fill: ink-2, party.legalName)
    ]
    #for l in party.addressLines [
      #linebreak()
      #text(size: px(9), fill: ink-2, l)
    ]
    #if party.contact != none [
      #linebreak()
      #text(size: px(9), fill: ink-2, "Attn: " + party.contact)
    ]
    #v(px(3))
    #text(size: px(9))[GSTIN #text(font: mono-font, if party.gstin != none { party.gstin } else { "—" })]
  ]
]

// ── Page shell ─────────────────────────────────────────────────────────────
// The footer is a PAGE mechanism here, which is what DEV.37 wanted and could
// not have: Chromium could only count pages through `footerTemplate`, so the
// page band lived outside the document. counter(page) is native in Typst.
//
// The branded body header deliberately stays in the BODY (DEV.37), even though
// Typst's page-header machinery could host it. Moving it would change
// first-page geometry, and the reference layout is the contract.
//
// Margins match the capture exactly: `renderPdfFromHtml` defaults to 18mm on
// every side and capture-references.ts overrode top/bottom to 14/20mm.
#let doc-shell(doc-id: "", body) = {
  set page(
    paper: "a4",
    margin: (top: 14mm, bottom: 20mm, left: 18mm, right: 18mm),
    // buildFooterTemplate(): 7px IBM Plex Mono in #6B7280, document id left,
    // "Page X of Y" right, and NO rule above it.
    footer: context {
      set text(size: px(7), fill: muted, font: mono-font)
      grid(
        columns: (1fr, auto),
        align: (left, right),
        doc-id,
        [Page #counter(page).display() of #counter(page).final().first()],
      )
    },
  )
  // html, body { font-size: 10px; line-height: 1.45 }.
  //
  // MATCHING `line-height: 1.45` TAKES BOTH SETTINGS BELOW, AND THE ERROR
  // COMPOUNDS IF EITHER IS WRONG — a first attempt with an absolute 4.5px
  // leading put the quotation's totals row 58pt above the reference's, because
  // every line of the document was a little short.
  //
  // A CSS line box is line-height tall and CONTAINS the glyphs: half the excess
  // over the font's own extent sits above the line and half below, including
  // for the first and last line of a block. Typst instead advances by
  // leading + the text's extent, adding nothing outside the first and last
  // line — and its default extent is cap-height-to-baseline, about 0.73em,
  // which is narrower still.
  //
  // Leading of 0.72em restores the 1.45em advance over that 0.73em extent, and
  // paragraph SPACING is set to the same: the stylesheet opens with
  // `* { margin: 0 }`, so a caps label and the value under it are two block
  // boxes separated by nothing but the line-height each contributes.
  //
  // (Widening the extent to ascender/descender and shrinking leading to match
  // was tried — it gives the same advance and a taller block, but costs more
  // at every block boundary than it recovers inside one, and measured worse.
  // What the extent cannot reach is absorbed by the table and card insets
  // below, where the shortfall actually shows.)
  set text(font: body-font, size: px(10), fill: ink)
  set par(leading: 0.72em, spacing: 0.72em)
  body
}

// ── Header band ────────────────────────────────────────────────────────────
// `logo` is a ROOT-ABSOLUTE path ("/logo.svg") written beside the data file by
// the render script when the tenant has one, else none. Root-absolute because
// Typst resolves a relative image path against the file that CALLS image() —
// this one, in _lib/ — not against the entry point. Day 25 established that the
// branded and unbranded references share a documentId so the logo is the only
// delta. That property is what makes the visual diff reviewable, so it is
// preserved here.
#let doc-header(bill-from: none, title: "", rows: (), logo: none) = {
  grid(
    columns: (1fr, auto),
    align: (left + top, right + top),
    [
      // `.logo` caps height at 46px and width at 220px; `.logo-fallback` is the
      // 18px accent wordmark shown when the tenant has no logo.
      #if logo != none {
        // Height only: `.logo` is max-height 46px / max-width 220px, and the
        // fixture logo's 400x120 comes to 153px wide at that height, so the
        // width cap never binds. Setting it explicitly centred the mark inside
        // a 220px box and shifted it ~33px right of the reference.
        box(image(logo, height: px(46)))
        v(px(8))
      } else {
        text(size: px(18), weight: 700, fill: accent, tracking: px(-18 * 0.02), bill-from.name)
        v(px(6))
      }
      #text(size: px(13), weight: 700, tracking: px(-13 * 0.01), bill-from.legalName)
      #v(px(2))
      #for l in bill-from.addressLines [#text(size: px(9), fill: muted, l)#linebreak()]
      #text(size: px(9), fill: muted)[GSTIN #text(font: mono-font, fill: ink-2, bill-from.gstin) · PAN #text(font: mono-font, fill: ink-2, bill-from.pan)]
    ],
    [
      #text(size: px(26), weight: 700, fill: accent, tracking: px(26 * 0.04), upper(title))
      #v(px(10))
      #table(
        columns: (auto, auto),
        stroke: none,
        column-gutter: px(14),
        inset: (x: 0pt, y: px(1.5)),
        align: (right, right),
        ..rows.map(r => (
          text(size: px(9), fill: muted, r.at(0)),
          text(size: px(9), weight: 600, font: mono-font, r.at(1)),
        )).flatten()
      )
    ],
  )
  v(px(14))
  line(length: 100%, stroke: px(2) + ink)
  v(px(16))
}

// ── Supply badge ───────────────────────────────────────────────────────────
#let supply-badge(inter) = {
  let label = if inter { "INTER-STATE · IGST" } else { "INTRA-STATE · CGST + SGST" }
  let fg = if inter { accent } else { emerald }
  box(
    fill: if inter { rgb("#EEF2FF") } else { rgb("#ECFDF5") },
    stroke: px(1) + (if inter { rgb("#C7D2FE") } else { rgb("#A7F3D0") }),
    radius: px(3),
    inset: (x: px(6), y: px(1)),
    outset: (y: px(1.5)),
    text(size: px(8), weight: 600, fill: fg, tracking: px(8 * 0.04), label),
  )
}

// ── Totals block ───────────────────────────────────────────────────────────
// `.summary`: the amount-in-words tile on the left, a fixed 250px totals list
// on the right. The list is flat — the Grand Total's 2px rule is the only heavy
// element, as in the reference.
//
// ROUND-OFF INSERTION POINT. The whole-rupee round-off adjustment line is NOT
// implemented in Phase 1 and must not be added here — it is F.6's, it has tax
// consequences, and it is not a rendering concern. Insert it as one more pair
// in `rows` immediately before the rule below and nothing else moves:
//     ("Round Off", money(data.roundOff))
#let totals-block(words: "", rows: (), grand: "") = {
  grid(
    columns: (1fr, px(250)),
    column-gutter: px(14),
    align: (left + top, right + top),
    card(fill-col: tile, pad-x: 12, pad-y: 10)[
      #caps-label("Amount Chargeable (in words)")
      #v(px(4))
      #text(size: px(10), weight: 600, fill: ink-2, words)
    ],
    [
      #table(
        columns: (1fr, auto),
        stroke: none,
        inset: (x: 0pt, y: px(3.5)),
        align: (left, right),
        ..rows.map(r => (
          text(size: px(9.5), fill: muted, r.at(0)),
          text(size: px(9.5), font: mono-font, r.at(1)),
        )).flatten()
      )
      #v(px(3.5))
      #line(length: 100%, stroke: px(2) + ink)
      #v(px(7))
      #grid(
        columns: (1fr, auto),
        align: (left + horizon, right + horizon),
        text(size: px(13), weight: 700, "Grand Total"),
        text(size: px(13), weight: 700, font: mono-font, "₹" + grand),
      )
    ],
  )
}

// ── Footer block (T&Cs + bank) ─────────────────────────────────────────────
// Stacked, not side by side: `.section` then `.bank`, each a caps label above a
// full-width card, and the bank details run as four labelled columns rather
// than a vertical list.
#let footer-block(terms: none, bank: none) = {
  if terms != none {
    v(px(16))
    caps-label("Terms & Conditions")
    v(px(5))
    card(text(size: px(9), fill: ink-2, terms))
  }
  if bank != none {
    v(px(16))
    caps-label("Bank Details")
    v(px(5))
    card(
      grid(
        columns: (auto, auto, auto, 1fr),
        column-gutter: px(26),
        ..(
          (("Bank", bank.name, false), ("Account No.", bank.accountNumber, true), ("IFSC", bank.ifsc, true))
            + (if bank.branch != none { (("Branch", bank.branch, false),) } else { () })
        ).map(it => [
          #caps-label(it.at(0))
          #v(px(1))
          #text(size: px(9.5), weight: 600, font: (if it.at(2) { mono-font } else { body-font }), it.at(1))
        ])
      ),
    )
  }
}

// ── Serial chips ───────────────────────────────────────────────────────────
/// A wrapping run of bordered serial chips — `.serial-chips` / `.serial-chip`
/// in styles.ts:213-217.
#let serial-chips(serials) = {
  // NO outer box: an inline box cannot break, so wrapping the run in one
  // pushes the whole list onto the next page — measured at 500 serials, where
  // it cost a third page against the reference's two. The chips flow as
  // ordinary paragraph content; each chip stays individually unbreakable,
  // which is correct, because a serial number must not be split.
  set par(leading: px(4), spacing: px(4))
  serials
    .map(s => box(
      stroke: px(1) + line-2,
      radius: px(3),
      inset: (x: px(5), y: px(1)),
      outset: (y: px(1.5)),
      text(size: px(7.5), font: mono-font, s),
    ))
    .join(h(px(3)))
}

// ── Acknowledgment of receipt ──────────────────────────────────────────────
/// The dashed signature card on the dispatch note (`.ack` in styles.ts:220).
/// Dispatch is the only one of the four documents that gets signed on delivery.
#let ack-block() = block(
  width: 100%,
  stroke: (paint: line-2, thickness: px(1), dash: "dashed"),
  radius: px(5),
  inset: (x: px(16), y: px(14)),
  breakable: false,
  [
    #caps-label("Acknowledgment of Receipt")
    #v(px(10))
    #grid(
      columns: (1fr, 1fr),
      column-gutter: px(40),
      ..(
        ("Received By (Name & Signature)", "Date").map(lbl => [
          // `.ack-line` is a 26px-tall box with a 1px bottom rule.
          #box(width: 100%, height: px(26), stroke: (bottom: px(1) + ink))
          #v(px(3))
          #text(size: px(8), weight: 600, fill: muted, tracking: px(8 * 0.12), upper(lbl))
        ])
      )
    )
  ],
)
