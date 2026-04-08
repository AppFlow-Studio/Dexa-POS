/**
 * NoSaleDocumentTemplate
 *
 * Builds a PrintDocument for No Sale receipt printing.
 * Follows the same pattern as ReceiptDocumentTemplate.
 */

import { PrintDocument, PrintNode } from "@/types/print-document";
import { ReceiptTemplateConfig } from "@/types/receipt-template";
import { sanitizeForPrint, safeTimeString } from "../utils/sanitizeText";

export interface NoSaleReceiptData {
  storeName: string;
  storeAddress?: string;
  drawerName: string;
  stationName: string;
  employeeName: string;
  reason: string;
  approvedBy?: string;
  timestamp: string; // ISO
}

export function buildNoSaleDocument(
  data: NoSaleReceiptData,
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

  // Header
  nodes.push({
    type: "text_line",
    content: "** NO SALE **",
    align: "center",
    format: { bold: true, doubleHeight: true },
  });
  nodes.push({ type: "empty_line" });

  // Divider
  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  // Store info
  nodes.push({
    type: "text_line",
    content: sanitizeForPrint(data.storeName),
    align: "center",
    format: { bold: true },
  });
  if (data.storeAddress) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(data.storeAddress),
      align: "center",
    });
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // Details
  const date = new Date(data.timestamp);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const timeStr = safeTimeString(date);

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
  nodes.push({
    type: "two_column",
    left: "Employee:",
    right: sanitizeForPrint(data.employeeName),
    lineWidth: w,
  });
  nodes.push({
    type: "two_column",
    left: "Drawer:",
    right: sanitizeForPrint(data.drawerName),
    lineWidth: w,
  });
  nodes.push({
    type: "two_column",
    left: "Station:",
    right: sanitizeForPrint(data.stationName),
    lineWidth: w,
  });

  nodes.push({ type: "empty_line" });

  nodes.push({
    type: "two_column",
    left: "Reason:",
    right: sanitizeForPrint(data.reason),
    lineWidth: w,
    format: { bold: true },
  });

  // Gate "Approved By" by the showApprovedBy flag (default true when no config)
  const showApprovedBy = config?.showApprovedBy ?? true;
  if (data.approvedBy && showApprovedBy) {
    nodes.push({
      type: "two_column",
      left: "Approved By:",
      right: sanitizeForPrint(data.approvedBy),
      lineWidth: w,
    });
  }

  // Footer
  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  nodes.push({
    type: "text_line",
    content: "NOT A TRANSACTION",
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
