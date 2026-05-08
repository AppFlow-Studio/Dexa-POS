/**
 * BatchSummaryDocumentTemplate
 *
 * Builds a PrintDocument for two related reports:
 *   - Settled-batch summary (post-batchout, per settlement_batches row)
 *   - Closing/Z-report (cashier end-of-day, sourced from order_payments
 *     directly via get_business_day_activity_summary_v1)
 *
 * Both share the same JSONB shape (header.kind discriminates), so this
 * template renders a single canonical 10-section layout regardless of
 * source. Every section ALWAYS prints — empty values fall back to
 * $0.00 / 0 / "—" so a slow day still produces a complete-looking
 * report.
 *
 * Star Micronics (Landi C20Pro) constraint: no addTextColumns /
 * addDividingLine — all columns laid out via two_column nodes with
 * manual char-padding at 32 chars.
 */

import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
import { sanitizeForPrint, safeTimeString } from "../utils/sanitizeText";

const BOLD: PrintTextFormat = { bold: true };
const BOLD_DH: PrintTextFormat = { bold: true, doubleHeight: true };

export interface BatchSummaryHeader {
  /** "batch" for a settled batch report; "closing_report" for the day's activity */
  kind?: "batch" | "closing_report";
  // Settled-batch-only fields (still optional on closing reports)
  settlement_batch_id?: string | null;
  batch_id?: string | null;
  castles_batch_num?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  settlement_date?: string | null;
  funded_date?: string | null;
  // Always present
  business_date: string;
  business_date_start?: string | null;
  business_date_end?: string | null;
  status?: string | null;
  processor?: string | null;
  terminal_id?: string | null;
  terminal_name?: string | null;
  register_id?: string | null;
  transaction_count?: number | null;
}

export interface BatchSummaryAmount { amount: number; count: number; }

export interface BatchSummary {
  header: BatchSummaryHeader;
  sales: {
    credit_total: number;
    cash_total: number;
    gift_total: number;
    house_total?: number;
    gross: number;
  };
  refunds: { count: number; amount: number };
  net: { gross: number; refunds: number; net_deposit: number | null };
  card_brands: Record<string, BatchSummaryAmount>;
  entry_modes: Record<string, BatchSummaryAmount>;
  payment_methods?: Record<string, BatchSummaryAmount>;
  counts: { approvals: number; refunds: number; voids: number };
  adjustments: {
    voids_count: number;
    voids_amount: number;
    tip_total: number;
    refunded_tip_total: number;
    tip_adjustments_count: number;
  };
  fees: {
    dual_pricing_fee: number;
    refunded_dual_pricing_fee: number;
    processor_fees: number | null;
    interchange_fees: number | null;
    assessment_fees: number | null;
  };
  // Closing-report-only — always present on day summaries, optional on
  // settled-batch reports.
  unsettled?: { count: number; amount: number };
  batches?: Array<{
    id: string;
    castles_batch_num?: string | null;
    status?: string | null;
    opened_at?: string | null;
    closed_at?: string | null;
    settlement_date?: string | null;
    funded_date?: string | null;
    net_deposit?: number | null;
    transaction_count?: number | null;
  }>;
}

export type BusinessDaySummary = BatchSummary;

export interface BatchSummaryStoreContext {
  storeName?: string;
  storeAddress?: string;
}

const W = 32;
const CARD_BRAND_KEYS = ["VISA", "MASTERCARD", "AMEX", "DISCOVER"] as const;
const ENTRY_MODE_KEYS = ["chip", "contactless", "swipe", "manual"] as const;

