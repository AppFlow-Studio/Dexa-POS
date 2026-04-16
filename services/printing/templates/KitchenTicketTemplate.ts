import { KitchenTicketData, KitchenTicketItemData } from "@/types/printer";
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
  b.textLine(`ORDER ${data.orderNumber}`);
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
    b.bold(true);
    b.textLine(`Server: ${data.serverName}`);
    b.bold(false);
  }

  // Full timestamp (date + time)
  b.bold(true);
  b.textLine(data.fullTimestamp ?? data.timestamp);
  b.bold(false);

  // Ready-by time
  if (cfg?.showReadyByTime !== false && data.readyByTime) {
    b.bold(true);
    b.textLine(`Ready by: ${data.readyByTime}`);
    b.bold(false);
  }

  b.alignLeft();
  b.doubleLine(w);

  // ── Items ──
  // Wrap existing seat/station/flat rendering with course grouping when the
  // ticket spans multiple courses (or contains any non-default course).
  renderItemsGroupedByCourse(b, data.items, w, cfg);

  b.doubleLine(w);

  // ── Item count footer ──
  if (data.totalItemCount !== undefined) {
    b.alignCenter();
    b.bold(true);
    b.textLine(`${data.totalItemCount} items total`);
    b.bold(false);
    b.alignLeft();
  }

  b.cut();

  return b.build();
}

/**
 * Top-level course grouping. Prints a prominent "COURSE N" header above each
 * course's items, then delegates to the existing seat/station/flat layout.
 * Header is skipped when the ticket only contains the default course (1).
 */
function renderItemsGroupedByCourse(
  b: EscPosBuilder,
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData["templateConfig"],
): void {
  const groups = new Map<number, KitchenTicketItemData[]>();
  for (const item of items) {
    const course = item.courseNumber ?? 1;
    if (!groups.has(course)) {
      groups.set(course, []);
    }
    groups.get(course)!.push(item);
  }

  const courseNumbers = [...groups.keys()].sort((a, b) => a - b);
  const showCourseHeaders =
    courseNumbers.length > 1 || courseNumbers.some((n) => n > 1);

  let isFirst = true;
  for (const course of courseNumbers) {
    const courseItems = groups.get(course)!;

    if (showCourseHeaders) {
      if (!isFirst) {
        b.emptyLine();
      }
      b.alignCenter();
      b.bold(true);
      b.doubleSize(true);
      b.textLine(`COURSE ${course}`);
      b.doubleSize(false);
      b.bold(false);
      b.alignLeft();
      b.doubleLine(w);
    }
    isFirst = false;

    if (cfg?.groupBySeat) {
      renderItemsGroupedBySeat(b, courseItems, w, cfg);
    } else if (cfg?.groupByStation) {
      renderItemsGroupedByStation(b, courseItems, w, cfg);
    } else {
      renderItemsFlat(b, courseItems, w, cfg);
    }
  }
}

function renderItemsGroupedBySeat(
  b: EscPosBuilder,
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData["templateConfig"],
): void {
  const groups = new Map<string, KitchenTicketItemData[]>();
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

    // Seat header
    b.alignCenter();
    b.bold(true);
    b.textLine(`-- ${seat} --`);
    b.bold(false);
    b.alignLeft();
    b.solidLine(w);

    for (const item of seatItems) {
      renderSingleItem(b, item, w, cfg);
    }
  }
}

function renderItemsGroupedByStation(
  b: EscPosBuilder,
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
      b.emptyLine();
    }
    isFirst = false;

    // Station header
    b.alignCenter();
    b.bold(true);
    b.textLine(`-- ${station.toUpperCase()} --`);
    b.bold(false);
    b.alignLeft();
    b.solidLine(w);

    for (const item of stationItems) {
      renderSingleItem(b, item, w, cfg);
    }
  }
}

function renderItemsFlat(
  b: EscPosBuilder,
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData["templateConfig"],
): void {
  for (const item of items) {
    renderSingleItem(b, item, w, cfg);
  }
}

function renderSingleItem(
  b: EscPosBuilder,
  item: KitchenTicketItemData,
  _w: number,
  cfg: KitchenTicketData["templateConfig"],
): void {
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
    const modStyle = cfg?.modifierStyle ?? "inverted";
    if (modStyle === "inverted") {
      b.inverted(true);
    }
    b.bold(true);

    for (const mod of item.modifiers) {
      const isNo = mod.startsWith("NO ");
      b.textLine(`  ${isNo ? "-" : "+"} ${mod}`);
    }

    if (modStyle === "inverted") {
      b.inverted(false);
    }
    b.bold(false);
  }

  // Allergy alert (prominent warning)
  if (cfg?.showAllergyAlert !== false && item.allergyAlert) {
    b.bold(true);
    b.textLine(`  !! ALLERGY: ${item.allergyAlert} !!`);
    b.bold(false);
  }

  // Special instructions (prominent)
  if (item.notes) {
    b.bold(true);
    b.textLine(`  *** ${item.notes} ***`);
    b.bold(false);
  }

  b.emptyLine();
}
