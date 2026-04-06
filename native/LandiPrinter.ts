import { NativeModules, Platform } from "react-native";

export interface LandiPrinterStatus {
  isOnline: boolean;
  hasPaper: boolean;
  coverOpen: boolean;
  statusCode: string;
  errorMessage: string | null;
}

interface LandiPrinterNative {
  initPrinter(): Promise<boolean>;
  getPrinterStatus(): Promise<LandiPrinterStatus>;
  printDocument(documentJson: string): Promise<boolean>;
  openCashDrawer(): Promise<boolean>;
  setPrintDensity(level: number): Promise<number>;
}

const { LandiPrinterModule } = NativeModules as {
  LandiPrinterModule: LandiPrinterNative;
};

export async function initLandiPrinter(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    return await LandiPrinterModule.initPrinter();
  } catch (e) {
    console.warn("[LandiPrinter] Init failed:", e);
    return false;
  }
}

export async function getLandiPrinterStatus(): Promise<LandiPrinterStatus | null> {
  if (Platform.OS !== "android") return null;
  try {
    return await LandiPrinterModule.getPrinterStatus();
  } catch (e) {
    console.warn("[LandiPrinter] Status check failed:", e);
    return null;
  }
}

export async function printLandiDocument(documentJson: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    return await LandiPrinterModule.printDocument(documentJson);
  } catch (e) {
    console.warn("[LandiPrinter] Print failed:", e);
    throw e; // Re-throw for retry logic
  }
}

export async function openLandiCashDrawer(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    return await LandiPrinterModule.openCashDrawer();
  } catch (e) {
    console.warn("[LandiPrinter] Cash drawer failed:", e);
    return false;
  }
}

/**
 * Set the LANDI built-in printer's gray-level (density).
 * Accepted range is 1..8 (lower = lighter, higher = darker).
 * Values outside the range are clamped natively. Returns the applied level.
 *
 * Lower densities (3..4) generally reduce thermal bleed and vertical
 * streaks on long receipts at the cost of slightly lighter text.
 */
export async function setLandiPrintDensity(level: number): Promise<number | null> {
  if (Platform.OS !== "android") return null;
  try {
    return await LandiPrinterModule.setPrintDensity(level);
  } catch (e) {
    console.warn("[LandiPrinter] setPrintDensity failed:", e);
    return null;
  }
}
