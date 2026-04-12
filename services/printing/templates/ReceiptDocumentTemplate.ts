// import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
// import { ReceiptItemData, ReceiptTemplateData } from "@/types/printer";
// import { formatCurrency } from "@/utils/currency";
// import { sanitizeForPrint } from "../utils/sanitizeText";

// const BOLD: PrintTextFormat = { bold: true };
// // Bold + doubleWidth — wider chars for the TOTAL header to create visual hierarchy.
// // On Landi VectorPrinter: bold=true (native weight) + scaleX=2.0 (wider).
// const BOLD_DW: PrintTextFormat = { bold: true, doubleWidth: true };
// // 2x size for order number — visually prominent on all printers.
// // Star: fitFormat() auto-reduces if overflow. Dejavoo: maps to <LG>. Landi: scaleX/Y=2.0.
// const ORDER_NUM: PrintTextFormat = { bold: true, doubleHeight: true, doubleWidth: true };

// function isDineIn(orderType: string | undefined): boolean {
//   if (!orderType) return true;
//   const lower = orderType.toLowerCase().replace(/[\s_-]+/g, "");
//   return lower === "dinein" || lower === "dinein";
// }

// /**
//  * Builds a receipt document optimized for both Star and Landi printers.
//  *
//  * Bold formatting baseline with doubleHeight/doubleWidth only for the order number.
//  * Landi receipts stay compact while the order number stands out at 2x size.
//  * Star gets visible bold emphasis via weight 700 + stroke.
//  *
//  * Layout: Header → Order# → Type/Table → Items → Totals → Grand Total →
//  *         Tip Line → Payments → Bottom Metadata → Footer
//  */
// export function buildReceiptDocument(data: ReceiptTemplateData): PrintDocument {
//   const w = data.maxCharsPerLine || 32;
//   const nodes: PrintNode[] = [];
//   const cfg = data.templateConfig;

//   // ── A. Store Header ──
//   if (cfg?.showLogo !== false && data.logoBase64) {
//     nodes.push({ type: "image", base64Png: data.logoBase64 });
//   }
//   nodes.push({ type: "text_line", content: sanitizeForPrint(data.storeName), align: "center", format: BOLD });
//   if (data.storeAddress) {
//     nodes.push({ type: "text_line", content: sanitizeForPrint(data.storeAddress), align: "center" });
//   }
//   if (data.storePhone) {
//     nodes.push({ type: "text_line", content: sanitizeForPrint(data.storePhone), align: "center" });
//   }
//   if (data.headerMessage) {
//     nodes.push({ type: "text_line", content: sanitizeForPrint(data.headerMessage), align: "center" });
//   }
//   nodes.push({ type: "empty_line" });

//   // ── B. Order Number (centered, 2x size for prominence) ──
//   nodes.push({
//     type: "text_line",
//     content: data.orderNumber,
//     align: "center",
//     format: ORDER_NUM,
//   });

//   // ── C. Order Type + Table (centered, bold) ──
//   if (cfg?.showOrderType !== false) {
//     const typeLine = data.tableName
//       ? `${sanitizeForPrint(data.orderType)} - ${sanitizeForPrint(data.tableName)}`
//       : sanitizeForPrint(data.orderType);
//     nodes.push({ type: "text_line", content: typeLine, align: "center", format: BOLD });
//   }

//   // ── D. Items ──
//   nodes.push({ type: "divider", style: "solid", lineWidth: w });

//   const useSeatGrouping = cfg?.groupBySeat && isDineIn(data.orderType);
//   if (useSeatGrouping) {
//     pushReceiptItemsGroupedBySeat(nodes, data.items, w, cfg);
//   } else {
//     pushReceiptItemsFlat(nodes, data.items, w, cfg);
//   }

//   // ── E. Totals (centered labels, price right) ──
//   // centerLabel pads the left side so the label sits roughly centered
//   // between the left edge and the price, while two_column keeps the price flush-right.
//   const cl = (label: string, priceLen: number) => {
//     const gap = w - label.length - priceLen;
//     if (gap <= 2) return label;
//     return " ".repeat(Math.floor(gap / 2)) + label;
//   };

