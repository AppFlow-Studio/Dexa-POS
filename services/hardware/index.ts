// services/hardware/index.ts - Barrel export

export {
  type DeviceCapabilities,
  type DeviceChangeResult,
  detectDeviceCapabilities,
  detectAndStoreCapabilities,
  updateStationCapabilities,
  handleDeviceChangeIfNeeded,
  ensureBuiltinPrinterProvisioned,
  ensureDejavooPrinterProvisioned,
  verifyDejavooPrinter,
  provisionStarPrinter,
  verifyStarPrinter,
  getCachedCapabilities,
  setCachedCapabilities,
  invalidateCache,
} from "./deviceDetection";

export {
  startHeartbeat,
  stopHeartbeat,
  isHeartbeatRunning,
} from "./heartbeat";

export {
  startTerminalHealthCheck,
  stopTerminalHealthCheck,
} from "./terminalHealthCheck";

export {
  startListening,
  stopListening,
} from "./hardwareEventListener";
