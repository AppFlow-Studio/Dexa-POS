import { PrintDocument, PrintNode } from "@/types/print-document";
import { ReceiptTemplateConfig } from "@/types/receipt-template";
import { sanitizeForPrint } from "../utils/sanitizeText";

export interface RefundReceiptLineItem {
  name: string;
  quantity: number;
  amount: number;
}

export interface RefundReceiptData {
  locationId: string;
  orderId: string;
  reversalId: string;
  storeName: string;
  storeAddress?: string;
  storeAddressLines?: string[];
  storePhone?: string;
  logoBase64?: string | null;
  refundNumber: string;
  orderNumber: string;
  orderDate: string;
  refundDate: string;
  refundTime?: string | null;
  cashierName?: string | null;
  posCode?: string | null;
  items: RefundReceiptLineItem[];
  customAmountLabel?: string;
  subtotal?: number | null;
  tax?: number | null;
  totalRefunded: number;
  paymentMethod: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  approvalStatus?: string | null;
  approvalCode?: string | null;
  transactionId?: string | null;
  refundRrn?: string | null;
  batchNumber?: string | null;
  invoiceNumber?: string | null;
  terminalId?: string | null;
  originalRrn?: string | null;
  reason?: string | null;
  originalPaymentAmount: number;
  refundedToDate: number;
  remainingRefundable: number;
  hostedReceiptUrl?: string | null;
  copyLabel?: "Customer Copy" | "Merchant Copy";
  isReprint?: boolean;
}

const WIDTH = 42;
const BOLD = { bold: true } as const;
const LARGE = { bold: true, doubleHeight: true } as const;

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function truncate(value: string, max: number): string {
  const clean = sanitizeForPrint(value);
  return clean.length <= max
    ? clean
    : clean.slice(0, Math.max(1, max - 3)) + "...";
}

/** Right-aligned two-column row (label left, value flush right). Omits empty. */
function amountRow(
  nodes: PrintNode[],
  label: string,
  value: string | null | undefined,
  format?: { bold?: boolean },
): void {
  if (!value) return;
  nodes.push({
    type: "two_column",
    left: sanitizeForPrint(label),
    right: truncate(value, 24),
    lineWidth: WIDTH,
    format,
  });
}

/** Left-aligned "Label: value" line. Omits when the value is missing. */
function labelLine(
  nodes: PrintNode[],
  label: string,
  value: string | null | undefined,
  format?: { bold?: boolean },
): void {
  if (!value) return;
  nodes.push({
    type: "text_line",
    content: truncate(`${label}: ${value}`, WIDTH),
    format,
  });
}

/**
 * Renders only precomputed refund values. All allocation and balance arithmetic
 * belongs in RefundReceiptService so print drivers cannot disagree.
 *
 * A single document adapts to all three refund flows:
 *   - full / per-item  -> `items` populated, printed as positive line amounts.
 *   - custom amount     -> `items` empty, printed as one `customAmountLabel` line.
 * and to the tender: card shows approval/RRN/batch proof, cash suppresses them.
 */
