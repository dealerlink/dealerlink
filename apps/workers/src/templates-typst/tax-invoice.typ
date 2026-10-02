// GST tax invoice — Typst (F.6).
//
// A THIN ENTRY POINT over the shared quotation body, for the reason
// `performa-invoice.typ` states and this day had no cause to revisit: the four HTML
// templates accumulated their inconsistencies by being copies, and importing is
// what stopped that. The invoice differs from a performa invoice in its title, its
// number label, and ONE row — the round-off — so a copy would duplicate ~150 lines
// to add one pair.
//
// NOT a React template. `TAX_INVOICE_AUDIT.md` §A.1/§A.3 specify
// `templates/tax-invoice.tsx` reusing `_components/*`; that is stale since ADR-015
// and those six components are dead code. `docs/INVOICE_CN_DN_AUDIT.md` corrects it.
//
// ROUND-OFF. `data.roundOff` is pre-formatted and signed by the view builder, or
// `null` when the stored term is zero — so the row appears only when there is
// something to show, and the template decides nothing. That it is `null` rather
// than `"0.00"` matters: the body tests `!= none`, which is the same shape as
// `discountLabel`, rather than comparing a formatted string.

#import "_lib/chrome.typ": *
#import "quotation.typ": quotation-body

#let data = json("data.json")
#let logo = if data.billFrom.logoUrl != none { "/logo.svg" } else { none }
#show: doc-shell.with(
  doc-id: data.footerLabel + " " + data.quoteNumber + " · Generated " + data.generatedAt,
)
#quotation-body(data, logo: logo, round-off: data.roundOff)
