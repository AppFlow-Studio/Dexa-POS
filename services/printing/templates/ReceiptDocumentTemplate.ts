import { PrintDocument, PrintNode, PrintTextFormat } from "@/types/print-document";
import { ReceiptTemplateData } from "@/types/printer";
import { formatCurrency } from "@/utils/currency";

/**
 * Build format that scales down magnification to fit content on one line.
 * Priority: doubleWidth+doubleHeight → doubleHeight only → normal bold.
 */
function scaledFormat(
  text: string,
  lineWidth: number,
  desired: { doubleWidth?: boolean; doubleHeight?: boolean; inverted?: boolean },
): PrintTextFormat {
  const base: PrintTextFormat = { bold: true };
  if (desired.inverted) base.inverted = true;

  if (desired.doubleWidth && text.length <= Math.floor(lineWidth / 2)) {
    return { ...base, doubleHeight: desired.doubleHeight, doubleWidth: true };
  }
  if (desired.doubleHeight && text.length <= lineWidth) {
    return { ...base, doubleHeight: true };
  }
  return base;
}

/**
 * Builds a PrintDocument for a receipt.
 * Layout matches the sales receipt mockup with conditional flags from templateConfig.
 *
 * Visual hierarchy: bold is reserved for headers, item lines, totals, and key labels.
 * Secondary/informational text (modifiers, notes, subtotals, payment details, footer meta)
 * uses regular weight for contrast.
 */
