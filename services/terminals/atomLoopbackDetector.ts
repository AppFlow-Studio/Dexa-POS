// ============================================================
// ATOM loopback detector
// File: services/terminals/atomLoopbackDetector.ts
// ============================================================
// Detects the on-device ("internal") LandiGlobal ATOM payment app on loopback
// and surfaces it as an available terminal (useAtomTerminalStore). Analogous to
// valorUsbAutoConnect, but for a loopback REST server instead of a USB socket.
//
//   1. Gate on Landi hardware + the native AtomBridge being present.
//   2. Probe ATOM_CANDIDATE_PORTS via GET /ping; first 200 wins.
//   3. Publish a synthetic internal terminal + configure the shared service.
//   4. Re-probe on a light interval and on AppState -> "active" (the ATOM app
//      may launch after the POS, or be killed/restarted at any time).
// ============================================================

import { AppState, type AppStateStatus } from "react-native";
import { detectNativeHardware } from "@/native/HardwareDetection";
import {
  ATOM_CANDIDATE_PORTS,
  ATOM_LOOPBACK_HOST,
  ATOM_SALE_TIMEOUT_MS,
} from "@/types/atom";
import { AtomService, getSharedAtomService } from "./atom-service";
import {
  buildInternalAtomTerminal,
  useAtomTerminalStore,
} from "@/stores/useAtomTerminalStore";

const TAG = "[AtomLoopbackDetector]";
/** Re-probe cadence while running. */
const PROBE_INTERVAL_MS = 30_000;

let _running = false;
let _timer: ReturnType<typeof setInterval> | null = null;
let _appStateSub: { remove: () => void } | null = null;
let _isLandiDevice: boolean | null = null;
let _probing = false;
/**
 * When >0, probing is suspended. The ATOM app is single-session, so a health
 * probe (ping/status) overlapping a live sale/refund makes the terminal report
 * "device is busy". Payment flows bump this around the transaction. Refcounted
 * so nested/overlapping suspends compose safely.
 */
let _suspendCount = 0;

/** Pause background probing (call before an ATOM sale/refund). */
export function suspendAtomLoopbackProbing(): void {
  _suspendCount += 1;
}

/** Resume background probing (call after the ATOM sale/refund settles). */
export function resumeAtomLoopbackProbing(): void {
  _suspendCount = Math.max(0, _suspendCount - 1);
}

/** True on a Landi P-series device (where the ATOM app can run). Cached. */
async function isLandiDevice(): Promise<boolean> {
  if (_isLandiDevice != null) return _isLandiDevice;
  try {
    const hw = await detectNativeHardware();
    const manufacturer = (hw?.manufacturer ?? "").toUpperCase();
    const model = (hw?.model ?? "").toUpperCase();
    _isLandiDevice =
      manufacturer.includes("LANDI") || model.includes("P30") || model.includes("P32");
  } catch {
    _isLandiDevice = false;
  }
  return _isLandiDevice;
}

/** Probe candidate ports; on the first reachable one, surface + configure. */
async function probeOnce(): Promise<void> {
  if (_probing) return;
  // Suspended during a live sale/refund — never let a probe grab the ATOM
  // app's single session while a transaction is in flight.
  if (_suspendCount > 0) return;
  _probing = true;
  try {
    if (!AtomService.isAvailable()) return;
    if (!(await isLandiDevice())) return;

    const service = getSharedAtomService();
    const store = useAtomTerminalStore.getState();

    // Fast path: if we already found a port, re-confirm it first.
    const knownPort = store.port;
    const portsToTry = knownPort
      ? [knownPort, ...ATOM_CANDIDATE_PORTS.filter((p) => p !== knownPort)]
      : [...ATOM_CANDIDATE_PORTS];

    for (const port of portsToTry) {
      const reachable = await service.ping(ATOM_LOOPBACK_HOST, port);
      if (reachable) {
        // Configure the shared service so payment calls have host/port/timeout.
        const terminal = buildInternalAtomTerminal(port);
        service.configure({
          host: ATOM_LOOPBACK_HOST,
          port,
          terminalId: terminal.id,
          timeout: ATOM_SALE_TIMEOUT_MS,
        });
        // Only write to the store if something changed (avoid needless renders).
        if (store.internalTerminal?.id !== terminal.id || store.port !== port) {
          store.setInternalTerminal(terminal, port);
          console.log(`${TAG} internal ATOM surfaced on 127.0.0.1:${port}`);
        } else {
          // Refresh lastSeenAt.
          store.setInternalTerminal(terminal, port);
        }
        return;
      }
    }

    // Nothing reachable — un-surface if we had previously surfaced it.
    if (store.internalTerminal) {
      console.log(`${TAG} internal ATOM no longer reachable — un-surfacing`);
      store.clear();
    }
  } catch (e) {
    console.warn(`${TAG} probe failed:`, e);
  } finally {
    _probing = false;
  }
}

function onAppStateChange(state: AppStateStatus): void {
  if (state === "active" && _suspendCount === 0) {
    void probeOnce();
  }
}

export function startAtomLoopbackDetect(): void {
  if (_running) return;
  _running = true;
  console.log(`${TAG} starting`);
  // Immediate probe, then interval + AppState-active re-probes.
  void probeOnce();
  _timer = setInterval(() => void probeOnce(), PROBE_INTERVAL_MS);
  _appStateSub = AppState.addEventListener("change", onAppStateChange);
}

export function stopAtomLoopbackDetect(): void {
  if (!_running) return;
  _running = false;
  console.log(`${TAG} stopping`);
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  if (_appStateSub) {
    _appStateSub.remove();
    _appStateSub = null;
  }
}

/** Force an immediate re-probe (e.g. from a Settings "Test Connection" button). */
export function probeAtomLoopbackNow(): Promise<void> {
  return probeOnce();
}
