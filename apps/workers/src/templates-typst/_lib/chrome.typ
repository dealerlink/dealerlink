// Shared document chrome for the Dealerlink Typst templates (F.38, Day 26).
//
// Factored rather than copied into each template: the four HTML templates this
// replaces accumulated their inconsistencies precisely by copying (the PI does
// not even have its own document shell — it delegates to the quotation's).
//
// NOTHING HERE COMPUTES A NUMBER. Every money value is read from the JSON the
// loader produced, which reads it from a stored column. Per CLAUDE.md, money is
// read and never recomputed; a template that does arithmetic is a bug.

// ── Palette and metrics, transcribed from templates/styles.ts ───────────────
#let ink = rgb("#0F172A")
#let muted = rgb("#64748B")
#let line-col = rgb("#E2E8F0")
#let tile = rgb("#F8FAFC")
#let accent = rgb("#4F46E5")
#let emerald = rgb("#059669")

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

// ── Page shell ─────────────────────────────────────────────────────────────
// The footer is a PAGE mechanism here, which is what DEV.37 wanted and could
// not have: Chromium could only count pages through `footerTemplate`, so the
// page band lived outside the document. counter(page) is native in Typst.
//
// The branded body header deliberately stays in the BODY (DEV.37), even though
// Typst's page-header machinery could host it. Moving it would change
// first-page geometry, and the reference layout is the contract.
#let doc-shell(doc-id: "", body) = {
  set page(
    paper: "a4",
    margin: (top: 14mm, bottom: 20mm, left: 14mm, right: 14mm),
    footer: context {
      set text(size: 7pt, fill: muted, font: body-font)
      line(length: 100%, stroke: 0.5pt + line-col)
      v(3pt)
      grid(
        columns: (1fr, 1fr),
        align: (left, right),
        doc-id,
        [Page #counter(page).display() of #counter(page).final().first()],
      )
    },
  )
  set text(font: body-font, size: 9pt, fill: ink)
  set par(leading: 0.5em)
  body
}

// ── Header band ────────────────────────────────────────────────────────────
// `logo` is a path written next to the data file by the render script when the
// tenant has one, else none. Day 25 established the branded and unbranded
// references share a documentId so the logo is the only delta — that property
// is what makes the visual diff reviewable, so it is preserved here.
#let doc-header(bill-from: none, title: "", rows: (), logo: none) = {
  grid(
    columns: (1fr, auto),
    align: (left + top, right + top),
    [
      #if logo != none {
        box(image(logo, height: 12mm))
      } else {
        text(size: 13pt, weight: "bold", bill-from.name)
      }
      #v(4pt)
      #text(size: 10pt, weight: "bold", bill-from.legalName)
      #v(2pt)
      #for l in bill-from.addressLines [#text(size: 8pt, fill: muted, l)#linebreak()]
      #v(2pt)
      #text(size: 8pt, fill: muted)[
        GSTIN #text(font: mono-font, bill-from.gstin) ·
        PAN #text(font: mono-font, bill-from.pan)
      ]
    ],
    [
      #text(size: 15pt, weight: "bold", tracking: 0.5pt, upper(title))
      #v(5pt)
      #table(
        columns: (auto, auto),
        stroke: none,
        inset: (x: 0pt, y: 1.6pt),
        align: (right, right),
        ..rows.map(r => (text(size: 8pt, fill: muted, r.at(0)), text(size: 8pt, font: mono-font, r.at(1)))).flatten()
      )
    ],
  )
  v(6pt)
  line(length: 100%, stroke: 0.8pt + ink)
  v(8pt)
}

// ── Party blocks ───────────────────────────────────────────────────────────
#let party-block(label: "", party: none, note: none) = [
  #text(size: 7.5pt, weight: "bold", fill: muted, tracking: 0.6pt, upper(label))
  #v(3pt)
  #if party == none [
    #text(size: 8pt, fill: muted, style: "italic", if note != none { note } else { "Same as Bill-To" })
  ] else [
    #text(size: 9.5pt, weight: "bold", party.name)
    #if party.legalName != party.name [
      #linebreak()
      #text(size: 8pt, fill: muted, party.legalName)
    ]
    #for l in party.addressLines [
      #linebreak()
      #text(size: 8pt, fill: muted, l)
    ]
    #if party.contact != none [
      #linebreak()
      #text(size: 8pt, fill: muted, "Attn: " + party.contact)
    ]
    #linebreak()
    #text(size: 8pt)[GSTIN #text(font: mono-font, if party.gstin != none { party.gstin } else { "—" })]
  ]
]

// ── Supply badge ───────────────────────────────────────────────────────────
#let supply-badge(inter) = {
  let label = if inter { "INTER-STATE · IGST" } else { "INTRA-STATE · CGST + SGST" }
  let fg = if inter { accent } else { emerald }
  box(
    fill: if inter { rgb("#EEF2FF") } else { rgb("#ECFDF5") },
    stroke: 0.5pt + fg,
    radius: 2pt,
    inset: (x: 5pt, y: 2.5pt),
    text(size: 7pt, weight: "bold", fill: fg, label),
  )
}

