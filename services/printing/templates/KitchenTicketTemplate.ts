import { KitchenTicketData } from "@/types/printer";
import { EscPosBuilder } from "../escpos/EscPosBuilder";

/**
 * Builds ESC/POS commands for a kitchen ticket.
 * Layout matches the kitchen ticket mockup with conditional flags from templateConfig.
 */
export function buildKitchenTicketCommands(
  data: KitchenTicketData,
): Uint8Array {
  const w = data.maxCharsPerLine;
  const b = new EscPosBuilder();
  const cfg = data.templateConfig;

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
  b.textLine(`ORDER #${data.orderNumber}`);
  b.doubleSize(false);

  // Combined order type + table on one line
  if (cfg?.showOrderType !== false) {
    const typeLine = data.tableName
      ? `${data.orderType.toUpperCase()} - ${data.tableName}`
      : data.orderType.toUpperCase();
    b.doubleHeight(true);
    b.textLine(typeLine);
    b.doubleHeight(false);
  }

  b.bold(false);

  // Server name
  if (cfg?.showServerName !== false && data.serverName) {
    b.textLine(`Server: ${data.serverName}`);
  }

  // Full timestamp (date + time)
  b.textLine(data.fullTimestamp ?? data.timestamp);

  b.alignLeft();
  b.doubleLine(w);

  // ── Items ──
  for (const item of data.items) {
    const useLargeText = cfg?.largeItemText !== false;

    b.bold(true);
    if (useLargeText) {
      b.doubleHeight(true);
    }

    const prefix = item.isVoided ? "VOID " : "";
    const qtyStr = `${item.quantity}x `;
    b.textLine(`${prefix}${qtyStr}${item.name}`);

    if (useLargeText) {
      b.doubleHeight(false);
    }
    b.bold(false);

    // Modifiers (conditional)
    if (cfg?.showItemModifiers !== false) {
      const useModsLarge = cfg?.showModsLarge === true;
      if (useModsLarge) {
        b.bold(true);
      }

      for (const mod of item.modifiers) {
        b.textLine(`  + ${mod}`);
      }

      if (useModsLarge) {
        b.bold(false);
      }
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

  // ── Item count footer ──
  if (data.totalItemCount !== undefined) {
    b.alignCenter();
    b.textLine(`${data.totalItemCount} items total`);
    b.alignLeft();
  }

  b.cut();

  return b.build();
}
