// ============================================================
// Valor TCP Transport — WiFi socket implementation
// File: services/terminals/valor-transport-tcp.ts
// ============================================================
// Persistent TCP socket to the Valor terminal (default port 5000).
// Structurally identical to CastlesTcpTransport — Valor's protocol
// differences (STX/ETX framing, ACK/STAN handshake) live above the
// transport, in valor-framing.ts + valor-service.ts. The transport is
// a pure byte pipe.
// ============================================================

import TcpSocket from "react-native-tcp-socket";
import type { ITerminalTransport } from "./valor-transport.types";
import { VALOR_CONNECT_TIMEOUT_MS } from "@/types/valor";

type TcpSocketInstance = ReturnType<typeof TcpSocket.createConnection>;

export class ValorTcpTransport implements ITerminalTransport {
  private readonly _host: string;
  private readonly _port: number;
  private readonly _connectTimeoutMs: number;

  private _socket: TcpSocketInstance | null = null;
  private _isOpen = false;

  /** Stale-socket guard — handlers compare against this to ignore events from a prior socket. */
  private _currentSocket: TcpSocketInstance | null = null;
  private _lastDataReceivedAt = 0;

  private _dataCallbacks: Array<(chunk: string) => void> = [];
  private _errorCallbacks: Array<(error: Error) => void> = [];
  private _closeCallbacks: Array<(hadError: boolean) => void> = [];

  constructor(host: string, port: number, connectTimeoutMs?: number) {
    this._host = host;
    this._port = port;
    this._connectTimeoutMs = connectTimeoutMs ?? VALOR_CONNECT_TIMEOUT_MS;
  }

  get isOpen(): boolean {
    return this._isOpen && this._socket != null;
  }

  secondsSinceLastData(): number {
    if (this._lastDataReceivedAt === 0) return Infinity;
    return (Date.now() - this._lastDataReceivedAt) / 1000;
  }

  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { socket?.destroy(); } catch { /* ignore */ }
          reject(new Error("Connection timed out"));
        }
      }, this._connectTimeoutMs);

      const socket = TcpSocket.createConnection(
        { host: this._host, port: this._port },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          this._socket = socket;
          this._currentSocket = socket;
          this._isOpen = true;
          this._lastDataReceivedAt = Date.now();

          // Disable Nagle so framed commands flush to wire immediately.
          try { (socket as any).setNoDelay(true); } catch { /* best-effort */ }
          // OS-level keepalive probes (every 15s) to detect half-open sockets.
          try { (socket as any).setKeepAlive(true, 15_000); } catch { /* best-effort */ }

          socket.on("close", (hadError: boolean) => {
            if (this._currentSocket !== socket) {
              console.log("[ValorTcpTransport] Ignoring close from stale socket");
              return;
            }
            console.warn(`[ValorTcpTransport] Socket closed (hadError: ${hadError})`);
            this._isOpen = false;
            this._socket = null;
            for (const cb of [...this._closeCallbacks]) {
              try { cb(hadError); } catch { /* ignore callback errors */ }
            }
          });

          socket.on("error", (err: Error) => {
            if (this._currentSocket !== socket) {
              console.log("[ValorTcpTransport] Ignoring error from stale socket");
              return;
            }
            console.error("[ValorTcpTransport] Socket error:", err.message);
            this._isOpen = false;
            for (const cb of [...this._errorCallbacks]) {
              try { cb(err); } catch { /* ignore callback errors */ }
            }
          });

          socket.on("data", (data: string | Buffer) => {
            if (this._currentSocket !== socket) return;
            this._lastDataReceivedAt = Date.now();
            const chunk = typeof data === "string" ? data : data.toString("utf8");
            // TEMP DIAGNOSTIC (Valor connect debugging): log exactly what the
            // terminal sends, with control bytes made visible (STX=\x02, ETX=\x03).
            // Remove once the connection issue is resolved.
            try {
              const visible = chunk
                .replace(/\x02/g, "<STX>")
                .replace(/\x03/g, "<ETX>")
                .replace(/\r/g, "<CR>")
                .replace(/\n/g, "<LF>");
              console.log(
                `[ValorTcpTransport] RAW RX (${chunk.length}B): ${visible}`,
              );
            } catch { /* best-effort */ }
            for (const cb of [...this._dataCallbacks]) {
              try { cb(chunk); } catch { /* ignore callback errors */ }
            }
          });

          resolve();
        },
      );

      socket.on("error", (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  /**
   * Ungraceful close. Null JS refs FIRST so the stale-socket guards ignore
   * any late events, then destroy() exactly once (never also end() — both
   * route to the same native cId Runnable and racing them crashes the
   * native module; see CastlesTcpTransport.disconnect for the full note).
   */
  disconnect(): void {
    const oldSocket = this._socket;

    this._socket = null;
    this._currentSocket = null;
    this._isOpen = false;

    if (oldSocket) {
      try { oldSocket.removeAllListeners(); } catch { /* ignore */ }
      try { oldSocket.destroy(); } catch { /* already destroyed */ }
    }
  }

  write(data: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this._isOpen || !this._socket) {
        reject(new Error("Transport is not open"));
        return;
      }
      try {
        this._socket.write(data, "utf8", (err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  onData(cb: (chunk: string) => void): void { this._dataCallbacks.push(cb); }
  onError(cb: (error: Error) => void): void { this._errorCallbacks.push(cb); }
  onClose(cb: (hadError: boolean) => void): void { this._closeCallbacks.push(cb); }

  offData(cb: (chunk: string) => void): void {
    const idx = this._dataCallbacks.indexOf(cb);
    if (idx !== -1) this._dataCallbacks.splice(idx, 1);
  }
  offError(cb: (error: Error) => void): void {
    const idx = this._errorCallbacks.indexOf(cb);
    if (idx !== -1) this._errorCallbacks.splice(idx, 1);
  }
  offClose(cb: (hadError: boolean) => void): void {
    const idx = this._closeCallbacks.indexOf(cb);
    if (idx !== -1) this._closeCallbacks.splice(idx, 1);
  }

  removeAllListeners(): void {
    this._dataCallbacks = [];
    this._errorCallbacks = [];
    this._closeCallbacks = [];
    this._socket?.removeAllListeners();
  }
}