// ── Totals block ───────────────────────────────────────────────────────────
// ROUND-OFF INSERTION POINT. The whole-rupee round-off adjustment line is NOT
// implemented in Phase 1 and must not be added here — it is F.6's, it has tax
// consequences, and it is not a rendering concern. This block is laid out so
// the row can be inserted between the tax rows and Grand Total WITHOUT
// re-laying out anything: add a `("Round Off", money(data.roundOff))` pair to
// `rows` below, immediately before the grand-total rule. Nothing else moves.
#let totals-block(rows: (), grand-label: "Grand Total", grand: "", words: "") = {
  grid(
    columns: (1fr, auto),
    align: (left + bottom, right),
    [
      #text(size: 7.5pt, weight: "bold", fill: muted, tracking: 0.6pt)[AMOUNT IN WORDS]
      #v(3pt)
      #text(size: 8.5pt, style: "italic", words)
    ],
    box(
      width: 62mm,
      fill: tile,
      inset: (x: 9pt, y: 8pt),
      [
        #table(
          columns: (1fr, auto),
          stroke: none,
          inset: (x: 0pt, y: 2.2pt),
          align: (left, right),
          ..rows.map(r => (text(size: 8.5pt, fill: muted, r.at(0)), r.at(1))).flatten()
        )
        #v(3pt)
        #line(length: 100%, stroke: 0.8pt + ink)
        #v(4pt)
        #grid(
          columns: (1fr, auto),
          align: (left, right),
          text(size: 9.5pt, weight: "bold", grand-label),
          text(size: 11pt, weight: "bold", rupees(grand)),
        )
      ],
    ),
  )
}

// ── Footer block (T&Cs + bank) ─────────────────────────────────────────────
#let footer-block(terms: none, bank: none) = {
  if terms != none or bank != none {
    v(10pt)
    line(length: 100%, stroke: 0.5pt + line-col)
    v(7pt)
    grid(
      columns: (1fr, auto),
      column-gutter: 12pt,
      if terms != none [
        #text(size: 7.5pt, weight: "bold", fill: muted, tracking: 0.6pt)[TERMS & CONDITIONS]
        #v(3pt)
        #text(size: 7.5pt, fill: muted, terms)
      ] else [],
      if bank != none [
        #box(fill: tile, inset: (x: 9pt, y: 7pt), width: 62mm)[
          #text(size: 7.5pt, weight: "bold", fill: muted, tracking: 0.6pt)[BANK DETAILS]
          #v(3pt)
          #text(size: 8pt)[#bank.name]
          #v(1pt)
          #text(size: 8pt)[A/c #text(font: mono-font, bank.accountNumber)]
          #v(1pt)
          #text(size: 8pt)[IFSC #text(font: mono-font, bank.ifsc)]
          #if bank.branch != none [
            #v(1pt)
            #text(size: 8pt, fill: muted, bank.branch)
          ]
        ]
      ] else [],
    )
  }
}

// ── Card primitives ────────────────────────────────────────────────────────
// The HTML uses bordered, slightly-rounded cards for the party/meta blocks and
// a heavy-bordered card for the headline amount. Factored so the four
// templates share one definition rather than four drifting copies.
#let card(body, heavy: false, fill-col: white) = box(
  width: 100%,
  fill: fill-col,
  stroke: (if heavy { 1.2pt + ink } else { 0.6pt + line-col }),
  radius: 3pt,
  inset: (x: 10pt, y: 9pt),
  body,
)

#let caps-label(s) = text(size: 7pt, weight: "medium", fill: muted, tracking: 1.1pt, upper(s))

/// A dark-header data table, as used for line items and allocations.
#let data-table(columns: (), aligns: (), header: (), rows: (), total-row: none) = {
  table(
    columns: columns,
    align: aligns,
    stroke: none,
    inset: (x: 7pt, y: 5.5pt),
    fill: (_, y) => if y == 0 { ink } else { none },
    table.header(..header.map(h => text(size: 7pt, weight: "bold", fill: white, tracking: 0.8pt, upper(h)))),
    ..rows.flatten(),
  )
  if total-row != none {
    line(length: 100%, stroke: 0.6pt + line-col)
    block(
      inset: (x: 7pt, y: 5.5pt),
      grid(
        columns: (1fr, auto),
        align: (left, right),
        text(size: 8.5pt, weight: "bold", total-row.at(0)),
        text(size: 8.5pt, weight: "bold", total-row.at(1)),
      ),
    )
    line(length: 100%, stroke: 0.6pt + line-col)
  }
}

/// The light-indigo informational callout (advance balance, etc).
#let callout(body) = box(
  width: 100%,
  fill: rgb("#EEF2FF"),
  stroke: 0.6pt + rgb("#C7D2FE"),
  radius: 3pt,
  inset: (x: 10pt, y: 8pt),
  text(size: 8.5pt, fill: accent, body),
)

/// A row of labelled values inside a card — METHOD / REFERENCE / etc.
#let meta-row(items) = card(
  grid(
    columns: items.map(_ => 1fr),
    ..items.map(it => [
      #caps-label(it.at(0))
      #v(3pt)
      #text(size: 8.5pt, weight: "medium", font: (if it.len() > 2 and it.at(2) { mono-font } else { body-font }), it.at(1))
    ])
  ),
)

/// Party contents WITHOUT the caps label — for use inside a `card`, which
/// supplies its own label. Mirrors PartyBlock.tsx exactly: display name, legal
/// name only when it differs, each address line on its own line, optional
/// contact, then GSTIN with an em-dash fallback.
#let party-body(party) = [
  #if party == none [
    #text(size: 8.5pt, fill: muted, style: "italic", "Same as Bill-To")
  ] else [
    #text(size: 9.5pt, weight: "bold", party.name)
    #if party.legalName != party.name [
      #linebreak()
      #text(size: 8pt, party.legalName)
    ]
    #for l in party.addressLines [
      #linebreak()
      #text(size: 8pt, l)
    ]
    #if party.contact != none [
      #linebreak()
      #text(size: 8pt, "Attn: " + party.contact)
    ]
    #v(3pt)
    #text(size: 8pt)[GSTIN #text(font: mono-font, if party.gstin != none { party.gstin } else { "—" })]
  ]
]
