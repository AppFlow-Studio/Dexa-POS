import { KitchenTicketData } from "@/types/printer";
import { EscPosBuilder } from "../escpos/EscPosBuilder";

/**
 * Builds ESC/POS commands for a kitchen ticket.
 * Uses large bold text for readability. No prices.
 */
export function buildKitchenTicketCommands(
  data: KitchenTicketData,
): Uint8Array {
  const w = data.maxCharsPerLine;
  const b = new EscPosBuilder();

  b.initialize();

  // ── Void header (if applicable) ──
  if (data.isVoidTicket) {
    b.alignCenter();
    b.bold(true);
    b.doubleSize(true);
    b.textLine("** VOID **");
    b.doubleSize(false);
    b.bold(false);
    b.alignLeft();
    b.doubleLine(w);
  }

  // ── Order Header ──
  b.alignCenter();
  b.bold(true);
  b.doubleSize(true);
  b.textLine(`Order ${data.orderNumber}`);
  b.doubleSize(false);
  b.bold(false);

  b.doubleHeight(true);
  b.textLine(data.orderType);
  b.doubleHeight(false);

  b.alignLeft();
  b.doubleLine(w);

  // ── Order Info ──
  if (data.tableName) {
    b.bold(true);
    b.doubleHeight(true);
    b.textLine(`Table: ${data.tableName}`);
    b.doubleHeight(false);
    b.bold(false);
  }

  if (data.serverName) {
    b.twoColumnRow("Server:", data.serverName, w);
  }

  b.twoColumnRow("Time:", data.timestamp, w);
  b.dottedLine(w);

  // ── Items ──
  for (const item of data.items) {
    b.bold(true);
    b.doubleHeight(true);

    const prefix = item.isVoided ? "VOID " : "";
    const qtyStr = item.quantity > 1 ? `${item.quantity}x ` : "";
    b.textLine(`${prefix}${qtyStr}${item.name}`);

    b.doubleHeight(false);
    b.bold(false);

    // Modifiers
    for (const mod of item.modifiers) {
      b.textLine(`  > ${mod}`);
    }

    // Special instructions (prominent)
    if (item.notes) {
      b.bold(true);
      b.textLine(`  *** ${item.notes} ***`);
      b.bold(false);
    }

    b.emptyLine();
  }

  b.doubleLine(w);

  // ── Timestamp footer ──
  b.alignCenter();
  b.textLine(data.timestamp);
  b.alignLeft();

  b.cut();

  return b.build();
}
