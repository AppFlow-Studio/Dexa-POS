import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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
 * category pills, modifier chips, CTAs) so touch feedback is consistent.
 */
export function KioskPressable({
  pressedScale = 0.96,
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
    opacity: 1 - press.value * 0.1,
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => {
        if (disabled) return;
        press.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 15, stiffness: 280, mass: 0.5 });
      }}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
