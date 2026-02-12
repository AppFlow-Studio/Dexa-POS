import { ReceiptTemplateData } from "@/types/printer";
import { formatCurrency } from "@/utils/currency";
import { EscPosBuilder } from "../escpos/EscPosBuilder";

/**
 * Builds ESC/POS commands for a receipt.
 * Layout matches the sales receipt mockup with conditional flags from templateConfig.
 */
export function buildReceiptCommands(data: ReceiptTemplateData): Uint8Array {
  const w = data.maxCharsPerLine;
  const b = new EscPosBuilder();
  const cfg = data.templateConfig;

  b.initialize();

  // ── Store Header ──
  b.alignCenter();
  b.bold(true);
  b.doubleSize(true);
  b.textLine(data.storeName);
  b.doubleSize(false);
  b.bold(false);

  if (data.storeAddress) {
    b.textLine(data.storeAddress);
  }
  if (data.storePhone) {
    b.textLine(data.storePhone);
  }

  b.alignLeft();
  b.doubleLine(w);

  // ── Header message (from template) ──
  if (data.headerMessage) {
    b.alignCenter();
    b.textLine(data.headerMessage);
    b.alignLeft();
    b.dottedLine(w);
  }

  // ── Order Info ──
  // Order # and date on same two-column line
  b.twoColumnRow(`Order #${data.orderNumber}`, data.orderDate, w);

  // Combined order type + table on one line
  if (cfg?.showOrderType !== false) {
    const typeLine = data.tableName
      ? `${data.orderType} - ${data.tableName}`
      : data.orderType;
    b.textLine(typeLine);
  }

  if (data.customerName) {
    b.twoColumnRow("Customer:", data.customerName, w);
  }
  if (cfg?.showServerName !== false && data.serverName) {
    b.textLine(`Server: ${data.serverName}`);
  }

  b.dottedLine(w);

  // ── Items ──
  for (const item of data.items) {
    if (item.isVoided) continue;

    const qty = `${item.quantity}x `;
    const itemName = `${qty}${item.name}`;
    const itemPrice = formatCurrency(item.price);

    b.twoColumnRow(itemName, itemPrice, w);

    // Modifiers (conditional)
    if (cfg?.showItemModifiers !== false) {
      for (const mod of item.modifiers) {
        const modPrice = mod.price > 0 ? formatCurrency(mod.price) : "";
        const modText = `  + ${mod.name}`;
        if (modPrice) {
          b.twoColumnRow(modText, modPrice, w);
        } else {
          b.textLine(modText);
        }
      }
    }

    // Notes
    if (item.notes) {
      b.textLine(`  Note: ${item.notes}`);
    }
  }

  b.dottedLine(w);

  // ── Totals ──
  b.twoColumnRow("Subtotal", formatCurrency(data.subtotal), w);

  if (data.tax > 0) {
    const taxLabel =
      cfg?.showTaxBreakdown !== false && data.taxRate
        ? `Tax (${(data.taxRate * 100).toFixed(2)}%)`
        : "Tax";
    b.twoColumnRow(taxLabel, formatCurrency(data.tax), w);
  }
  if (data.discount > 0) {
    b.twoColumnRow("Discount", `-${formatCurrency(data.discount)}`, w);
  }
  if (data.tip > 0) {
    b.twoColumnRow("Tip", formatCurrency(data.tip), w);
  }

  b.doubleLine(w);
  b.bold(true);
  b.twoColumnRow("Total", formatCurrency(data.total), w);
  b.bold(false);

  // Cash prices section (only if different)
  if (
    data.cashTotal !== undefined &&
    data.cashTotal !== data.total
  ) {
    b.dottedLine(w);
    b.twoColumnRow("Subtotal (Cash)", formatCurrency(data.cashSubtotal ?? 0), w);

    if ((data.cashTax ?? 0) > 0) {
      const cashTaxLabel =
        cfg?.showTaxBreakdown !== false && data.taxRate
          ? `Tax (${(data.taxRate * 100).toFixed(2)}%)`
          : "Tax";
      b.twoColumnRow(cashTaxLabel, formatCurrency(data.cashTax ?? 0), w);
    }
    if (data.discount > 0) {
      b.twoColumnRow("Discount", `-${formatCurrency(data.discount)}`, w);
    }
    if (data.tip > 0) {
      b.twoColumnRow("Tip", formatCurrency(data.tip), w);
    }

    b.doubleLine(w);
    b.bold(true);
    b.twoColumnRow("Total (Cash)", formatCurrency(data.cashTotal), w);
    b.bold(false);
  }

  // ── Tip line (blank for customer to fill in) ──
  if (cfg?.showTipLine !== false) {
    b.dottedLine(w);
    b.twoColumnRow("Tip:", "________", w);
    b.twoColumnRow("Total w/ Tip:", "________", w);
  }

  // ── Payments ──
  if (data.payments.length > 0) {
    b.dottedLine(w);

    for (const payment of data.payments) {
      b.twoColumnRow(`Paid: ${payment.method}`, formatCurrency(payment.amount), w);
      if (payment.last4) {
        b.textLine(`  ${payment.method} ending in ${payment.last4}`);
      }
    }

    if (data.amountPaid && data.amountPaid > 0) {
      b.dottedLine(w);
      b.twoColumnRow("Amount Paid", formatCurrency(data.amountPaid), w);
    }
    if (data.amountDue && data.amountDue > 0) {
      b.twoColumnRow("Amount Due", formatCurrency(data.amountDue), w);
    }
  }

  b.dottedLine(w);

  // ── Footer ──
  b.alignCenter();
  if (data.footerMessage) {
    b.textLine(data.footerMessage);
  }

  b.alignLeft();
  b.cut();

  return b.build();
}
