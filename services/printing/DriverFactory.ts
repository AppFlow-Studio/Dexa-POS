import { PrinterConfig } from "@/types/printer";
import { PrinterDriver } from "./drivers/PrinterDriver";
import { LandiDriver } from "./drivers/LandiDriver";
import { NetworkDriver } from "./drivers/NetworkDriver";
import { DejavooDriver } from "./drivers/DejavooDriver";
import { StarMicronicsDriver } from "./drivers/StarMicronicsDriver";

const driverCache = new Map<string, PrinterDriver>();

export function getDriver(config: PrinterConfig): PrinterDriver {
  const existing = driverCache.get(config.id);
  if (existing && existing.isConnected()) {
    return existing;
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
      driver = new NetworkDriver();
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
