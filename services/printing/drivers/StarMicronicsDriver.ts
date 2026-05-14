import { PrintDocument } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";
import { StarIO10InUseError } from "react-native-star-io10";
import { renderDocumentToStarCommands } from "../renderers/StarXpandRenderer";
import {
  createStarPrinterInstance,
  closeAndDispose,
  disposeQuietly,
} from "../starPrinterFactory";
import { getStarPrinterMutex } from "../starPrinterMutex";
import { recordStarSuccess } from "../starPrintActivity";
import { PrinterDriver } from "./PrinterDriver";

// Exponential-backoff retry schedule for StarIO10InUseError (printer is held
// by another connection — same app, peer POS, or another vendor's POS). Total
// wall clock at most ~13.5s before we give up. Restaurant peer prints often
// last 5–10s; 2 retries / 1.5s gap (the old policy) gave up far too early.
const IN_USE_BACKOFF_MS = [500, 1000, 2000, 4000, 6000];
const IN_USE_JITTER_FRACTION = 0.2; // ±20%

/** If no successful operation within this window, isConnected() returns false
 *  so PrinterService re-initializes on next job. */
const STALE_THRESHOLD_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number): number {
  const delta = ms * IN_USE_JITTER_FRACTION;
  return Math.max(0, Math.round(ms + (Math.random() * 2 - 1) * delta));
}

/** User-facing error thrown when retries are exhausted on InUseError. */
export class StarPrinterBusyError extends Error {
  constructor(label: string, address: string | null | undefined, totalWaitMs: number) {
    super(
      `Printer is in use by another device. The other terminal must finish its job before retrying. (operation=${label}, addr=${address ?? "?"}, waited ${Math.round(totalWaitMs / 1000)}s)`,
    );
    this.name = "StarPrinterBusyError";
  }
}

/**
 * Star Micronics printer driver using react-native-star-io10 SDK.
 *
 * Per SDK docs (Basic Step 2), each operation creates a fresh StarPrinter
 * instance, opens → operates → closes → disposes. No instance is kept alive
 * between operations to avoid stale TCP connections.
 *
 * `autoSwitchInterface` is disabled since we exclusively use LAN, avoiding
 * wasted time probing BT/USB on failure.
 */
export class StarMicronicsDriver implements PrinterDriver {
  readonly supportsRawPrint = false;

  private config: PrinterConfig | null = null;
  private connected = false;
  private lastSuccessAt = 0;
  private configFingerprint: string | null = null;

  /**
   * Execute an operation with automatic retry on StarIO10InUseError.
   * The Star SDK throws InUseError when another connection (same or different
   * device) holds the printer. A brief wait + retry usually resolves it.
   */
  private async withInUseRetry<T>(
    operation: () => Promise<T>,
    label: string,
  ): Promise<T> {
    const addr = this.config?.networkAddress;
    const startedAt = Date.now();
    let lastInUse: any = null;
    for (let attempt = 0; attempt <= IN_USE_BACKOFF_MS.length; attempt++) {
      try {
        return await operation();
      } catch (e: any) {
        if (
          e instanceof StarIO10InUseError &&
          attempt < IN_USE_BACKOFF_MS.length
        ) {
          lastInUse = e;
          const delay = jitter(IN_USE_BACKOFF_MS[attempt]);
          const elapsed = Date.now() - startedAt;
          const sinceLastOk = this.lastSuccessAt
            ? Date.now() - this.lastSuccessAt
            : -1;
          console.warn(
            `[StarMicronicsDriver] ${label}: InUseError (addr=${addr}, attempt=${attempt + 1}/${IN_USE_BACKOFF_MS.length}, elapsed=${elapsed}ms, sinceLastOk=${sinceLastOk}ms) — backing off ${delay}ms`,
          );
          await sleep(delay);
          continue;
        }
        throw e;
      }
    }
    const totalWait = Date.now() - startedAt;
    console.warn(
      `[StarMicronicsDriver] ${label}: InUseError retries exhausted (addr=${addr}, waited=${totalWait}ms)`,
    );
    throw new StarPrinterBusyError(label, addr, totalWait);
  }

  /** Check whether printer config has changed since last initialize(). */
  hasConfigChanged(config: PrinterConfig): boolean {
    const fp = `${config.networkAddress}|${config.graphicsOnly}|${config.maxCharsPerLine}`;
    return this.configFingerprint !== null && this.configFingerprint !== fp;
  }

  async initialize(config: PrinterConfig): Promise<void> {
    this.config = config;
    this.configFingerprint = `${config.networkAddress}|${config.graphicsOnly}|${config.maxCharsPerLine}`;

    if (!config.networkAddress) {
      throw new Error("Star Micronics printer requires a network address");
    }

    const mutex = getStarPrinterMutex(config.networkAddress);
    await mutex.runExclusive(() =>
      this.withInUseRetry(async () => {
        const printer = createStarPrinterInstance(config.networkAddress!, "print");
        try {
          await printer.open();
          const status = await printer.getStatus();
          await printer.close();

          if (status.hasError) {
            const msg = status.paperEmpty
              ? "Paper empty"
              : status.coverOpen
                ? "Cover open"
                : "Printer error";
            throw new Error(msg);
          }

          this.connected = true;
          this.lastSuccessAt = Date.now();
          recordStarSuccess(this.config!.networkAddress!);
        } catch (e: any) {
          this.connected = false;
          // Re-throw InUseError so withInUseRetry can handle it
          if (e instanceof StarIO10InUseError) throw e;
          throw new Error(`Star printer unreachable: ${e.message}`);
        } finally {
          await disposeQuietly(printer);
        }
      }, "initialize"),
    );
  }

