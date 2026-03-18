import { PrintDocument } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";
import {
  StarPrinter,
  StarConnectionSettings,
  InterfaceType,
} from "react-native-star-io10";
import { renderDocumentToStarCommands } from "../renderers/StarXpandRenderer";
import { PrinterDriver } from "./PrinterDriver";

/**
 * Star Micronics printer driver using react-native-star-io10 SDK.
 * Uses open/operation/close per call pattern (SDK requirement).
 */
export class StarMicronicsDriver implements PrinterDriver {
  readonly supportsRawPrint = false;

  private printer: StarPrinter | null = null;
  private config: PrinterConfig | null = null;
  private connected = false;

  async initialize(config: PrinterConfig): Promise<void> {
    this.config = config;

    // Clean up previous instance
    if (this.printer) {
      try {
        await this.printer.dispose();
      } catch {
        // Ignore disposal errors
      }
    }

    const settings = new StarConnectionSettings();
    settings.interfaceType = InterfaceType.Lan;
    settings.identifier = config.networkAddress ?? "";

    if (!settings.identifier) {
      throw new Error("Star Micronics printer requires a network address");
    }

    this.printer = new StarPrinter(settings);
    this.printer.openTimeout = 5000;
    this.printer.getStatusTimeout = 5000;
    this.printer.printTimeout = 30000;

    // Validate connectivity
    try {
      await this.printer.open();
      const status = await this.printer.getStatus();
      await this.printer.close();

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
      throw new Error(`Star printer unreachable: ${e.message}`);
    }
  }

  async getStatus(): Promise<PrinterStatusResult> {
    if (!this.printer) {
      return {
        isOnline: false,
        hasPaper: false,
        coverOpen: false,
        errorMessage: "Driver not initialized",
      };
    }

    try {
      await this.printer.open();
      const status = await this.printer.getStatus();
      await this.printer.close();

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
      this.connected = false;
      return {
        isOnline: false,
        hasPaper: false,
        coverOpen: false,
        errorMessage: e.message,
      };
    }
  }

  async printDocument(doc: PrintDocument): Promise<void> {
    if (!this.printer || !this.config) {
      throw new Error("Star Micronics driver not initialized");
    }

    console.log(
      `[StarMicronicsDriver] graphicsOnly=${this.config.graphicsOnly}, model=${this.config.printerModel}`,
    );

    const commands = await renderDocumentToStarCommands(doc, {
      supportsAutoCut: this.config.supportsAutoCut,
      maxCharsPerLine: this.config.maxCharsPerLine,
      graphicsOnly: this.config.graphicsOnly ?? false,
    });

    console.log(
      `[StarMicronicsDriver] Printing ${commands.length} chars to ${this.config.printerName}`,
    );

    try {
      await this.printer.open();
      await this.printer.print(commands);
      await this.printer.close();
      this.connected = true;
    } catch (e: any) {
      this.connected = false;
      try {
        await this.printer.close();
      } catch {
        // Ignore close errors during error handling
      }
      throw new Error(`Star print failed: ${e.message}`);
    }
  }

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error(
      "Star Micronics does not support raw ESC/POS. Use printDocument() instead.",
    );
  }

  async openCashDrawer(): Promise<void> {
    if (!this.printer) {
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

    try {
      await this.printer.open();
      await this.printer.print(commands);
      await this.printer.close();
      this.connected = true;
    } catch (e: any) {
      this.connected = false;
      try { await this.printer.close(); } catch { /* ignore */ }
      throw new Error(`Star cash drawer open failed: ${e.message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.printer) {
      try {
        await this.printer.dispose();
      } catch {
        // Ignore disposal errors
      }
      this.printer = null;
    }
    this.config = null;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
