import { CartItem } from "@/lib/types";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { PrinterConfig, PrinterRoutingConfig } from "@/types/printer";

/**
 * Finds the default receipt printer for a location/station.
 */
export function getReceiptPrinter(
  locationId: string,
  stationId?: string | null,
): PrinterConfig | null {
  const { printers } = usePrinterStore.getState();

  const activePrinters = printers.filter(
    (p) =>
      p.isActive &&
      p.locationId === locationId &&
      (p.printerRole === "receipt" || p.isDefaultReceipt),
  );

  // Prefer station-specific printer
  if (stationId) {
    const stationPrinter = activePrinters.find(
      (p) => p.stationId === stationId && p.isDefaultReceipt,
    );
    if (stationPrinter) return stationPrinter;
  }

  // Fall back to location default
  const defaultPrinter = activePrinters.find((p) => p.isDefaultReceipt);
  if (defaultPrinter) return defaultPrinter;

  // Fall back to any active receipt printer
  return activePrinters[0] ?? null;
}

/**
 * Gets all active kitchen printers for a location.
 */
export function getKitchenPrinters(locationId: string): PrinterConfig[] {
  const { printers } = usePrinterStore.getState();

  const result = printers.filter(
    (p) =>
      p.isActive &&
      p.locationId === locationId &&
      (p.printerRole === "kitchen" || p.printerRole === "bar" || p.isDefaultKitchen),
  );

  for (const p of result) {
    console.log(
      `[PrintRouter] Kitchen printer: ${p.printerName} (${p.networkAddress}) id=${p.id.slice(0, 8)} active=${p.isActive} defaultKitchen=${p.isDefaultKitchen}`,
    );
  }

  return result;
}

/**
 * Routes kitchen items to the correct printer(s) based on per-printer routing config.
 * Returns a map of printerId -> items to print on that printer.
 *
 * Algorithm:
 * 1. "all" printers receive ALL items (subject to order_type gate)
 * 2. "custom" printers check order_type gate, then category/item rules
 * 3. "unassigned" printers receive items not matched by any "custom" or "all" printer
 * 4. Fallback: if nothing routed anywhere, send everything to defaultKitchenPrinter
 */
