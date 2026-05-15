import type { GstRate, TaxComputationOutput, TaxLineOutput } from './types';

/**
 * String-valued mirror of `TaxLineOutput`. Money fields are fixed-2dp
 * strings (e.g. "1770000.00") — safe to insert directly into NUMERIC
 * columns and safe to ship across the Server Component boundary.
 */
export type SerializedTaxLine = {
  lineId: string;
  lineSubtotal: string;
  lineDiscount: string;
  lineTaxable: string;
  gstRate: GstRate;
  lineCgst: string;
  lineSgst: string;
  lineIgst: string;
  lineTaxTotal: string;
  lineTotal: string;
};

/** String-valued mirror of `TaxComputationOutput`. */
export type SerializedTaxOutput = {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
  isInterState: boolean;
  lines: SerializedTaxLine[];
};

function serializeLine(l: TaxLineOutput): SerializedTaxLine {
  return {
    lineId: l.lineId,
    lineSubtotal: l.lineSubtotal.toFixed(2),
    lineDiscount: l.lineDiscount.toFixed(2),
    lineTaxable: l.lineTaxable.toFixed(2),
    gstRate: l.gstRate,
    lineCgst: l.lineCgst.toFixed(2),
    lineSgst: l.lineSgst.toFixed(2),
    lineIgst: l.lineIgst.toFixed(2),
    lineTaxTotal: l.lineTaxTotal.toFixed(2),
    lineTotal: l.lineTotal.toFixed(2),
  };
}

/**
 * Convert a `TaxComputationOutput` to plain fixed-2dp strings. `Decimal`
 * objects do not serialize cleanly across the Server Component boundary and
 * are not directly insertable into the DB; this is the canonical boundary
 * adapter for both.
 */
export function serializeOutput(output: TaxComputationOutput): SerializedTaxOutput {
  return {
    subtotal: output.subtotal.toFixed(2),
    discountAmount: output.discountAmount.toFixed(2),
    taxableAmount: output.taxableAmount.toFixed(2),
    cgstAmount: output.cgstAmount.toFixed(2),
    sgstAmount: output.sgstAmount.toFixed(2),
    igstAmount: output.igstAmount.toFixed(2),
    totalAmount: output.totalAmount.toFixed(2),
    isInterState: output.isInterState,
    lines: output.lines.map(serializeLine),
  };
}
