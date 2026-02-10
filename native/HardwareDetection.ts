import { NativeModules, NativeEventEmitter, Platform } from 'react-native'

export interface HardwareDetectionResult {
  hasSecondaryDisplay: boolean;
  secondaryDisplayWidth: number;
  secondaryDisplayHeight: number;
  hasNfc: boolean;
  hasUsbHost: boolean;
  hasPrinter: boolean;
  hasBarcodeScanner: boolean;
  hasCashDrawer: boolean;
  connectedUsbDevices: Array<{
    vendorId: number;
    productId: number;
    deviceName: string;
    deviceClass: number;
  }>;
  manufacturer: string;
  model: string;
  board: string;
}

interface HardwareDetectionNative {
  detectHardware(): Promise<HardwareDetectionResult>;
}

const { HardwareDetectionModule } = NativeModules as {
  HardwareDetectionModule: HardwareDetectionNative;
};

export async function detectNativeHardware(): Promise<HardwareDetectionResult | null> {
  if (Platform.OS !== 'android') return null;
  try {
    return await HardwareDetectionModule.detectHardware();
  } catch (e) {
    console.warn('[HardwareDetection] Native detection failed:', e);
    return null;
  }
}

export const hardwareEvents = Platform.OS === 'android'
  ? new NativeEventEmitter(NativeModules.HardwareDetectionModule)
  : null;
