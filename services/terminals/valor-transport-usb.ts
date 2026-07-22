// ============================================================
// Valor USB Transport — USB CDC serial implementation
// File: services/terminals/valor-transport-usb.ts
// ============================================================
// Reuses the VENDOR-AGNOSTIC native `@/modules/castles-usb` module (it lists
// all serial devices and its events are unfiltered — the vendor filter is
// JS-side). Only the device-selection filter + baud differ from Castles.
//
// The Valor VP terminal enumerates as a Qualcomm "Android Diag" CDC serial
// device — USB vendor id 0x1E0E (Qualcomm). The device_filter.xml declares the
// same VID (decimal 7694) so Android grants persistent USB permission and
// delivers USB_DEVICE_ATTACHED for zero-touch auto-connect. NOTE: 0x1E0E is a
// shared Qualcomm VID, so in a multi-device setup prefer the product-name hints
// below to disambiguate. Requires a native rebuild after changing the filter.
// ============================================================

import * as Sentry from "@sentry/react-native";
import type { EventSubscription } from "expo-modules-core";
import {
  listDevices,
  requestPermission,
  open as usbOpen,
  write as usbWrite,
  close as usbClose,
  addDataListener,
  addErrorListener,
  addDetachedListener,
  type UsbDeviceInfo,
} from "@/modules/castles-usb";
import type { ITerminalTransport } from "./valor-transport.types";
import { VALOR_USB_BAUD_RATE } from "@/types/valor";

/** Valor VP terminal USB vendor id — 0x1E0E (Qualcomm "Android Diag" CDC). */
export const VALOR_USB_VENDOR_ID = 0x1e0e;
/** Product-name substrings to match a Valor terminal as a fallback. */
const VALOR_PRODUCT_HINTS = ["VALOR", "VP500", "VP100"];

export class ValorUsbTransport implements ITerminalTransport {
  private _isOpen = false;
  private _connectedDeviceId: number | null = null;
  private _lastDataReceivedAt = 0;

  private _dataCallbacks: Array<(chunk: string) => void> = [];
  private _errorCallbacks: Array<(error: Error) => void> = [];
  private _closeCallbacks: Array<(hadError: boolean) => void> = [];
  private _subscriptions: EventSubscription[] = [];

  get isOpen(): boolean {
    return this._isOpen;
  }

  secondsSinceLastData(): number {
    if (this._lastDataReceivedAt === 0) return Infinity;
    return (Date.now() - this._lastDataReceivedAt) / 1000;
  }

  async connect(): Promise<void> {
    let devices: UsbDeviceInfo[];
    try {
      devices = await listDevices();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(
        `Unable to scan USB devices (${error.message}). Check Android USB permissions and reconnect the terminal.`,
      );
    }

    const device = this._findValorTerminal(devices);
    if (!device) {
      throw new Error(
        "Valor terminal not found on USB. Check cable connection, power, and that USB CDC (Retail USB) is enabled on the terminal.",
      );
    }

    let hasPermission = device.hasPermission;
    if (!hasPermission) {
      const granted = await requestPermission(device.deviceId);
      if (!granted) {
        throw new Error("USB permission denied. Allow USB access when prompted and try again.");
      }
    }

    await usbOpen(device.deviceId, VALOR_USB_BAUD_RATE);

    this._subscriptions.push(
      addDataListener((event) => {
        this._lastDataReceivedAt = Date.now();
        for (const cb of [...this._dataCallbacks]) {
          try { cb(event.data); } catch { /* ignore */ }
        }
      }),
    );
    this._subscriptions.push(
      addErrorListener((event) => {
        try {
          Sentry.addBreadcrumb({
            category: "hardware.usb",
            level: "error",
            message: `Valor USB read-thread error: ${event.message}`,
            data: { deviceId: this._connectedDeviceId },
          });
        } catch { /* non-fatal */ }
        const error = new Error(event.message);
        for (const cb of [...this._errorCallbacks]) {
          try { cb(error); } catch { /* ignore */ }
        }
      }),
    );
    this._subscriptions.push(
      addDetachedListener((event) => {
        if (event.deviceId !== this._connectedDeviceId) return;
        this._isOpen = false;
        this._connectedDeviceId = null;
        for (const cb of [...this._closeCallbacks]) {
          try { cb(true); } catch { /* ignore */ }
        }
      }),
    );

    this._connectedDeviceId = device.deviceId;
    this._isOpen = true;
    this._lastDataReceivedAt = Date.now();
  }

  disconnect(): void {
    this._isOpen = false;
    for (const sub of this._subscriptions) {
      try { sub.remove(); } catch { /* ignore */ }
    }
    this._subscriptions = [];
    this._dataCallbacks = [];
    this._errorCallbacks = [];
    this._closeCallbacks = [];
    usbClose().catch(() => { /* may already be closed */ });
    this._connectedDeviceId = null;
  }

  async write(data: string): Promise<void> {
    if (!this._isOpen) throw new Error("Transport is not open");
    try {
      await usbWrite(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const cb of [...this._errorCallbacks]) {
        try { cb(error); } catch { /* ignore */ }
      }
      throw error;
    }
  }

  onData(cb: (chunk: string) => void): void { this._dataCallbacks.push(cb); }
  onError(cb: (error: Error) => void): void { this._errorCallbacks.push(cb); }
  onClose(cb: (hadError: boolean) => void): void { this._closeCallbacks.push(cb); }
  offData(cb: (chunk: string) => void): void {
    const i = this._dataCallbacks.indexOf(cb); if (i !== -1) this._dataCallbacks.splice(i, 1);
  }
  offError(cb: (error: Error) => void): void {
    const i = this._errorCallbacks.indexOf(cb); if (i !== -1) this._errorCallbacks.splice(i, 1);
  }
  offClose(cb: (hadError: boolean) => void): void {
    const i = this._closeCallbacks.indexOf(cb); if (i !== -1) this._closeCallbacks.splice(i, 1);
  }
  removeAllListeners(): void {
    this._dataCallbacks = [];
    this._errorCallbacks = [];
    this._closeCallbacks = [];
    for (const sub of this._subscriptions) {
      try { sub.remove(); } catch { /* ignore */ }
    }
    this._subscriptions = [];
  }

  private _findValorTerminal(devices: UsbDeviceInfo[]): UsbDeviceInfo | undefined {
    const byVendor = devices.find((d) => d.vendorId === VALOR_USB_VENDOR_ID);
    if (byVendor) return byVendor;
    return devices.find((d) => {
      const name = (d.productName || "").toUpperCase();
      return VALOR_PRODUCT_HINTS.some((h) => name.includes(h));
    });
  }
}
