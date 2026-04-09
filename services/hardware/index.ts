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
  addStarPrinter,
  addBuiltinPrinter,
  addDejavooPrinter,
  testPrinterConnection,
} from "./printerProvisioning";

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

export {
  startStarPrinterHealthCheck,
  stopStarPrinterHealthCheck,
} from "./starPrinterHealthCheck";
