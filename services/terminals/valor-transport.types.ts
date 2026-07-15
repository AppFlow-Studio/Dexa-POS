// ============================================================
// Valor Transport Abstraction — Interface & Config Types
// File: services/terminals/valor-transport.types.ts
// ============================================================
// Valor terminals (like Castles) run a TCP socket server; the POS
// connects as a client. The transport is a pure byte pipe with no
// protocol knowledge, so Valor reuses the SAME structural interface
// as Castles. We alias rather than rename ICastlesTransport to avoid
// churning the payment-critical Castles code path.
//
// The Valor-specific message layer (STX/ETX framing, the ACK ->
// Payload-Received(STAN) -> final -> ACK handshake) lives in
// valor-framing.ts + valor-service.ts, NOT in the transport.
// ============================================================

import type {
  ICastlesTransport,
  CastlesTransportType,
} from "./castles-transport.types";

/** Structurally identical to ICastlesTransport — Valor transports implement this. */
export type ITerminalTransport = ICastlesTransport;

/** Valor supports the same transport types as Castles (TCP socket + USB serial). */
export type ValorTransportType = CastlesTransportType; // 'local_socket' | 'usb'

export interface ValorTransportConfig {
  connectionType: ValorTransportType;
  /** Terminal IP — required for local_socket */
  host?: string;
  /** Transaction port — default 5000, local_socket only */
  port?: number;
  /** Cancel port — default 5001, local_socket only (second short-lived socket) */
  cancelPort?: number;
  /** TCP connect timeout in ms */
  connectTimeoutMs?: number;
}
