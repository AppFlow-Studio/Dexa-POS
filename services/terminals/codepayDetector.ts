// ============================================================
// CodePay on-terminal detector
// File: services/terminals/codepayDetector.ts
// ============================================================
// Detects the on-device CodePay Register app and surfaces an internal CodePay
// terminal (useCodePayTerminalStore) so the POS can take card payments with no
// manual terminal setup — the ATOM analogue, for an Intent target instead of a
// loopback REST server.
//
//   1. Gate on the native CodePay bridge being present + an app_id being set.
//   2. Presence-check via codepayIsRegisterAvailable() (Intent resolves?).
//   3. Surface a synthetic internal terminal (register_id = app_id) + configure
//      the shared service.
//   4. Re-check on a light interval and on AppState -> "active".
//
// Unlike ATOM, the presence check is a pure packageManager.resolveActivity — it
// never touches the Register app's session — so there is NO suspend/resume
// machinery; it is safe to run even during a live sale.
// ============================================================

import { AppState, type AppStateStatus } from "react-native";
import {
  codepayIsRegisterAvailable,
  isCodePayBridgeAvailable,
} from "@/native/CodePayBridge";
import {
  CODEPAY_AUTO_PROVISION_ENABLED,
  CODEPAY_SALE_TIMEOUT_MS,
} from "@/types/codepay";
import { getSharedCodePayService } from "./codepay-service";
import { ensureCodePayTerminalProvisioned } from "./codepayAutoProvision";
import {
  buildInternalCodePayTerminal,
  useCodePayTerminalStore,
} from "@/stores/useCodePayTerminalStore";

const TAG = "[CodePayDetector]";
/** Re-check cadence while running. */
const PROBE_INTERVAL_MS = 30_000;

let _running = false;
let _timer: ReturnType<typeof setInterval> | null = null;
let _appStateSub: { remove: () => void } | null = null;
let _probing = false;
/** Auto-provision runs at most once per detector session (idempotent anyway). */
let _autoProvisioned = false;
let _provisioning = false;

/**
 * Best-effort: create a real payment_terminals row for this device so batch-out
 * works without SQL. Fire-and-forget from the probe (never blocks it); no-ops
 * offline / before the session is ready and retries on the next probe until it
 * succeeds, then latches off for the session.
 */
async function maybeAutoProvision(): Promise<void> {
  if (!CODEPAY_AUTO_PROVISION_ENABLED || _autoProvisioned || _provisioning) {
    return;
  }
  _provisioning = true;
  try {
    const res = await ensureCodePayTerminalProvisioned();
    if (res.ok) {
      _autoProvisioned = true;
      console.log(
        `${TAG} auto-provisioned terminal ${res.terminalId} (serial ${res.serial})`,
      );
    }
  } finally {
    _provisioning = false;
  }
}

/** Presence-check once; surface or un-surface the internal CodePay terminal. */
async function probeOnce(): Promise<void> {
  if (_probing) return;
  _probing = true;
  try {
    if (!isCodePayBridgeAvailable()) return;

    const store = useCodePayTerminalStore.getState();
    const appId = store.appId?.trim();

    // No app_id configured → CodePay can't route an Intent; ensure un-surfaced.
    if (!appId) {
      if (store.internalTerminal) {
        console.log(`${TAG} no app_id configured — un-surfacing`);
        store.clear();
      }
      return;
    }

    const present = await codepayIsRegisterAvailable();
    if (present) {
      const terminal = buildInternalCodePayTerminal(appId);
      // Configure the shared service so health/charge calls have app_id/timeout.
      getSharedCodePayService().configure({
        appId,
        terminalId: terminal.id,
        timeout: CODEPAY_SALE_TIMEOUT_MS,
      });
      const changed =
        store.internalTerminal?.id !== terminal.id ||
        store.internalTerminal?.register_id !== appId;
      store.setInternalTerminal(terminal);
      if (changed) console.log(`${TAG} internal CodePay surfaced (app_id set)`);
      // Persist a real terminal row too (settlement needs one). Fire-and-forget.
      void maybeAutoProvision();
      return;
    }

    // Register app not present — un-surface if we had surfaced it.
    if (store.internalTerminal) {
      console.log(`${TAG} CodePay Register not present — un-surfacing`);
      store.clear();
    }
  } catch (e) {
    console.warn(`${TAG} probe failed:`, e);
  } finally {
    _probing = false;
  }
}

function onAppStateChange(state: AppStateStatus): void {
  if (state === "active") void probeOnce();
}

export function startCodePayDetect(): void {
  if (_running) return;
  _running = true;
  console.log(`${TAG} starting`);
  void probeOnce();
  _timer = setInterval(() => void probeOnce(), PROBE_INTERVAL_MS);
  _appStateSub = AppState.addEventListener("change", onAppStateChange);
}

export function stopCodePayDetect(): void {
  if (!_running) return;
  _running = false;
  _autoProvisioned = false;
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

/** Force an immediate re-check (e.g. from a Settings "Test Connection" button). */
export function probeCodePayNow(): Promise<void> {
  return probeOnce();
}
