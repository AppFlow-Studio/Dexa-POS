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
    if (Platform.OS === "web") return;

    // No orientation requested — lock to landscape (the app's default per
    // app.json). lockAsync(DEFAULT) doesn't actually prevent rotation on
    // Android when system auto-rotate is on; we must be explicit.
    if (!orientation) {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      ).catch(() => {});
      return;
    }

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

    // Restore landscape when the component unmounts or the orientation changes
    // away, so switching to a non-kiosk station locks back to the app default.
    return () => {
      cancelled = true;
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      ).catch(() => {});
    };
  }, [orientation]);
}