//   nodes.push({ type: "divider", style: "solid", lineWidth: w });
//   const subtotalPrice = formatCurrency(data.subtotal);
//   nodes.push({ type: "two_column", left: cl("Subtotal", subtotalPrice.length), right: subtotalPrice, lineWidth: w });
//   if (data.tax > 0) {
//     const taxLabel =
//       cfg?.showTaxBreakdown !== false && data.taxRate
//         ? `Tax (${(data.taxRate * 100).toFixed(2)}%)`
//         : "Tax";
//     const taxPrice = formatCurrency(data.tax);
//     nodes.push({ type: "two_column", left: cl(taxLabel, taxPrice.length), right: taxPrice, lineWidth: w });
//   }
//   if (data.discount > 0) {
//     const discountPrice = `-${formatCurrency(data.discount)}`;
//     nodes.push({ type: "two_column", left: cl("Discount", discountPrice.length), right: discountPrice, lineWidth: w });
//   }
//   if (data.tip > 0) {
//     const tipPrice = formatCurrency(data.tip);
//     nodes.push({ type: "two_column", left: cl("Tip", tipPrice.length), right: tipPrice, lineWidth: w });
//   }

//   // ── F. Grand Total ──
//   nodes.push({ type: "divider", style: "double", lineWidth: w, weight: "bold" });
//   nodes.push({ type: "text_line", content: "TOTAL", format: BOLD_DW });
//   const hasDualPricing = data.cashTotal !== undefined && data.cashTotal !== data.total;
//   if (hasDualPricing) {
//     const cardPrice = formatCurrency(data.total);
//     const cashPrice = formatCurrency(data.cashTotal!);
//     nodes.push({ type: "two_column", left: cl("Card Total", cardPrice.length), right: cardPrice, lineWidth: w, format: BOLD });
//     nodes.push({ type: "two_column", left: cl("Cash Total", cashPrice.length), right: cashPrice, lineWidth: w, format: BOLD });
//   } else {
//     const totalPrice = formatCurrency(data.total);
//     nodes.push({ type: "two_column", left: cl("Total", totalPrice.length), right: totalPrice, lineWidth: w, format: BOLD });
//   }
//   nodes.push({ type: "divider", style: "solid", lineWidth: w });

//   // ── G. Tip Line ──
//   if (cfg?.showTipLine !== false) {
//     nodes.push({ type: "two_column", left: "Tip:", right: "________", lineWidth: w });
//     nodes.push({ type: "two_column", left: "Total w/ Tip:", right: "________", lineWidth: w, format: BOLD });
//     nodes.push({ type: "divider", style: "solid", lineWidth: w });
//   }

//   // ── H. Payments ──
//   if (data.payments.length > 0) {
//     for (const payment of data.payments) {
//       nodes.push({ type: "two_column", left: `Paid: ${payment.method}`, right: formatCurrency(payment.amount), lineWidth: w, format: BOLD });
//       if (payment.last4) {
//         const card = payment.cardBrand ? `${payment.cardBrand} *${payment.last4}` : `*${payment.last4}`;
//         nodes.push({ type: "text_line", content: `  ${card}` });
//       }
//       if (payment.authCode) {
//         nodes.push({ type: "text_line", content: `  Auth: ${payment.authCode}` });
//       }
//       if (payment.rrn) {
//         nodes.push({ type: "text_line", content: `  Ref: ${payment.rrn}` });
//       }
//     }
//     if (data.amountPaid && data.amountPaid > 0) {
//       nodes.push({ type: "two_column", left: "Amount Paid", right: formatCurrency(data.amountPaid), lineWidth: w });
//     }
//     if (data.amountDue && data.amountDue > 0) {
//       nodes.push({ type: "two_column", left: "Amount Due", right: formatCurrency(data.amountDue), lineWidth: w, format: BOLD });
//     }
//   }

//   // ── I. Bottom Metadata ──
//   nodes.push({ type: "divider", style: "solid", lineWidth: w });
//   if (cfg?.showServerName !== false && data.serverName) {
//     nodes.push({ type: "two_column", left: "Server:", right: sanitizeForPrint(data.serverName), lineWidth: w });
//   }
//   if (data.customerName) {
//     nodes.push({ type: "two_column", left: "Customer:", right: sanitizeForPrint(data.customerName), lineWidth: w });
//   }
//   nodes.push({ type: "two_column", left: "Date:", right: `${data.orderDate} ${data.orderTime}`, lineWidth: w });
//   if (data.printDate && data.printTime) {
//     nodes.push({ type: "text_line", content: `Printed: ${data.printDate}, ${data.printTime}`, align: "center" });
//   }

