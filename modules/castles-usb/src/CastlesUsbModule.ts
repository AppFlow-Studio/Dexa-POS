// ============================================================
// CastlesUsbModule — TypeScript wrapper for native Kotlin module
// ============================================================

import { requireNativeModule, EventSubscription } from 'expo-modules-core';

// ── Types ──

export interface UsbDeviceInfo {
  deviceId: number;
  vendorId: number;
  productId: number;
  productName: string;
  manufacturerName: string;
  serialNumber: string;
  driverName: string;
  hasPermission: boolean;
}

export interface CastlesUsbDataEvent {
  data: string;
}

export interface CastlesUsbErrorEvent {
  message: string;
}

export interface CastlesUsbDetachedEvent {
  deviceId: number;
}

// ── Native module ──

const CastlesUsb = requireNativeModule('CastlesUsbModule');

// ── Public API ──

/** Returns all USB serial devices discovered by the default prober. */
export function listDevices(): Promise<UsbDeviceInfo[]> {
  return CastlesUsb.listDevices();
}

/** Triggers the Android USB permission dialog. Resolves true if granted. */
export function requestPermission(deviceId: number): Promise<boolean> {
  return CastlesUsb.requestPermission(deviceId);
}

/** Opens USB serial connection and starts background read thread. */
export function open(deviceId: number, baudRate: number = 115200): Promise<void> {
  return CastlesUsb.open(deviceId, baudRate);
}

/** Sends a UTF-8 string to the open serial port. */
export function write(data: string): Promise<void> {
  return CastlesUsb.write(data);
}

/** Closes the serial port and stops the read thread. */
export function close(): Promise<void> {
  return CastlesUsb.close();
}

/** Synchronous check — returns true if a port is currently open. */
export function isOpen(): boolean {
  return CastlesUsb.isOpen();
}

// ── Event listeners ──

export function addDataListener(
  callback: (event: CastlesUsbDataEvent) => void
): EventSubscription {
  return CastlesUsb.addListener('onCastlesUsbData', callback);
}

export function addErrorListener(
  callback: (event: CastlesUsbErrorEvent) => void
): EventSubscription {
  return CastlesUsb.addListener('onCastlesUsbError', callback);
}

export function addDetachedListener(
  callback: (event: CastlesUsbDetachedEvent) => void
): EventSubscription {
  return CastlesUsb.addListener('onCastlesUsbDetached', callback);
}
