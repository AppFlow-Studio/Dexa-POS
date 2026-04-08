import { PrintDocument } from "@/types/print-document";
import { PrinterConfig, PrinterStatusResult } from "@/types/printer";
import { renderDocumentToDejavooXml } from "../renderers/DejavooXmlRenderer";
import { PrinterDriver } from "./PrinterDriver";

interface DejavooDriverCredentials {
  authKey: string;
  tpn: string;
  registerId: string;
  baseUrl: string;
}

export class DejavooDriver implements PrinterDriver {
  readonly supportsRawPrint = false;
  private connected = false;
  private credentials: DejavooDriverCredentials | null = null;

  async initialize(config: PrinterConfig): Promise<void> {
    // Extract Dejavoo credentials from printer metadata
    const meta = config.metadata as Record<string, string> | null;
    if (!meta?.dejavooAuthKey || !meta?.dejavooTpn || !meta?.dejavooBaseUrl || !meta?.dejavooRegisterId) {
      throw new Error(
        "Dejavoo printer requires metadata fields: dejavooAuthKey, dejavooTpn, dejavooRegisterId, dejavooBaseUrl",
      );
    }

    this.credentials = {
      authKey: meta.dejavooAuthKey,
      tpn: meta.dejavooTpn,
      registerId: meta.dejavooRegisterId,
      baseUrl: meta.dejavooBaseUrl,
    };

    // Verify terminal is reachable
    try {
      const status = await this.getStatus();
      if (!status.isOnline) {
        throw new Error(status.errorMessage ?? "Terminal offline");
      }
    } catch (e: any) {
      throw new Error(`Dejavoo terminal unreachable: ${e.message}`);
    }

    this.connected = true;
  }

  async getStatus(): Promise<PrinterStatusResult> {
    if (!this.credentials) {
      return {
        isOnline: false,
        hasPaper: false,
        coverOpen: false,
        errorMessage: "Driver not initialized",
      };
    }

    try {
      const params = new URLSearchParams({
        "request.tpn": this.credentials.tpn,
        "request.authkey": this.credentials.authKey,
      });

      const response = await fetch(
        `${this.credentials.baseUrl}/v2/Common/TerminalStatus?${params}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        return {
          isOnline: false,
          hasPaper: true,
          coverOpen: false,
          errorMessage: `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      const isOnline = data?.TerminalStatus === "Online" || data?.terminalStatus === "Online";

      return {
        isOnline,
        hasPaper: true, // Dejavoo has built-in paper — can't query
        coverOpen: false,
        errorMessage: isOnline ? undefined : "Terminal offline",
      };
    } catch (e: any) {
      return {
        isOnline: false,
        hasPaper: true,
        coverOpen: false,
        errorMessage: e.message,
      };
    }
  }

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error(
      "Dejavoo SPIN P does not support raw ESC/POS. Use printDocument() instead.",
    );
  }

  async printDocument(doc: PrintDocument): Promise<void> {
    if (!this.connected || !this.credentials) {
      throw new Error("Dejavoo driver not initialized");
    }

    const xml = renderDocumentToDejavooXml(doc);

    const body = {
      Printer: xml,
      RegisterId: this.credentials.registerId,
      Authkey: this.credentials.authKey,
      SPInProxyTimeout: null,
      CustomFields: {},
    };

    const response = await fetch(
      `${this.credentials.baseUrl}/v2/Common/Printer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Dejavoo print failed: HTTP ${response.status} — ${text}`,
      );
    }

    const result = await response.json().catch(() => null);
    const resultCode = result?.ResultCode ?? result?.resultCode;
    if (resultCode !== undefined && resultCode !== "0" && resultCode !== 0) {
      throw new Error(
        `Dejavoo print error (code ${resultCode}): ${result?.Message ?? result?.message ?? "Unknown"}`,
      );
    }
  }

  async openCashDrawer(): Promise<void> {
    throw new Error("Dejavoo terminals do not support external cash drawers");
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.credentials = null;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
