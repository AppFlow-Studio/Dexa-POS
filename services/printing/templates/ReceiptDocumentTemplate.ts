import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
import { ReceiptItemData, ReceiptTemplateData } from "@/types/printer";
import { formatCurrency } from "@/utils/currency";
import { sanitizeForPrint } from "../utils/sanitizeText";

const BOLD: PrintTextFormat = { bold: true };
// Bold + doubleWidth — wider chars for the TOTAL header to create visual hierarchy.
// On Landi VectorPrinter: bold=true (native weight) + scaleX=2.0 (wider).
const BOLD_DW: PrintTextFormat = { bold: true, doubleWidth: true };
// 2x size for order number — visually prominent on all printers.
// Star: fitFormat() auto-reduces if overflow. Dejavoo: maps to <LG>. Landi: scaleX/Y=2.0.
const ORDER_NUM: PrintTextFormat = { bold: true, doubleHeight: true, doubleWidth: true };

function isDineIn(orderType: string | undefined): boolean {
  if (!orderType) return true;
  const lower = orderType.toLowerCase().replace(/[\s_-]+/g, "");
  return lower === "dinein" || lower === "dinein";
}

/**
 * Builds a receipt document optimized for both Star and Landi printers.
 *
 * Bold formatting baseline with doubleHeight/doubleWidth only for the order number.
 * Landi receipts stay compact while the order number stands out at 2x size.
 * Star gets visible bold emphasis via weight 700 + stroke.
 *
 * Layout: Header → Order# → Type/Table → Items → Totals → Grand Total →
 *         Tip Line → Payments → Bottom Metadata → Footer
 */
export function buildReceiptDocument(data: ReceiptTemplateData): PrintDocument {
  const w = data.maxCharsPerLine || 32;
  const nodes: PrintNode[] = [];
  const cfg = data.templateConfig;

  // ── A. Store Header ──
  if (cfg?.showLogo !== false && data.logoBase64) {
    nodes.push({ type: "image", base64Png: data.logoBase64 });
  }
  nodes.push({ type: "text_line", content: sanitizeForPrint(data.storeName), align: "center", format: BOLD });
  if (data.storeAddress) {
    nodes.push({ type: "text_line", content: sanitizeForPrint(data.storeAddress), align: "center" });
  }
  if (data.storePhone) {
    nodes.push({ type: "text_line", content: sanitizeForPrint(data.storePhone), align: "center" });
  }
  if (data.headerMessage) {
    nodes.push({ type: "text_line", content: sanitizeForPrint(data.headerMessage), align: "center" });
  }
  nodes.push({ type: "empty_line" });

  // ── B. Order Number (centered, 2x size for prominence) ──
  nodes.push({
    type: "text_line",
    content: data.orderNumber,
    align: "center",
    format: ORDER_NUM,
  });

  // ── C. Order Type + Table (centered, bold) ──
  if (cfg?.showOrderType !== false) {
    const typeLine = data.tableName
      ? `${sanitizeForPrint(data.orderType)} - ${sanitizeForPrint(data.tableName)}`
      : sanitizeForPrint(data.orderType);
    nodes.push({ type: "text_line", content: typeLine, align: "center", format: BOLD });
  }

  // ── D. Items ──
  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  const useSeatGrouping = cfg?.groupBySeat && isDineIn(data.orderType);
  if (useSeatGrouping) {
    pushReceiptItemsGroupedBySeat(nodes, data.items, w, cfg);
  } else {
    pushReceiptItemsFlat(nodes, data.items, w, cfg);
  }

  // ── E. Totals (centered labels, price right) ──
  // centerLabel pads the left side so the label sits roughly centered
  // between the left edge and the price, while two_column keeps the price flush-right.
  const cl = (label: string, priceLen: number) => {
    const gap = w - label.length - priceLen;
    if (gap <= 2) return label;
    return " ".repeat(Math.floor(gap / 2)) + label;
  };

  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  const subtotalPrice = formatCurrency(data.subtotal);
  nodes.push({ type: "two_column", left: cl("Subtotal", subtotalPrice.length), right: subtotalPrice, lineWidth: w });
  if (data.tax > 0) {
    const taxLabel =
      cfg?.showTaxBreakdown !== false && data.taxRate
        ? `Tax (${(data.taxRate * 100).toFixed(2)}%)`
        : "Tax";
    const taxPrice = formatCurrency(data.tax);
    nodes.push({ type: "two_column", left: cl(taxLabel, taxPrice.length), right: taxPrice, lineWidth: w });
  }
  if (data.discount > 0) {
    const discountPrice = `-${formatCurrency(data.discount)}`;
    nodes.push({ type: "two_column", left: cl("Discount", discountPrice.length), right: discountPrice, lineWidth: w });
  }
  if (data.tip > 0) {
    const tipPrice = formatCurrency(data.tip);
    nodes.push({ type: "two_column", left: cl("Tip", tipPrice.length), right: tipPrice, lineWidth: w });
  }

  // ── F. Grand Total ──
  nodes.push({ type: "divider", style: "double", lineWidth: w });
  nodes.push({ type: "text_line", content: "TOTAL", format: BOLD_DW });
  const hasDualPricing = data.cashTotal !== undefined && data.cashTotal !== data.total;
  if (hasDualPricing) {
    const cardPrice = formatCurrency(data.total);
    const cashPrice = formatCurrency(data.cashTotal!);
    nodes.push({ type: "two_column", left: cl("Card Total", cardPrice.length), right: cardPrice, lineWidth: w, format: BOLD });
    nodes.push({ type: "two_column", left: cl("Cash Total", cashPrice.length), right: cashPrice, lineWidth: w, format: BOLD });
  } else {
    const totalPrice = formatCurrency(data.total);
    nodes.push({ type: "two_column", left: cl("Total", totalPrice.length), right: totalPrice, lineWidth: w, format: BOLD });
  }
  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  // ── G. Tip Line ──
  if (cfg?.showTipLine !== false) {
    nodes.push({ type: "two_column", left: "Tip:", right: "________", lineWidth: w });
    nodes.push({ type: "two_column", left: "Total w/ Tip:", right: "________", lineWidth: w, format: BOLD });
    nodes.push({ type: "divider", style: "solid", lineWidth: w });
  }

  // ── H. Payments ──
  if (data.payments.length > 0) {
    for (const payment of data.payments) {
      nodes.push({ type: "two_column", left: `Paid: ${payment.method}`, right: formatCurrency(payment.amount), lineWidth: w, format: BOLD });
      if (payment.last4) {
        const card = payment.cardBrand ? `${payment.cardBrand} *${payment.last4}` : `*${payment.last4}`;
        nodes.push({ type: "text_line", content: `  ${card}` });
      }
      if (payment.authCode) {
        nodes.push({ type: "text_line", content: `  Auth: ${payment.authCode}` });
      }
      if (payment.rrn) {
        nodes.push({ type: "text_line", content: `  Ref: ${payment.rrn}` });
      }
    }
    if (data.amountPaid && data.amountPaid > 0) {
      nodes.push({ type: "two_column", left: "Amount Paid", right: formatCurrency(data.amountPaid), lineWidth: w });
    }
    if (data.amountDue && data.amountDue > 0) {
      nodes.push({ type: "two_column", left: "Amount Due", right: formatCurrency(data.amountDue), lineWidth: w, format: BOLD });
    }
  }

  // ── I. Bottom Metadata ──
  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  if (cfg?.showServerName !== false && data.serverName) {
    nodes.push({ type: "two_column", left: "Server:", right: sanitizeForPrint(data.serverName), lineWidth: w });
  }
  if (data.customerName) {
    nodes.push({ type: "two_column", left: "Customer:", right: sanitizeForPrint(data.customerName), lineWidth: w });
  }
  nodes.push({ type: "two_column", left: "Date:", right: `${data.orderDate} ${data.orderTime}`, lineWidth: w });
  if (data.printDate && data.printTime) {
    nodes.push({ type: "text_line", content: `Printed: ${data.printDate}, ${data.printTime}`, align: "center" });
  }

  // ── J. Footer ──
  if (data.footerMessage) {
    nodes.push({ type: "text_line", content: sanitizeForPrint(data.footerMessage), align: "center" });
  }
  if (cfg?.showBarcode !== false && data.orderNumber) {
    nodes.push({ type: "barcode", data: data.orderNumber });
  }
  if (cfg?.showQrCode !== false && data.orderNumber) {
    nodes.push({ type: "qr_code", data: data.orderNumber, size: 6 });
  }

  // ── K. Feed + Cut ──
  nodes.push({ type: "feed", lines: 4 });
  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: w };
}

