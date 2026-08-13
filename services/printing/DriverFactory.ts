import { PrinterConfig } from "@/types/printer";
import { DejavooDriver } from "./drivers/DejavooDriver";
import { LandiDriver } from "./drivers/LandiDriver";
import { NetworkDriver } from "./drivers/NetworkDriver";
import { PrinterDriver } from "./drivers/PrinterDriver";
import { StarMicronicsDriver } from "./drivers/StarMicronicsDriver";
import { UsbEscPosDriver } from "./drivers/UsbEscPosDriver";

/** Max drivers to cache before evicting the oldest non-Star entry. */
const MAX_DRIVER_CACHE = 10;
const driverCache = new Map<string, PrinterDriver>();

export function getDriver(config: PrinterConfig): PrinterDriver {
  const existing = driverCache.get(config.id);
  if (existing) {
    // Evict stale Star driver if printer config changed (IP, capabilities)
    if (
      existing instanceof StarMicronicsDriver &&
      existing.hasConfigChanged(config)
    ) {
      existing.disconnect().catch(() => {});
      driverCache.delete(config.id);
      // Fall through to create new driver
    } else {
      return existing;
    }
  }

  // Evict oldest entry when at capacity (skip Stars — they're expensive to reconnect)
  if (driverCache.size >= MAX_DRIVER_CACHE) {
    for (const [key, driver] of driverCache) {
      if (!(driver instanceof StarMicronicsDriver)) {
        driver.disconnect().catch(() => {});
        driverCache.delete(key);
        break;
      }
    }
  }

  let driver: PrinterDriver;

  switch (config.printerType) {
    case "builtin_landi":
      driver = new LandiDriver();
      break;
    case "dejavoo_spin_p":
      driver = new DejavooDriver();
      break;
    case "star_micronics":
      driver = new StarMicronicsDriver();
      break;
    case "generic_escpos":
      // USB-attached ESC/POS printers use the native bulk-transfer driver;
      // network ESC/POS is still the (unimplemented) NetworkDriver stub.
      driver =
        config.connectionType === "usb"
          ? new UsbEscPosDriver()
          : new NetworkDriver();
      break;
    default:
      throw new Error(`Unknown printer driver type: ${config.printerType}`);
  }

  driverCache.set(config.id, driver);
  return driver;
}

export function clearDriverCache(): void {
  for (const driver of driverCache.values()) {
    driver.disconnect().catch(() => {});
  }
  driverCache.clear();
}

export function removeDriverFromCache(printerId: string): void {
  const driver = driverCache.get(printerId);
  if (driver) {
    driver.disconnect().catch(() => {});
    driverCache.delete(printerId);
  }
}
