import { PrintDocument } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";

export interface PrinterDriver {
  initialize(config: PrinterConfig): Promise<void>;
  getStatus(): Promise<PrinterStatusResult>;
  printRaw(data: Uint8Array): Promise<void>;
  printDocument(doc: PrintDocument): Promise<void>;
  openCashDrawer(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  readonly supportsRawPrint: boolean;
}
