import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { ViewProps } from "react-native";

/**
 * Lightweight per-screen transition wrapper for kiosk ordering flows.
 *
 * Uses Reanimated's `entering`/`exiting` fade animations, which run entirely
 * on the UI thread — no JS-thread cost, safe for low-power kiosk tablets.
 */
export function KioskScreenTransition({ style, children, ...rest }: ViewProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      style={[{ flex: 1 }, style]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}
