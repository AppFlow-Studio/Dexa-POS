// ============================================================
// Castles Transport Abstraction — Interface & Config Types
// File: services/terminals/castles-transport.types.ts
// ============================================================
// Transport layer decouples CastlesService from the underlying
// connection mechanism (TCP socket, USB serial, etc.).
// ============================================================

/**
 * Transport interface that CastlesService talks to.
 * Implementations: CastlesTcpTransport (WiFi), CastlesUsbTransport (USB serial).
 *
 * Listener model: onData/offData allow per-command listeners to be
 * added and removed without killing transport lifecycle listeners.
 */
export interface ICastlesTransport {
  connect(): Promise<void>;
  disconnect(): void;
  readonly isOpen: boolean;

  /** Write data. Resolves when flushed to kernel buffer; rejects on write failure. */
  write(data: string): Promise<void>;

  /** Seconds since last data received (Infinity if never). For stale-connection detection. */
  secondsSinceLastData(): number;

  // ── Listener management ──
  onData(cb: (chunk: string) => void): void;
  onError(cb: (error: Error) => void): void;
  onClose(cb: (hadError: boolean) => void): void;
  offData(cb: (chunk: string) => void): void;
  offError(cb: (error: Error) => void): void;
  offClose(cb: (hadError: boolean) => void): void;
  removeAllListeners(): void;
}

export type CastlesTransportType = 'local_socket' | 'usb';

export interface CastlesTransportConfig {
  connectionType: CastlesTransportType;
  /** TCP host — required for local_socket */
  host?: string;
  /** TCP port — default 8080, local_socket only */
  port?: number;
  /** TCP connect timeout in ms */
  connectTimeoutMs?: number;
}
