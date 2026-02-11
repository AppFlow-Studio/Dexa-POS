import { PrintDocument } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";
import { renderDocumentToEscPos } from "../renderers/EscPosRenderer";
import { PrinterDriver } from "./PrinterDriver";

/**
 * Network printer driver (WiFi/Ethernet) - STUB
 * Placeholder for future Star Micronics / Epson WiFi support.
 */
export class NetworkDriver implements PrinterDriver {
  readonly supportsRawPrint = true;

  async initialize(_config: PrinterConfig): Promise<void> {
    throw new Error("Network printer driver not yet implemented");
  }

  async getStatus(): Promise<PrinterStatusResult> {
    throw new Error("Network printer driver not yet implemented");
  }

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error("Network printer driver not yet implemented");
  }

  async printDocument(doc: PrintDocument): Promise<void> {
    // Convert structured document to ESC/POS bytes and print
    const data = renderDocumentToEscPos(doc);
    await this.printRaw(data);
  }

  async openCashDrawer(): Promise<void> {
    throw new Error("Network printer driver not yet implemented");
  }

  async disconnect(): Promise<void> {
    // No-op for stub
  }

  isConnected(): boolean {
    return false;
  }
}