//   // ── J. Footer ──
//   if (data.footerMessage) {
//     nodes.push({ type: "text_line", content: sanitizeForPrint(data.footerMessage), align: "center" });
//   }
//   if (cfg?.showBarcode !== false && data.orderNumber) {
//     nodes.push({ type: "barcode", data: data.orderNumber });
//   }
//   if (cfg?.showQrCode !== false && data.orderNumber) {
//     nodes.push({ type: "qr_code", data: data.orderNumber, size: 6 });
//   }

//   // ── K. Feed + Cut ──
//   nodes.push({ type: "feed", lines: 4 });
//   nodes.push({ type: "cut" });

//   return { nodes, maxCharsPerLine: w };
// }
// //  still not flush aligned only the sections A and I are flush aligned if that help   

// // ============================================================================
// // ITEM HELPERS
// // ============================================================================

// function pushReceiptSingleItem(
//   nodes: PrintNode[],
//   item: ReceiptItemData,
//   w: number,
//   cfg: ReceiptTemplateData["templateConfig"],
// ): void {
//   if (item.isVoided) return;

//   const qty = `${item.quantity}x `;
//   let itemName = `${qty}${sanitizeForPrint(item.name)}`;
//   const itemPrice = formatCurrency(item.price);
//   const maxNameLen = w - itemPrice.length - 1;
//   if (itemName.length > maxNameLen) {
//     itemName = itemName.slice(0, maxNameLen);
//   }

//   nodes.push({ type: "two_column", left: itemName, right: itemPrice, lineWidth: w, format: BOLD });

//   if (cfg?.showItemModifiers !== false) {
//     for (const mod of item.modifiers) {
//       const prefix = mod.isNo ? "- NO " : "+ ";
//       const modName = sanitizeForPrint(mod.name);
//       const modLine = mod.isNo || mod.price <= 0
//         ? `  ${prefix}${modName}`
//         : `  ${prefix}${modName} (${formatCurrency(mod.price)})`;
//       nodes.push({ type: "text_line", content: modLine });
//     }
//   }

//   if (item.notes) {
//     nodes.push({ type: "text_line", content: `  Note: ${sanitizeForPrint(item.notes)}` });
//   }
// }

// function pushReceiptItemsFlat(
//   nodes: PrintNode[],
//   items: ReceiptItemData[],
//   w: number,
//   cfg: ReceiptTemplateData["templateConfig"],
// ): void {
//   for (const item of items) {
//     pushReceiptSingleItem(nodes, item, w, cfg);
//   }
// }

// function pushReceiptItemsGroupedBySeat(
//   nodes: PrintNode[],
//   items: ReceiptItemData[],
//   w: number,
//   cfg: ReceiptTemplateData["templateConfig"],
// ): void {
//   const groups = new Map<string, ReceiptItemData[]>();
//   for (const item of items) {
//     const seat = item.seatNumber != null ? `SEAT ${item.seatNumber}` : "SHARED";
//     if (!groups.has(seat)) {
//       groups.set(seat, []);
//     }
//     groups.get(seat)!.push(item);
//   }

//   // If all items are in one group (e.g. all SHARED), skip the header
//   if (groups.size === 1) {
//     const items = [...groups.values()][0];
//     for (const item of items) {
//       pushReceiptSingleItem(nodes, item, w, cfg);
//     }
//     return;
//   }

//   let isFirst = true;
//   for (const [seat, seatItems] of groups) {
//     if (!isFirst) {
//       nodes.push({ type: "divider", style: "solid", lineWidth: w });
//     }
//     isFirst = false;

//     nodes.push({ type: "text_line", content: `-- ${seat} --`, align: "center", format: BOLD });

//     for (const item of seatItems) {
//       pushReceiptSingleItem(nodes, item, w, cfg);
//     }
//   }
// }

import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
import { ReceiptItemData, ReceiptTemplateData } from "@/types/printer";
import { formatCurrency } from "@/utils/currency";
import { sanitizeForPrint } from "../utils/sanitizeText";

// ============================================================================
// FORMAT PRESETS
// ============================================================================

const BOLD: PrintTextFormat = { bold: true };
const BOLD_DW: PrintTextFormat = { bold: true, doubleWidth: true };
const ORDER_NUM: PrintTextFormat = { bold: true, doubleHeight: true, doubleWidth: true };

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

