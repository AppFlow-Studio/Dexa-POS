import { ReceiptTemplateData } from "@/types/printer";
import { DEFAULT_SIGNATURE_DISCLAIMER } from "@/types/receipt-template";
import { sanitizeForPrint } from "../utils/sanitizeText";

/**
 * Cardholder signature block for sale receipts, shared by the IR renderer
 * (Star / Landi / Dejavoo) and the raw ESC/POS template so both print the same
 * lines.
 *
 * Prints only when all three hold: the template's signature line is on, this
 * job is the merchant copy, and the receipt carries a card payment (a split's
 * card portion counts; the block still prints once).
 */
export const SIGNATURE_BLANK_LINES = 3;

export function shouldPrintSignatureBlock(data: ReceiptTemplateData): boolean {
  return (
    data.templateConfig?.printSignatureLine === true &&
    data.copyType === "merchant" &&
    data.payments.some((p) => p.isCard)
  );
}

export interface SignatureBlockLines {
  /** "X" then a hyphen rule to the full width (no box-drawing chars). */
  rule: string;
  caption: string;
  /** Disclaimer pre-wrapped to the width so the printer never soft-wraps. */
  disclaimer: string[];
}

export function buildSignatureBlockLines(
  data: ReceiptTemplateData,
  width: number,
): SignatureBlockLines {
  const custom = data.templateConfig?.signatureLineDisclaimer?.trim();
  return {
    rule: `X ${"-".repeat(Math.max(0, width - 2))}`,
    caption: "Cardholder Signature",
    disclaimer: wrapPrintText(custom || DEFAULT_SIGNATURE_DISCLAIMER, width),
  };
}

/**
 * Wrap merchant-entered text to the paper width, honoring the merchant's own
 * line breaks. Blank lines are kept (as empty strings) so spacing the merchant
 * typed survives; leading/trailing blank lines are dropped.
 */
export function wrapPrintText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of sanitizeForPrint(text).split(/\r?\n/)) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      if (!current) current = word;
      else if (current.length + 1 + word.length <= width) current += ` ${word}`;
      else {
        lines.push(current);
        current = word;
      }
      // A single word longer than the paper is hard-broken.
      while (current.length > width) {
        lines.push(current.slice(0, width));
        current = current.slice(width);
      }
    }
    if (current) lines.push(current);
  }
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
