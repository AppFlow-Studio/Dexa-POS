import { PrintDocument, PrintNode } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";
import {
  initLandiPrinter,
  getLandiPrinterStatus,
  printLandiDocument,
  openLandiCashDrawer,
  closeLandiPrinter,
} from "@/native/LandiPrinter";
import { PrinterDriver } from "./PrinterDriver";

/** Node types the Landi C20Pro built-in thermal printer cannot handle. */
const UNSUPPORTED_LANDI_NODES = new Set(["barcode", "image"]);

// ─────────────────────────────────────────────────────────────────────────────
// LANDI C20Pro RECEIPT LAYOUT CALIBRATION
// Hardware: pixelWidth=576px (confirmed via getValidWidth() in logcat)
// Font size: VP_FONT_SIZE=28 (set in LandiPrinterModule.kt)
//
// TUNING GUIDE:
//   If right column is NOT flush to right edge  → DECREASE the value
//   If text wraps to the next line              → INCREASE the value
//
// WHY normal=48 but bold≠38:
//   Normal char ≈ 12px  → 576/12 = 48 chars ✓  (Section I confirmed working)
//   Bold char   ≈ 14.4px, BUT space chars stay at 12px even in bold mode.
//   A bold line: textChars×14.4 + spaceChars×12 = 576
//   → for typical 13-char bold content: need ~45 total chars to fill paper.
//
// SECTIONS:
//   D. Items          → bold two_column  (use BOLD)
//   E. Subtotal/Tax   → normal two_column with cl() centering (use NORMAL)
//   F. Card/Cash/Total→ bold two_column with cl() centering  (use BOLD)
//   G. Tip lines      → Tip: normal, Total w/ Tip: bold
//   H. Payments       → bold two_column
//   I. Server/Date    → normal two_column  (working ✓)
//   Dividers          → use NORMAL (non-bold font, same as normal chars)
// ─────────────────────────────────────────────────────────────────────────────
const LANDI_CPL = {
  NORMAL: 48, // ← working ✓ — tune if Sections E/I/G misalign
  BOLD: 48,   // ← try 42–46 — tune if Sections D/F/G/H price not flush right
  DIVIDER: 48, // ← solid line width — use NORMAL
};

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
    // Built-in thermal printer: no cutter, no image, no barcode support.
    // Filter unsupported nodes and add trailing feed for tear-off gap.
    const filtered: PrintNode[] = doc.nodes.filter(
      (n) => !UNSUPPORTED_LANDI_NODES.has(n.type),
    );

    // Inject calibrated lineWidths — Kotlin uses these directly.
    // Template builds content for w=32 (maxCharsPerLine default).
    // We override here so Kotlin doesn't need to guess format or CPL.
    const calibrated = filtered.map((node) => {
      if (node.type === "two_column") {
        const fmt = node.format as Record<string, boolean> | undefined;
        const isBold = fmt?.bold ?? false;
        const isDW = fmt?.doubleWidth ?? false;
        const cpl = isDW
          ? Math.floor(LANDI_CPL.BOLD / 2) // doubleWidth = 2× char size
          : isBold
            ? LANDI_CPL.BOLD
            : LANDI_CPL.NORMAL;
        return { ...node, lineWidth: cpl };
      }
      if (node.type === "divider") {
        return { ...node, lineWidth: LANDI_CPL.DIVIDER };
      }
      return node;
    });

    calibrated.push({ type: "feed", lines: 4 });
    await printLandiDocument(JSON.stringify({ ...doc, nodes: calibrated }));
  }

  async openCashDrawer(): Promise<void> {
    if (!this.connected) {
      // Try to re-initialize — cash drawer might be requested before a print job
      console.warn("[LandiDriver] Not connected, attempting init for cash drawer...");
      await this.initialize({} as any);
    }
    const success = await openLandiCashDrawer();
    if (!success) {
      throw new Error("Cash drawer kick returned false");
    }
  }

  async disconnect(): Promise<void> {
    await closeLandiPrinter();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
