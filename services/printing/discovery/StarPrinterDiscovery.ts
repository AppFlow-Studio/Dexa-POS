import {
  StarDeviceDiscoveryManagerFactory,
  StarDeviceDiscoveryManager,
  StarPrinter,
  StarPrinterModel,
  InterfaceType,
} from "react-native-star-io10";

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

// ============================================================================
// CAPABILITY INFERENCE
// ============================================================================

/**
 * Maps a Star printer model to default capabilities.
 */
export function inferCapabilities(model: StarPrinterModel): DiscoveredStarPrinter["capabilities"] {
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
    };
  }

  // Default: thermal receipt (80mm, auto-cut) — TSP100 series, mC-Print, BSC, etc.
  return {
    supportsAutoCut: true,
    paperWidth: 80,
    maxCharsPerLine: 48,
    suggestedRole: "receipt",
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
