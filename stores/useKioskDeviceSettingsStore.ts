// ============================================================
// Kiosk device-local settings
// File: stores/useKioskDeviceSettingsStore.ts
// ============================================================
// Per-DEVICE kiosk settings that a manager sets on the tablet itself (via the
// PIN-gated Kiosk Settings screen), separate from the website-driven kiosk
// profile. Persisted in MMKV so the choice survives restarts.
//
//   menuColumns — how many item columns the menu grid shows.
//     "auto" = the template's orientation default (3 vertical / 4 horizontal).
//     1 | 2 | 3 | 4 = a fixed override regardless of orientation.
//     1 switches the grid to the full-width feature row (copy left, photo
//     bleeding off the right edge) — see KioskMenuItemFeatureRow.
//
//   orientationMode — which way this device lays the kiosk out.
//     "profile" = obey the website-configured profile orientation (default).
//     "auto"    = don't lock; follow however the hardware is actually mounted.
//     "vertical" | "horizontal" = force one on this device only.
// ============================================================

import { createLazyPersistStorage } from "@/lib/storage";
import type { KioskOrientation } from "@/types/kiosk";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type KioskMenuColumns = "auto" | 1 | 2 | 3 | 4;

export type KioskOrientationMode =
  | "profile"
  | "auto"
  | "vertical"
  | "horizontal";

interface KioskDeviceSettingsState {
  menuColumns: KioskMenuColumns;
  setMenuColumns: (columns: KioskMenuColumns) => void;
  orientationMode: KioskOrientationMode;
  setOrientationMode: (mode: KioskOrientationMode) => void;
}

export const useKioskDeviceSettingsStore = create<KioskDeviceSettingsState>()(
  persist(
    (set) => ({
      menuColumns: "auto",
      setMenuColumns: (menuColumns) => set({ menuColumns }),
      orientationMode: "profile",
      setOrientationMode: (orientationMode) => set({ orientationMode }),
    }),
    {
      name: "dexa-pos-kiosk-device-settings",
      storage: createLazyPersistStorage(),
    },
  ),
);

/**
 * Resolve the effective column count. `autoDefault` is the template's own
 * orientation-based default, used when the manager leaves it on "auto".
 */
export function resolveKioskColumns(
  pref: KioskMenuColumns,
  autoDefault: number,
): number {
  return pref === "auto" ? autoDefault : pref;
}

/**
 * Collapse the device's orientation preference against the profile's, into the
 * three things the kiosk can actually do: lock portrait, lock landscape, or
 * follow the device ("auto").
 *
 * "profile" defers to the website-configured value, which is the default so an
 * untouched device behaves exactly as it did before this setting existed.
 */
export function resolveKioskOrientationMode(
  pref: KioskOrientationMode,
  profileOrientation: KioskOrientation | undefined,
): "auto" | KioskOrientation {
  if (pref !== "profile") return pref;
  return profileOrientation ?? "vertical";
}
