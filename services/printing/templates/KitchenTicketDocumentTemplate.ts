import { PrintDocument, PrintNode } from "@/types/print-document";
import { KitchenTicketData } from "@/types/printer";

/**
 * Builds a PrintDocument for a kitchen ticket.
 * Mirrors the exact layout of KitchenTicketTemplate.ts but outputs PrintNode[] instead of ESC/POS bytes.
 */
export function buildKitchenTicketDocument(
  data: KitchenTicketData,
): PrintDocument {
  const w = data.maxCharsPerLine;
  const nodes: PrintNode[] = [];

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
    content: `Order ${data.orderNumber}`,
    align: "center",
    format: { bold: true, doubleHeight: true, doubleWidth: true },
  });

  nodes.push({
    type: "text_line",
    content: data.orderType,
    align: "center",
    format: { doubleHeight: true },
  });

  nodes.push({ type: "divider", style: "double", lineWidth: w });

  // ── Order Info ──
  if (data.tableName) {
    nodes.push({
      type: "text_line",
      content: `Table: ${data.tableName}`,
      format: { bold: true, doubleHeight: true },
    });
  }

  if (data.serverName) {
    nodes.push({ type: "two_column", left: "Server:", right: data.serverName, lineWidth: w });
  }

  nodes.push({ type: "two_column", left: "Time:", right: data.timestamp, lineWidth: w });
  nodes.push({ type: "divider", style: "dotted", lineWidth: w });

  // ── Items ──
  for (const item of data.items) {
    const prefix = item.isVoided ? "VOID " : "";
    const qtyStr = item.quantity > 1 ? `${item.quantity}x ` : "";

    nodes.push({
      type: "text_line",
      content: `${prefix}${qtyStr}${item.name}`,
      format: { bold: true, doubleHeight: true },
    });

    // Modifiers
    for (const mod of item.modifiers) {
      nodes.push({ type: "text_line", content: `  > ${mod}` });
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

  nodes.push({ type: "divider", style: "double", lineWidth: w });

  // ── Timestamp footer ──
  nodes.push({ type: "text_line", content: data.timestamp, align: "center" });
  nodes.push({ type: "cut" });

  return { nodes, maxCharsPerLine: w };
}
