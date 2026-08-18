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
  storePhone?: string;
  logoBase64?: string | null;
  refundNumber: string;
  orderNumber: string;
  orderDate: string;
  refundDate: string;
  items: RefundReceiptLineItem[];
  customAmountLabel?: string;
  totalRefunded: number;
  paymentMethod: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  approvalStatus?: string | null;
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

function negativeMoney(value: number): string {
  return `-${money(value)}`;
}

function truncate(value: string, max: number): string {
  const clean = sanitizeForPrint(value);
  return clean.length <= max ? clean : clean.slice(0, Math.max(1, max - 3)) + "...";
}

function row(
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

/**
 * Renders only precomputed refund values. All allocation and balance arithmetic
 * belongs in RefundReceiptService so print drivers cannot disagree.
 */
export function buildRefundReceiptDocument(
  data: RefundReceiptData,
  config?: ReceiptTemplateConfig,
): PrintDocument {
  const nodes: PrintNode[] = [];
  const merchantCopy = data.copyLabel === "Merchant Copy";

  if (config?.showLogo !== false && data.logoBase64) {
    nodes.push({ type: "image", base64Png: data.logoBase64 });
  }
  nodes.push({
    type: "text_line",
    content: sanitizeForPrint(data.storeName),
    align: "center",
    format: BOLD,
  });
  if (data.storeAddress) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(data.storeAddress),
      align: "center",
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

  nodes.push({ type: "empty_line" });
  nodes.push({
    type: "text_line",
    content: "*** REFUND ***",
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
  nodes.push({
    type: "text_line",
    content: data.copyLabel ?? "Customer Copy",
    align: "center",
    format: BOLD,
  });
  nodes.push({ type: "divider", style: "double", lineWidth: WIDTH });

  row(nodes, "Refund #", data.refundNumber, BOLD);
  row(nodes, "Original Order", data.orderNumber);
  row(nodes, "Order Date", data.orderDate);
  row(nodes, "Refund Date", data.refundDate);

  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
  if (data.items.length > 0) {
    for (const item of data.items) {
      nodes.push({
        type: "two_column",
        left: truncate(`${item.quantity}x ${item.name}`, 28),
        right: negativeMoney(item.amount),
        lineWidth: WIDTH,
      });
    }
  } else {
    nodes.push({
      type: "two_column",
      left: data.customAmountLabel ?? "Custom refund",
      right: negativeMoney(data.totalRefunded),
      lineWidth: WIDTH,
    });
  }

  nodes.push({ type: "divider", style: "double", lineWidth: WIDTH });
  nodes.push({
    type: "two_column",
    left: "TOTAL REFUNDED",
    right: negativeMoney(data.totalRefunded),
    lineWidth: WIDTH,
    format: BOLD,
  });

  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
  row(nodes, "Method", data.paymentMethod, BOLD);
  const cardLabel = [data.cardBrand, data.cardLast4 ? `*${data.cardLast4}` : null]
    .filter(Boolean)
    .join(" ");
  row(nodes, "Card", cardLabel || null);
  row(nodes, "Status", data.approvalStatus);
  row(nodes, "Refund RRN", data.refundRrn);
  row(nodes, "Batch", data.batchNumber);
  row(nodes, "Invoice", data.invoiceNumber);
  row(nodes, "Terminal", data.terminalId);
  row(nodes, "Original RRN", data.originalRrn);

  if (data.reason) {
    nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
    row(nodes, "Reason", data.reason);
  }

  nodes.push({ type: "divider", style: "solid", lineWidth: WIDTH });
  row(nodes, "Original Payment", money(data.originalPaymentAmount));
  row(nodes, "Refunded To Date", money(data.refundedToDate));
  row(nodes, "Remaining Refundable", money(data.remainingRefundable), BOLD);

  nodes.push({ type: "empty_line" });
  if (data.paymentMethod.toLowerCase() !== "cash") {
    nodes.push({
      type: "text_line",
      content: "Credit timing depends on your card issuer.",
      align: "center",
    });
  }

  if (merchantCopy) {
    nodes.push({ type: "empty_line" });
    nodes.push({ type: "text_line", content: "Customer Signature:" });
    nodes.push({ type: "text_line", content: "____________________________" });
  } else if (config?.showQrCode !== false && data.hostedReceiptUrl) {
    nodes.push({ type: "qr_code", data: data.hostedReceiptUrl, size: 6 });
  }

  if (config?.footerText) {
    nodes.push({ type: "empty_line" });
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(config.footerText),
      align: "center",
    });
  }

  nodes.push({ type: "feed", lines: 4 });
  nodes.push({ type: "cut" });
  return { nodes, maxCharsPerLine: WIDTH };
}
