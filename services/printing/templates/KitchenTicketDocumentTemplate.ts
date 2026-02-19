import { PrintDocument, PrintNode } from "@/types/print-document";
import { KitchenTicketData, KitchenTicketItemData } from "@/types/printer";

/**
 * Builds a PrintDocument for a kitchen ticket.
 * Layout matches the kitchen ticket mockup with conditional flags from templateConfig.
 */
export function buildKitchenTicketDocument(
  data: KitchenTicketData,
): PrintDocument {
  const w = data.maxCharsPerLine;
  const nodes: PrintNode[] = [];
  const cfg = data.templateConfig;

  // ── Void header (if applicable) ──
  if (data.isVoidTicket) {
    nodes.push({
      type: "text_line",
      content: "** VOID **",
      align: "center",
      format: { bold: true, doubleHeight: true, doubleWidth: true },
    });
    nodes.push({ type: "divider", style: "double", lineWidth: w });
  }

  // ── Order Header ──
  nodes.push({
    type: "text_line",
    content: `ORDER #${data.orderNumber}`,
    align: "center",
    format: { bold: true, doubleHeight: true, doubleWidth: true },
  });

  // Combined order type + table on one line
  if (cfg?.showOrderType !== false) {
    const typeLine = data.tableName
      ? `${data.orderType.toUpperCase()} - ${data.tableName}`
      : data.orderType.toUpperCase();
    nodes.push({
      type: "text_line",
      content: typeLine,
      align: "center",
      format: { bold: true, doubleHeight: true },
    });
  }

  // Server name
  if (cfg?.showServerName !== false && data.serverName) {
    nodes.push({
      type: "text_line",
      content: `Server: ${data.serverName}`,
      align: "center",
    });
  }

  // Full timestamp (date + time)
  nodes.push({
    type: "text_line",
    content: data.fullTimestamp ?? data.timestamp,
    align: "center",
  });

  // Ready-by time
  if (cfg?.showReadyByTime !== false && data.readyByTime) {
    nodes.push({
      type: "text_line",
      content: `Ready by: ${data.readyByTime}`,
      align: "center",
      format: { bold: true },
    });
  }

  nodes.push({ type: "divider", style: "double", lineWidth: w });

  // ── Items ──
  if (cfg?.groupByStation) {
    pushItemsGroupedByStation(nodes, data.items, w, cfg);
  } else {
    pushItemsFlat(nodes, data.items, w, cfg);
  }

  nodes.push({ type: "divider", style: "double", lineWidth: w });

  // ── Item count footer ──
  if (data.totalItemCount !== undefined) {
    nodes.push({
      type: "text_line",
      content: `${data.totalItemCount} items total`,
      align: "center",
    });
  }

  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: w };
}

function pushItemsGroupedByStation(
  nodes: PrintNode[],
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData["templateConfig"],
): void {
  const groups = new Map<string, KitchenTicketItemData[]>();
  for (const item of items) {
    const station = item.station || "GENERAL";
    if (!groups.has(station)) {
      groups.set(station, []);
    }
    groups.get(station)!.push(item);
  }

  let isFirst = true;
  for (const [station, stationItems] of groups) {
    if (!isFirst) {
      nodes.push({ type: "empty_line" });
    }
    isFirst = false;

    // Station header
    nodes.push({
      type: "text_line",
      content: `-- ${station.toUpperCase()} --`,
      align: "center",
      format: { bold: true },
    });
    nodes.push({ type: "divider", style: "solid", lineWidth: w });

    for (const item of stationItems) {
      pushSingleItem(nodes, item, w, cfg);
    }
  }
}

function pushItemsFlat(
  nodes: PrintNode[],
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData["templateConfig"],
): void {
  for (const item of items) {
    pushSingleItem(nodes, item, w, cfg);
  }
}

function pushSingleItem(
  nodes: PrintNode[],
  item: KitchenTicketItemData,
  _w: number,
  cfg: KitchenTicketData["templateConfig"],
): void {
  const useLargeText = cfg?.largeItemText !== false;
  const prefix = item.isVoided ? "VOID " : "";
  const qtyStr = `${item.quantity}x `;

  nodes.push({
    type: "text_line",
    content: `${prefix}${qtyStr}${item.name}`,
    format: {
      bold: true,
      doubleHeight: useLargeText ? true : undefined,
    },
  });

  // Modifiers (conditional)
  if (cfg?.showItemModifiers !== false) {
    const useModsLarge = cfg?.showModsLarge === true;
    for (const mod of item.modifiers) {
      nodes.push({
        type: "text_line",
        content: `  + ${mod}`,
        format: useModsLarge ? { bold: true } : undefined,
      });
    }
  }

  // Allergy alert (prominent warning)
  if (cfg?.showAllergyAlert !== false && item.allergyAlert) {
    nodes.push({
      type: "text_line",
      content: `  !! ALLERGY: ${item.allergyAlert} !!`,
      format: { bold: true },
    });
  }

  // Special instructions (prominent)
  if (item.notes) {
    nodes.push({
      type: "text_line",
      content: `  *** ${item.notes} ***`,
      format: { bold: true },
    });
  }

  nodes.push({ type: "empty_line" });
}
