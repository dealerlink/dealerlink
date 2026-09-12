// Payment receipt — Typst (F.38, Day 26).
//
// Tax-neutral: no GST breakdown, no place of supply. The payer is the Bill-To
// dealer (CLAUDE.md §6). Authored first because it is the simplest of the four
// — getting the shared chrome right here is cheaper than discovering it on the
// dispatch note.
//
// Data arrives as JSON from `loadPaymentReceiptPdfData`, the SAME loader the
// HTML template uses, with money and dates already formatted by the same
// helpers. Nothing is computed here.

#import "_lib/chrome.typ": *

#let data = json("data.json")
#let logo = if data.billFrom.logoUrl != none { "/logo.svg" } else { none }

#show: doc-shell.with(
  doc-id: data.footerLabel + " " + data.receiptNumber + " · Generated " + data.generatedAt,
)

#doc-header(
  bill-from: data.billFrom,
  title: "Payment Receipt",
  logo: logo,
  rows: (("Receipt No.", data.receiptNumber), ("Date", data.receiptDate)),
)

#card-row((
  [
    #caps-label("Received From")
    #v(px(4))
    #party-body(data.receivedFrom)
  ],
  [
    #caps-label("Receipt Status")
    #v(px(4))
    #text(size: px(10.5), weight: 700, font: mono-font, data.status.replace("_", " "))
    #linebreak()
    #text(size: px(9), fill: ink-2)[Received on #text(font: mono-font, data.receiptDate)]
  ],
))

#v(px(16))

// Headline amount — the one place a receipt shows ₹, in the heavy-bordered card.
#card(heavy: true, fill-col: tile, pad-x: 16, pad-y: 14)[
  // Paragraph spacing is zeroed inside this card and the three CSS margins
  // written out instead. `par.spacing` is relative to the paragraph's OWN em,
  // and the amount is 30px — so the shared 0.72em put ~16pt above and below it
  // where the stylesheet asks for 3px and 4px, pushing everything below the
  // card 20pt down the page. `.amount-value` also sets line-height 1.1, not
  // the document's 1.45.
  #set par(spacing: 0pt)
  #caps-label("Amount Received")
  #v(px(3))
  #text(size: px(30), weight: 700, fill: accent, font: mono-font, tracking: px(-30 * 0.01), "₹" + data.amount)
  #v(px(4))
  #text(size: px(9.5), weight: 600, fill: ink-2, data.amountInWords)
]

#v(px(14))

#meta-row((
  ("Method", data.method, false),
  ..(if data.reference != none { (("Reference", data.reference, true),) } else { () }),
  ..(if data.depositedToBank != none { (("Deposited To", data.depositedToBank, false),) } else { () }),
  ..(if data.depositedDate != none { (("Deposited On", data.depositedDate, true),) } else { () }),
))

#v(px(16))

#if data.allocations.len() > 0 [
  #data-table(
    columns: (1fr, 1fr, auto),
    aligns: (left, left, right),
    header: ("Allocated Against", "Document No.", "Amount"),
    rows: data.allocations.map(a => (
      text(size: px(9), a.documentLabel),
      text(size: px(9), font: mono-font, a.documentNumber),
      money(a.amount),
    )),
    // Mirrors the HTML tfoot. The allocated total is derived in the harness,
    // not summed here — arithmetic in a template is what CLAUDE.md rules out.
    total-cells: (
      table.cell(colspan: 2, align(left, text(size: px(9), weight: 700, "Total Allocated"))),
      text(size: px(9), weight: 700, font: mono-font, data.allocatedTotal),
    ),
  )
  #v(px(12))
]

#if data.unallocatedAmountRaw > 0 [
  #callout[
    Advance balance — ₹#data.unallocatedAmount of this payment is unallocated and
    held as credit against future orders.
  ]
  #v(px(4))
]

#footer-block(terms: none, bank: data.bank)
