import {
  usbPrinterGetStatus,
  usbPrinterHasPermission,
  usbPrinterPrintBytes,
} from "@/native/UsbPrinter";
import { PrintDocument } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";
import { EscPosBuilder } from "../escpos/EscPosBuilder";
import { renderDocumentToEscPos } from "../renderers/EscPosRenderer";
import { PrinterDriver } from "./PrinterDriver";

/**
 * Generic ESC/POS printer over USB (bulk transfer). Documents are rendered to
 * ESC/POS bytes in JS (shared with the network path) and handed to the native
 * UsbPrinterModule. The vendor/product IDs are read from the printer config's
 * metadata (written by addUsbPrinter during provisioning).
 */
export class UsbEscPosDriver implements PrinterDriver {
  readonly supportsRawPrint = true;
  private vendorId = 0;
  private productId = 0;
  private connected = false;

  async initialize(config: PrinterConfig): Promise<void> {
    const meta = (config.metadata ?? {}) as Record<string, unknown>;
    const vid = Number(meta.usbVendorId);
    const pid = Number(meta.usbProductId);
    if (!vid || Number.isNaN(vid) || Number.isNaN(pid)) {
      throw new Error(
        "USB printer config is missing usbVendorId/usbProductId in metadata",
      );
    }
    this.vendorId = vid;
    this.productId = pid;

    // Permission is requested at provisioning time (and granted persistently
    // for device_filter-listed vendors). If it's missing, fail clearly rather
    // than surfacing an opaque bulk-transfer error.
    const granted = await usbPrinterHasPermission(vid, pid);
    if (!granted) {
      throw new Error(
        "USB printer permission not granted — re-assign the printer in kiosk settings to grant access.",
      );
    }
    this.connected = true;
  }

  async getStatus(): Promise<PrinterStatusResult> {
    const status = await usbPrinterGetStatus(this.vendorId, this.productId);
    if (!status) {
      return {
        isOnline: false,
        hasPaper: false,
        coverOpen: false,
        errorMessage: "USB printer unavailable",
      };
    }
    return {
      isOnline: status.isOnline,
      hasPaper: status.hasPaper,
      coverOpen: status.coverOpen,
      errorMessage: status.errorMessage ?? undefined,
    };
  }

  async printRaw(data: Uint8Array): Promise<void> {
    if (!this.vendorId) throw new Error("USB printer not initialized");
    await usbPrinterPrintBytes(this.vendorId, this.productId, toBase64(data));
  }

  async printDocument(doc: PrintDocument): Promise<void> {
    const data = renderDocumentToEscPos(doc);
    await this.printRaw(data);
  }

  async openCashDrawer(): Promise<void> {
    const bytes = new EscPosBuilder().openCashDrawer().build();
    await this.printRaw(bytes);
  }

  async disconnect(): Promise<void> {
    // Native opens/closes the USB connection per write — nothing to hold open.
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
