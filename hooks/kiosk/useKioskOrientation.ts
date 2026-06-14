import type { KioskOrientation } from "@/types/kiosk";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Locks the device to the kiosk's configured orientation.
 *
 * The main layout cedes orientation control to kiosk routes (it locks to
 * DEFAULT), so the kiosk owns this. Re-locks whenever `orientation` changes —
 * e.g. when a config edit is committed on returning to idle.
 *
 *   'vertical'   → PORTRAIT_UP
 *   'horizontal' → LANDSCAPE
 */
export function useKioskOrientation(orientation: KioskOrientation | undefined) {
  useEffect(() => {
    if (Platform.OS === "web" || !orientation) return;

    const lock =
      orientation === "horizontal"
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP;

    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await ScreenOrientation.lockAsync(lock);
      } catch (err) {
        console.warn("[kiosk] orientation lock failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orientation]);
}
