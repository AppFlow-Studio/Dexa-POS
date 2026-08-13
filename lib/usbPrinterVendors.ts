// lib/usbPrinterVendors.ts
// Small, self-contained helpers for labelling connected USB devices in the
// kiosk printer picker. The native HardwareDetectionModule enumerates every
// connected USB device (vendorId / productId / deviceName / deviceClass); this
// file turns those raw numbers into human-readable labels and a "likely
// printer" hint so staff can pick the right device on a mixed/unknown kiosk.
//
// No native dependency — pure data + formatting.

/** One entry from HardwareDetectionResult.connectedUsbDevices. */
export interface UsbDeviceInfo {
  vendorId: number;
  productId: number;
  deviceName: string;
  deviceClass: number;
}

/** USB device/interface class 7 == Printer (per the USB spec). */
export const USB_PRINTER_CLASS = 7;

interface VendorEntry {
  name: string;
  /** True when this vendor overwhelmingly ships receipt/label printers. */
  likelyPrinter: boolean;
}

// Vendor IDs are keyed in decimal (JS number) — the native side reports
// device.getVendorId() as a plain int. Comments show the hex form for
// cross-referencing lsusb / the USB-IF database.
//
// The first block mirrors the printer vendors HardwareDetectionModule already
// recognises; the rest are well-known thermal / label printer makers.
const VENDOR_MAP: Record<number, VendorEntry> = {
  0x0519: { name: "Star Micronics", likelyPrinter: true },
  0x04b8: { name: "Epson", likelyPrinter: true },
  0x154f: { name: "Bixolon", likelyPrinter: true },
  0x0fe6: { name: "iMin / ICS Advent", likelyPrinter: true },
  0x28e9: { name: "GoDEX", likelyPrinter: true },
  0x0a5f: { name: "Zebra", likelyPrinter: true },
  0x1d90: { name: "Citizen", likelyPrinter: true },
  0x0dd4: { name: "Custom / SNBC", likelyPrinter: true },
  0x6868: { name: "Zjiang / Xprinter", likelyPrinter: true },
  0x0416: { name: "Nuvoton (POS printer)", likelyPrinter: true },
  0x20d1: { name: "Rongta", likelyPrinter: true },
  0x0483: { name: "STMicroelectronics", likelyPrinter: false },
  0x1a86: { name: "QinHeng (CH34x serial)", likelyPrinter: false },
  0x067b: { name: "Prolific (PL2303 serial)", likelyPrinter: false },
};

/** Human-friendly vendor name, or null when the vendor ID is unknown. */
export function usbVendorName(vendorId: number): string | null {
  return VENDOR_MAP[vendorId]?.name ?? null;
}

/** e.g. "0x0519" */
function toHex4(id: number): string {
  return `0x${(id >>> 0).toString(16).padStart(4, "0")}`;
}

/** e.g. "VID 0x0519 · PID 0x0003" — stable identity shown under the label. */
export function usbIdLabel(dev: UsbDeviceInfo): string {
  return `VID ${toHex4(dev.vendorId)} · PID ${toHex4(dev.productId)}`;
}

/**
 * Best-effort "is this a printer" heuristic for the picker. Deliberately
 * permissive: the kiosk hardware is mixed/unknown, so we surface every device
 * but flag the ones that are almost certainly printers.
 *
 * Note: many composite POS printers report a device-level class of 0 (the
 * printer class lives on an interface, which the JS layer doesn't see), so we
 * can't rely on deviceClass alone — the vendor map is the stronger signal.
 */
export function isLikelyUsbPrinter(dev: UsbDeviceInfo): boolean {
  if (dev.deviceClass === USB_PRINTER_CLASS) return true;
  return VENDOR_MAP[dev.vendorId]?.likelyPrinter ?? false;
}

export interface UsbDeviceDescription {
  /** Vendor name when known, else a generic label. */
  label: string;
  vendorName: string | null;
  idLabel: string;
  likelyPrinter: boolean;
}

export function describeUsbDevice(dev: UsbDeviceInfo): UsbDeviceDescription {
  const vendorName = usbVendorName(dev.vendorId);
  return {
    label: vendorName ?? "USB device",
    vendorName,
    idLabel: usbIdLabel(dev),
    likelyPrinter: isLikelyUsbPrinter(dev),
  };
}

/**
 * Stable identity string for dedupe / persistence when a real USB serial isn't
 * available (reading the serial requires USB permission, which detection does
 * not hold). Uses the OS device path plus vendor:product.
 */
export function usbDeviceKey(dev: UsbDeviceInfo): string {
  return `${dev.deviceName}|${toHex4(dev.vendorId)}:${toHex4(dev.productId)}`;
}

/** Printer candidates first (badged), then the rest — for a stable list order. */
export function sortUsbDevicesForPicker(
  devices: UsbDeviceInfo[],
): UsbDeviceInfo[] {
  return [...devices].sort((a, b) => {
    const pa = isLikelyUsbPrinter(a) ? 0 : 1;
    const pb = isLikelyUsbPrinter(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.deviceName.localeCompare(b.deviceName);
  });
}
