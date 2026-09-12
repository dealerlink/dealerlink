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
      ..(if data.isInterState {
        (("IGST " + data.fullRateLabel, data.igstAmount),)
      } else {
        (("CGST " + data.halfRateLabel, data.cgstAmount), ("SGST " + data.halfRateLabel, data.sgstAmount))
      }),
    ),
    grand: data.totalAmount,
  )

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