const DEFAULT_CPL = 48;
const MIN_COLUMN_GAP = 2;
const ELLIPSIS = "..";
const CENTER_TRIGGER = 3;

// ============================================================================
// HELPERS
// ============================================================================

function isDineIn(orderType: string | undefined): boolean {
  if (!orderType) return true;
  return orderType.toLowerCase().replace(/[\s_-]+/g, "") === "dinein";
}

function truncate(s: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (s.length <= maxLen) return s;
  if (maxLen <= ELLIPSIS.length) return s.slice(0, maxLen);
  return s.slice(0, maxLen - ELLIPSIS.length).trimEnd() + ELLIPSIS;
}

function safeCurrency(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "$0.00";
  return formatCurrency(n);
}

/**
 * Builds a left-side string for a centered-label two_column row (Figure's
 * "subtotal" / "tax" pattern — label sits roughly mid-line, price flush right).
 *
 * Leading spaces here cross Kotlin's `wasCentered` trigger threshold (>=3),
 * which causes the Kotlin renderer to strip and re-center using its own CPL
 * constants. The exact leading-space count is informational.
 */
// function centeredLabel(label: string, priceLen: number, lineWidth: number): string {
//   const minNeeded = label.length + priceLen + MIN_COLUMN_GAP + CENTER_TRIGGER * 2;
//   if (lineWidth < minNeeded) return label;
//   const gap = lineWidth - label.length - priceLen;
//   const leadingSpaces = Math.max(CENTER_TRIGGER, Math.floor((gap - MIN_COLUMN_GAP) / 2));
//   return " ".repeat(leadingSpaces) + label;
// }