export function buildReceiptDocument(data: ReceiptTemplateData): PrintDocument {
  const w = 32;
  const nodes: PrintNode[] = [];
  const cfg = data.templateConfig;

  // ── Logo ──
  if (cfg?.showLogo !== false && data.logoBase64) {
    nodes.push({ type: "image", base64Png: data.logoBase64 });
    nodes.push({ type: "empty_line" });
  }

  // ── Store Header ──
  nodes.push({
    type: "text_line",
    content: data.storeName,
    align: "center",
    format: scaledFormat(data.storeName, w, { doubleHeight: true }),
  });

  if (data.storeAddress) {
    nodes.push({ type: "text_line", content: data.storeAddress, align: "center", format: { bold: true } });
  }
  if (data.storePhone) {
    nodes.push({ type: "text_line", content: data.storePhone, align: "center", format: { bold: true } });
  }

  // ── Header message (from template) ──
  if (data.headerMessage) {
    nodes.push({ type: "text_line", content: data.headerMessage, align: "center", format: { bold: true } });
  }

  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  // ── Prominent Order Number ──
  nodes.push({ type: "empty_line" });
  const orderNumText = `${data.orderNumber} `;
  nodes.push({
    type: "text_line",
    content: orderNumText,
    align: "center",
    format: scaledFormat(orderNumText, w, { doubleHeight: true, doubleWidth: true, inverted: true }),
  });
  nodes.push({ type: "empty_line" });
  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  // ── Order Info ──
  // Combined order type + table on one line
  if (cfg?.showOrderType !== false) {
    const typeLine = data.tableName
      ? `${data.orderType} - ${data.tableName}`
      : data.orderType;
    nodes.push({ type: "text_line", content: typeLine, format: { bold: true } });
  }

  if (data.customerName) {
    nodes.push({
      type: "two_column",
      left: "Customer:",
      right: data.customerName,
      lineWidth: w,
      format: { bold: true },
    });
  }
  if (cfg?.showServerName !== false && data.serverName) {
    nodes.push({ type: "text_line", content: `Server: ${data.serverName}`, format: { bold: true } });
  }

  // Date + Time line
  nodes.push({
    type: "two_column",
    left: data.orderDate,
    right: data.orderTime,
    lineWidth: w,
    format: { bold: true },
  });

  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  // ── Items ──
  for (const item of data.items) {
    if (item.isVoided) continue;

    const qty = `${item.quantity}x `;
    let itemName = `${qty}${item.name}`;
    const itemPrice = formatCurrency(item.price);
    const maxNameLen = w - itemPrice.length - 1;
    if (itemName.length > maxNameLen) {
      itemName = itemName.slice(0, maxNameLen);
    }

    nodes.push({ type: "two_column", left: itemName, right: itemPrice, lineWidth: w, format: { bold: true } });

    // Modifiers (conditional) — regular weight for contrast
    if (cfg?.showItemModifiers !== false) {
      for (const mod of item.modifiers) {
        const isNo = !!mod.isNo;
        const prefix = isNo ? "-" : "+";
        const modLine = isNo
          ? `  ${prefix} NO ${mod.name}`
          : mod.price > 0
            ? `  ${prefix} ${mod.name} (${formatCurrency(mod.price)})`
            : `  ${prefix} ${mod.name}`;
        nodes.push({ type: "text_line", content: modLine });
      }
    }

    // Notes — regular weight
    if (item.notes) {
      nodes.push({ type: "text_line", content: `  Note: ${item.notes}` });
    }
  }

  // ── Totals ──
  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  nodes.push({ type: "text_line", content: "TOTALS", align: "center", format: { bold: true } });
  nodes.push({ type: "divider", style: "solid", lineWidth: w });

  // Subtotal/tax/discount/tip — regular weight for contrast with totals
  nodes.push({
    type: "two_column",
    left: "Subtotal",
    right: formatCurrency(data.subtotal),
    lineWidth: w,
  });

  if (data.tax > 0) {
    const taxLabel =
      cfg?.showTaxBreakdown !== false && data.taxRate
        ? `Tax (${(data.taxRate * 100).toFixed(2)}%)`
        : "Tax";
    nodes.push({
      type: "two_column",
      left: taxLabel,
      right: formatCurrency(data.tax),
      lineWidth: w,
    });
  }
  if (data.discount > 0) {
    nodes.push({
      type: "two_column",
      left: "Discount",
      right: `-${formatCurrency(data.discount)}`,
      lineWidth: w,
    });
  }
  if (data.tip > 0) {
    nodes.push({
      type: "two_column",
      left: "Tip",
      right: formatCurrency(data.tip),
      lineWidth: w,
    });
  }

  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  const cardTotalLine = `Card Total  ${formatCurrency(data.total)}`;
  nodes.push({
    type: "two_column",
    left: "Card Total",
    right: formatCurrency(data.total),
    lineWidth: w,
    format: scaledFormat(cardTotalLine, w, { doubleHeight: true }),
  });

  // Cash total (only if different from card total)
  if (data.cashTotal !== undefined && data.cashTotal !== data.total) {
    const cashTotalLine = `Cash Total  ${formatCurrency(data.cashTotal)}`;
    nodes.push({
      type: "two_column",
      left: "Cash Total",
      right: formatCurrency(data.cashTotal),
      lineWidth: w,
      format: scaledFormat(cashTotalLine, w, { doubleHeight: true }),
    });
  }

  // ── Tip line (blank for customer to fill in) ──
  if (cfg?.showTipLine !== false) {
    nodes.push({ type: "divider", style: "solid", lineWidth: w });
    nodes.push({
      type: "two_column",
      left: "Tip:",
      right: "________",
      lineWidth: w,
      format: { bold: true },
    });
    const tipTotalLine = "Total w/ Tip:  ________";
    nodes.push({
      type: "two_column",
      left: "Total w/ Tip:",
      right: "________",
      lineWidth: w,
      format: scaledFormat(tipTotalLine, w, { doubleHeight: true }),
    });
  }

  // ── Payments ──
  if (data.payments.length > 0) {
    nodes.push({ type: "divider", style: "solid", lineWidth: w });

    for (const payment of data.payments) {
      nodes.push({
        type: "two_column",
        left: `Paid: ${payment.method}`,
        right: formatCurrency(payment.amount),
        lineWidth: w,
        format: { bold: true },
      });
      // Payment detail lines — regular weight for contrast
      if (payment.last4) {
        const cardLine = payment.cardBrand
          ? `  ${payment.cardBrand} ending in ${payment.last4}`
          : `  ${payment.method} ending in ${payment.last4}`;
        nodes.push({ type: "text_line", content: cardLine });
      }
      if (payment.authCode) {
        nodes.push({ type: "two_column", left: "  Auth #", right: payment.authCode, lineWidth: w });
      }
      if (payment.rrn) {
        nodes.push({ type: "two_column", left: "  Ref (RRN)", right: payment.rrn, lineWidth: w });
      }
    }

    if (data.amountPaid && data.amountPaid > 0) {
      nodes.push({ type: "divider", style: "solid", lineWidth: w });
      nodes.push({
        type: "two_column",
        left: "Amount Paid",
        right: formatCurrency(data.amountPaid),
        lineWidth: w,
        format: { bold: true },
      });
    }
    if (data.amountDue && data.amountDue > 0) {
      nodes.push({
        type: "two_column",
        left: "Amount Due",
        right: formatCurrency(data.amountDue),
        lineWidth: w,
        format: { bold: true },
      });
    }
  }

  // ── Order Details Footer — regular weight ──
  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  nodes.push({ type: "empty_line" });

  if (data.backendOrderNumber) {
    nodes.push({ type: "two_column", left: "Order #", right: data.backendOrderNumber, lineWidth: w });
  } else {
    nodes.push({ type: "two_column", left: "Order #", right: data.orderNumber, lineWidth: w });
  }
  nodes.push({ type: "two_column", left: "Ordered", right: `${data.orderDate}, ${data.orderTime}`, lineWidth: w });
  if (data.printDate && data.printTime) {
    nodes.push({ type: "two_column", left: "Printed", right: `${data.printDate}, ${data.printTime}`, lineWidth: w });
  }
  if (data.serverName) {
    nodes.push({ type: "two_column", left: "Server", right: data.serverName, lineWidth: w });
  }
  if (data.customerName) {
    nodes.push({ type: "two_column", left: "Customer", right: data.customerName, lineWidth: w });
  }

  nodes.push({ type: "empty_line" });
  nodes.push({ type: "text_line", content: "Customer Copy", align: "center", format: { bold: true } });

  // ── Footer ──
  if (data.footerMessage) {
    nodes.push({ type: "divider", style: "solid", lineWidth: w });
    nodes.push({ type: "text_line", content: data.footerMessage, align: "center", format: { bold: true } });
  }

  // ── Barcode ──
  if (cfg?.showBarcode !== false && data.orderNumber) {
    nodes.push({ type: "empty_line" });
    nodes.push({ type: "barcode", data: data.orderNumber });
  }

  // ── QR Code ──
  if (cfg?.showQrCode !== false && data.orderNumber) {
    nodes.push({ type: "empty_line" });
    nodes.push({ type: "qr_code", data: data.orderNumber, size: 6 });
  }

  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: w };
}
