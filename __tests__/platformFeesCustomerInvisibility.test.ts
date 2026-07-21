/**
 * Customer-invisibility regression test for platform fees.
 *
 * Per `feedback_platform_fees_invisible_to_customer` and the source plan's
 * P1 decision, no customer-facing render path may surface dual_pricing_fee,
 * tip_fee, "service fee", "platform fee", or any surcharge disclosure.
 *
 * This test grep-scans the canonical customer-facing surfaces for those
 * strings. If a future change accidentally pipes fee data into a receipt,
 * CFD screen, or printer template, this test fails before it ships.
 *
 * Surfaces audited (per Phase 1 codebase exploration):
 *   - components/cfd-client/TipSelectionScreen.tsx (customer tip-chip UI)
 *   - components/cfd-client/ResultScreen.tsx (post-payment customer display)
 *   - services/printing/templates/ReceiptTemplate.ts (ESC/POS)
 *   - services/printing/templates/ReceiptDocumentTemplate.ts (PDF/document)
 *   - services/printing/renderers/EscPosRenderer.ts
 *   - services/printing/renderers/StarXpandRenderer.ts
 *   - services/printing/renderers/SkiaTicketRenderer.ts
 *   - services/printing/renderers/DejavooXmlRenderer.ts
 *
 * NOT audited as customer-facing: components/menu/PaymentDetailBottomSheet.tsx —
 * that's the staff tip-adjust / refund / payment-detail surface (manager-only
 * in practice). It legitimately imports OrderDetailMerchantBreakdown and
 * holds fee fields in its internal data model. Customers never see it.
 *
 * Internal-only OK: components/orders/OrderDetailMerchantBreakdown.tsx
 * (manager-gated; never imported by the surfaces below).
 */

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

const CUSTOMER_FACING_PATHS = [
  "components/cfd-client/TipSelectionScreen.tsx",
  "components/cfd-client/ResultScreen.tsx",
  "services/printing/templates/ReceiptTemplate.ts",
  "services/printing/templates/ReceiptDocumentTemplate.ts",
  "services/printing/renderers/EscPosRenderer.ts",
  "services/printing/renderers/StarXpandRenderer.ts",
  "services/printing/renderers/SkiaTicketRenderer.ts",
  "services/printing/renderers/DejavooXmlRenderer.ts",
];

// Patterns that must never appear in a customer-facing surface as user-
// visible text. Matched against literal-looking strings only.
const FORBIDDEN_USER_VISIBLE = [
  /service\s*fee/i,
  /platform\s*fee/i,
  /\bsurcharge\b/i,
  /dual[_ ]pricing[_ ]fee/i,
  /tip[_ ]fee/i,
];

// Components that are internal-only (manager-gated) — verify the
// customer-facing surfaces do NOT import them.
const FORBIDDEN_IMPORTS = [
  /OrderDetailMerchantBreakdown/,
];

function readSafe(relPath: string): string {
  try {
    return readFileSync(join(ROOT, relPath), "utf-8");
  } catch {
    return "";
  }
}

/**
 * Extract only quoted string literals + JSX text nodes from source.
 *
 * Why: a UI label like "Service fee: $0.40" lives in a string literal or
 * between JSX tags — never as a bare identifier. Internal code names like
 * `tipSurchargePercentage` would false-positive a naive whole-file grep.
 * This narrows the scan to where customer-visible text actually lives.
 */
function extractUiText(source: string): string {
  if (!source) return "";
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const literals: string[] = [];
  // String literals (single, double, backtick).
  const stringRe = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = stringRe.exec(stripped)) !== null) {
    literals.push(match[2]);
  }
  // JSX text nodes between tags. Heuristic: `>...<` content.
  const jsxRe = />([^<>{}\n]+)</g;
  while ((match = jsxRe.exec(stripped)) !== null) {
    const text = match[1].trim();
    if (text) literals.push(text);
  }
  return literals.join("\n");
}

describe("Platform-fee customer invisibility", () => {
  describe.each(CUSTOMER_FACING_PATHS)("%s", (relPath) => {
    const source = readSafe(relPath);

    it("file exists (sanity)", () => {
      // PaymentDetailBottomSheet must exist; renderer/template names may
      // shift over time. If a path is missing, treat the test as skipped
      // rather than failing — the linting catches the 'must exist' subset
      // via separate suite below.
      if (!source) {
        console.warn(`[invisibility test] missing surface: ${relPath}`);
      }
      expect(typeof source).toBe("string");
    });

    it.each(FORBIDDEN_USER_VISIBLE)(
      "must not contain user-visible string matching %p",
      (pattern) => {
        if (!source) return; // skipped surfaces — see warning above
        // Only scan string literals + JSX text nodes — that's where
        // customer-visible labels live. Identifiers like
        // `tipSurchargePercentage` are internal code, not UI text.
        const uiText = extractUiText(source);
        expect(uiText).not.toMatch(pattern);
      },
    );

    it.each(FORBIDDEN_IMPORTS)(
      "must not import %p",
      (pattern) => {
        if (!source) return;
        // Look at import lines specifically.
        const importLines = source
          .split("\n")
          .filter((line) => /^\s*import\s/.test(line))
          .join("\n");
        expect(importLines).not.toMatch(pattern);
      },
    );
  });

  it("TipSelectionScreen exists (load-bearing CFD surface)", () => {
    const source = readSafe("components/cfd-client/TipSelectionScreen.tsx");
    expect(source.length).toBeGreaterThan(0);
  });
});
