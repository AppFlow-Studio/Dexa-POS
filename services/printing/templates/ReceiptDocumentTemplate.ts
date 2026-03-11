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
  desired: { doubleWidth?: boolean; doubleHeight?: boolean },
): PrintTextFormat {
  if (desired.doubleWidth && text.length <= Math.floor(lineWidth / 2)) {
    return { bold: true, doubleHeight: desired.doubleHeight, doubleWidth: true };
  }
  if (desired.doubleHeight && text.length <= lineWidth) {
    return { bold: true, doubleHeight: true };
  }
  return { bold: true };
}

/**
 * Builds a PrintDocument for a receipt.
 * Layout matches the sales receipt mockup with conditional flags from templateConfig.
 */
export function buildReceiptDocument(data: ReceiptTemplateData): PrintDocument {
  const w = data.maxCharsPerLine;
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
    nodes.push({ type: "text_line", content: data.storeAddress, align: "center" });
  }
  if (data.storePhone) {
    nodes.push({ type: "text_line", content: data.storePhone, align: "center" });
  }

  // ── Header message (from template) ──
  if (data.headerMessage) {
    nodes.push({ type: "text_line", content: data.headerMessage, align: "center" });
  }

  nodes.push({ type: "divider", style: "double", lineWidth: w });

  // ── Order Info ──
  // Order # and date on same two-column line
  nodes.push({
    type: "two_column",
    left: `Order #${data.orderNumber}`,
    right: data.orderDate,
    lineWidth: w,
    format: { bold: true },
  });

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

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

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

    // Modifiers (conditional)
    if (cfg?.showItemModifiers !== false) {
      for (const mod of item.modifiers) {
        const modPrice = mod.price > 0 ? formatCurrency(mod.price) : "";
        const modText = `  + ${mod.name}`;
        if (modPrice) {
          nodes.push({ type: "two_column", left: modText, right: modPrice, lineWidth: w });
        } else {
          nodes.push({ type: "text_line", content: modText });
        }
      }
    }

    // Notes
    if (item.notes) {
      nodes.push({ type: "text_line", content: `  Note: ${item.notes}` });
    }
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // ── Totals ──
  nodes.push({
    type: "two_column",
    left: "Subtotal",
    right: formatCurrency(data.subtotal),
    lineWidth: w,
    format: { bold: true },
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
      format: { bold: true },
    });
  }
  if (data.discount > 0) {
    nodes.push({
      type: "two_column",
      left: "Discount",
      right: `-${formatCurrency(data.discount)}`,
      lineWidth: w,
      format: { bold: true },
    });
  }
  if (data.tip > 0) {
    nodes.push({
      type: "two_column",
      left: "Tip",
      right: formatCurrency(data.tip),
      lineWidth: w,
      format: { bold: true },
    });
  }

  nodes.push({ type: "divider", style: "double", lineWidth: w });
  const totalLine = `Total  ${formatCurrency(data.total)}`;
  nodes.push({
    type: "two_column",
    left: "Total",
    right: formatCurrency(data.total),
    lineWidth: w,
    format: scaledFormat(totalLine, w, { doubleHeight: true }),
  });

  // Cash prices section (only if different)
  if (data.cashTotal !== undefined && data.cashTotal !== data.total) {
    nodes.push({ type: "divider", style: "dotted", lineWidth: w });
    nodes.push({
      type: "two_column",
      left: "Subtotal (Cash)",
      right: formatCurrency(data.cashSubtotal ?? 0),
      lineWidth: w,
      format: { bold: true },
    });

    if ((data.cashTax ?? 0) > 0) {
      const cashTaxLabel =
        cfg?.showTaxBreakdown !== false && data.taxRate
          ? `Tax (${(data.taxRate * 100).toFixed(2)}%)`
          : "Tax";
      nodes.push({
        type: "two_column",
        left: cashTaxLabel,
        right: formatCurrency(data.cashTax ?? 0),
        lineWidth: w,
        format: { bold: true },
      });
    }
    if (data.discount > 0) {
      nodes.push({
        type: "two_column",
        left: "Discount",
        right: `-${formatCurrency(data.discount)}`,
        lineWidth: w,
        format: { bold: true },
      });
    }
    if (data.tip > 0) {
      nodes.push({
        type: "two_column",
        left: "Tip",
        right: formatCurrency(data.tip),
        lineWidth: w,
        format: { bold: true },
      });
    }

    nodes.push({ type: "divider", style: "double", lineWidth: w });
    const cashTotalLine = `Total (Cash)  ${formatCurrency(data.cashTotal)}`;
    nodes.push({
      type: "two_column",
      left: "Total (Cash)",
      right: formatCurrency(data.cashTotal),
      lineWidth: w,
      format: scaledFormat(cashTotalLine, w, { doubleHeight: true }),
    });
  }

  // ── Tip line (blank for customer to fill in) ──
  if (cfg?.showTipLine !== false) {
    nodes.push({ type: "divider", style: "dotted", lineWidth: w });
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
    nodes.push({ type: "divider", style: "dotted", lineWidth: w });

    for (const payment of data.payments) {
      nodes.push({
        type: "two_column",
        left: `Paid: ${payment.method}`,
        right: formatCurrency(payment.amount),
        lineWidth: w,
        format: { bold: true },
      });
      if (payment.last4) {
        nodes.push({
          type: "text_line",
          content: `  ${payment.method} ending in ${payment.last4}`,
        });
      }
    }

    if (data.amountPaid && data.amountPaid > 0) {
      nodes.push({ type: "divider", style: "dotted", lineWidth: w });
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

  // ── Footer ──
  if (data.footerMessage) {
    nodes.push({ type: "divider", style: "dotted", lineWidth: w });
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