// ============================================================================
// ITEM HELPERS
// ============================================================================

function pushReceiptSingleItem(
  nodes: PrintNode[],
  item: ReceiptItemData,
  w: number,
  cfg: ReceiptTemplateData["templateConfig"],
): void {
  if (item.isVoided) return;

  const qty = `${item.quantity}x `;
  let itemName = `${qty}${sanitizeForPrint(item.name)}`;
  const itemPrice = formatCurrency(item.price);
  const maxNameLen = w - itemPrice.length - 1;
  if (itemName.length > maxNameLen) {
    itemName = itemName.slice(0, maxNameLen);
  }

  nodes.push({ type: "two_column", left: itemName, right: itemPrice, lineWidth: w, format: BOLD });

  if (cfg?.showItemModifiers !== false) {
    for (const mod of item.modifiers) {
      const prefix = mod.isNo ? "- NO " : "+ ";
      const modName = sanitizeForPrint(mod.name);
      const modLine = mod.isNo || mod.price <= 0
        ? `  ${prefix}${modName}`
        : `  ${prefix}${modName} (${formatCurrency(mod.price)})`;
      nodes.push({ type: "text_line", content: modLine });
    }
  }

  if (item.notes) {
    nodes.push({ type: "text_line", content: `  Note: ${sanitizeForPrint(item.notes)}` });
  }
}

function pushReceiptItemsFlat(
  nodes: PrintNode[],
  items: ReceiptItemData[],
  w: number,
  cfg: ReceiptTemplateData["templateConfig"],
): void {
  for (const item of items) {
    pushReceiptSingleItem(nodes, item, w, cfg);
  }
}

function pushReceiptItemsGroupedBySeat(
  nodes: PrintNode[],
  items: ReceiptItemData[],
  w: number,
  cfg: ReceiptTemplateData["templateConfig"],
): void {
  const groups = new Map<string, ReceiptItemData[]>();
  for (const item of items) {
    const seat = item.seatNumber != null ? `SEAT ${item.seatNumber}` : "SHARED";
    if (!groups.has(seat)) {
      groups.set(seat, []);
    }
    groups.get(seat)!.push(item);
  }

  // If all items are in one group (e.g. all SHARED), skip the header
  if (groups.size === 1) {
    const items = [...groups.values()][0];
    for (const item of items) {
      pushReceiptSingleItem(nodes, item, w, cfg);
    }
    return;
  }

  let isFirst = true;
  for (const [seat, seatItems] of groups) {
    if (!isFirst) {
      nodes.push({ type: "divider", style: "solid", lineWidth: w });
    }
    isFirst = false;

    nodes.push({ type: "text_line", content: `-- ${seat} --`, align: "center", format: BOLD });

    for (const item of seatItems) {
      pushReceiptSingleItem(nodes, item, w, cfg);
    }
  }
}