function validateAndDefault(data: ReceiptTemplateData): ReceiptTemplateData {
  if (!data) throw new Error("buildReceiptDocument: data is required");
  if (!Array.isArray(data.items)) {
    throw new Error("buildReceiptDocument: data.items must be an array");
  }
  if (!Array.isArray(data.payments)) return { ...data, payments: [] };
  return data;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Hybrid receipt: DEXA header (top) + Figure-style body (bottom).
 *
 * Layout:
 *   ┌─ TOP (current DEXA style) ────────────────────────────┐
 *   │ A. Store header block (logo, name, address, phone)    │
 *   │ B. Big bold order number (#S3-0008)                    │
 *   │ C. Order type / table (Takeaway / Dine In - Table 10) │
 *   ├─ SEAM ─────────────────────────────────────────────────┤
 *   │ D. Items (bold name left, bold price right)            │
 *   │ E. Subtotal/Tax/Discount/Tip (centered labels)         │
 *   │ F. Grand Total block (Total / Card / Cash)             │
 *   │ G. Tip write-in line                                   │
 *   │ H. Payments (conditional)                              │
 *   │ I. Metadata (Figure key/value style)                   │
 *   │ J. Footer (Customer Copy + Created with Dexa)          │
 *   │ K. Feed + Cut                                          │
 *   └────────────────────────────────────────────────────────┘
 */
export function buildReceiptDocument(data: ReceiptTemplateData): PrintDocument {
  const validated = validateAndDefault(data);
  const w = 32
  const cfg = validated.templateConfig;
  const nodes: PrintNode[] = [];
  const CENTER_TRIGGER = 3;

  // ── A. Store Header (UNCHANGED — DEXA top) ───────────────────────────
  if (cfg?.showLogo !== false && validated.logoBase64) {
    nodes.push({ type: "image", base64Png: validated.logoBase64 });
  }
  if (validated.storeName) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(validated.storeName),
      align: "center",
      format: BOLD,
    });
  }
  if (validated.storeAddress) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(validated.storeAddress),
      align: "center",
    });
  }
  if (validated.storePhone) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(validated.storePhone),
      align: "center",
    });
  }
  if (validated.headerMessage) {
    nodes.push({
      type: "text_line",
      content: sanitizeForPrint(validated.headerMessage),
      align: "center",
    });
  }
  nodes.push({ type: "empty_line" });

  // ── B. Big Order Number (UNCHANGED — DEXA top) ───────────────────────
  if (validated.orderNumber) {
    nodes.push({
      type: "text_line",
      content: validated.orderNumber,
      align: "center",
      format: ORDER_NUM,
    });
  }

  // ── C. Order Type + Table (UNCHANGED — DEXA top) ─────────────────────
  if (cfg?.showOrderType !== false && validated.orderType) {
    const typeLine = validated.tableName
      ? `${sanitizeForPrint(validated.orderType)} - ${sanitizeForPrint(validated.tableName)}`
      : sanitizeForPrint(validated.orderType);
    nodes.push({
      type: "text_line",
      content: typeLine,
      align: "center",
      format: BOLD,
    });
  }

  // ═══ SEAM: handoff from DEXA top to Figure body ══════════════════════
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "empty_line" });


  // ── D. Items (Figure style: bold name left, bold price right) ────────
  nodes.push({ type: "divider", style: "solid", lineWidth: w, weight: "bold" });
  nodes.push({ type: "empty_line" });
  if (validated.items.length === 0) {
    nodes.push({ type: "text_line", content: "(no items)", align: "center" });
  } else {
    const useSeatGrouping = cfg?.groupBySeat && isDineIn(validated.orderType);
    if (useSeatGrouping) {
      pushItemsGroupedBySeat(nodes, validated.items, w, cfg);
    } else {
      pushItemsFlat(nodes, validated.items, w, cfg);
    }
  }
  nodes.push({ type: "empty_line" });

  // ── E. Subtotal / Tax / Discount / Tip (Figure: centered labels) ─────
  nodes.push({ type: "divider", style: "solid", lineWidth: w, weight: "bold" });
  nodes.push({ type: "empty_line" });
  //  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  nodes.push({
    type: "two_column",
    left: "Subtotal",
    right: safeCurrency(validated.subtotal),
    lineWidth: w,
    labelAlign: "mid",
  });

  if ((validated.tax ?? 0) > 0) {
    const taxLabel =
      cfg?.showTaxBreakdown !== false && validated.taxRate
        ? `Tax (${(validated.taxRate * 100).toFixed(2)}%)`
        : "Tax";
    nodes.push({
      type: "two_column",
      left: taxLabel,
      right: safeCurrency(validated.tax),
      lineWidth: w,
      labelAlign: "mid",
    });
  }

  if ((validated.discount ?? 0) > 0) {
    nodes.push({
      type: "two_column",
      left: "Discount",
      right: `-${safeCurrency(validated.discount)}`,
      lineWidth: w,
      labelAlign: "mid",
    });
  }

  if ((validated.tip ?? 0) > 0) {
    nodes.push({
      type: "two_column",
      left: "Tip",
      right: safeCurrency(validated.tip),
      lineWidth: w,
      labelAlign: "mid",
    });
  }

  nodes.push({ type : 'empty_line' })
  // ── F. Grand Total (Figure: heavy rule, stacked totals, flush left) ──
  nodes.push({ type: "divider", style: "double", lineWidth: w, weight: "bold" });
  nodes.push({ type: "empty_line" });
  const hasDualPricing =
    validated.cashTotal !== undefined && validated.cashTotal !== validated.total;

  if (hasDualPricing) {
    const totalPrice = safeCurrency(validated.total);
    const cashPrice = safeCurrency(validated.cashTotal);
    // Figure pattern: "Total" (prominent) → "Card Total" / "Cash Total"
    // (slightly indented, same bold weight). Total is the headline, the
    // two below are the breakdown.
    nodes.push({
      type: "two_column",
      left: "Total",
      right: totalPrice,
      lineWidth: w,
      format: BOLD,
    });
    // Single leading space — does NOT trigger Kotlin's wasCentered (>=3).
    nodes.push({
      type: "two_column",
      left: " Card Total",
      right: totalPrice,
      lineWidth: w,
      format: BOLD,
      labelAlign: "mid",
    });
    nodes.push({
      type: "two_column",
      left: " Cash Total",
      right: cashPrice,
      lineWidth: w,
      format: BOLD,
      labelAlign: "mid",
    });
  } else {
    const totalPrice = safeCurrency(validated.total);
    nodes.push({
      type: "two_column",
      left: "Total",
      right: totalPrice,
      lineWidth: w,
      format: BOLD,
    });
  }

  // ── G. Tip Write-In Line ─────────────────────────────────────────────
  if (cfg?.showTipLine !== false) {
    // nodes.push({ type: "divider", style: "solid", lineWidth: w });
    nodes.push({ type: "empty_line" });
    nodes.push({ type: "empty_line" });
    nodes.push({
      type: "two_column",
      left: "Tip:",
      right: "________",
      lineWidth: w,
    });
    nodes.push({
      type: "two_column",
      left: "Total w/ Tip:",
      right: "________",
      lineWidth: w,
      format: BOLD,
    });
  }

  // ── H. Payments (conditional) ────────────────────────────────────────
  if (validated.payments.length > 0) {
    // nodes.push({ type: "divider", style: "solid", lineWidth: w });
    nodes.push({ type: "empty_line" });
    nodes.push({ type: "empty_line" });
    for (const payment of validated.payments) {
      const methodLabel = `Paid: ${sanitizeForPrint(payment.method)}`;
      const paidPrice = safeCurrency(payment.amount);
      nodes.push({
        type: "two_column",
        left: truncate(methodLabel, w - paidPrice.length - MIN_COLUMN_GAP),
        right: paidPrice,
        lineWidth: w,
        format: BOLD,
      });
      if (payment.tipAmount && payment.tipAmount > 0) {
        nodes.push({
          type: "two_column",
          left: "  Tip",
          right: safeCurrency(payment.tipAmount),
          lineWidth: w,
        });
      }
      if (payment.last4) {
        const card = payment.cardBrand
          ? `${sanitizeForPrint(payment.cardBrand)} *${payment.last4}`
          : `*${payment.last4}`;
        nodes.push({ type: "text_line", content: truncate(`  ${card}`, w) });
      }
      if (payment.authCode) {
        nodes.push({
          type: "text_line",
          content: truncate(`  Auth: ${payment.authCode}`, w),
        });
      }
      if (payment.rrn) {
        nodes.push({
          type: "text_line",
          content: truncate(`  Ref: ${payment.rrn}`, w),
        });
      }
      if (payment.aid) {
        nodes.push({
          type: "text_line",
          content: truncate(`  AID: ${payment.aid}`, w),
        });
      }
      if (payment.amountTendered != null && payment.amountTendered > 0) {
        nodes.push({
          type: "two_column",
          left: "  Tendered",
          right: safeCurrency(payment.amountTendered),
          lineWidth: w,
        });
      }
      if (payment.changeGiven != null && payment.changeGiven > 0) {
        nodes.push({
          type: "two_column",
          left: "  Change",
          right: safeCurrency(payment.changeGiven),
          lineWidth: w,
        });
      }
    }
    if ((validated.amountPaid ?? 0) > 0) {
      nodes.push({
        type: "two_column",
        left: "Amount Paid",
        right: safeCurrency(validated.amountPaid),
        lineWidth: w,
      });
    }
    if ((validated.amountDue ?? 0) > 0) {
      nodes.push({
        type: "two_column",
        left: "Amount Due",
        right: safeCurrency(validated.amountDue),
        lineWidth: w,
        format: BOLD,
      });
    }
  }

  // ── I. Metadata (Figure key/value block — no "Order #" row, per spec) ─
  // nodes.push({ type: "divider", style: "solid", lineWidth: w });
  nodes.push({ type: "empty_line" });

  // All metadata values share the longest label width so rows align.
  // Longest label is "Date & Time of Print" = 20 chars.
  // Leave the rest of the line (w - 20 - 1 gap) for the value.
  // const META_VALUE_MAX = Math.max(8, w - 21);
  const META_VALUE_MAX = 27

  if (validated.orderDate || validated.orderTime) {
    const created = `${validated.orderDate ?? ""} ${validated.orderTime ?? ""}`.trim();
    nodes.push({
      type: "two_column",
      left: "Order Date",
      right: truncate(created, META_VALUE_MAX),
      lineWidth: w,
      labelAlign : 'meta'
    });
  }

  if (cfg?.showServerName !== false && validated.serverName) {
    nodes.push({
      type: "two_column",
      left: "Assignee",
      right: truncate(sanitizeForPrint(validated.serverName), META_VALUE_MAX),
      lineWidth: w,
      labelAlign : 'meta'
    });
  }

  const assignmentValue = validated.tableName
    ? sanitizeForPrint(validated.tableName)
    : validated.orderType
      ? sanitizeForPrint(validated.orderType)
      : null;
  if (assignmentValue) {
    nodes.push({
      type: "two_column",
      left: "Assignment",
      right: truncate(assignmentValue, META_VALUE_MAX),
      lineWidth: w,
      labelAlign : 'meta'
    });
  }

  if (validated.customerName) {
    nodes.push({
      type: "two_column",
      left: "Customer",
      right: truncate(sanitizeForPrint(validated.customerName), META_VALUE_MAX),
      lineWidth: w,
      labelAlign : 'meta'
    });
  }

  if (validated.printDate && validated.printTime) {
    const printed = `${validated.printDate}, ${validated.printTime}`;
    nodes.push({
      type: "two_column",
      left: "Date of Print",
      right: truncate(printed, META_VALUE_MAX),
      lineWidth: w,
      labelAlign : 'meta'
    });
  }


  // ── J. Footer (Figure restraint: big gap → Copy label → brand) ───────
  if (cfg?.showBarcode !== false && validated.orderNumber) {
    nodes.push({ type: "barcode", data: validated.orderNumber });
  }
  if (cfg?.showQrCode !== false && validated.orderNumber) {
    nodes.push({ type: "qr_code", data: validated.orderNumber, size: 6 });
  }

  // Big breathing gap before the footer — this is what makes Figure feel
  // premium vs. cramped. Don't reduce.
  nodes.push({ type: "feed", lines: 4 });

  const copyLabel = validated?.copyLabel ?? "Customer Copy";
  nodes.push({
    type: "text_line",
    content: copyLabel,
    align: "center",
    format: BOLD,
  });
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "empty_line" });
  nodes.push({
    type: "text_line",
    content: "Created with Dexa",
    align: "center",
    format: BOLD,
  });

  // ── K. Feed + Cut ────────────────────────────────────────────────────
  nodes.push({ type: "feed", lines: 5 });
  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: w };
}

