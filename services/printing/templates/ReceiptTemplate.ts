import { ReceiptItemData, ReceiptTemplateData } from "@/types/printer";
import { ReceiptTemplateConfig } from "@/types/receipt-template";
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
  if (cfg?.groupBySeat) {
    pushEscPosItemsGroupedBySeat(b, data.items, w, cfg);
  } else {
    pushEscPosItemsFlat(b, data.items, w, cfg);
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
  if ((data.serviceCharge ?? 0) > 0) {
    const scLabel = data.serviceChargeName?.trim() || "Service Charge";
    b.twoColumnRow(scLabel, formatCurrency(data.serviceCharge!), w);
  }
  if (data.tip > 0) {
    const tipPct = data.subtotal > 0
      ? ` (${((data.tip / data.subtotal) * 100).toFixed(1)}%)`
      : "";
    b.twoColumnRow(`Tip${tipPct}`, formatCurrency(data.tip), w);
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

  // ── Tip line (blank for customer to fill in — skip if tip already collected) ──
  if (cfg?.showTipLine !== false && data.tip <= 0) {
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
      if (payment.tipAmount && payment.tipAmount > 0) {
        if (payment.originalTipAmount != null && payment.originalTipAmount !== payment.tipAmount) {
          b.twoColumnRow("  Orig. Tip", formatCurrency(payment.originalTipAmount), w);
          b.twoColumnRow("  Adj. Tip", formatCurrency(payment.tipAmount), w);
        } else {
          b.twoColumnRow("  Tip", formatCurrency(payment.tipAmount), w);
        }
      }
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
      if (payment.aid) {
        b.twoColumnRow("  AID", payment.aid, w);
      }
      if (payment.amountTendered != null && payment.amountTendered > 0) {
        b.twoColumnRow("  Tendered", formatCurrency(payment.amountTendered), w);
      }
      if (payment.changeGiven != null && payment.changeGiven > 0) {
        b.twoColumnRow("  Change", formatCurrency(payment.changeGiven), w);
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

// ============================================================================
// ITEM HELPERS
// ============================================================================

function pushEscPosSingleItem(
  b: EscPosBuilder,
  item: ReceiptItemData,
  w: number,
  cfg: ReceiptTemplateConfig | undefined,
): void {
  if (item.isVoided) return;

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
      const isNo = !!mod.isNo;
      const prefix = isNo ? "-" : "+";
      const modLine = isNo
        ? `  ${prefix} NO ${mod.name}`
        : mod.price > 0
          ? `  ${prefix} ${mod.name} (${formatCurrency(mod.price)})`
          : `  ${prefix} ${mod.name}`;
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

function pushEscPosItemsFlat(
  b: EscPosBuilder,
  items: ReceiptItemData[],
  w: number,
  cfg: ReceiptTemplateConfig | undefined,
): void {
  for (const item of items) {
    pushEscPosSingleItem(b, item, w, cfg);
  }
}

function pushEscPosItemsGroupedBySeat(
  b: EscPosBuilder,
  items: ReceiptItemData[],
  w: number,
  cfg: ReceiptTemplateConfig | undefined,
): void {
  const groups = new Map<string, ReceiptItemData[]>();
  for (const item of items) {
    const seat = item.seatNumber != null ? `SEAT ${item.seatNumber}` : "SHARED";
    if (!groups.has(seat)) {
      groups.set(seat, []);
    }
    groups.get(seat)!.push(item);
  }

  let isFirst = true;
  for (const [seat, seatItems] of groups) {
    if (!isFirst) {
      b.emptyLine();
    }
    isFirst = false;

    b.alignCenter();
    b.bold(true);
    b.textLine(`-- ${seat} --`);
    b.bold(false);
    b.alignLeft();
    b.solidLine(w);

    for (const item of seatItems) {
      pushEscPosSingleItem(b, item, w, cfg);
    }
  }
}
