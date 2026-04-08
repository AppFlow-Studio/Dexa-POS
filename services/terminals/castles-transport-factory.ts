// ============================================================
// Castles Transport Factory
// File: services/terminals/castles-transport-factory.ts
// ============================================================

import type {
  ICastlesTransport,
  CastlesTransportConfig,
} from "./castles-transport.types";
import { CastlesTcpTransport } from "./castles-transport-tcp";
import { CastlesUsbTransport } from "./castles-transport-usb";

const CASTLES_DEFAULT_PORT = 8080;

/**
 * Create a transport instance based on configuration.
 * Supports 'local_socket' (TCP WiFi) and 'usb' (USB serial).
 */
export function createCastlesTransport(
  config: CastlesTransportConfig,
): ICastlesTransport {
  switch (config.connectionType) {
    case "local_socket": {
      if (!config.host) {
        throw new Error("TCP transport requires a host address");
      }
      return new CastlesTcpTransport(
        config.host,
        config.port ?? CASTLES_DEFAULT_PORT,
        config.connectTimeoutMs,
      );
    }
    case "usb":
      return new CastlesUsbTransport();
    default:
      throw new Error(`Unknown transport type: ${config.connectionType}`);
  }
}
