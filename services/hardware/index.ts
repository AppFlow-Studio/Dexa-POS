// services/hardware/index.ts - Barrel export

export {
  type DeviceCapabilities,
  detectDeviceCapabilities,
  detectAndStoreCapabilities,
  updateStationCapabilities,
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
