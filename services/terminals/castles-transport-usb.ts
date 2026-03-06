// ============================================================
// Castles USB Transport — USB serial implementation
// File: services/terminals/castles-transport-usb.ts
// ============================================================
// Wraps the native CastlesUsbModule (Expo Modules API) into
// an ICastlesTransport for use by CastlesService.
// Saturn1000 auto-detected by vendorId 0x0CA6 (Castles Tech).
// ============================================================

import type { EventSubscription } from 'expo-modules-core';
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
} from '@/modules/castles-usb';
import type { ICastlesTransport } from './castles-transport.types';

/** Castles Technology USB vendor ID */
const CASTLES_VENDOR_ID = 0x0CA6;

/** Saturn1000 serial baud rate */
const SATURN_BAUD_RATE = 115200;

/**
 * USB serial transport for Castles Saturn1000 terminals.
 *
 * Connects to the Saturn1000 via Android USB host API. The native module
 * (CastlesUsbModule) handles the serial driver, permission dialog, and
 * background read thread. This class bridges native events into the
 * ICastlesTransport callback model that CastlesService expects.
 */
export class CastlesUsbTransport implements ICastlesTransport {
  private _isOpen = false;
  private _connectedDeviceId: number | null = null;

  // ── Callback arrays (same pattern as TCP transport) ──
  private _dataCallbacks: Array<(chunk: string) => void> = [];
  private _errorCallbacks: Array<(error: Error) => void> = [];
  private _closeCallbacks: Array<(hadError: boolean) => void> = [];

  // ── Native event subscriptions for cleanup ──
  private _subscriptions: EventSubscription[] = [];

  // ── ICastlesTransport ──

  get isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Connect to a Saturn1000 via USB serial.
   *
   * 1. Discovers all USB serial devices via the native prober.
   * 2. Finds Saturn1000 by vendor ID (0x0CA6), with fallback on product name.
   * 3. Requests USB permission (Android dialog, persists until app uninstall).
   * 4. Opens the serial port at 115200 baud.
   * 5. Subscribes to native data/error/detach events.
   */
  async connect(): Promise<void> {
    // Step 1: Discover USB serial devices
    const devices = await listDevices();
    console.log(
      `[CastlesUsbTransport] Found ${devices.length} USB serial device(s)`,
    );

    // Step 2: Find Saturn1000
    const device = this._findSaturn1000(devices);
    if (!device) {
      throw new Error(
        'Saturn1000 not found on USB. Check cable connection.',
      );
    }
    console.log(
      `[CastlesUsbTransport] Saturn1000 found: deviceId=${device.deviceId}, ` +
        `vendor=0x${device.vendorId.toString(16)}, product="${device.productName}"`,
    );

    // Step 3: Request USB permission
    const granted = await requestPermission(device.deviceId);
    if (!granted) {
      throw new Error(
        'USB permission denied. Please allow USB access when prompted.',
      );
    }

    // Step 4: Open serial port
    await usbOpen(device.deviceId, SATURN_BAUD_RATE);

    // Step 5: Subscribe to native events
    this._subscriptions.push(
      addDataListener((event) => {
        for (const cb of [...this._dataCallbacks]) {
          try { cb(event.data); } catch { /* ignore callback errors */ }
        }
      }),
    );

    this._subscriptions.push(
      addErrorListener((event) => {
        const error = new Error(event.message);
        for (const cb of [...this._errorCallbacks]) {
          try { cb(error); } catch { /* ignore callback errors */ }
        }
      }),
    );

    this._subscriptions.push(
      addDetachedListener((event) => {
        // Only handle detach for the device we're connected to
        if (event.deviceId !== this._connectedDeviceId) return;

        console.warn(
          `[CastlesUsbTransport] USB device detached (deviceId=${event.deviceId})`,
        );
        this._isOpen = false;
        this._connectedDeviceId = null;

        for (const cb of [...this._closeCallbacks]) {
          try { cb(true); } catch { /* ignore callback errors */ }
        }
      }),
    );

    this._connectedDeviceId = device.deviceId;
    this._isOpen = true;

    console.log(
      `[CastlesUsbTransport] Connected: deviceId=${device.deviceId}, baud=${SATURN_BAUD_RATE}`,
    );
  }

  /**
   * Disconnect and clean up the USB serial connection.
   * Removes all native event subscriptions and closes the port.
   */
  disconnect(): void {
    this._isOpen = false;

    // Remove native event subscriptions
    for (const sub of this._subscriptions) {
      try { sub.remove(); } catch { /* ignore */ }
    }
    this._subscriptions = [];

    // Clear callback arrays
    this._dataCallbacks = [];
    this._errorCallbacks = [];
    this._closeCallbacks = [];

    // Close native port (best-effort, may already be closed from detach)
    // usbClose() is async — fire-and-forget, swallow rejections
    usbClose().catch(() => { /* ignore — port may already be closed */ });

    this._connectedDeviceId = null;
    console.log('[CastlesUsbTransport] Disconnected');
  }

  /**
   * Write a UTF-8 string to the open serial port.
   * The native module handles buffering and the 2s write timeout.
   */
  write(data: string): void {
    if (!this._isOpen) {
      throw new Error('Transport is not open');
    }
    // Native write is async but we fire-and-forget per spec.
    // Errors propagate through the onError event channel.
    usbWrite(data).catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[CastlesUsbTransport] Write error:', error.message);
      for (const cb of [...this._errorCallbacks]) {
        try { cb(error); } catch { /* ignore */ }
      }
    });
  }

  // ── Listener management ──

  onData(cb: (chunk: string) => void): void {
    this._dataCallbacks.push(cb);
  }

  onError(cb: (error: Error) => void): void {
    this._errorCallbacks.push(cb);
  }

  onClose(cb: (hadError: boolean) => void): void {
    this._closeCallbacks.push(cb);
  }

  offData(cb: (chunk: string) => void): void {
    const idx = this._dataCallbacks.indexOf(cb);
    if (idx !== -1) this._dataCallbacks.splice(idx, 1);
  }

  offError(cb: (error: Error) => void): void {
    const idx = this._errorCallbacks.indexOf(cb);
    if (idx !== -1) this._errorCallbacks.splice(idx, 1);
  }

  offClose(cb: (hadError: boolean) => void): void {
    const idx = this._closeCallbacks.indexOf(cb);
    if (idx !== -1) this._closeCallbacks.splice(idx, 1);
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

  // ── Private helpers ──

  /**
   * Find a Saturn1000 in the discovered USB serial devices.
   * Primary match: vendor ID 0x0CA6 (Castles Technology).
   * Fallback: product name containing "Saturn", "CASTLES", or "S1000".
   */
  private _findSaturn1000(devices: UsbDeviceInfo[]): UsbDeviceInfo | undefined {
    // Primary: match by Castles vendor ID
    const byVendor = devices.find((d) => d.vendorId === CASTLES_VENDOR_ID);
    if (byVendor) return byVendor;

    // Fallback: match by product name
    return devices.find((d) => {
      const name = (d.productName || '').toUpperCase();
      return name.includes('SATURN') || name.includes('CASTLES') || name.includes('S1000');
    });
  }
}
