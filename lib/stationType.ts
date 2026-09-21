import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

/**
 * Handheld ("Dexa Go") station predicate — the same switch KDS and Kiosk use.
 *
 * Lives here, not under `handheld/`, so the register-side gates (root layout,
 * PosSyncProvider, CFDProvider) can read it without pulling the lazy handheld
 * bundle into the tablet cold start.
 */
export const HANDHELD_STATION_TYPE = "handheld" as const;

export function isHandheldStationType(stationType?: string | null): boolean {
  return stationType === HANDHELD_STATION_TYPE;
}

/** True when the currently selected station is a handheld. */
export function useIsHandheld(): boolean {
  return useStoreSettingsStore((s) =>
    isHandheldStationType(s.selectedStation?.station_type),
  );
}