// ============================================================================
// ITEM HELPERS (unchanged from previous fix pass)
// ============================================================================

function pushSingleItem(
  nodes: PrintNode[],
  item: ReceiptItemData,
  w: number,
  cfg: ReceiptTemplateData["templateConfig"],
): void {
  if (item.isVoided) return;

  const qty = `${item.quantity}x `;
  const fullName = `${qty}${sanitizeForPrint(item.name)}`;
  const itemPrice = safeCurrency(item.price);

  const maxNameLen = w - itemPrice.length - MIN_COLUMN_GAP;
  const itemName = truncate(fullName, maxNameLen);

  nodes.push({
    type: "two_column",
    left: itemName,
    right: itemPrice,
    lineWidth: w,
    format: BOLD,
  });

  if (cfg?.showItemModifiers !== false) {
    for (const mod of item.modifiers) {
      const prefix = mod.isNo ? "- NO " : "+ ";
      const modName = sanitizeForPrint(mod.name);
      const showPrice = !mod.isNo && mod.price !== 0;
      const modLine = showPrice
        ? `  ${prefix}${modName} (${safeCurrency(mod.price)})`
        : `  ${prefix}${modName}`;
      nodes.push({ type: "text_line", content: truncate(modLine, w) });
    }
  }

  if (item.notes) {
    const noteLine = `  Note: ${sanitizeForPrint(item.notes)}`;
    nodes.push({ type: "text_line", content: truncate(noteLine, w) });
  }
}

