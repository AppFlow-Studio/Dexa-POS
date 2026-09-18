import { PrintDocument } from "@/types/print-document";
import {
  DrawerKickSense,
  PrinterConfig,
  PrinterStatusResult,
} from "@/types/printer";

export interface PrinterDriver {
  initialize(config: PrinterConfig): Promise<void>;
  getStatus(): Promise<PrinterStatusResult>;
  printRaw(data: Uint8Array): Promise<void>;
  printDocument(doc: PrintDocument): Promise<void>;
  openCashDrawer(): Promise<void>;
  /**
   * Optional: kick the drawer AND read drawer-sense back on the same
   * connection (baseline before + after) for strict-confirm. Only drivers
   * whose transport exposes a drawer channel (Star) implement this; callers
   * must feature-detect. `ok` is still the command ACK — the returned sense is
   * advisory only.
   */
  openCashDrawerConfirmed?(): Promise<DrawerKickSense>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  readonly supportsRawPrint: boolean;
}
