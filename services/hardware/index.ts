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
  startListening,
  stopListening,
} from "./hardwareEventListener";
