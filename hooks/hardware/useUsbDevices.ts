// hooks/hardware/useUsbDevices.ts
// Surfaces the USB devices the native HardwareDetectionModule already
// enumerates, plus live hotplug updates, so JS/UI (kiosk printer picker) can
// let staff pick a connected printer. Detection-only — no device is opened, so
// no USB permission is required to list vendor/product/name.

import {
  detectNativeHardware,
  hardwareEvents,
  type HardwareDetectionResult,
} from "@/native/HardwareDetection";
import {
  isLikelyUsbPrinter,
  sortUsbDevicesForPicker,
  type UsbDeviceInfo,
} from "@/lib/usbPrinterVendors";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseUsbDevicesResult {
  /** Every connected USB device, printer-candidates sorted first. */
  usbDevices: UsbDeviceInfo[];
  /** Subset that looks like a printer (class 7 or a known printer vendor). */
  usbPrinterCandidates: UsbDeviceInfo[];
  /** Native reports an integrated printer on this device (e.g. all-in-one POS). */
  hasBuiltinPrinter: boolean;
  /** Device exposes a USB host port at all. */
  hasUsbHost: boolean;
  /** Device model string from native (used to name the built-in printer). */
  deviceModel: string | null;
  /** True until the first detection resolves. */
  loading: boolean;
  /** Re-run native detection on demand (the "Detect" button). */
  refresh: () => Promise<void>;
}

/**
 * Reads `detectNativeHardware()` once on mount and then keeps the snapshot fresh
 * via the native `onHardwareChanged` event, which fires a *complete* hardware
 * snapshot on every USB attach/detach — so replacing state from the event never
 * drops the device list.
 *
 * Subscribes to `hardwareEvents` directly (not the single-subscription
 * `hardwareEventListener` helper) so multiple screens can observe hotplug
 * independently without clobbering each other.
 */
export function useUsbDevices(): UseUsbDevicesResult {
  const [result, setResult] = useState<HardwareDetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const hw = await detectNativeHardware();
      if (mountedRef.current) setResult(hw);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial detection.
    void refresh();

    // Live hotplug refresh — payload is a full HardwareDetectionResult.
    const sub = hardwareEvents?.addListener(
      "onHardwareChanged",
      (hw: HardwareDetectionResult) => {
        if (mountedRef.current) setResult(hw);
      },
    );

    return () => {
      mountedRef.current = false;
      sub?.remove();
    };
  }, [refresh]);

  const rawDevices = result?.connectedUsbDevices ?? [];
  const usbDevices = sortUsbDevicesForPicker(rawDevices);
  const usbPrinterCandidates = usbDevices.filter(isLikelyUsbPrinter);

  return {
    usbDevices,
    usbPrinterCandidates,
    hasBuiltinPrinter: result?.hasPrinter ?? false,
    hasUsbHost: result?.hasUsbHost ?? false,
    deviceModel: result?.model ?? null,
    loading,
    refresh,
  };
}
