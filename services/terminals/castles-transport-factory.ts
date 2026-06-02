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
  setCastlesMockScenario,
} from "./castles-transport-mock";
import { useCastlesMockStore } from "@/stores/useCastlesMockStore";

const CASTLES_DEFAULT_PORT = 8080;

/**
 * Two-tier mock override.
 *
 * 1. Runtime store flag (`useCastlesMockStore.enabled`) — persisted in MMKV,
 *    flipped from the USB Diagnostics screen. Lets QA flip a live preview
 *    build (e.g., Landi tablet over EAS Update) into mock mode without
 *    rebuilding or restarting Metro. Default is OFF.
 * 2. Build-time env var (`EXPO_PUBLIC_CASTLES_MOCK`) — fallback for local
 *    dev when you want mock enabled before MMKV has hydrated (cold start).
 *
 * When the store is enabled, the factory ALSO syncs the active scenario
 * into the module-level scenario var that the mock transport reads, so
 * picking a scenario from Diagnostics and toggling the switch in either
 * order behaves the same.
 *
 * Production safety: store defaults to false; the env var is unset on
 * preview/production builds. So a merchant who never touches the
 * Diagnostics toggle sees zero behavioral change.
 */
function isMockEnabled (): boolean {
  const storeEnabled = useCastlesMockStore.getState().enabled;
  if (storeEnabled) return true;
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
    // Sync the runtime store's scenario into the mock module's state so
    // the user picks "wedge_empty_buffer" from Diagnostics and the very
    // next connect attempt uses it, regardless of which they toggled first.
    const storeScenario = useCastlesMockStore.getState().scenario;
    if (storeScenario !== getCastlesMockScenario()) {
      setCastlesMockScenario(storeScenario);
    }
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
