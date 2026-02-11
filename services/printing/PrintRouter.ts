import { CartItem } from "@/lib/types";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { PrinterConfig } from "@/types/printer";

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

  return printers.filter(
    (p) =>
      p.isActive &&
      p.locationId === locationId &&
      (p.printerRole === "kitchen" || p.isDefaultKitchen),
  );
}

/**
 * Routes kitchen items to the correct printer(s) based on category route rules.
 * Returns a map of printerId -> items to print on that printer.
 */
export function routeKitchenItems(
  items: CartItem[],
  locationId: string,
): Map<string, CartItem[]> {
  const { routeRules } = usePrinterStore.getState();
  const kitchenPrinters = getKitchenPrinters(locationId);
  const result = new Map<string, CartItem[]>();

  if (kitchenPrinters.length === 0) {
    return result;
  }

  // Default kitchen printer (first one, or one marked as default)
  const defaultKitchenPrinter =
    kitchenPrinters.find((p) => p.isDefaultKitchen) ?? kitchenPrinters[0];

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
