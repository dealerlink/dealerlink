// Dispatch note — Typst (F.38, Day 26).
//
// Tax-neutral: no GST breakdown. The consignee is the SHIP-TO dealer, because
// physical goods follow delivery (CLAUDE.md §6); Bill-To appears only as a
// reference sub-block.
//
// THE HARD CASE IN THE WHOLE SET. A line's serial list can be long — the
// client's real invoice carries 26 under one line item, and the Day 25
// references include a 500-serial stress case. Day 25 proved Typst breaks such
// a list cleanly with a repeating header; this template is where that has to
// hold against the real layout rather than a spike fixture.
//
// Data arrives as JSON from `loadDispatchNotePdfData`, dates already formatted.

#import "_lib/chrome.typ": *

#let data = json("data.json")
#let logo = if data.billFrom.logoUrl != none { "/logo.svg" } else { none }
#let l = data.logistics

#show: doc-shell.with(
  doc-id: data.footerLabel + " " + data.dispatchNumber + " · Generated " + data.generatedAt,
)

#doc-header(
  bill-from: data.billFrom,
  title: "Dispatch Note",
  logo: logo,
  rows: (
    ("Dispatch No.", data.dispatchNumber),
    ("Date", data.dispatchDate),
  ),
)

#card-row((
  [
    #caps-label("Ship To (Consignee)")
    #v(px(4))
    #party-body(data.shipTo)
  ],
  [
    #caps-label("Invoice To (Bill-To)")
    #v(px(4))
    #party-body(data.billTo)
  ],
))

#v(px(14))
#text(size: px(9.5), weight: 600, fill: ink-2)[
  Against Order #text(font: mono-font, fill: accent, data.orderNumber) dated #text(font: mono-font, fill: accent, data.orderDate)
]
#v(px(10))

// Logistics — only the fields that are present, matching LogisticsItem's null
// handling in the HTML.
#let logistics-items = (
  ("Vehicle", l.vehicleNumber),
  ("Transporter", l.transporterName),
  ("Docket No.", l.transporterDocketNumber),
  ("Driver", l.driverName),
  ("Driver Phone", l.driverPhone),
  ("E-Way Bill", l.ewayBillNumber),
  ("E-Way Bill Date", l.ewayBillDate),
  ("Expected Delivery", l.expectedDeliveryDate),
).filter(it => it.at(1) != none)

#if logistics-items.len() > 0 [
  #card(
    fill-col: tile,
    grid(
      columns: (1fr, 1fr, 1fr, 1fr),
      row-gutter: px(10),
      column-gutter: px(20),
      ..logistics-items.map(it => [
        #caps-label(it.at(0))
        #v(px(1))
        #text(size: px(9.5), weight: 600, font: mono-font, it.at(1))
      ])
    ),
  )
  #v(px(16))
]

// Serial lists. `table.header` repeats on every page by default, which is the
// property Day 25 verified at 500 serials — so a list that spans pages keeps
// its column headings instead of orphaning them.
//
// The serials themselves are laid out as a wrapping run of monospace chips
// inside the description cell, mirroring `.serial-chips` in the HTML.
//
// They are emitted as a PARAGRAPH, not wrapped in a `box`. A box is an inline,
// UNBREAKABLE container: with the run inside `box(width: 100%)` the 500-serial
// case could not split it, so the whole list moved to page 2, page 1 carried a
// line item with no serials under it, and the document ran to 3 pages against
// the reference's 2. Every serial was still present — nothing was lost — but
// the page count and the layout both diverged. Paragraph text breaks across
// pages, which is what a list of this shape needs.
#data-table(
  columns: (px(32), 1fr, px(70)),
  aligns: (right + top, left + top, right + top),
  header: ("#", "Product & Serial Numbers", "Qty"),
  rows: data.lines.map(ln => (
    text(size: px(9), font: mono-font, str(ln.lineNumber)),
    [
      #text(size: px(9.5), weight: 600, ln.name)
      #linebreak()
      #text(size: px(8), fill: muted, font: mono-font, ln.sku)
      #if ln.serials.len() > 0 [
        #v(px(4))
        #serial-chips(ln.serials)
      ]
    ],
    text(size: px(9), font: mono-font, str(ln.quantity)),
  )),
  total-cells: (
    // align(left) because a colspan cell inherits column 1's alignment, which
    // is right for the line-number column.
    table.cell(colspan: 2, align(left, text(size: px(9), weight: 700, "Total units dispatched"))),
    text(size: px(9), weight: 700, font: mono-font, str(data.totalQuantity)),
  ),
)

#if data.notes != none [
  #v(px(16))
  #caps-label("Notes")
  #v(px(5))
  #card(text(size: px(9), fill: ink-2, data.notes))
]

// Acknowledgment of receipt — the dashed card at dispatch-note.tsx:138-150.
// A dispatch note is signed for on delivery, so this is the one block on any of
// the four documents that exists to be written on.
#v(px(22))
#ack-block()

#footer-block(terms: none, bank: data.bank)
