import {
  resolveKioskOrientationMode,
  useKioskDeviceSettingsStore,
} from "@/stores/useKioskDeviceSettingsStore";
import type { KioskOrientation } from "@/types/kiosk";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";

/**
 * Owns kiosk orientation: applies the lock, and reports the orientation the
 * layout should actually render for.
 *
 * The main layout cedes orientation control to kiosk routes (it locks to
 * DEFAULT), so the kiosk owns this. Re-locks whenever the target changes —
 * e.g. when a config edit is committed on returning to idle, or a manager
 * flips the device-local override in Kiosk Settings.
 *
 *   'vertical'   → PORTRAIT_UP
 *   'horizontal' → LANDSCAPE
 *   'auto'       → no lock at all. The kiosk stops dictating an orientation and
 *                  renders for whatever shape the panel reports. On a tablet
 *                  bolted into a stand (auto-rotate off at the OS level) that
 *                  settles into the mount's own orientation; on one with
 *                  auto-rotate on it follows the device live, because the
 *                  returned value is derived from the window and re-renders
 *                  with it.
 *
 * The device-local override (useKioskDeviceSettingsStore) wins over the
 * profile; its default is "profile", so an untouched kiosk behaves exactly as
 * before.
 *
 * @param profileOrientation the website-configured profile orientation
 * @returns the orientation every kiosk layout should key off
 */
export function useKioskOrientation(
  profileOrientation: KioskOrientation | undefined,
): KioskOrientation {
  const mode = useKioskDeviceSettingsStore((s) => s.orientationMode);
  const { width, height } = useWindowDimensions();

  const target = resolveKioskOrientationMode(mode, profileOrientation);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let cancelled = false;
    (async () => {
      try {
        // 'auto' — hand orientation back to the OS. lockAsync(DEFAULT) is not
        // the same thing: it re-asserts a lock, where unlockAsync clears ours
        // and lets the device's own setting decide.
        if (target === "auto") {
          if (!cancelled) await ScreenOrientation.unlockAsync();
          return;
        }
        const lock =
          target === "horizontal"
            ? ScreenOrientation.OrientationLock.LANDSCAPE
            : ScreenOrientation.OrientationLock.PORTRAIT_UP;
        if (!cancelled) await ScreenOrientation.lockAsync(lock);
      } catch (err) {
        console.warn("[kiosk] orientation lock failed:", err);
      }
    })();

    // Restore landscape when the component unmounts or the target changes
    // away, so switching to a non-kiosk station locks back to the app default.
    return () => {
      cancelled = true;
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      ).catch(() => {});
    };
  }, [target]);

  if (target !== "auto") return target;
  // Square-ish panels (rare, but they exist) fall to landscape — the kiosk's
  // horizontal layouts degrade more gracefully at 1:1 than the portrait ones.
  return width >= height ? "horizontal" : "vertical";
}
