import {
  StarDeviceDiscoveryManagerFactory,
  StarDeviceDiscoveryManager,
  StarPrinter,
  StarPrinterModel,
  StarConnectionSettings,
  InterfaceType,
} from "react-native-star-io10";
import { getStarPrinterMutex } from "../starPrinterMutex";

// ============================================================================
// TYPES
// ============================================================================

export interface DiscoveredStarPrinter {
  identifier: string;
  ipAddress: string;
  macAddress: string | null;
  model: StarPrinterModel;
  modelName: string;
  capabilities: {
    supportsAutoCut: boolean;
    paperWidth: number;
    maxCharsPerLine: number;
    suggestedRole: "receipt" | "kitchen";
    graphicsOnly: boolean;
  };
}

// ============================================================================
// MODULE STATE
// ============================================================================

let activeManager: StarDeviceDiscoveryManager | null = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Scans the LAN for Star Micronics printers.
 * Returns deduplicated list of discovered printers after timeout.
 */
export async function discoverStarPrinters(
  timeoutMs = 10000,
): Promise<DiscoveredStarPrinter[]> {
  // Stop any active scan first
  await stopDiscovery();

  const found = new Map<string, DiscoveredStarPrinter>();

  const manager = await StarDeviceDiscoveryManagerFactory.create([
    InterfaceType.Lan,
  ]);
  activeManager = manager;
  manager.discoveryTime = timeoutMs;

  return new Promise<DiscoveredStarPrinter[]>((resolve, reject) => {
    manager.onPrinterFound = (printer: StarPrinter) => {
      try {
        const settings = printer.connectionSettings;
        const info = printer.information;

        const identifier = settings.identifier;
        const ipAddress =
          info?.detail?.lan?.ipAddress ?? identifier;
        const macAddress =
          info?.detail?.lan?.macAddress ?? null;
        const model = info?.model ?? StarPrinterModel.Unknown;

        // Deduplicate by IP
        if (!found.has(ipAddress)) {
          found.set(ipAddress, {
            identifier,
            ipAddress,
            macAddress,
            model,
            modelName: getModelDisplayName(model),
            capabilities: inferCapabilities(model),
          });
        }
      } catch (e) {
        console.warn("[StarDiscovery] Error processing found printer:", e);
      }
    };

    manager.onDiscoveryFinished = () => {
      activeManager = null;
      resolve(Array.from(found.values()));
    };

    manager.startDiscovery().catch((err) => {
      activeManager = null;
      reject(err);
    });
  });
}

/**
 * Stops any active discovery scan.
 */
export async function stopDiscovery(): Promise<void> {
  if (activeManager) {
    try {
      await activeManager.stopDiscovery();
    } catch {
      // Already stopped or never started
    }
    activeManager = null;
  }
}

/**
 * Probes a Star printer at a known IP address by connecting directly.
 * Opens the printer to read model info, verifies status, then cleans up.
 * Throws on timeout, unreachable, or printer error.
 */
export async function probeStarPrinterByIp(
  ipAddress: string,
): Promise<DiscoveredStarPrinter> {
  // Validate IPv4 format
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ipAddress)) {
    throw new Error("Invalid IP address format. Expected format: 192.168.1.100");
  }

  const mutex = getStarPrinterMutex(ipAddress);
  return mutex.runExclusive(async () => {
    const settings = new StarConnectionSettings();
    settings.interfaceType = InterfaceType.Lan;
    settings.identifier = ipAddress;
    settings.autoSwitchInterface = false; // LAN only — skip BT/USB probing

    const printer = new StarPrinter(settings);
    printer.openTimeout = 5000;
    printer.getStatusTimeout = 5000;

    try {
      // Open populates printer.information.model from firmware
      await printer.open();

      const model = printer.information?.model ?? StarPrinterModel.Unknown;

      // Verify the printer is functional
      const status = await printer.getStatus();
      if (status.hasError) {
        const msg = status.paperEmpty
          ? "Printer found but paper is empty"
          : status.coverOpen
            ? "Printer found but cover is open"
            : "Printer found but has an error";
        throw new Error(msg);
      }

      await printer.close();
      await printer.dispose();

      return {
        identifier: ipAddress,
        ipAddress,
        macAddress: null,
        model,
        modelName: getModelDisplayName(model),
        capabilities: inferCapabilities(model),
      };
    } catch (e: any) {
      // Clean up on failure
      try { await printer.close(); } catch {}
      try { await printer.dispose(); } catch {}

      // Re-throw with descriptive message if not already descriptive
      if (e.message?.includes("Printer found")) {
        throw e;
      }
      throw new Error(
        `Could not connect to printer at ${ipAddress}. Verify the IP address and that the printer is powered on and connected to the network.`,
      );
    }
  });
}

