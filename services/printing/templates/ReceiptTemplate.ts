import { ReceiptTemplateData } from "@/types/printer";
import { formatCurrency } from "@/utils/currency";
import { EscPosBuilder } from "../escpos/EscPosBuilder";

/**
 * Builds ESC/POS commands for a receipt.
 * Layout matches the sales receipt mockup with conditional flags from templateConfig.
 */
export function buildReceiptCommands(data: ReceiptTemplateData): Uint8Array {
  const w = data.maxCharsPerLine || 32;
  const b = new EscPosBuilder();
  const cfg = data.templateConfig;

  b.initialize();

  // Increase thermal head heating time to achieve solid black characters
  b.setPrintDensity(7, 150, 2);

  // ── Store Header ──
  b.alignCenter();
  b.bold(true);
  b.doubleHeight(true);
  b.textLine(data.storeName);
  b.doubleHeight(false);
  b.bold(false);

  if (data.storeAddress) {
    b.bold(true);
    b.textLine(data.storeAddress);
    b.bold(false);
  }
  if (data.storePhone) {
    b.bold(true);
    b.textLine(data.storePhone);
    b.bold(false);
  }

  // ── Header message (from template) ──
  if (data.headerMessage) {
    b.bold(true);
    b.textLine(data.headerMessage);
    b.bold(false);
  }

  b.alignLeft();
  b.solidLine(w);

  // ── Prominent Order Number ──
  b.emptyLine();
  b.alignCenter();
  b.bold(true);
  b.inverted(true);
  b.doubleSize(true);
  b.textLine(`${data.orderNumber} `);
  b.doubleSize(false);
  b.inverted(false);
  b.bold(false);
  b.alignLeft();
  b.emptyLine();
  b.solidLine(w);

  // ── Order Info ──
  // Combined order type + table on one line
  if (cfg?.showOrderType !== false) {
    const typeLine = data.tableName
      ? `${data.orderType} - ${data.tableName}`
      : data.orderType;
    b.bold(true);
    b.textLine(typeLine);
    b.bold(false);
  }

  if (data.customerName) {
    b.bold(true);
    b.twoColumnRow("Customer:", data.customerName, w);
    b.bold(false);
  }
  if (cfg?.showServerName !== false && data.serverName) {
    b.bold(true);
    b.textLine(`Server: ${data.serverName}`);
    b.bold(false);
  }

  // Date + Time line
  b.bold(true);
  b.twoColumnRow(data.orderDate, data.orderTime, w);
  b.bold(false);

  b.solidLine(w);

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

    b.bold(true);
    b.doubleHeight(true);
    b.twoColumnRow(itemName, itemPrice, w);
    b.doubleHeight(false);
    b.bold(false);

    // Modifiers (conditional)
    if (cfg?.showItemModifiers !== false) {
      for (const mod of item.modifiers) {
        const modLine = mod.price > 0
          ? `  + ${mod.name} (${formatCurrency(mod.price)})`
          : `  + ${mod.name}`;
        b.bold(true);
        b.textLine(modLine);
        b.bold(false);
      }
    }

    // Notes
    if (item.notes) {
      b.bold(true);
      b.textLine(`  Note: ${item.notes}`);
      b.bold(false);
    }
  }

  // ── Totals ──
  b.solidLine(w);
  b.alignCenter();
  b.bold(true);
  b.textLine("TOTALS");
  b.bold(false);
  b.alignLeft();
  b.solidLine(w);

  b.bold(true);
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
  b.bold(false);

  b.solidLine(w);
  b.bold(true);
  b.doubleHeight(true);
  b.twoColumnRow("Card Total", formatCurrency(data.total), w);
  b.doubleHeight(false);

  // Cash total (only if different from card total)
  if (
    data.cashTotal !== undefined &&
    data.cashTotal !== data.total
  ) {
    b.doubleHeight(true);
    b.twoColumnRow("Cash Total", formatCurrency(data.cashTotal), w);
    b.doubleHeight(false);
  }
  b.bold(false);

  // ── Tip line (blank for customer to fill in) ──
  if (cfg?.showTipLine !== false) {
    b.solidLine(w);
    b.bold(true);
    b.twoColumnRow("Tip:", "________", w);
    b.bold(false);
    b.bold(true);
    b.doubleHeight(true);
    b.twoColumnRow("Total w/ Tip:", "________", w);
    b.doubleHeight(false);
    b.bold(false);
  }

  // ── Payments ──
  if (data.payments.length > 0) {
    b.solidLine(w);

    for (const payment of data.payments) {
      b.bold(true);
      b.twoColumnRow(`Paid: ${payment.method}`, formatCurrency(payment.amount), w);
      b.bold(false);
      if (payment.last4) {
        const cardLine = payment.cardBrand
          ? `  ${payment.cardBrand} ending in ${payment.last4}`
          : `  ${payment.method} ending in ${payment.last4}`;
        b.bold(true);
        b.textLine(cardLine);
        b.bold(false);
      }
      if (payment.authCode) {
        b.bold(true);
        b.twoColumnRow("  Auth #", payment.authCode, w);
        b.bold(false);
      }
      if (payment.rrn) {
        b.bold(true);
        b.twoColumnRow("  Ref (RRN)", payment.rrn, w);
        b.bold(false);
      }
    }

    if (data.amountPaid && data.amountPaid > 0) {
      b.solidLine(w);
      b.bold(true);
      b.twoColumnRow("Amount Paid", formatCurrency(data.amountPaid), w);
      b.bold(false);
    }
    if (data.amountDue && data.amountDue > 0) {
      b.bold(true);
      b.twoColumnRow("Amount Due", formatCurrency(data.amountDue), w);
      b.bold(false);
    }
  }

  // ── Order Details Footer ──
  b.solidLine(w);
  b.emptyLine();

  b.bold(true);
  if (data.backendOrderNumber) {
    b.twoColumnRow("Order #", data.backendOrderNumber, w);
  } else {
    b.twoColumnRow("Order #", data.orderNumber, w);
  }
  b.twoColumnRow("Ordered", `${data.orderDate}, ${data.orderTime}`, w);
  if (data.printDate && data.printTime) {
    b.twoColumnRow("Printed", `${data.printDate}, ${data.printTime}`, w);
  }
  if (data.serverName) {
    b.twoColumnRow("Server", data.serverName, w);
  }
  if (data.customerName) {
    b.twoColumnRow("Customer", data.customerName, w);
  }
  b.bold(false);

  b.emptyLine();
  b.alignCenter();
  b.bold(true);
  b.textLine("Customer Copy");
  b.bold(false);
  b.alignLeft();

  // ── Footer ──
  if (data.footerMessage) {
    b.solidLine(w);
    b.alignCenter();
    b.bold(true);
    b.textLine(data.footerMessage);
    b.bold(false);
    b.alignLeft();
  }
  b.cut();

  return b.build();
}
