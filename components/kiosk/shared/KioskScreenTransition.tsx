import type { ViewProps } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  type AnimatedProps,
} from "react-native-reanimated";

/**
 * Per-screen transition wrapper for kiosk ordering flows.
 *
 * Every screen cross-fades. Sliding was tried and removed: on a kiosk panel a
 * full-screen slide is a very large travel distance, which reads as sluggish
 * rather than polished, and the incoming screen is usually still building its
 * subtree while it moves. A fade carries the same "something changed" signal
 * with no travel.
 *
 * `direction` is kept in the signature so call sites still document how each
 * screen relates to the one it replaces, but every value renders the same
 * cross-fade today.
 *
 * Runs entirely on the UI thread via Reanimated's layout animations — no
 * JS-thread cost, which matters on low-power kiosk hardware. Durations stay
 * short: a customer standing at a kiosk is mid-task, and anything slower reads
 * as lag.
 */
export type KioskTransitionDirection = "forward" | "up" | "fade";

export function KioskScreenTransition({
  direction = "fade",
  style,
  children,
  ...rest
}: AnimatedProps<ViewProps> & { direction?: KioskTransitionDirection }) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(160)}
      style={[{ flex: 1 }, style]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}
