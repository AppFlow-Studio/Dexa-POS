import { CartItem } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { PrinterConfig, PrinterRoutingConfig } from "@/types/printer";

/**
 * Finds the default receipt printer for a location/station.
 *
 * Priority order:
 *   1. isDefaultReceipt + isConnected + non-builtin  (e.g. Star set as default)
 *   2. isDefaultReceipt + isConnected + builtin       (Landi fallback when Star offline)
 *   3. isDefaultReceipt + non-builtin                 (Star set, not yet connected)
 *   4. isDefaultReceipt + builtin                     (Landi only option)
 *
 * Builtin printers are always treated as lower priority than network printers
 * so that explicitly assigning a Star as the receipt printer is respected.
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

  console.log(
    `[PrintRouter] getReceiptPrinter: locationId=${locationId}, candidates=${activePrinters.length}`,
  );

  const isBuiltin = (p: PrinterConfig) => p.connectionType === "builtin";

  const pick = (candidates: PrinterConfig[]): PrinterConfig | undefined =>
    // Prefer non-builtin (network/Star) over builtin (Landi) within any tier
    candidates.find((p) => p.isDefaultReceipt && p.isConnected && !isBuiltin(p)) ??
    candidates.find((p) => p.isDefaultReceipt && p.isConnected) ??
    candidates.find((p) => p.isDefaultReceipt && !isBuiltin(p)) ??
    candidates.find((p) => p.isDefaultReceipt);

  // Station-specific default first
  if (stationId) {
    const stationPrinters = activePrinters.filter((p) => p.stationId === stationId);
    const stationPrinter = pick(stationPrinters);
    if (stationPrinter) return stationPrinter;
  }

  // Location-wide default
  const defaultPrinter = pick(activePrinters);
  if (defaultPrinter) return defaultPrinter;

  // No default receipt printer set → return null (triggers "set default" modal)
  return null;
}

/**
 * Gets all active kitchen printers for a location.
 */
export function getKitchenPrinters(locationId: string): PrinterConfig[] {
  const { printers } = usePrinterStore.getState();

  return printers.filter(
    (p) =>
      p.isActive &&
      p.locationId === locationId &&
      (p.printerRole === "kitchen" || p.printerRole === "bar" || p.isDefaultKitchen),
  );
}

/**
 * Routes kitchen items to the correct printer(s) based on per-printer routing config.
 * Returns a map of printerId -> items to print on that printer.
 *
 * Algorithm:
 * 1a. "custom" printers check order_type gate, then category/item rules (processed first)
 * 1b. "all" printers receive remaining items not claimed by custom printers
 *     (if no custom routing exists, "all" printers get everything)
 * 2. "unassigned" printers receive items not matched by any "custom" or "all" printer
 * 3. Fallback: if nothing routed anywhere, send everything to defaultKitchenPrinter
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

  if (kitchenPrinters.length === 0) {
    console.warn("[PrintRouter] No kitchen printers found for location", locationId);
    return result;
  }

  // Default kitchen printer (fallback)
  const defaultKitchenPrinter =
    kitchenPrinters.find((p) => p.isDefaultKitchen) ?? kitchenPrinters[0];

  // Check if any KITCHEN printer has custom/unassigned routing configured.
  // Only look at kitchen printers — routingConfigs may contain entries for
  // receipt printers too, which would falsely skip the legacy fast-path.
  const hasAnyCustomRouting = kitchenPrinters.some((p) => {
    const cfg = routingConfigs[p.id];
    return cfg && cfg.routingMode !== "all";
  });

  // Fast path: if no kitchen printer uses custom/unassigned routing, use legacy.
  // This prevents multiple "all"-mode printers from each receiving the full item
  // list (legacy routes by category → default printer, avoiding duplicates).
  if (!hasAnyCustomRouting) {
    return routeLegacy(items, kitchenPrinters, defaultKitchenPrinter);
  }

  // Track which items have been assigned to at least one non-unassigned printer
  const assignedItems = new Set<CartItem>();

  // Phase 1a: Route to "custom" printers first to build assignedItems set
  for (const printer of kitchenPrinters) {
    const config = routingConfigs[printer.id] ?? defaultConfig(printer.id);
    if (config.routingMode !== "custom") continue;
    if (!passesOrderTypeGate(config, orderContext?.orderType)) continue;

    const matched = items.filter((item) => matchesCustomRules(config, item));
    if (matched.length > 0) {
      result.set(printer.id, matched);
      for (const item of matched) assignedItems.add(item);
    }
  }

  // Phase 1b: Route to "all" printers — exclude items claimed by custom printers
  const hasCustomRouting = assignedItems.size > 0;
  for (const printer of kitchenPrinters) {
    const config = routingConfigs[printer.id] ?? defaultConfig(printer.id);
    if (config.routingMode !== "all") continue;
    if (!passesOrderTypeGate(config, orderContext?.orderType)) continue;

    if (hasCustomRouting) {
      // Custom routing is active: only give unmatched items to "all" printers
      const unmatched = items.filter((item) => !assignedItems.has(item));
      if (unmatched.length > 0) {
        result.set(printer.id, unmatched);
      }
    } else {
      // No custom routing: original behavior — all items
      result.set(printer.id, [...items]);
      for (const item of items) assignedItems.add(item);
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
    // Primary: direct UUID match via addedFromCategoryId
    const categoryId = item.addedFromCategoryId ?? "";
    if (categoryId && categoryRules.some((r) => r.rule_value === categoryId)) {
      return true;
    }

    // Secondary: look up menu item's categories from menu store
    // rule_value stores category UUID, menuItem.category stores category NAMES
    // Resolve UUID → name via categoriesById, then check membership
    const { menuItemsById, categoriesById } = useMenuStore.getState();
    const menuItem = menuItemsById[item.menuItemId];
    if (menuItem?.category) {
      return categoryRules.some((r) => {
        const cat = categoriesById[r.rule_value];
        return cat && menuItem.category.includes(cat.name);
      });
    }
  }

  // No category or item rules = doesn't match this custom printer
  return false;
}
