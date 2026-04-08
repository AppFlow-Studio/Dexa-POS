/**
 * TimeSheetDocumentTemplate
 *
 * Builds a PrintDocument for an employee time-sheet receipt.
 * Follows the same pattern as NoSaleDocumentTemplate.
 */

import { PrintDocument, PrintNode } from "@/types/print-document";
import { ReceiptTemplateConfig } from "@/types/receipt-template";
import { sanitizeForPrint, safeTimeString } from "../utils/sanitizeText";

export interface TimeSheetShiftData {
  date: string; // formatted date, e.g. "01/15/2026"
  clockIn: string;
  clockOut: string;
  breakInitiated?: string;
  breakEnded?: string;
  durationHours: number;
}

export interface TimeSheetReceiptData {
  storeName: string;
  storeAddress?: string;
  employeeName: string;
  employeeRole?: string;
  dateRangeLabel?: string;
  shifts: TimeSheetShiftData[];
  totalHours: number;
  timestamp: string; // ISO (print time)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

export function buildTimeSheetDocument(
  data: TimeSheetReceiptData,
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
    content: "** TIME SHEET **",
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

  // Employee info
  nodes.push({
    type: "two_column",
    left: "Employee:",
    right: truncate(sanitizeForPrint(data.employeeName), w - 11),
    lineWidth: w,
    format: { bold: true },
  });
  if (data.employeeRole) {
    nodes.push({
      type: "two_column",
      left: "Role:",
      right: truncate(sanitizeForPrint(data.employeeRole), w - 7),
      lineWidth: w,
    });
  }

  // Date range
  if (data.dateRangeLabel) {
    nodes.push({
      type: "two_column",
      left: "Period:",
      right: data.dateRangeLabel,
      lineWidth: w,
    });
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // Shifts
  const showBreakDetails = config?.showBreakDetails ?? true;

  if (data.shifts.length === 0) {
    nodes.push({
      type: "text_line",
      content: "(no shifts)",
      align: "center",
    });
  } else {
    for (let i = 0; i < data.shifts.length; i++) {
      const shift = data.shifts[i];

      // Date row (bold)
      nodes.push({
        type: "text_line",
        content: shift.date,
        align: "left",
        format: { bold: true },
      });

      // In / Out
      nodes.push({
        type: "two_column",
        left: "  In:",
        right: shift.clockIn,
        lineWidth: w,
      });
      nodes.push({
        type: "two_column",
        left: "  Out:",
        right: shift.clockOut,
        lineWidth: w,
      });

      // Break row (if present and enabled)
      if (
        showBreakDetails &&
        shift.breakInitiated &&
        shift.breakEnded &&
        shift.breakInitiated !== "N/A"
      ) {
        nodes.push({
          type: "two_column",
          left: "  Break:",
          right: `${shift.breakInitiated}-${shift.breakEnded}`,
          lineWidth: w,
        });
      }

      // Total for shift
      nodes.push({
        type: "two_column",
        left: "  Total:",
        right: `${shift.durationHours.toFixed(2)} h`,
        lineWidth: w,
      });

      if (i < data.shifts.length - 1) {
        nodes.push({ type: "empty_line" });
      }
    }
  }

  // Totals
  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  nodes.push({
    type: "two_column",
    left: "TOTAL HOURS:",
    right: `${data.totalHours.toFixed(2)} h`,
    lineWidth: w,
    format: { bold: true, doubleHeight: true },
  });
  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  // Print timestamp footer
  const printedAt = new Date(data.timestamp);
  const printedStr =
    printedAt.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }) +
    " " +
    safeTimeString(printedAt);

  nodes.push({
    type: "text_line",
    content: `Printed: ${printedStr}`,
    align: "center",
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
