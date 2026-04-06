import { PrintDocument } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";
import {
  StarPrinter,
  StarConnectionSettings,
  InterfaceType,
  StarIO10InUseError,
} from "react-native-star-io10";
import { renderDocumentToStarCommands } from "../renderers/StarXpandRenderer";
import { getStarPrinterMutex } from "../starPrinterMutex";
import { PrinterDriver } from "./PrinterDriver";

// Brief delay before retrying after an InUseError (another connection still releasing)
const IN_USE_RETRY_DELAY_MS = 1500;
const IN_USE_MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  /** Create a fresh StarPrinter instance for one open/op/close cycle. */
  private createPrinter(): StarPrinter {
    const settings = new StarConnectionSettings();
    settings.interfaceType = InterfaceType.Lan;
    settings.identifier = this.config!.networkAddress ?? "";
    // Disable auto-switch: we only use LAN, skip BT/USB fallback probing
    settings.autoSwitchInterface = false;

    const printer = new StarPrinter(settings);
    printer.openTimeout = 8000; // SDK default is 10s; 8s balances speed vs reliability
    printer.getStatusTimeout = 5000;
    printer.printTimeout = 30000;
    return printer;
  }

  /**
   * Execute an operation with automatic retry on StarIO10InUseError.
   * The Star SDK throws InUseError when another connection (same or different
   * device) holds the printer. A brief wait + retry usually resolves it.
   */
  private async withInUseRetry<T>(
    operation: () => Promise<T>,
    label: string,
  ): Promise<T> {
    for (let attempt = 0; attempt <= IN_USE_MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (e: any) {
        if (e instanceof StarIO10InUseError && attempt < IN_USE_MAX_RETRIES) {
          console.warn(
            `[StarMicronicsDriver] ${label}: printer in use, retry ${attempt + 1}/${IN_USE_MAX_RETRIES} after ${IN_USE_RETRY_DELAY_MS}ms`,
          );
          await sleep(IN_USE_RETRY_DELAY_MS);
          continue;
        }
        throw e;
      }
    }
    // TypeScript: unreachable, but satisfies return type
    throw new Error(`${label}: exhausted retries`);
  }

  async initialize(config: PrinterConfig): Promise<void> {
    this.config = config;

    if (!config.networkAddress) {
      throw new Error("Star Micronics printer requires a network address");
    }

    const mutex = getStarPrinterMutex(config.networkAddress);
    await mutex.runExclusive(() =>
      this.withInUseRetry(async () => {
        const printer = this.createPrinter();
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
        } catch (e: any) {
          this.connected = false;
          // Re-throw InUseError so withInUseRetry can handle it
          if (e instanceof StarIO10InUseError) throw e;
          throw new Error(`Star printer unreachable: ${e.message}`);
        } finally {
          try { await printer.dispose(); } catch { /* ignore */ }
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
        const printer = this.createPrinter();
        try {
          await printer.open();
          const status = await printer.getStatus();
          await printer.close();

          this.connected = true;

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
          try { await printer.dispose(); } catch { /* ignore */ }
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
        const printer = this.createPrinter();
        try {
          await printer.open();
          await printer.print(commands);
          await printer.close();
          this.connected = true;
        } catch (e: any) {
          this.connected = false;
          try { await printer.close(); } catch { /* ignore */ }
          // Let InUseError propagate for retry
          if (e instanceof StarIO10InUseError) throw e;
          throw new Error(`Star print failed: ${e.message}`);
        } finally {
          try { await printer.dispose(); } catch { /* ignore */ }
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
        const printer = this.createPrinter();
        try {
          await printer.open();
          await printer.print(commands);
          await printer.close();
          this.connected = true;
        } catch (e: any) {
          this.connected = false;
          try { await printer.close(); } catch { /* ignore */ }
          if (e instanceof StarIO10InUseError) throw e;
          throw new Error(`Star cash drawer open failed: ${e.message}`);
        } finally {
          try { await printer.dispose(); } catch { /* ignore */ }
        }
      }, "openCashDrawer"),
    );
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = null;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