export function buildRefundReceiptDocument(
  data: RefundReceiptData,
  config?: ReceiptTemplateConfig,
): PrintDocument {
  const nodes: PrintNode[] = [];
  const merchantCopy = data.copyLabel === "Merchant Copy";
  const isCash = data.paymentMethod.toLowerCase() === "cash";

  // ── Store header ──────────────────────────────────────────────────────
  if (config?.showLogo !== false && data.logoBase64) {
    nodes.push({ type: "image", base64Png: data.logoBase64 });
  }
  nodes.push({
    type: "text_line",
    content: sanitizeForPrint(data.storeName),
    align: "center",
    format: BOLD,
  });
  // Address: one centered bold line per component so a long address does not
  // center-clip on the Star raster path. Falls back to the joined string.
  const addressLines =
    data.storeAddressLines && data.storeAddressLines.length > 0
      ? data.storeAddressLines
      : data.storeAddress
        ? [data.storeAddress]
        : [];
  for (const line of addressLines) {
    if (!line) continue;
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(line),
      align: "center",
      format: BOLD,
    });
  }
  if (data.storePhone) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(data.storePhone),
      align: "center",
    });
  }
  if (config?.headerText) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(config.headerText),
      align: "center",
    });
  }

  // ── Title ─────────────────────────────────────────────────────────────
  nodes.push({ type: "empty_line" });
  nodes.push({
    type: "text_line",
    content: "*** REFUND RECEIPT ***",
    align: "center",
    format: LARGE,
  });
  if (data.isReprint) {
    nodes.push({
      type: "text_line",
      content: "*** REPRINT ***",
      align: "center",
      format: BOLD,
    });
  }
  if (merchantCopy) {
    nodes.push({
      type: "text_line",
      content: "Merchant Copy",
      align: "center",
      format: BOLD,
    });
  }
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });

  // ── Meta ──────────────────────────────────────────────────────────────
  if (data.refundTime) {
    nodes.push({
      type: "two_column",
      left: sanitizeForPrint(`Date: ${data.refundDate}`),
      right: truncate(data.refundTime, 12),
      lineWidth: WIDTH,
    });
  } else {
    labelLine(nodes, "Date", data.refundDate);
  }
  labelLine(nodes, "Receipt #", data.refundNumber, BOLD);
  labelLine(nodes, "Original Receipt #", data.orderNumber);
  if (data.cashierName && data.posCode) {
    nodes.push({
      type: "two_column",
      left: truncate(`Cashier: ${data.cashierName}`, WIDTH - 10),
      right: truncate(`POS: ${data.posCode}`, 10),
      lineWidth: WIDTH,
    });
  } else {
    labelLine(nodes, "Cashier", data.cashierName);
    labelLine(nodes, "POS", data.posCode);
  }

  // ── Refunded items (dynamic across flows) ─────────────────────────────
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
  nodes.push({ type: "text_line", content: "REFUNDED ITEMS", format: BOLD });
  if (data.items.length > 0) {
    for (const item of data.items) {
      nodes.push({
        type: "two_column",
        left: truncate(`${item.quantity} ${item.name}`, 30),
        right: money(item.amount),
        lineWidth: WIDTH,
      });
    }
  } else {
    nodes.push({
      type: "two_column",
      left: sanitizeForPrint(data.customAmountLabel ?? "Refund"),
      right: money(data.totalRefunded),
      lineWidth: WIDTH,
    });
  }

  // ── Totals ────────────────────────────────────────────────────────────
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
  if (data.subtotal != null) {
    amountRow(nodes, "Subtotal", money(data.subtotal));
  }
  if (data.tax != null) {
    amountRow(nodes, "Tax", money(data.tax));
  }
  amountRow(nodes, "REFUND TOTAL", money(data.totalRefunded), BOLD);

  // ── Refunded to (dynamic by tender) ───────────────────────────────────
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
  const cardLabel = [
    data.cardBrand,
    data.cardLast4 ? `****${data.cardLast4}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  nodes.push({
    type: "text_line",
    content: sanitizeForPrint(
      `REFUNDED TO: ${isCash ? "CASH" : cardLabel || data.paymentMethod}`,
    ),
    format: BOLD,
  });
  if (!isCash) {
    labelLine(nodes, "Approval Code", data.approvalCode);
    labelLine(nodes, "Refund RRN", data.refundRrn);
    const batchInvoice = [
      data.batchNumber ? `Batch: ${data.batchNumber}` : null,
      data.invoiceNumber ? `Invoice: ${data.invoiceNumber}` : null,
    ]
      .filter(Boolean)
      .join("   ");
    if (batchInvoice) {
      nodes.push({ type: "text_line", content: truncate(batchInvoice, WIDTH) });
    }
  }
  labelLine(nodes, "Transaction ID", data.transactionId ?? data.refundNumber);
  amountRow(nodes, "Refund Amount", money(data.totalRefunded));

  // ── Merchant-only audit block ─────────────────────────────────────────
  if (merchantCopy) {
    labelLine(nodes, "Status", data.approvalStatus);
    labelLine(nodes, "Terminal", data.terminalId);
    labelLine(nodes, "Original RRN", data.originalRrn);
    labelLine(nodes, "Reason", data.reason);
    nodes.push({ type: "empty_line" });
    nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
    amountRow(nodes, "Original Payment", money(data.originalPaymentAmount));
    amountRow(nodes, "Refunded To Date", money(data.refundedToDate));
    amountRow(
      nodes,
      "Remaining Refundable",
      money(data.remainingRefundable),
      BOLD,
    );
  }

  // ── Footer (fixed refund messaging; never the sale receipt footer_text) ──
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
  nodes.push({
    type: "text_line",
    content: "THANK YOU!",
    align: "center",
    format: BOLD,
  });
  if (!isCash) {
    nodes.push({
      type: "text_line",
      content: "Refunds may take 3-5 business days",
      align: "center",
    });
    nodes.push({
      type: "text_line",
      content: "to appear on your statement.",
      align: "center",
    });
  }
  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });

  if (merchantCopy) {
    nodes.push({ type: "empty_line" });
    nodes.push({ type: "text_line", content: "Customer Signature:" });
    nodes.push({ type: "text_line", content: "____________________________" });
  }

  // ── Barcode ───────────────────────────────────────────────────────────
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "barcode", data: data.refundNumber });
  nodes.push({
    type: "text_line",
    content: sanitizeForPrint(data.refundNumber),
    align: "center",
  });

  nodes.push({ type: "feed", lines: 4 });
  nodes.push({ type: "cut" });
  return { nodes, maxCharsPerLine: WIDTH };
}
