import { StyleSheet, type ViewProps } from "react-native";
import Animated, {
  Easing,
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
 * **Absolutely positioned, deliberately.** An exiting screen stays mounted for
 * the length of its fade. If these were flow children (`flex: 1`) the outgoing
 * and incoming screens would share the column for those frames — each squeezed
 * to half height — and then snap. That reflow, not the fade, is what used to
 * make the old screen look like it hung around after "Add to Cart". Stacked,
 * the outgoing screen fades out *over* the incoming one, which is a real
 * cross-fade and reads instant.
 *
 * Requires a positioned, sized parent (a `flex: 1` body container).
 *
 * `direction` is kept in the signature so call sites still document how each
 * screen relates to the one it replaces, but every value renders the same
 * cross-fade today.
 *
 * Runs entirely on the UI thread via Reanimated's layout animations — no
 * JS-thread cost, which matters on low-power kiosk hardware. Durations stay
 * short: a customer standing at a kiosk is mid-task, and anything slower reads
 * as lag. The exit is faster than the entrance and eased out, so the outgoing
 * screen loses most of its opacity in the first few frames instead of lingering
 * at half-visible through the middle of the transition.
 */
export type KioskTransitionDirection = "forward" | "up" | "fade";

const ENTER_MS = 170;
const EXIT_MS = 110;

export function KioskScreenTransition({
  direction = "fade",
  style,
  children,
  ...rest
}: AnimatedProps<ViewProps> & { direction?: KioskTransitionDirection }) {
  return (
    <Animated.View
      entering={FadeIn.duration(ENTER_MS).easing(Easing.out(Easing.quad))}
      exiting={FadeOut.duration(EXIT_MS).easing(Easing.in(Easing.quad))}
      style={[StyleSheet.absoluteFillObject, style]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}
