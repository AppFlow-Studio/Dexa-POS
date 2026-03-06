// ============================================================
// Castles TCP Transport — WiFi socket implementation
// File: services/terminals/castles-transport-tcp.ts
// ============================================================
// Extracted from CastlesService._attemptConnect + disconnect.
// Manages a persistent TCP socket to the Castles terminal.
// ============================================================

import TcpSocket from "react-native-tcp-socket";
import type { ICastlesTransport } from "./castles-transport.types";

type TcpSocketInstance = ReturnType<typeof TcpSocket.createConnection>;

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

export class CastlesTcpTransport implements ICastlesTransport {
  private readonly _host: string;
  private readonly _port: number;
  private readonly _connectTimeoutMs: number;

  private _socket: TcpSocketInstance | null = null;
  private _isOpen = false;

  /**
   * Stale socket guard: when we create a new socket, we store it here.
   * Socket event handlers compare against this reference to ignore
   * events from a previous (stale) socket that fire after disconnect.
   */
  private _currentSocket: TcpSocketInstance | null = null;

  /** Timestamp of last data received — used for stale connection detection */
  private _lastDataReceivedAt = 0;

  // ── Callback arrays ──
  private _dataCallbacks: Array<(chunk: string) => void> = [];
  private _errorCallbacks: Array<(error: Error) => void> = [];
  private _closeCallbacks: Array<(hadError: boolean) => void> = [];

  constructor(host: string, port: number, connectTimeoutMs?: number) {
    this._host = host;
    this._port = port;
    this._connectTimeoutMs = connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  }

  // ── ICastlesTransport ──

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

          // Disable Nagle — flush JSON commands to wire immediately
          try { (socket as any).setNoDelay(true); } catch { /* best-effort */ }
          // Detect dead connections via OS-level keepalive probes (every 15s)
          try { (socket as any).setKeepAlive(true, 15_000); } catch { /* best-effort */ }

          // ── Persistent lifecycle listeners ──
          // Guard against stale socket events: only process if this socket
          // is still the active one.

          socket.on("close", (hadError: boolean) => {
            if (this._currentSocket !== socket) {
              console.log("[CastlesTcpTransport] Ignoring close from stale socket");
              return;
            }
            console.warn(`[CastlesTcpTransport] Socket closed (hadError: ${hadError})`);
            this._isOpen = false;
            this._socket = null;
            for (const cb of [...this._closeCallbacks]) {
              try { cb(hadError); } catch { /* ignore callback errors */ }
            }
          });

          socket.on("error", (err: Error) => {
            if (this._currentSocket !== socket) {
              console.log("[CastlesTcpTransport] Ignoring error from stale socket");
              return;
            }
            console.error("[CastlesTcpTransport] Socket error:", err.message);
            this._isOpen = false;
            for (const cb of [...this._errorCallbacks]) {
              try { cb(err); } catch { /* ignore callback errors */ }
            }
          });

          socket.on("data", (data: string | Buffer) => {
            if (this._currentSocket !== socket) return;
            this._lastDataReceivedAt = Date.now();
            const chunk = typeof data === "string" ? data : data.toString("utf8");
            for (const cb of [...this._dataCallbacks]) {
              try { cb(chunk); } catch { /* ignore callback errors */ }
            }
          });

          resolve();
        },
      );

      // Error during initial connection attempt
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
   * Disconnect and clean up the socket.
   * Nulls currentSocket FIRST to prevent stale event races,
   * then end() + delayed destroy() so TCP FIN propagates.
   */
  disconnect(): void {
    const oldSocket = this._socket;

    // Null out references FIRST to prevent race conditions
    this._socket = null;
    this._currentSocket = null;
    this._isOpen = false;

    if (oldSocket) {
      try {
        oldSocket.removeAllListeners();
        oldSocket.end(); // Send TCP FIN (graceful close)
        // Delay destroy to let FIN reach the terminal before force-closing
        setTimeout(() => {
          try { oldSocket.destroy(); } catch { /* already closed */ }
        }, 500);
      } catch {
        // Socket may already be destroyed
      }
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

  // ── Listener add/remove ──

  onData(cb: (chunk: string) => void): void {
    this._dataCallbacks.push(cb);
  }

  onError(cb: (error: Error) => void): void {
    this._errorCallbacks.push(cb);
  }

  onClose(cb: (hadError: boolean) => void): void {
    this._closeCallbacks.push(cb);
  }

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
