import { ReceiptTemplateData } from "@/types/printer";
import { formatCurrency } from "@/utils/currency";
import { EscPosBuilder } from "../escpos/EscPosBuilder";

/**
 * Builds ESC/POS commands for a receipt.
 * Mirrors the layout of ReceiptModal.tsx.
 */
export function buildReceiptCommands(data: ReceiptTemplateData): Uint8Array {
  const w = data.maxCharsPerLine;
  const b = new EscPosBuilder();

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
  b.dottedLine(w);

  // ── Order Info ──
  b.twoColumnRow("Order #:", data.orderNumber, w);
  b.twoColumnRow("Date:", data.orderDate, w);
  b.twoColumnRow("Time:", data.orderTime, w);
  b.twoColumnRow("Type:", data.orderType, w);

  if (data.tableName) {
    b.twoColumnRow("Table:", data.tableName, w);
  }
  if (data.customerName) {
    b.twoColumnRow("Customer:", data.customerName, w);
  }
  if (data.serverName) {
    b.twoColumnRow("Server:", data.serverName, w);
  }

  b.doubleLine(w);

  // ── Items ──
  for (const item of data.items) {
    if (item.isVoided) continue;

    const qty = item.quantity > 1 ? `${item.quantity}x ` : "";
    const itemName = `${qty}${item.name}`;
    const itemPrice = formatCurrency(item.price);

    b.twoColumnRow(itemName, itemPrice, w);

    // Cash price if different
    if (item.cashPrice !== undefined && item.cashPrice !== item.price) {
      const cashStr = `  Cash: ${formatCurrency(item.cashPrice)}`;
      b.textLine(cashStr);
    }

    // Modifiers
    for (const mod of item.modifiers) {
      const modPrice = mod.price > 0 ? formatCurrency(mod.price) : "";
      const modText = `  + ${mod.name}`;
      if (modPrice) {
        b.twoColumnRow(modText, modPrice, w);
      } else {
        b.textLine(modText);
      }
    }

    // Notes
    if (item.notes) {
      b.textLine(`  Note: ${item.notes}`);
    }
  }

  b.dottedLine(w);

  // ── Totals ──
  // Card prices section
  b.textLine("Card Price");
  b.twoColumnRow("Subtotal", formatCurrency(data.subtotal), w);

  if (data.tax > 0) {
    b.twoColumnRow("Tax", formatCurrency(data.tax), w);
  }
  if (data.discount > 0) {
    b.twoColumnRow("Discount", `-${formatCurrency(data.discount)}`, w);
  }
  if (data.tip > 0) {
    b.twoColumnRow("Tip", formatCurrency(data.tip), w);
  }

  b.solidLine(w);
  b.bold(true);
  b.twoColumnRow("TOTAL (Card)", formatCurrency(data.total), w);
  b.bold(false);

  // Cash prices section (only if different)
  if (
    data.cashTotal !== undefined &&
    data.cashTotal !== data.total
  ) {
    b.emptyLine();
    b.dottedLine(w);
    b.textLine("Cash Price");
    b.twoColumnRow("Subtotal", formatCurrency(data.cashSubtotal ?? 0), w);

    if ((data.cashTax ?? 0) > 0) {
      b.twoColumnRow("Tax", formatCurrency(data.cashTax ?? 0), w);
    }
    if (data.discount > 0) {
      b.twoColumnRow("Discount", `-${formatCurrency(data.discount)}`, w);
    }
    if (data.tip > 0) {
      b.twoColumnRow("Tip", formatCurrency(data.tip), w);
    }

    b.solidLine(w);
    b.bold(true);
    b.twoColumnRow("TOTAL (Cash)", formatCurrency(data.cashTotal), w);
    b.bold(false);
  }

  // ── Payments ──
  if (data.payments.length > 0) {
    b.dottedLine(w);
    b.alignCenter();
    b.textLine("Payment");
    b.alignLeft();

    for (const payment of data.payments) {
      const methodText = payment.last4
        ? `${payment.method} ****${payment.last4}`
        : payment.method;
      b.twoColumnRow(methodText, formatCurrency(payment.amount), w);
    }

    if (data.amountPaid && data.amountPaid > 0) {
      b.dottedLine(w);
      b.twoColumnRow("Amount Paid", formatCurrency(data.amountPaid), w);
    }
    if (data.amountDue && data.amountDue > 0) {
      b.twoColumnRow("Amount Due", formatCurrency(data.amountDue), w);
    }
  }

  b.doubleLine(w);

  // ── Footer ──
  b.alignCenter();
  b.bold(true);
  b.textLine("Thank You!");
  b.bold(false);

  if (data.footerMessage) {
    b.textLine(data.footerMessage);
  }

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  b.textLine(dateStr);

  b.alignLeft();
  b.cut();

  return b.build();
}
