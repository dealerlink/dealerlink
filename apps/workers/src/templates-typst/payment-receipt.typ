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
#let logo = if data.billFrom.logoUrl != none { "logo.svg" } else { none }

#show: doc-shell.with(
  doc-id: "Receipt " + data.receiptNumber + " · Generated " + data.generatedAt,
)

#doc-header(
  bill-from: data.billFrom,
  title: "Payment Receipt",
  logo: logo,
  rows: (("Receipt No.", data.receiptNumber), ("Date", data.receiptDate)),
)

#grid(
  columns: (1fr, 1fr),
  column-gutter: 11pt,
  card[
    #caps-label("Received From")
    #v(4pt)
    #party-body(data.receivedFrom)
  ],
  card[
    #caps-label("Receipt Status")
    #v(4pt)
    #text(size: 10pt, weight: "bold", font: mono-font, data.status.replace("_", " "))
    #linebreak()
    #text(size: 8pt, fill: muted, "Received on " + data.receiptDate)
  ],
)

#v(11pt)

// Headline amount — the one place a receipt shows ₹, in the heavy-bordered card.
#card(heavy: true)[
  #caps-label("Amount Received")
  #v(5pt)
  #text(size: 21pt, weight: "bold", fill: accent, font: mono-font, "₹" + data.amount)
  #v(2pt)
  #text(size: 8.5pt, data.amountInWords)
]

#v(9pt)

#meta-row((
  ("Method", data.method, false),
  ..(if data.reference != none { (("Reference", data.reference, true),) } else { () }),
  ..(if data.depositedToBank != none { (("Deposited To", data.depositedToBank, false),) } else { () }),
  ..(if data.depositedDate != none { (("Deposited On", data.depositedDate, true),) } else { () }),
))

#v(11pt)

#if data.allocations.len() > 0 [
  #data-table(
    columns: (1fr, 1fr, auto),
    aligns: (left, left, right),
    header: ("Allocated Against", "Document No.", "Amount"),
    rows: data.allocations.map(a => (
      text(size: 8.5pt, a.documentLabel),
      text(size: 8.5pt, font: mono-font, a.documentNumber),
      money(a.amount),
    )),
    // The allocated total is read from the loader, not summed here. The HTML
    // template reduces over the rows at render time; doing that in a template
    // is the arithmetic CLAUDE.md rules out, so the loader's value is used.
    total-row: ("Total Allocated", money(data.allocatedTotal)),
  )
  #v(9pt)
]

#if data.unallocatedAmountRaw > 0 [
  #callout[
    Advance balance — ₹#data.unallocatedAmount of this payment is unallocated and
    held as credit against future orders.
  ]
  #v(11pt)
]

#if data.bank != none [
  #caps-label("Bank Details")
  #v(4pt)
  #card[
    #grid(
      columns: (auto, auto, auto, 1fr),
      column-gutter: 16pt,
      ..(
        (("Bank", data.bank.name, false), ("Account No.", data.bank.accountNumber, true), ("IFSC", data.bank.ifsc, true))
        + (if data.bank.branch != none { (("Branch", data.bank.branch, false),) } else { () })
      ).map(it => [
        #caps-label(it.at(0))
        #v(3pt)
        #text(size: 8.5pt, weight: "medium", font: (if it.at(2) { mono-font } else { body-font }), it.at(1))
      ])
    )
  ]
]
