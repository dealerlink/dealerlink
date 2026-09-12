// Performa invoice — Typst (F.38, Day 26).
//
// Structurally identical to the quotation: the HTML `performa-invoice.tsx`
// delegates to `renderQuotationHtml`, passing a different `documentTitle` and
// `numberLabel`, and carrying a distinct Ship-To party where a quotation has
// none. That sharing is preserved by IMPORTING the quotation body rather than
// copying it — copying is precisely how the four HTML templates accumulated
// their inconsistencies.
//
// It has its own entry point so the two can diverge later (F.6's tax invoice,
// F.4's multi-rate summary) without either inheriting the other's changes by
// accident.

#import "_lib/chrome.typ": *
#import "quotation.typ": quotation-body

#let data = json("data.json")
#let logo = if data.billFrom.logoUrl != none { "/logo.svg" } else { none }
#show: doc-shell.with(
  doc-id: data.footerLabel + " " + data.quoteNumber + " · Generated " + data.generatedAt,
)
#quotation-body(data, logo: logo)
