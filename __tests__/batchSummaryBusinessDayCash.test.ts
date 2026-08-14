import {
  buildBatchSummaryDocument,
  type BatchSummary,
} from "@/services/printing/templates/BatchSummaryDocumentTemplate";
import type { PrintNode } from "@/types/print-document";

/**
 * Business-day cash on the Batch Summary receipt.
 *
 * Cash payments have no settlement_batch_id, so the per-batch card figures
 * (SALES / NET) never include them. get_batch_summary_v1 now returns a
 * `business_day` block with all-tender day totals; the template renders it as
 * a distinct "BUSINESS DAY (ALL TENDERS)" section without touching the card
 * batch totals. Closing reports omit `business_day` and must NOT grow the
 * section (their SALES already spans the whole day).
 */

const baseSummary = (): BatchSummary => ({
  header: {
    kind: "batch",
    business_date: "2026-08-13",
    status: "settled",
    processor: "castles",
    transaction_count: 3,
  },
  // Card batch figures — cash is $0 here by construction (no settlement batch).
  sales: {
    credit_total: 842.1,
    cash_total: 0,
    gift_total: 20.0,
    gross: 862.1,
  },
  refunds: { count: 0, amount: 0 },
  net: { gross: 862.1, tips: 0, refunds: 0, net_deposit: 862.1 },
  card_brands: {},
  entry_modes: {},
  counts: { approvals: 3, refunds: 0, voids: 0 },
  adjustments: {
    voids_count: 0,
    voids_amount: 0,
    tip_total: 0,
    refunded_tip_total: 0,
    tip_adjustments_count: 0,
  },
  fees: {
    dual_pricing_fee: 0,
    refunded_dual_pricing_fee: 0,
    processor_fees: null,
    interchange_fees: null,
    assessment_fees: null,
  },
});

const findSectionTitle = (nodes: PrintNode[], title: string): boolean =>
  nodes.some((n) => n.type === "text_line" && n.content === title);

// Right-hand value of the first two_column row whose left label matches,
// optionally starting the search at `from` (used to scope to a section).
const twoColRight = (
  nodes: PrintNode[],
  left: string,
  from = 0,
): string | undefined => {
  const row = nodes
    .slice(from)
    .find(
      (n): n is Extract<PrintNode, { type: "two_column" }> =>
        n.type === "two_column" && n.left === left,
    );
  return row?.right;
};

const sectionIndex = (nodes: PrintNode[], title: string): number =>
  nodes.findIndex((n) => n.type === "text_line" && n.content === title);

describe("Batch summary — business-day cash section", () => {
  it("renders BUSINESS DAY (ALL TENDERS) with cash when business_day is present", () => {
    const summary = baseSummary();
    summary.business_day = {
      business_date: "2026-08-13",
      cash_total: 315.0,
      cash_count: 7,
      card_total: 842.1,
      gift_total: 20.0,
      gross: 1177.1,
    };

    const { nodes } = buildBatchSummaryDocument(summary, {});

    const dayAt = sectionIndex(nodes, "BUSINESS DAY (ALL TENDERS)");
    expect(dayAt).toBeGreaterThan(-1);
    // Scope to the day block so we read the day cash, not the batch SALES cash.
    expect(twoColRight(nodes, "Cash", dayAt)).toBe("$315.00");
    expect(twoColRight(nodes, "Day Gross", dayAt)).toBe("$1177.10");
  });

  it("leaves the card batch SALES / NET figures untouched", () => {
    const summary = baseSummary();
    summary.business_day = {
      cash_total: 315.0,
      card_total: 842.1,
      gross: 1177.1,
    };

    const { nodes } = buildBatchSummaryDocument(summary, {});

    // Card gross (SALES) and net deposit reflect the batch only, not the day.
    expect(twoColRight(nodes, "Gross Sales")).toBe("$862.10");
    expect(twoColRight(nodes, "Net Deposit")).toBe("$862.10");
  });

  it("omits the section entirely when business_day is absent (closing report)", () => {
    const summary = baseSummary();
    summary.header.kind = "closing_report";
    // No business_day field.

    const { nodes } = buildBatchSummaryDocument(summary, {});

    expect(findSectionTitle(nodes, "BUSINESS DAY (ALL TENDERS)")).toBe(false);
  });

  it("hides gift / house rows in the day block when they are zero", () => {
    const summary = baseSummary();
    summary.business_day = {
      cash_total: 100,
      card_total: 200,
      gift_total: 0,
      house_total: 0,
      gross: 300,
    };

    const { nodes } = buildBatchSummaryDocument(summary, {});
    const idx = nodes.findIndex(
      (n) => n.type === "text_line" && n.content === "BUSINESS DAY (ALL TENDERS)",
    );
    // Rows belonging to the day block: from its title to the next section divider.
    const dayRows = nodes.slice(idx);
    const giftRow = dayRows.find(
      (n) => n.type === "two_column" && n.left === "Gift Card",
    );
    // A Gift Card row may exist in the card SALES section above, but not
    // inside the day block (slice starts at the day title).
    expect(giftRow).toBeUndefined();
  });
});
