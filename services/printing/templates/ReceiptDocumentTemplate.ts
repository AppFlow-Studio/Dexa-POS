import { PrintDocument, PrintNode } from "@/types/print-document";
import { ReceiptTemplateData } from "@/types/printer";
import { formatCurrency } from "@/utils/currency";

/**
 * Builds a PrintDocument for a receipt.
 * Layout matches the sales receipt mockup with conditional flags from templateConfig.
 */
export function buildReceiptDocument(data: ReceiptTemplateData): PrintDocument {
  const w = data.maxCharsPerLine;
  const nodes: PrintNode[] = [];
  const cfg = data.templateConfig;

  // ── Store Header ──
  nodes.push({
    type: "text_line",
    content: data.storeName,
    align: "center",
    format: { bold: true, doubleHeight: true, doubleWidth: true },
  });

  if (data.storeAddress) {
    nodes.push({ type: "text_line", content: data.storeAddress, align: "center" });
  }
  if (data.storePhone) {
    nodes.push({ type: "text_line", content: data.storePhone, align: "center" });
  }

  nodes.push({ type: "divider", style: "double", lineWidth: w });

  // ── Header message (from template) ──
  if (data.headerMessage) {
    nodes.push({ type: "text_line", content: data.headerMessage, align: "center" });
    nodes.push({ type: "divider", style: "dotted", lineWidth: w });
  }

  // ── Order Info ──
  // Order # and date on same two-column line
  nodes.push({
    type: "two_column",
    left: `Order #${data.orderNumber}`,
    right: data.orderDate,
    lineWidth: w,
  });

  // Combined order type + table on one line
  if (cfg?.showOrderType !== false) {
    const typeLine = data.tableName
      ? `${data.orderType} - ${data.tableName}`
      : data.orderType;
    nodes.push({ type: "text_line", content: typeLine });
  }

  if (data.customerName) {
    nodes.push({
      type: "two_column",
      left: "Customer:",
      right: data.customerName,
      lineWidth: w,
    });
  }
  if (cfg?.showServerName !== false && data.serverName) {
    nodes.push({ type: "text_line", content: `Server: ${data.serverName}` });
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // ── Items ──
  for (const item of data.items) {
    if (item.isVoided) continue;

    const qty = `${item.quantity}x `;
    const itemName = `${qty}${item.name}`;
    const itemPrice = formatCurrency(item.price);

    nodes.push({ type: "two_column", left: itemName, right: itemPrice, lineWidth: w });

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

  nodes.push({ type: "divider", style: "double", lineWidth: w });
  nodes.push({
    type: "two_column",
    left: "Total",
    right: formatCurrency(data.total),
    lineWidth: w,
    format: { bold: true },
  });

  // Cash prices section (only if different)
  if (data.cashTotal !== undefined && data.cashTotal !== data.total) {
    nodes.push({ type: "divider", style: "dotted", lineWidth: w });
    nodes.push({
      type: "two_column",
      left: "Subtotal (Cash)",
      right: formatCurrency(data.cashSubtotal ?? 0),
      lineWidth: w,
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

    nodes.push({ type: "divider", style: "double", lineWidth: w });
    nodes.push({
      type: "two_column",
      left: "Total (Cash)",
      right: formatCurrency(data.cashTotal),
      lineWidth: w,
      format: { bold: true },
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
    });
    nodes.push({
      type: "two_column",
      left: "Total w/ Tip:",
      right: "________",
      lineWidth: w,
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
      });
    }
    if (data.amountDue && data.amountDue > 0) {
      nodes.push({
        type: "two_column",
        left: "Amount Due",
        right: formatCurrency(data.amountDue),
        lineWidth: w,
      });
    }
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // ── Footer ──
  if (data.footerMessage) {
    nodes.push({ type: "text_line", content: data.footerMessage, align: "center" });
  }

  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: w };
}
