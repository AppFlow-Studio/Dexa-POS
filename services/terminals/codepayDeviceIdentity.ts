// ============================================================
// CodePay device identity
// File: services/terminals/codepayDeviceIdentity.ts
// ============================================================
// Resolves a STABLE per-device identity to use as the CodePay terminal's
// serial_number — the (location_id, serial_number) dedup key that lets a device
// auto-provision its own payment_terminals row exactly once (find-or-create),
// instead of a fresh duplicate on every boot.
//
// Priority:
//   1. Native hardware serial (Build.getSerial) — the true device serial when
//      the ROM grants it (Dexa privileged on the terminal). It rides the
//      physical terminal and never moves, which is exactly the identity we want.
//   2. ANDROID_ID (expo-application) — zero-permission, stable across app
//      upgrades/reinstalls (resets only on factory reset). The resilient
//      fallback so provisioning still works on ROMs that block getSerial (most
//      non-system apps get a SecurityException from Build.getSerial).
//
// The ANDROID_ID form is prefixed so it is self-describing in the DB/UI and can
// never be confused with a real hardware serial. Returns null on non-Android or
// when neither source yields a value (caller then skips auto-provision).
// ============================================================

import * as Application from "expo-application";
import { Platform } from "react-native";
import { codepayGetDeviceSerial } from "@/native/CodePayBridge";

export interface CodePayDeviceIdentity {
  /** The value to store as payment_terminals.serial_number (dedup key). */
  serial: string;
  /** Which source produced it — for logging/telemetry, not persisted. */
  source: "hardware" | "android_id";
}

/**
 * Resolve the device's stable identity, native hardware serial first, else
 * ANDROID_ID. Returns null when neither is available (e.g. non-Android).
 */
export async function resolveCodePayDeviceIdentity(): Promise<CodePayDeviceIdentity | null> {
  if (Platform.OS !== "android") return null;

  try {
    const hw = await codepayGetDeviceSerial();
    if (hw && hw.trim()) {
      return { serial: hw.trim(), source: "hardware" };
    }
  } catch {
    // fall through to ANDROID_ID
  }

  try {
    const androidId = Application.getAndroidId();
    if (androidId && androidId.trim()) {
      return { serial: `ANDROIDID-${androidId.trim()}`, source: "android_id" };
    }
  } catch {
    // no id available
  }

  return null;
}

/** Convenience: just the serial string (or null). */
export async function resolveCodePayDeviceSerial(): Promise<string | null> {
  return (await resolveCodePayDeviceIdentity())?.serial ?? null;
}
