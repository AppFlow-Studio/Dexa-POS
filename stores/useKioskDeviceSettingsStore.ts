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
//     2 | 3 | 4 = a fixed override regardless of orientation.
// ============================================================

import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type KioskMenuColumns = "auto" | 2 | 3 | 4;

interface KioskDeviceSettingsState {
  menuColumns: KioskMenuColumns;
  setMenuColumns: (columns: KioskMenuColumns) => void;
}

export const useKioskDeviceSettingsStore = create<KioskDeviceSettingsState>()(
  persist(
    (set) => ({
      menuColumns: "auto",
      setMenuColumns: (menuColumns) => set({ menuColumns }),
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