function pushItemsFlat(
  nodes: PrintNode[],
  items: ReceiptItemData[],
  w: number,
  cfg: ReceiptTemplateData["templateConfig"],
): void {
  for (const item of items) pushSingleItem(nodes, item, w, cfg);
}

function pushItemsGroupedBySeat(
  nodes: PrintNode[],
  items: ReceiptItemData[],
  w: number,
  cfg: ReceiptTemplateData["templateConfig"],
): void {
  const groups = new Map<string, ReceiptItemData[]>();
  for (const item of items) {
    const seat = item.seatNumber != null ? `SEAT ${item.seatNumber}` : "SHARED";
    if (!groups.has(seat)) groups.set(seat, []);
    groups.get(seat)!.push(item);
  }

  if (groups.size === 1) {
    const onlyItems = [...groups.values()][0];
    for (const item of onlyItems) pushSingleItem(nodes, item, w, cfg);
    return;
  }

  let isFirst = true;
  for (const [seat, seatItems] of groups) {
    if (!isFirst) {
      nodes.push({ type: "divider", style: "solid", lineWidth: w });
    }
    isFirst = false;
    nodes.push({
      type: "text_line",
      content: `-- ${seat} --`,
      align: "center",
      format: BOLD,
    });
    for (const item of seatItems) pushSingleItem(nodes, item, w, cfg);
  }
}