// ============================================================================
// CAPABILITY INFERENCE
// ============================================================================

/**
 * Maps a Star printer model to default capabilities.
 */
export function inferCapabilities(model: StarPrinterModel): DiscoveredStarPrinter["capabilities"] {
  // Graphics-only printers (no actionPrintText support — must use actionPrintImage)
  // See react-native-star-io10 SDK example: TSP100III and TSP100IIU+ are graphics-only.
  const graphicsOnlyModels: StarPrinterModel[] = [
    StarPrinterModel.TSP100IIILAN,
    StarPrinterModel.TSP100IIIW,
    StarPrinterModel.TSP100IIIBI,
    StarPrinterModel.TSP100IIIU,
    StarPrinterModel.TSP100IIU_Plus,
    StarPrinterModel.TSP100IV,
    StarPrinterModel.TSP100IV_SK,
  ];

  const isGraphicsOnly = graphicsOnlyModels.includes(model);

  // Impact printers (kitchen / tear-off, no auto-cut)
  const impactModels: StarPrinterModel[] = [
    StarPrinterModel.SP700,
    StarPrinterModel.TUP500,
  ];

  if (impactModels.includes(model)) {
    return {
      supportsAutoCut: false,
      paperWidth: 76,
      maxCharsPerLine: 42,
      suggestedRole: "kitchen",
      graphicsOnly: false,
    };
  }

  // Small/mobile printers (58mm paper)
  const smallModels: StarPrinterModel[] = [
    StarPrinterModel.SM_S210i,
    StarPrinterModel.SM_S230i,
    StarPrinterModel.SM_L200,
    StarPrinterModel.SM_L300,
    StarPrinterModel.mPOP,
  ];

  if (smallModels.includes(model)) {
    return {
      supportsAutoCut: true,
      paperWidth: 58,
      maxCharsPerLine: 32,
      suggestedRole: "receipt",
      graphicsOnly: false,
    };
  }

  // Default: thermal receipt (80mm, auto-cut) — TSP100 series, mC-Print, BSC, etc.
  return {
    supportsAutoCut: true,
    paperWidth: 80,
    maxCharsPerLine: 48,
    suggestedRole: "receipt",
    graphicsOnly: isGraphicsOnly,
  };
}

// ============================================================================
// DISPLAY NAME HELPER
// ============================================================================

function getModelDisplayName(model: StarPrinterModel): string {
  const names: Partial<Record<StarPrinterModel, string>> = {
    [StarPrinterModel.TSP100IV]: "TSP100IV",
    [StarPrinterModel.TSP100IV_SK]: "TSP100IV-SK",
    [StarPrinterModel.TSP100IIILAN]: "TSP100III LAN",
    [StarPrinterModel.TSP100IIIW]: "TSP100III WiFi",
    [StarPrinterModel.TSP100IIIBI]: "TSP100III BT",
    [StarPrinterModel.TSP100IIIU]: "TSP100III USB",
    [StarPrinterModel.TSP100LAN]: "TSP100 LAN",
    [StarPrinterModel.TSP100ECO]: "TSP100ECO",
    [StarPrinterModel.TSP100IIU_Plus]: "TSP100IIU+",
    [StarPrinterModel.TSP650II]: "TSP650II",
    [StarPrinterModel.TSP700II]: "TSP700II",
    [StarPrinterModel.TSP800II]: "TSP800II",
    [StarPrinterModel.TSP043]: "TSP043",
    [StarPrinterModel.SP700]: "SP700",
    [StarPrinterModel.TUP500]: "TUP500",
    [StarPrinterModel.mPOP]: "mPOP",
    [StarPrinterModel.mC_Print2]: "mC-Print2",
    [StarPrinterModel.mC_Print3]: "mC-Print3",
    [StarPrinterModel.mC_Label2]: "mC-Label2",
    [StarPrinterModel.mC_Label3]: "mC-Label3",
    [StarPrinterModel.SM_S210i]: "SM-S210i",
    [StarPrinterModel.SM_S230i]: "SM-S230i",
    [StarPrinterModel.SM_T300]: "SM-T300",
    [StarPrinterModel.SM_T300i]: "SM-T300i",
    [StarPrinterModel.SM_T400i]: "SM-T400i",
    [StarPrinterModel.SM_L200]: "SM-L200",
    [StarPrinterModel.SM_L300]: "SM-L300",
    [StarPrinterModel.BSC10]: "BSC10",
    [StarPrinterModel.BSC10II]: "BSC10II",
    [StarPrinterModel.SK1_2xx]: "SK1-2xx",
    [StarPrinterModel.SK1_3xx]: "SK1-3xx",
  };
  return names[model] ?? model ?? "Unknown Star Printer";
}
