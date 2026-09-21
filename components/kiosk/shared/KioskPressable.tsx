import { kioskMotion } from "@/components/kiosk/shared/kioskDesign";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with tactile press feedback — dips scale + opacity on press-in and
 * springs back on release.
 *
 * The whole animation lives on the UI thread (Reanimated shared value), so a
 * low-power kiosk tablet still feels responsive while JS is busy building the
 * next screen. Used for every tappable surface in the kiosk flow (menu cards,
 * category tabs, modifier chips, CTAs) so touch feedback is consistent.
 *
 * It dips and returns on a flat curve rather than springing back. The spring
 * overshot, and overshoot on every single tap is what makes an interface feel
 * like a toy — the press should acknowledge the finger and get out of the way.
 */
export function KioskPressable({
  pressedScale = 0.97,
  style,
  disabled,
  children,
  ...rest
}: Omit<PressableProps, "style"> & {
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const press = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * (1 - pressedScale) }],
    opacity: 1 - press.value * 0.06,
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => {
        if (disabled) return;
        press.value = withTiming(1, { duration: kioskMotion.instant });
      }}
      onPressOut={() => {
        press.value = withTiming(0, {
          duration: kioskMotion.fast,
          easing: kioskMotion.easing,
        });
      }}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
