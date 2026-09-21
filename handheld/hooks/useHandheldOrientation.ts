import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Portrait for the handheld. app/_layout.tsx skips its landscape lock for
 * handheld stations; this is the other half. Until the Wave 0 build drops the
 * native landscape lock (Temur), a production device may ignore this — it
 * takes effect in a dev client / emulator whose native config allows portrait.
 *
 * Restores the app-default landscape on unmount so a station switch back to
 * the (landscape) auth screens is not left in portrait.
 */
export function useHandheldOrientation(): void {
  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      ).catch(() => {});
    };
  }, []);
}
