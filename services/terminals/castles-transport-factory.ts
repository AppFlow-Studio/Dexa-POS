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
import {
  CastlesMockTransport,
  getCastlesMockScenario,
} from "./castles-transport-mock";

const CASTLES_DEFAULT_PORT = 8080;

/**
 * Dev-only override: when `EXPO_PUBLIC_CASTLES_MOCK=1` (or any truthy value)
 * the factory returns a CastlesMockTransport regardless of the requested
 * connection type. The mock implements the same ICastlesTransport surface
 * so CastlesService, the supervisor, the modal, and the wizard UX all run
 * end-to-end on iOS Simulator / Android Emulator with no hardware.
 *
 * The active scenario is selected at runtime via setCastlesMockScenario()
 * — typically from the dev-only USB Diagnostics screen — so you can flip
 * between healthy / wedged / detach / slow without a reload.
 *
 * In a production build this env var is undefined → the branch never runs
 * and there's no runtime cost.
 */
function isMockEnabled (): boolean {
  const flag = process.env.EXPO_PUBLIC_CASTLES_MOCK;
  if (!flag) return false;
  return flag !== '0' && flag.toLowerCase() !== 'false';
}

/**
 * Create a transport instance based on configuration.
 * Supports 'local_socket' (TCP WiFi) and 'usb' (USB serial).
 */
export function createCastlesTransport(
  config: CastlesTransportConfig,
): ICastlesTransport {
  if (isMockEnabled()) {
    console.log(
      `[CastlesTransport] MOCK enabled — using ${getCastlesMockScenario()} scenario ` +
        `(connectionType=${config.connectionType})`,
    );
    return new CastlesMockTransport();
  }

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