  async getStatus(): Promise<PrinterStatusResult> {
    if (!this.config?.networkAddress) {
      return {
        isOnline: false,
        hasPaper: false,
        coverOpen: false,
        errorMessage: "Driver not initialized",
      };
    }

    const mutex = getStarPrinterMutex(this.config.networkAddress);
    return mutex.runExclusive(() =>
      this.withInUseRetry(async () => {
        const printer = createStarPrinterInstance(this.config!.networkAddress!, "print");
        try {
          await printer.open();
          const status = await printer.getStatus();
          await printer.close();

          this.connected = true;
          this.lastSuccessAt = Date.now();
          recordStarSuccess(this.config!.networkAddress!);

          return {
            isOnline: !status.hasError,
            hasPaper: !status.paperEmpty,
            coverOpen: status.coverOpen,
            errorMessage: status.hasError
              ? status.paperEmpty
                ? "Paper empty"
                : status.coverOpen
                  ? "Cover open"
                  : "Printer error"
              : undefined,
          };
        } catch (e: any) {
          // Let InUseError propagate for retry
          if (e instanceof StarIO10InUseError) throw e;
          this.connected = false;
          return {
            isOnline: false,
            hasPaper: false,
            coverOpen: false,
            errorMessage: e.message,
          };
        } finally {
          await disposeQuietly(printer);
        }
      }, "getStatus"),
    );
  }

  async printDocument(doc: PrintDocument): Promise<void> {
    if (!this.config) {
      throw new Error("Star Micronics driver not initialized");
    }

    console.log(
      `[StarMicronicsDriver] graphicsOnly=${this.config.graphicsOnly}, model=${this.config.printerModel}, maxCharsPerLine=${this.config.maxCharsPerLine}, addr=${this.config.networkAddress}`,
    );

    const commands = await renderDocumentToStarCommands(doc, {
      supportsAutoCut: this.config.supportsAutoCut,
      maxCharsPerLine: this.config.maxCharsPerLine,
      graphicsOnly: this.config.graphicsOnly ?? false,
    });

    console.log(
      `[StarMicronicsDriver] Printing ${commands.length} chars to ${this.config.printerName}`,
    );

    const mutex = getStarPrinterMutex(this.config.networkAddress!);
    await mutex.runExclusive(() =>
      this.withInUseRetry(async () => {
        const printer = createStarPrinterInstance(this.config!.networkAddress!, "print");
        try {
          await printer.open();

          // Pre-print status check — surface descriptive errors early
          const status = await printer.getStatus();
          if (status.paperEmpty) throw new Error("Paper empty");
          if (status.coverOpen) throw new Error("Cover open");

          await printer.print(commands);
          await printer.close();
          this.connected = true;
          this.lastSuccessAt = Date.now();
          recordStarSuccess(this.config!.networkAddress!);
        } catch (e: any) {
          this.connected = false;
          try { await printer.close(); } catch { /* ignore */ }
          // Let InUseError propagate for retry
          if (e instanceof StarIO10InUseError) throw e;
          throw new Error(`Star print failed: ${e.message}`);
        } finally {
          await disposeQuietly(printer);
        }
      }, "printDocument"),
    );
  }

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error(
      "Star Micronics does not support raw ESC/POS. Use printDocument() instead.",
    );
  }

  async openCashDrawer(): Promise<void> {
    if (!this.config?.networkAddress) {
      throw new Error("Star Micronics driver not initialized");
    }

    const StarXpandCommand = require("react-native-star-io10").StarXpandCommand;

    // actionOpen() is intentionally NOT used here.
    // Its deferred action calls convertDrawerChannel() which accesses
    // StarXpandCommand.Drawer.Channel via the same circular-dep path that
    // crashes convertPrinterInternationalCharacterType. Direct _parameters
    // push with string literals bypasses the converter safely.
    const drawerBuilder = new StarXpandCommand.DrawerBuilder();
    const contents = drawerBuilder._parameters.get("contents") as Array<Map<string, any>>;
    contents.push(
      new Map<string, any>([
        ["method", "Action.Open"],
        ["parameter", new Map<string, any>([
          ["channel", "No.1"],
          ["on_time", 200]
        ])]
      ])
    );

    const commandBuilder = new StarXpandCommand.StarXpandCommandBuilder();
    commandBuilder.addDocument(
      new StarXpandCommand.DocumentBuilder().addDrawer(drawerBuilder)
    );

    const commands = await commandBuilder.getCommands();

    const mutex = getStarPrinterMutex(this.config.networkAddress);
    await mutex.runExclusive(() =>
      this.withInUseRetry(async () => {
        const printer = createStarPrinterInstance(this.config!.networkAddress!, "print");
        try {
          await printer.open();
          await printer.print(commands);
          await printer.close();
          this.connected = true;
          this.lastSuccessAt = Date.now();
          recordStarSuccess(this.config!.networkAddress!);
        } catch (e: any) {
          this.connected = false;
          try { await printer.close(); } catch { /* ignore */ }
          if (e instanceof StarIO10InUseError) throw e;
          throw new Error(`Star cash drawer open failed: ${e.message}`);
        } finally {
          await disposeQuietly(printer);
        }
      }, "openCashDrawer"),
    );
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.lastSuccessAt = 0;
    this.configFingerprint = null;
    this.config = null;
  }

  isConnected(): boolean {
    if (!this.connected || !this.config) return false;
    // Stale check: if no successful operation in the last 30s, report
    // as disconnected so PrinterService re-initializes on next job.
    return Date.now() - this.lastSuccessAt < STALE_THRESHOLD_MS;
  }
}
