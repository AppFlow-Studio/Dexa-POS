/**
 * VoidOrderDocumentTemplate
 *
 * Builds a PrintDocument for a customer-facing Void Order receipt.
 * Follows the same pattern as NoSaleDocumentTemplate.
 */

import { PrintDocument, PrintNode } from "@/types/print-document";
import { ReceiptTemplateConfig } from "@/types/receipt-template";

export interface VoidOrderItemData {
  name: string;
  quantity: number;
  price: number;
}

export interface VoidOrderReceiptData {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  orderNumber: string;
  serverName?: string;
  employeeName?: string;
  items: VoidOrderItemData[];
  subtotal: number;
  reason?: string;
  approvedBy?: string;
  timestamp: string; // ISO
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

export function buildVoidOrderDocument(
  data: VoidOrderReceiptData,
  config?: ReceiptTemplateConfig,
): PrintDocument {
  const w = 32;
  const nodes: PrintNode[] = [];

  // Optional custom header text
  if (config?.headerText) {
    nodes.push({
      type: "text_line",
      content: config.headerText,
      align: "center",
      format: { bold: true },
    });
    nodes.push({ type: "empty_line" });
  }

  // Header: ** VOID ORDER ** (bold double-height)
  nodes.push({
    type: "text_line",
    content: "** VOID ORDER **",
    align: "center",
    format: { bold: true, doubleHeight: true },
  });
  nodes.push({ type: "empty_line" });

  // Divider
  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  // Store info
  nodes.push({
    type: "text_line",
    content: data.storeName,
    align: "center",
    format: { bold: true },
  });
  if (data.storeAddress) {
    nodes.push({
      type: "text_line",
      content: data.storeAddress,
      align: "center",
    });
  }
  if (data.storePhone) {
    nodes.push({
      type: "text_line",
      content: data.storePhone,
      align: "center",
    });
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // Order info (order number / date / time / server)
  const date = new Date(data.timestamp);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  nodes.push({
    type: "two_column",
    left: "Order:",
    right: data.orderNumber,
    lineWidth: w,
  });
  nodes.push({
    type: "two_column",
    left: "Date:",
    right: dateStr,
    lineWidth: w,
  });
  nodes.push({
    type: "two_column",
    left: "Time:",
    right: timeStr,
    lineWidth: w,
  });
  if (data.serverName) {
    nodes.push({
      type: "two_column",
      left: "Server:",
      right: data.serverName,
      lineWidth: w,
    });
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // Items list
  if (data.items.length === 0) {
    nodes.push({
      type: "text_line",
      content: "(no items)",
      align: "center",
    });
  } else {
    for (const item of data.items) {
      const qtyName = `${item.quantity}x ${item.name}`;
      nodes.push({
        type: "two_column",
        left: truncate(qtyName, w - 10),
        right: formatMoney(item.price * item.quantity),
        lineWidth: w,
      });
    }
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // Totals
  nodes.push({
    type: "two_column",
    left: "Subtotal:",
    right: formatMoney(data.subtotal),
    lineWidth: w,
    format: { bold: true },
  });

  nodes.push({ type: "empty_line" });

  // Void reason (gated by showVoidReason)
  const showVoidReason = config?.showVoidReason ?? true;
  if (showVoidReason && data.reason) {
    nodes.push({
      type: "two_column",
      left: "Reason:",
      right: truncate(data.reason, w - 10),
      lineWidth: w,
      format: { bold: true },
    });
  }

  // Approved by (gated by showApprovedBy)
  const showApprovedBy = config?.showApprovedBy ?? true;
  if (showApprovedBy && data.approvedBy) {
    nodes.push({
      type: "two_column",
      left: "Approved By:",
      right: truncate(data.approvedBy, w - 14),
      lineWidth: w,
    });
  }

  // Footer
  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  nodes.push({
    type: "text_line",
    content: "THIS ORDER HAS BEEN VOIDED",
    align: "center",
    format: { bold: true },
  });

  if (config?.footerText) {
    nodes.push({ type: "empty_line" });
    nodes.push({
      type: "text_line",
      content: config.footerText,
      align: "center",
    });
  }

  nodes.push({ type: "empty_line" });
  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: w };
}
