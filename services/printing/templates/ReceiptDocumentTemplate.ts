import { PrintDocument, PrintNode } from "@/types/print-document";
import { ReceiptTemplateData } from "@/types/printer";
import { formatCurrency } from "@/utils/currency";

/**
 * Builds a PrintDocument for a receipt.
 * Mirrors the exact layout of ReceiptTemplate.ts but outputs PrintNode[] instead of ESC/POS bytes.
 */
export function buildReceiptDocument(data: ReceiptTemplateData): PrintDocument {
  const w = data.maxCharsPerLine;
  const nodes: PrintNode[] = [];

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

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // ── Order Info ──
  nodes.push({ type: "two_column", left: "Order #:", right: data.orderNumber, lineWidth: w });
  nodes.push({ type: "two_column", left: "Date:", right: data.orderDate, lineWidth: w });
  nodes.push({ type: "two_column", left: "Time:", right: data.orderTime, lineWidth: w });
  nodes.push({ type: "two_column", left: "Type:", right: data.orderType, lineWidth: w });

  if (data.tableName) {
    nodes.push({ type: "two_column", left: "Table:", right: data.tableName, lineWidth: w });
  }
  if (data.customerName) {
    nodes.push({ type: "two_column", left: "Customer:", right: data.customerName, lineWidth: w });
  }
  if (data.serverName) {
    nodes.push({ type: "two_column", left: "Server:", right: data.serverName, lineWidth: w });
  }

  nodes.push({ type: "divider", style: "double", lineWidth: w });

  // ── Items ──
  for (const item of data.items) {
    if (item.isVoided) continue;

    const qty = item.quantity > 1 ? `${item.quantity}x ` : "";
    const itemName = `${qty}${item.name}`;
    const itemPrice = formatCurrency(item.price);

    nodes.push({ type: "two_column", left: itemName, right: itemPrice, lineWidth: w });

    // Cash price if different
    if (item.cashPrice !== undefined && item.cashPrice !== item.price) {
      nodes.push({ type: "text_line", content: `  Cash: ${formatCurrency(item.cashPrice)}` });
    }

    // Modifiers
    for (const mod of item.modifiers) {
      const modPrice = mod.price > 0 ? formatCurrency(mod.price) : "";
      const modText = `  + ${mod.name}`;
      if (modPrice) {
        nodes.push({ type: "two_column", left: modText, right: modPrice, lineWidth: w });
      } else {
        nodes.push({ type: "text_line", content: modText });
      }
    }

    // Notes
    if (item.notes) {
      nodes.push({ type: "text_line", content: `  Note: ${item.notes}` });
    }
  }

  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // ── Totals ──
  nodes.push({ type: "text_line", content: "Card Price" });
  nodes.push({ type: "two_column", left: "Subtotal", right: formatCurrency(data.subtotal), lineWidth: w });

  if (data.tax > 0) {
    nodes.push({ type: "two_column", left: "Tax", right: formatCurrency(data.tax), lineWidth: w });
  }
  if (data.discount > 0) {
    nodes.push({ type: "two_column", left: "Discount", right: `-${formatCurrency(data.discount)}`, lineWidth: w });
  }
  if (data.tip > 0) {
    nodes.push({ type: "two_column", left: "Tip", right: formatCurrency(data.tip), lineWidth: w });
  }

  nodes.push({ type: "divider", style: "solid", lineWidth: w });
  nodes.push({
    type: "two_column",
    left: "TOTAL (Card)",
    right: formatCurrency(data.total),
    lineWidth: w,
    format: { bold: true },
  });

  // Cash prices section (only if different)
  if (data.cashTotal !== undefined && data.cashTotal !== data.total) {
    nodes.push({ type: "empty_line" });
    nodes.push({ type: "divider", style: "dotted", lineWidth: w });
    nodes.push({ type: "text_line", content: "Cash Price" });
    nodes.push({
      type: "two_column",
      left: "Subtotal",
      right: formatCurrency(data.cashSubtotal ?? 0),
      lineWidth: w,
    });

    if ((data.cashTax ?? 0) > 0) {
      nodes.push({
        type: "two_column",
        left: "Tax",
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
      nodes.push({ type: "two_column", left: "Tip", right: formatCurrency(data.tip), lineWidth: w });
    }

    nodes.push({ type: "divider", style: "solid", lineWidth: w });
    nodes.push({
      type: "two_column",
      left: "TOTAL (Cash)",
      right: formatCurrency(data.cashTotal),
      lineWidth: w,
      format: { bold: true },
    });
  }

  // ── Payments ──
  if (data.payments.length > 0) {
    nodes.push({ type: "divider", style: "dotted", lineWidth: w });
    nodes.push({ type: "text_line", content: "Payment", align: "center" });

    for (const payment of data.payments) {
      const methodText = payment.last4
        ? `${payment.method} ****${payment.last4}`
        : payment.method;
      nodes.push({ type: "two_column", left: methodText, right: formatCurrency(payment.amount), lineWidth: w });
    }

    if (data.amountPaid && data.amountPaid > 0) {
      nodes.push({ type: "divider", style: "dotted", lineWidth: w });
      nodes.push({ type: "two_column", left: "Amount Paid", right: formatCurrency(data.amountPaid), lineWidth: w });
    }
    if (data.amountDue && data.amountDue > 0) {
      nodes.push({ type: "two_column", left: "Amount Due", right: formatCurrency(data.amountDue), lineWidth: w });
    }
  }

  nodes.push({ type: "divider", style: "double", lineWidth: w });

  // ── Footer ──
  nodes.push({ type: "text_line", content: "Thank You!", align: "center", format: { bold: true } });

  if (data.footerMessage) {
    nodes.push({ type: "text_line", content: data.footerMessage, align: "center" });
  }

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  nodes.push({ type: "text_line", content: dateStr, align: "center" });
  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: w };
}
