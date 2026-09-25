// Quotation — Typst (F.38, Day 26).
//
// Also the body for the performa invoice: the HTML performa-invoice template
// delegates to `renderQuotationHtml` with a different title and number label,
// and the two documents are structurally identical. That sharing is preserved
// rather than copied — see performa-invoice.typ, which imports this body.
//
// Data arrives as JSON from `loadQuotationPdfData` / `loadPerformaInvoicePdfData`,
// with money and dates already formatted by the shared helpers. Nothing here
// computes a number: per CLAUDE.md money is read from stored columns, and even
// the line and total figures come through the loader.
//
// State NAMES are displayed and codes are stored (DEV.70) — the loader resolves
// `Karnataka` from `KA`, so the template prints what it is given.

#import "_lib/chrome.typ": *

#let quotation-body(data, logo: none) = {
  doc-header(
    bill-from: data.billFrom,
    title: data.documentTitle,
    logo: logo,
    revision: data.revision,
    rows: (
      (data.numberLabel, data.quoteNumber),
      ("Date", data.quoteDate),
      ("Valid Until", data.validUntil),
    ),
  )

  card-row((
    [
      #caps-label("Bill To")
      #v(px(4))
      #party-body(data.billTo)
    ],
    [
      #caps-label("Ship To")
      #v(px(4))
      // Quotations have no separate Ship-To — the loader passes null and the
      // reference shows the explicit note rather than repeating the address.
      // Day 11 PIs pass a distinct party and the same block renders it.
      #party-body(data.shipTo)
    ],
    [
      #caps-label("Place of Supply")
      #v(px(4))
      #text(size: px(10.5), weight: 700, data.placeOfSupply)
      #linebreak()
      #text(size: px(9), fill: ink-2)[Tenant state: #text(font: mono-font, data.tenantStateAtIssue)]
      #v(px(6))
      #supply-badge(data.isInterState)
    ],
  ))

  v(px(16))

  // Line items. The description cell carries the product name with a muted
  // SKU · HSN subline, matching the reference.
  // Explicit widths. Left to `auto`, Typst gives the numeric columns their
  // natural width and starves the description, wrapping product names over
  // three lines and pushing a one-page quotation onto two.
  data-table(
    columns: (px(24), 1fr, px(56), px(76), px(76), px(88), px(32), px(80), px(82)),
    aligns: (right + top, left + top, right + top, right + top, right + top, right + top, right + top, right + top, right + top),
    header: ("#", "Description", "Qty", "Unit Price", "Discount", "Taxable Value", "GST", "GST Amount", "Total"),
    rows: data.lines.map(l => (
      text(size: px(9), font: mono-font, str(l.lineNumber)),
      [
        #text(size: px(9.5), weight: 600, l.name)
        #linebreak()
        #text(size: px(8), fill: muted, font: mono-font, l.sku + " · HSN " + l.hsnCode)
      ],
      text(size: px(9), font: mono-font, str(l.quantity) + " " + l.unitOfMeasure),
      money(l.unitPrice),
      money(l.lineDiscount),
      money(l.taxableValue),
      text(size: px(9), font: mono-font, str(l.gstRate) + "%"),
      money(l.gstAmount),
      money(l.lineTotal),
    )),
    // Mirrors the HTML `<tfoot>`: "Total" spanning the first two columns, the
    // quantity total, three blanks, then taxable / GST / line totals.
    total-cells: (
      table.cell(colspan: 2, align(left, text(size: px(9), weight: 700, "Total"))),
      text(size: px(9), weight: 700, font: mono-font, str(data.totalQuantity)),
      [], [],
      text(size: px(9), weight: 700, font: mono-font, data.totalTaxable),
      [],
      text(size: px(9), weight: 700, font: mono-font, data.totalGstAmount),
      text(size: px(9), weight: 700, font: mono-font, data.totalLineAmount),
    ),
  )

  v(px(14))

  totals-block(
    words: data.amountInWords,
    rows: (
      ("Subtotal", data.subtotal),
      ..(if data.discountLabel != none { (("Discount (" + data.discountLabel + ")", "− " + data.discountAmount),) } else { () }),
      ("Taxable Amount", data.taxableAmount),
      // F.4 — one row per distinct GST rate actually present, ascending: an IGST
      // row per rate inter-state, a CGST/SGST pair per rate intra-state. The rows
      // arrive pre-labelled and pre-formatted from `pdf/tax-rows.ts`, which both
      // view builders share, because a Typst template must not do arithmetic.
      //
      // They stay INSIDE `rows:` deliberately. F.6's round-off is appended as one
      // more pair immediately after them and immediately before `grand:`; hoisting
      // the tax rows into a block of their own would put Round Off above them.
      ..data.taxRows.map(r => (r.label, r.amount)),
    ),
    grand: data.totalAmount,
  )

  // F.4 — HSN/SAC summary (`docs/F3_F4_SPEC.md` §6). One row per distinct
  // (HSN, rate) PAIR, ascending by HSN then rate, with a TOTAL row that sums this
  // table's own rows. `Rate` is an explicit column (D-1): the pair is the grouping
  // key, so two rows can share an HSN and differ only by it, and on an intra-state
  // document the only other rate shown is the HALF rate.
  //
  // Guarded on presence. The guard is belt-and-braces rather than a live branch:
  // both loaders throw on a document with no line items — `performa-invoice.tsx:111`
  // is "Performa invoice <id> has no line items" — so a zero-group document never
  // reaches a render. (38 seeded PIs are in exactly that state, F.97, and none of
  // them can be rendered today.) The guard stays because a header band above a TOTAL
  // of 0.00, on a document whose header claims money, is a worse failure than a
  // missing section, and the cost of preventing it is one line.
  if "hsnTable" in data {
    v(px(14))
    caps-label("HSN / SAC Summary")
    v(px(5))
    data-table(
      // Widths sum to the content box (A4 less 18mm side margins) with the HSN
      // column taking the slack. Explicit, for the reason the line table above
      // gives: left to `auto`, Typst starves the first column and wraps.
      columns: if data.isInterState {
        (1fr, px(56), px(110), px(84), px(110), px(110))
      } else {
        (1fr, px(48), px(96), px(62), px(88), px(62), px(88), px(92))
      },
      aligns: if data.isInterState {
        (left + top, right + top, right + top, right + top, right + top, right + top)
      } else {
        (left + top, right + top, right + top, right + top, right + top, right + top, right + top, right + top)
      },
      header: data.hsnTable.header,
      rows: data.hsnTable.rows.map(r => r.map(c => text(size: px(9), font: mono-font, c))),
      total-cells: data.hsnTable.total.map(c => text(size: px(9), weight: 700, font: mono-font, c)),
    )
  }

  footer-block(terms: data.termsAndConditions, bank: data.bank)
}

#let data = json("data.json")
#let logo = if data.billFrom.logoUrl != none { "/logo.svg" } else { none }
#show: doc-shell.with(
  // buildFooterTemplate() writes the title in title case ("Quotation", not
  // "QUOTATION"), so the footer label comes from the loader's footerLabel
  // rather than from the uppercase heading.
  doc-id: data.footerLabel + " " + data.quoteNumber + " · Generated " + data.generatedAt,
)
#quotation-body(data, logo: logo)