export function routeKitchenItems(
  items: CartItem[],
  locationId: string,
  orderContext?: {
    orderType?: string; // "dine_in" | "takeout" | "delivery" etc.
  },
): Map<string, CartItem[]> {
  const { routingConfigs } = usePrinterStore.getState();
  const kitchenPrinters = getKitchenPrinters(locationId);
  const result = new Map<string, CartItem[]>();

  console.log(
    `[PrintRouter] routeKitchenItems: locationId=${locationId}, kitchenPrinters=${kitchenPrinters.length}, items=${items.length}`,
  );

  if (kitchenPrinters.length === 0) {
    console.warn("[PrintRouter] No kitchen printers found for location", locationId);
    return result;
  }

  // Default kitchen printer (fallback)
  const defaultKitchenPrinter =
    kitchenPrinters.find((p) => p.isDefaultKitchen) ?? kitchenPrinters[0];

  // Check if any printer has non-default routing configured
  const hasAnyV2Config = kitchenPrinters.some((p) => {
    const cfg = routingConfigs[p.id];
    return cfg && cfg.routingMode !== "all";
  });

  // Fast path: if no V2 routing is configured, fall back to legacy behavior
  if (!hasAnyV2Config && Object.keys(routingConfigs).length === 0) {
    return routeLegacy(items, kitchenPrinters, defaultKitchenPrinter);
  }

  // Track which items have been assigned to at least one non-unassigned printer
  const assignedItems = new Set<CartItem>();

  // Phase 1: Route to "all" and "custom" printers
  for (const printer of kitchenPrinters) {
    const config = routingConfigs[printer.id] ?? defaultConfig(printer.id);

    if (config.routingMode === "unassigned") continue;

    // Order type gate: if printer has order_type rules, check them
    if (!passesOrderTypeGate(config, orderContext?.orderType)) continue;

    if (config.routingMode === "all") {
      // "All" mode: receives every item
      result.set(printer.id, [...items]);
      for (const item of items) assignedItems.add(item);
    } else if (config.routingMode === "custom") {
      // "Custom" mode: check item-level and category-level rules
      const matched = items.filter((item) => matchesCustomRules(config, item));
      if (matched.length > 0) {
        result.set(printer.id, matched);
        for (const item of matched) assignedItems.add(item);
      }
    }
  }

  // Phase 2: Route unassigned items to "unassigned" printers
  const unassignedItems = items.filter((item) => !assignedItems.has(item));
  if (unassignedItems.length > 0) {
    for (const printer of kitchenPrinters) {
      const config = routingConfigs[printer.id] ?? defaultConfig(printer.id);
      if (config.routingMode !== "unassigned") continue;

      // Order type gate applies to unassigned printers too
      if (!passesOrderTypeGate(config, orderContext?.orderType)) continue;

      const existing = result.get(printer.id) ?? [];
      result.set(printer.id, [...existing, ...unassignedItems]);
    }
  }

  // Phase 3: Fallback — if nothing was routed, send everything to default
  if (result.size === 0 && items.length > 0) {
    result.set(defaultKitchenPrinter.id, [...items]);
  }

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function defaultConfig(printerId: string): PrinterRoutingConfig {
  return { printerId, routingMode: "all", printModifiers: true, rules: [] };
}

/**
 * Legacy routing: use old routeRules from store (category name -> printer mapping).
 */
function routeLegacy(
  items: CartItem[],
  kitchenPrinters: PrinterConfig[],
  defaultKitchenPrinter: PrinterConfig,
): Map<string, CartItem[]> {
  const { routeRules } = usePrinterStore.getState();
  const result = new Map<string, CartItem[]>();
  const enabledRules = routeRules.filter((r) => r.isEnabled);

  for (const item of items) {
    const categoryName = item.category_name ?? "";
    const rule = enabledRules.find(
      (r) => r.categoryName.toLowerCase() === categoryName.toLowerCase(),
    );

    const targetPrinterId = rule?.printerId ?? defaultKitchenPrinter.id;

    // Verify the target printer exists and is active
    const targetPrinter = kitchenPrinters.find((p) => p.id === targetPrinterId);
    const finalPrinterId = targetPrinter
      ? targetPrinterId
      : defaultKitchenPrinter.id;

    const existing = result.get(finalPrinterId) ?? [];
    existing.push(item);
    result.set(finalPrinterId, existing);
  }

  return result;
}

/**
 * Check if the order passes the printer's order_type gate.
 * If no order_type rules exist, all orders pass.
 */
function passesOrderTypeGate(
  config: PrinterRoutingConfig,
  orderType?: string,
): boolean {
  const orderTypeRules = config.rules.filter(
    (r) => r.rule_type === "order_type" && r.is_enabled,
  );

  // No order_type rules = accepts all order types
  if (orderTypeRules.length === 0) return true;

  // If we don't know the order type, let it through
  if (!orderType) return true;

  // Normalize order type for comparison
  const normalized = normalizeOrderType(orderType);
  return orderTypeRules.some((r) => normalizeOrderType(r.rule_value) === normalized);
}

/**
 * Normalize order type strings to a canonical form for comparison.
 */
function normalizeOrderType(orderType: string): string {
  const lower = orderType.toLowerCase().replace(/[\s_-]+/g, "_");
  const map: Record<string, string> = {
    dine_in: "dine_in",
    dinein: "dine_in",
    takeaway: "takeout",
    takeout: "takeout",
    to_go: "takeout",
    togo: "takeout",
    delivery: "delivery",
  };
  return map[lower] ?? lower;
}

/**
 * Check if a cart item matches a "custom" printer's rules.
 * Item-level rules take priority over category-level rules.
 */
function matchesCustomRules(
  config: PrinterRoutingConfig,
  item: CartItem,
): boolean {
  const enabledRules = config.rules.filter((r) => r.is_enabled);
  const itemRules = enabledRules.filter((r) => r.rule_type === "menu_item");
  const categoryRules = enabledRules.filter((r) => r.rule_type === "category");

  // Check item-level rules first (exact match by menuItemId)
  if (itemRules.length > 0) {
    const itemMatch = itemRules.some((r) => r.rule_value === item.menuItemId);
    if (itemMatch) return true;
  }

  // Check category-level rules
  if (categoryRules.length > 0) {
    // Match by category name or addedFromCategoryId
    const categoryName = item.category_name ?? "";
    const categoryId = item.addedFromCategoryId ?? "";

    return categoryRules.some(
      (r) =>
        r.rule_value === categoryId ||
        r.rule_value.toLowerCase() === categoryName.toLowerCase(),
    );
  }

  // No category or item rules = doesn't match this custom printer
  return false;
}