function fmtCurrency(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "$0.00";
  return `$${Number(n).toFixed(2)}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  return `${date} ${safeTimeString(d)}`;
}

function brandDisplay(key: string): string {
  switch (key.toUpperCase()) {
    case "VISA": return "Visa";
    case "MASTERCARD": return "Mastercard";
    case "AMEX": return "Amex";
    case "DISCOVER": return "Discover";
    default: return key.charAt(0) + key.slice(1).toLowerCase();
  }
}

function entryModeDisplay(key: string): string {
  switch (key.toLowerCase()) {
    case "chip": return "Chip (EMV)";
    case "contactless": return "Tap";
    case "swipe": return "Swipe";
    case "manual": return "Keyed";
    case "fallback": return "Fallback";
    default: return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

function pushHeader(
  nodes: PrintNode[],
  header: BatchSummaryHeader,
  store: BatchSummaryStoreContext,
): void {
  if (store.storeName) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(store.storeName),
      align: "center",
      format: BOLD,
    });
  }
  if (store.storeAddress) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(store.storeAddress),
      align: "center",
    });
  }
  nodes.push({ type: "empty_line" });

  const isClosing = header.kind === "closing_report";
  nodes.push({
    type: "text_line",
    content: isClosing ? "CLOSING REPORT" : "BATCH SUMMARY",
    align: "center",
    format: BOLD_DH,
  });
  nodes.push({ type: "empty_line" });

  nodes.push({ type: "divider", style: "solid", lineWidth: W });

  // Header (Section 1) — always print full set
  if (header.castles_batch_num) {
    nodes.push({
      type: "two_column",
      left: "Batch #",
      right: header.castles_batch_num,
      lineWidth: W,
      format: BOLD,
    });
  } else if (header.batch_id) {
    nodes.push({
      type: "two_column",
      left: "Batch ID",
      right: header.batch_id.slice(0, 16),
      lineWidth: W,
      format: BOLD,
    });
  } else {
    nodes.push({
      type: "two_column",
      left: "Batch",
      right: "OPEN",
      lineWidth: W,
      format: BOLD,
    });
  }

  nodes.push({
    type: "two_column",
    left: "Processor",
    right: (header.processor ?? "—").toUpperCase(),
    lineWidth: W,
  });

  const terminalLabel = header.terminal_name || header.register_id || header.terminal_id || "—";
  nodes.push({
    type: "two_column",
    left: "Terminal",
    right: sanitizeForPrint(String(terminalLabel)).slice(0, 20),
    lineWidth: W,
  });

  if (header.register_id && header.terminal_name) {
    nodes.push({
      type: "two_column",
      left: "MID/TID",
      right: sanitizeForPrint(header.register_id).slice(0, 20),
      lineWidth: W,
    });
  }

  nodes.push({
    type: "two_column",
    left: "Business Day",
    right: header.business_date,
    lineWidth: W,
  });
  nodes.push({
    type: "two_column",
    left: "Opened",
    right: fmtDateTime(header.opened_at ?? header.business_date_start),
    lineWidth: W,
  });
  nodes.push({
    type: "two_column",
    left: "Closed",
    right: fmtDateTime(header.closed_at ?? header.business_date_end),
    lineWidth: W,
  });
  nodes.push({
    type: "two_column",
    left: "Status",
    right: (header.status ?? "OPEN").toUpperCase(),
    lineWidth: W,
  });
  nodes.push({
    type: "two_column",
    left: "Transactions",
    right: String(header.transaction_count ?? 0),
    lineWidth: W,
  });
}

function pushSection(nodes: PrintNode[], title: string): void {
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "divider", style: "solid", lineWidth: W });
  nodes.push({ type: "text_line", content: title, format: BOLD });
}

function pushAmountRow(
  nodes: PrintNode[],
  label: string,
  amount: number | null | undefined,
  format?: PrintTextFormat,
): void {
  nodes.push({
    type: "two_column",
    left: label,
    right: fmtCurrency(amount ?? 0),
    lineWidth: W,
    format,
  });
}

function pushCountAmountRow(
  nodes: PrintNode[],
  label: string,
  count: number,
  amount: number,
): void {
  nodes.push({
    type: "two_column",
    left: `${label} (${count})`,
    right: fmtCurrency(amount),
    lineWidth: W,
  });
}

function pushBody(nodes: PrintNode[], s: BatchSummary): void {
  // 2. SALES
  pushSection(nodes, "SALES");
  pushAmountRow(nodes, "Credit/Debit", s.sales.credit_total);
  pushAmountRow(nodes, "Cash", s.sales.cash_total);
  pushAmountRow(nodes, "Gift Card", s.sales.gift_total);
  if ((s.sales.house_total ?? 0) > 0) {
    pushAmountRow(nodes, "House Account", s.sales.house_total ?? 0);
  }
  pushAmountRow(nodes, "Gross Sales", s.sales.gross, BOLD);

  // 3. REFUNDS
  pushSection(nodes, "REFUNDS / RETURNS");
  pushCountAmountRow(nodes, "Refunds", s.refunds.count, s.refunds.amount);

  // 4. NET DEPOSIT
  pushSection(nodes, "NET BATCH TOTAL");
  pushAmountRow(nodes, "Gross", s.net.gross);
  nodes.push({
    type: "two_column",
    left: "Less Refunds",
    right: `-${fmtCurrency(s.net.refunds)}`,
    lineWidth: W,
  });
  pushAmountRow(
    nodes,
    "Net Deposit",
    s.net.net_deposit ?? s.net.gross - s.net.refunds,
    BOLD,
  );

  // 5. CARD BRANDS — always render the four canonical brands at zero,
  // then any extra brands present (Diners, JCB, UnionPay, unknowns) get
  // their own row, then a single "Other" row aggregating anything the
  // RPC bucketed under 'OTHER'.
  pushSection(nodes, "CARD TYPE BREAKDOWN");
  const brandsMap = s.card_brands ?? {};
  for (const key of CARD_BRAND_KEYS) {
    const v = brandsMap[key] ?? { count: 0, amount: 0 };
    pushCountAmountRow(nodes, brandDisplay(key), v.count, v.amount);
  }
  // Dynamic — surface any non-canonical brand keys the RPC returned
  // (e.g. DINERS, JCB, UNIONPAY) so they don't silently roll into OTHER
  // and disappear from the report.
  const extraBrandKeys = Object.keys(brandsMap)
    .filter(
      (k) =>
        !(CARD_BRAND_KEYS as readonly string[]).includes(k) && k !== "OTHER",
    )
    .sort();
  for (const key of extraBrandKeys) {
    const v = brandsMap[key];
    if (v && v.count > 0) {
      pushCountAmountRow(nodes, brandDisplay(key), v.count, v.amount);
    }
  }
  // Always render "Other" so the operator can see at-a-glance whether
  // any unrecognised card_type is leaking into the totals.
  const otherBrand = brandsMap.OTHER ?? { count: 0, amount: 0 };
  pushCountAmountRow(nodes, "Other", otherBrand.count, otherBrand.amount);

  // 6. TRANSACTION COUNTS
  pushSection(nodes, "TRANSACTIONS");
  nodes.push({
    type: "two_column",
    left: "Approvals",
    right: String(s.counts.approvals),
    lineWidth: W,
  });
  nodes.push({
    type: "two_column",
    left: "Declines",
    right: "n/a",
    lineWidth: W,
  });
  nodes.push({
    type: "two_column",
    left: "Refunds",
    right: String(s.counts.refunds),
    lineWidth: W,
  });
  nodes.push({
    type: "two_column",
    left: "Voids",
    right: String(s.counts.voids),
    lineWidth: W,
  });

  // 7. ADJUSTMENTS
  pushSection(nodes, "ADJUSTMENTS");
  pushCountAmountRow(nodes, "Voids", s.adjustments.voids_count, s.adjustments.voids_amount);
  pushAmountRow(nodes, "Tips", s.adjustments.tip_total);
  pushAmountRow(nodes, "Refunded Tips", s.adjustments.refunded_tip_total);
  nodes.push({
    type: "two_column",
    left: "Tip Adjustments",
    right: String(s.adjustments.tip_adjustments_count),
    lineWidth: W,
  });

  // 8. FEES — always render
  pushSection(nodes, "FEES / DUAL PRICING");
  pushAmountRow(nodes, "Dual Pricing Fee", s.fees.dual_pricing_fee);
  pushAmountRow(nodes, "Refunded DP Fee", s.fees.refunded_dual_pricing_fee);
  pushAmountRow(nodes, "Processor Fees", s.fees.processor_fees ?? 0);
  pushAmountRow(nodes, "Interchange", s.fees.interchange_fees ?? 0);
  pushAmountRow(nodes, "Assessment", s.fees.assessment_fees ?? 0);

  // 9. ENTRY MODE / PAYMENT METHOD — always render canonical keys
  pushSection(nodes, "PAYMENT METHOD");
  for (const key of ENTRY_MODE_KEYS) {
    const v = s.entry_modes?.[key] ?? { count: 0, amount: 0 };
    pushCountAmountRow(nodes, entryModeDisplay(key), v.count, v.amount);
  }
  const fallback = s.entry_modes?.fallback;
  if (fallback && fallback.count > 0) {
    pushCountAmountRow(nodes, entryModeDisplay("fallback"), fallback.count, fallback.amount);
  }
  const otherMode = s.entry_modes?.other;
  if (otherMode && otherMode.count > 0) {
    pushCountAmountRow(nodes, "Other", otherMode.count, otherMode.amount);
  }

  // 10. SETTLEMENT
  pushSection(nodes, "SETTLEMENT");
  const isClosing = s.header.kind === "closing_report";
  if (isClosing) {
    const batchCount = s.batches?.length ?? 0;
    nodes.push({
      type: "two_column",
      left: "State",
      right: batchCount === 0 ? "OPEN BATCH" : `${batchCount} BATCH${batchCount > 1 ? "ES" : ""}`,
      lineWidth: W,
      format: BOLD,
    });
    if (s.unsettled) {
      pushCountAmountRow(nodes, "Unsettled", s.unsettled.count, s.unsettled.amount);
    }
  }
  nodes.push({
    type: "two_column",
    left: "Settled",
    right: fmtDateTime(s.header.settlement_date),
    lineWidth: W,
  });
  nodes.push({
    type: "two_column",
    left: "Funded",
    right: s.header.funded_date || "Pending",
    lineWidth: W,
  });
}

export function buildBatchSummaryDocument(
  summary: BatchSummary,
  store: BatchSummaryStoreContext = {},
): PrintDocument {
  const nodes: PrintNode[] = [];

  pushHeader(nodes, summary.header, store);
  pushBody(nodes, summary);

  nodes.push({ type: "empty_line" });
  nodes.push({ type: "divider", style: "solid", lineWidth: W });
  nodes.push({
    type: "text_line",
    content: `Printed ${fmtDateTime(new Date().toISOString())}`,
    align: "center",
  });
  nodes.push({ type: "feed", lines: 3 });
  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: W };
}

/**
 * Closing report renderer — same shape as a batch summary now that the
 * RPCs unified on get_business_day_activity_summary_v1's output. Kept as
 * a separate export for call-site clarity.
 */
export function buildBusinessDaySummaryDocument(
  day: BusinessDaySummary,
  store: BatchSummaryStoreContext = {},
): PrintDocument {
  return buildBatchSummaryDocument(day, store);
}
