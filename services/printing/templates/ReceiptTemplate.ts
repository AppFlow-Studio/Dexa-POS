import { ReceiptItemData, ReceiptTemplateData } from "@/types/printer";
import { ReceiptTemplateConfig } from "@/types/receipt-template";
import { formatCurrency } from "@/utils/currency";
import { EscPosBuilder } from "../escpos/EscPosBuilder";

/**
 * Split a string into lines that each fit within maxLen, breaking at word
 * boundaries. Lines are trimmed. Used for notes / long text that should never
 * be silently truncated.
 */
function wordWrap(s: string, maxLen: number): string[] {
  if (maxLen <= 0) return [];
  if (!s) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of s.split(/\s+/)) {
    if (!word) continue;
    const sep = current.length > 0 ? 1 : 0;
    if (current.length + sep + word.length <= maxLen) {
      current = current ? `${current} ${word}` : word;
    } else {
      if (current) {
        lines.push(current);
      }
      if (word.length > maxLen) {
        for (let i = 0; i < word.length; i += maxLen) {
          lines.push(word.slice(i, i + maxLen));
        }
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

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

  if (data.isOnlineOrder) {
    // ── Bag-label header (online): platform → type → customer → code ──
    // Mirrors the delivery-app's own bag label so staff can match the order.
    b.emptyLine();
    b.alignCenter();
    if (data.onlinePlatformLabel) {
      b.bold(true);
      b.doubleSize(true);
      b.textLine(data.onlinePlatformLabel.toUpperCase());
      b.doubleSize(false);
      b.bold(false);
    }
    if (cfg?.showOrderType !== false && data.orderType) {
      b.bold(true);
      b.textLine(data.orderType);
      b.bold(false);
    }
    if (data.customerName) {
      b.emptyLine();
      b.bold(true);
      b.doubleSize(true);
      b.textLine(data.customerName);
      b.doubleSize(false);
      b.bold(false);
    }
    if (data.platformShortCode) {
      b.bold(true);
      b.doubleSize(true);
      b.textLine(`Code: ${data.platformShortCode}`);
      b.doubleSize(false);
      b.bold(false);
    }
    b.alignLeft();
    b.emptyLine();
    b.solidLine(w);
  } else {
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
    // Order type and table on separate rows
    if (cfg?.showOrderType !== false) {
      b.bold(true);
      b.textLine(data.orderType);
      if (data.tableName) {
        b.textLine(`Table: ${data.tableName}`);
      }
      b.bold(false);
    }
  }

  // ── Split-payment header (per-portion receipts only) ──
  if (data.splitLabel) {
    b.alignCenter();
    b.bold(true);
    b.textLine(data.splitLabel);
    b.bold(false);
    if (data.splitPayerName) {
      b.textLine(data.splitPayerName);
    }
    if (data.isPartialSplitReceipt) {
      b.textLine("Partial payment - full check below");
    }
    b.alignLeft();
  }

  // Online orders headline the customer name at the top, so skip the row here.
  if (!data.isOnlineOrder && data.customerName) {
    b.bold(true);
    b.twoColumnRow("Customer:", data.customerName, w);
    b.bold(false);
  }
  if (!data.isOnlineOrder && cfg?.showServerName !== false && data.serverName) {
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
    b.twoColumnRow("Tax", formatCurrency(data.tax), w);
  }
  if (data.discount > 0) {
    b.twoColumnRow("Discount", `-${formatCurrency(data.discount)}`, w);
  }
  if ((data.serviceCharge ?? 0) > 0) {
    const scLabel = data.serviceChargeName?.trim() || "Service Charge";
    b.twoColumnRow(scLabel, formatCurrency(data.serviceCharge!), w);
  }
  if (data.tip > 0) {
    const tipPct =
      data.subtotal > 0
        ? ` (${((data.tip / data.subtotal) * 100).toFixed(1)}%)`
        : "";
    b.twoColumnRow(`Tip${tipPct}`, formatCurrency(data.tip), w);
  }
  b.bold(false);

  b.solidLine(w);
  // Card Total / Cash Total in normal weight — no bold, no doubleHeight.
  const totalLabel =
    data.pricingMode === "cash"
      ? "TOTAL (CASH)"
      : data.pricingMode === "card"
        ? "TOTAL (CARD)"
        : "TOTAL";
  b.twoColumnRow(totalLabel, formatCurrency(data.total), w);

  if (
    data.pricingMode === "dual" &&
    data.cashTotal !== undefined &&
    data.cashTotal !== data.total
  ) {
    b.twoColumnRow("Cash Total", formatCurrency(data.cashTotal), w);
  }

  // ── Tip line (blank for customer to fill in — skip if collected, or online) ──
  if (cfg?.showTipLine !== false && data.tip <= 0 && !data.isOnlineOrder) {
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
      b.twoColumnRow(
        `Paid: ${payment.method}`,
        formatCurrency(payment.amount),
        w,
      );
      b.bold(false);
      if (payment.tipAmount && payment.tipAmount > 0) {
        if (
          payment.originalTipAmount != null &&
          payment.originalTipAmount !== payment.tipAmount
        ) {
          b.twoColumnRow(
            "  Orig. Tip",
            formatCurrency(payment.originalTipAmount),
            w,
          );
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
  // Online orders headline platform/customer/code at the top; the footer keeps
  // Order # (Dexa) + Ordered + Printed + Phone, and drops Server/Customer.
  if (data.isOnlineOrder) {
    b.twoColumnRow("Order #", data.orderNumber, w);
  } else if (data.backendOrderNumber) {
    b.twoColumnRow("Order #", data.backendOrderNumber, w);
  } else {
    b.twoColumnRow("Order #", data.orderNumber, w);
  }
  b.twoColumnRow("Ordered", `${data.orderDate}, ${data.orderTime}`, w);
  if (data.printDate && data.printTime) {
    b.twoColumnRow("Printed", `${data.printDate}, ${data.printTime}`, w);
  }
  if (!data.isOnlineOrder && data.serverName) {
    b.twoColumnRow("Server", data.serverName, w);
  }
  if (!data.isOnlineOrder && data.customerName) {
    b.twoColumnRow("Customer", data.customerName, w);
  }
  if (cfg?.showCustomerPhone !== false && data.customerPhone) {
    b.twoColumnRow("Phone", data.customerPhone, w);
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
    // Un-itemized modifier upcharge (priced modifier whose per-option price
    // didn't round-trip) — shown in aggregate so it isn't invisible.
    if (item.modifiersUpcharge && item.modifiersUpcharge > 0) {
      b.bold(true);
      b.textLine(`  Modifiers  +${formatCurrency(item.modifiersUpcharge)}`);
      b.bold(false);
    }
  }

  // Notes — word-wrap long notes instead of sending a single line that the
  // printer hardware may truncate or garble at the buffer boundary.
  if (item.notes) {
    const noteLines = wordWrap(`${item.notes}`, w - 2);
    for (const line of noteLines) {
      b.bold(true);
      b.textLine(`  ${line}`);
      b.bold(false);
    }
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
