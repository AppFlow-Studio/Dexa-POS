/**
 * starPrinterFactory.ts
 *
 * Single source of truth for creating StarPrinter instances.
 * All consumers (driver, health check, discovery) use this factory
 * to ensure consistent connection settings and timeouts.
 */

import {
  StarPrinter,
  StarConnectionSettings,
  InterfaceType,
} from "react-native-star-io10";

export type TimeoutProfile = "print" | "probe";

/**
 * Creates a fresh StarPrinter instance with consistent connection settings.
 *
 * @param networkAddress - IP address of the printer
 * @param profile - "print" for print operations (longer timeouts),
 *                  "probe" for status checks / discovery (shorter timeouts)
 */
export function createStarPrinterInstance(
  networkAddress: string,
  profile: TimeoutProfile = "print",
): StarPrinter {
  const settings = new StarConnectionSettings();
  settings.interfaceType = InterfaceType.Lan;
  settings.identifier = networkAddress;
  settings.autoSwitchInterface = false; // LAN only — skip BT/USB fallback probing

  const printer = new StarPrinter(settings);
  if (profile === "print") {
    // Open timeout raised from 8s → 12s: weak restaurant Wi-Fi can stretch
    // the TCP handshake past 8s, surfacing as a false "unavailable" on an
    // otherwise idle Star printer. Keep probe profile short (5s) so periodic
    // discovery / health checks stay snappy.
    printer.openTimeout = 12000;
    printer.getStatusTimeout = 5000;
    printer.printTimeout = 30000;
  } else {
    printer.openTimeout = 5000;
    printer.getStatusTimeout = 5000;
  }
  return printer;
}

/** Dispose a printer instance, swallowing any errors. */
export async function disposeQuietly(printer: StarPrinter): Promise<void> {
  try {
    await printer.dispose();
  } catch {
    /* ignore */
  }
}

/** Close then dispose a printer instance, swallowing any errors. */
export async function closeAndDispose(printer: StarPrinter): Promise<void> {
  try {
    await printer.close();
  } catch {
    /* ignore */
  }
  try {
    await printer.dispose();
  } catch {
    /* ignore */
  }
}
