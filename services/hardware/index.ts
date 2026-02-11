// services/hardware/index.ts - Barrel export

export {
  type DeviceCapabilities,
  detectDeviceCapabilities,
  detectAndStoreCapabilities,
  updateStationCapabilities,
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
