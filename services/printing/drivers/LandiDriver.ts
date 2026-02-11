import { PrintDocument } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";
import {
  initLandiPrinter,
  getLandiPrinterStatus,
  printLandiDocument,
  openLandiCashDrawer,
} from "@/native/LandiPrinter";
import { PrinterDriver } from "./PrinterDriver";

export class LandiDriver implements PrinterDriver {
  readonly supportsRawPrint = false;
  private connected = false;

  async initialize(_config: PrinterConfig): Promise<void> {
    const success = await initLandiPrinter();
    if (!success) {
      throw new Error("Failed to initialize Landi printer");
    }
    this.connected = true;
  }

  async getStatus(): Promise<PrinterStatusResult> {
    const status = await getLandiPrinterStatus();
    if (!status) {
      return {
        isOnline: false,
        hasPaper: false,
        coverOpen: false,
        errorMessage: "Unable to get printer status",
      };
    }
    return {
      isOnline: status.isOnline,
      hasPaper: status.hasPaper,
      coverOpen: status.coverOpen,
      errorMessage: status.errorMessage ?? undefined,
    };
  }

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error(
      "Landi builtin printer does not support raw ESC/POS. Use printDocument() instead.",
    );
  }

  async printDocument(doc: PrintDocument): Promise<void> {
    if (!this.connected) {
      throw new Error("Landi printer not initialized");
    }
    await printLandiDocument(JSON.stringify(doc));
  }

  async openCashDrawer(): Promise<void> {
    if (!this.connected) {
      throw new Error("Landi printer not initialized");
    }
    await openLandiCashDrawer();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
