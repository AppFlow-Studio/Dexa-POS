// ============================================================
// Valor Transport Factory
// File: services/terminals/valor-transport-factory.ts
// ============================================================

import type {
  ITerminalTransport,
  ValorTransportConfig,
} from "./valor-transport.types";
import { ValorTcpTransport } from "./valor-transport-tcp";
import { ValorUsbTransport } from "./valor-transport-usb";
import {
  ValorMockTransport,
  getValorMockScenario,
  setValorMockScenario,
} from "./valor-transport-mock";
import { useValorMockStore } from "@/stores/useValorMockStore";
import { VALOR_DEFAULT_PORT } from "@/types/valor";

/**
 * Two-tier mock override (mirrors the Castles factory):
 *  1. Runtime store flag (`useValorMockStore.enabled`) — MMKV-persisted, flipped
 *     from Diagnostics; lets QA flip a live preview build into mock mode.
 *  2. Build-time env var (`EXPO_PUBLIC_VALOR_MOCK`) — fallback for local dev.
 * Default OFF; production merchants see zero change.
 */
function isMockEnabled(): boolean {
  const storeEnabled = useValorMockStore.getState().enabled;
  if (storeEnabled) return true;
  const flag = process.env.EXPO_PUBLIC_VALOR_MOCK;
  if (!flag) return false;
  return flag !== "0" && flag.toLowerCase() !== "false";
}

/**
 * Create a transport for the given config. Supports 'local_socket' (TCP WiFi);
 * 'usb' is wired in Wave 8. Cloud is intentionally out of v1 scope.
 */
export function createValorTransport(
  config: ValorTransportConfig,
): ITerminalTransport {
  if (isMockEnabled()) {
    const storeScenario = useValorMockStore.getState().scenario;
    if (storeScenario !== getValorMockScenario()) {
      setValorMockScenario(storeScenario);
    }
    console.log(
      `[ValorTransport] MOCK enabled — using ${getValorMockScenario()} scenario ` +
        `(connectionType=${config.connectionType})`,
    );
    return new ValorMockTransport();
  }

  switch (config.connectionType) {
    case "local_socket": {
      if (!config.host) {
        throw new Error("TCP transport requires a host address");
      }
      return new ValorTcpTransport(
        config.host,
        config.port ?? VALOR_DEFAULT_PORT,
        config.connectTimeoutMs,
      );
    }
    case "usb":
      // Wave 8 — reuses the vendor-agnostic castles-usb native module; the
      // JS-side VID filter is gated on Valor providing its real vendor ID.
      return new ValorUsbTransport();
    default:
      throw new Error(`Unknown transport type: ${config.connectionType}`);
  }
}
