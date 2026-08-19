import { NativeModules, Platform } from "react-native";

export interface UsbPrinterStatus {
  isOnline: boolean;
  hasPaper: boolean;
  coverOpen: boolean;
  errorMessage: string | null;
}

interface UsbPrinterNative {
  hasPermission(vendorId: number, productId: number): Promise<boolean>;
  requestPermission(vendorId: number, productId: number): Promise<boolean>;
  printBytes(
    vendorId: number,
    productId: number,
    base64: string,
  ): Promise<boolean>;
  getStatus(vendorId: number, productId: number): Promise<UsbPrinterStatus>;
}

const { UsbPrinterModule } = NativeModules as {
  UsbPrinterModule?: UsbPrinterNative;
};

function ensureNative(): UsbPrinterNative {
  if (!UsbPrinterModule) {
    throw new Error("UsbPrinterModule native module is unavailable");
  }
  return UsbPrinterModule;
}

/** True when the app already holds USB permission for this device. */
export async function usbPrinterHasPermission(
  vendorId: number,
  productId: number,
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    return await ensureNative().hasPermission(vendorId, productId);
  } catch (e) {
    console.warn("[UsbPrinter] hasPermission failed:", e);
    return false;
  }
}

/** Prompts the Android USB permission dialog (best done during provisioning). */
export async function usbPrinterRequestPermission(
  vendorId: number,
  productId: number,
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    return await ensureNative().requestPermission(vendorId, productId);
  } catch (e) {
    console.warn("[UsbPrinter] requestPermission failed:", e);
    return false;
  }
}

/** Writes ESC/POS bytes (base64) to the printer. Throws on failure (retry). */
export async function usbPrinterPrintBytes(
  vendorId: number,
  productId: number,
  base64: string,
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  return ensureNative().printBytes(vendorId, productId, base64);
}

export async function usbPrinterGetStatus(
  vendorId: number,
  productId: number,
): Promise<UsbPrinterStatus | null> {
  if (Platform.OS !== "android") return null;
  try {
    return await ensureNative().getStatus(vendorId, productId);
  } catch (e) {
    console.warn("[UsbPrinter] getStatus failed:", e);
    return null;
  }
}
