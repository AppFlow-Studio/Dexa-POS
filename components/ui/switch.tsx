import * as SwitchPrimitives from "@rn-primitives/switch";
import * as React from "react";
import { Platform } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { useColorScheme } from "~/lib/useColorScheme";
import { cn } from "~/lib/utils";

// Dexa design system — matches the availability toggle in ItemForm
// On:  teal tinted track (#2DD4BF20 bg, #2DD4BF50 border), teal thumb
// Off: dark track (#2A3050), muted thumb

const TEAL_TRACK   = "rgba(45, 212, 191, 0.15)"; // teal + ~15% opacity
const TEAL_THUMB   = "rgb(45, 212, 191)";          // solid teal
const OFF_TRACK    = "rgb(30, 35, 64)";            // colors.card
const OFF_THUMB    = "rgb(100, 116, 139)";          // colors.muted

function SwitchWeb({
  className,
  ...props
}: SwitchPrimitives.RootProps & {
  ref?: React.RefObject<SwitchPrimitives.RootRef>;
}) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer flex-row h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed",
        props.disabled && "opacity-50",
        className
      )}
      style={{
        backgroundColor: props.checked ? TEAL_TRACK : OFF_TRACK,
        borderColor: props.checked ? "rgba(45,212,191,0.4)" : "rgba(42,48,80,1)",
      }}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full shadow-md ring-0 transition-transform",
          props.checked ? "translate-x-5" : "translate-x-0"
        )}
        style={{ backgroundColor: props.checked ? TEAL_THUMB : OFF_THUMB }}
      />
    </SwitchPrimitives.Root>
  );
}

function SwitchNative({
  className,
  ...props
}: SwitchPrimitives.RootProps & {
  ref?: React.RefObject<SwitchPrimitives.RootRef>;
}) {
  const translateX = useDerivedValue(() => (props.checked ? 16 : 0));

  const animatedTrackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(translateX.value, [0, 16], [OFF_TRACK, TEAL_TRACK]),
    borderColor: interpolateColor(translateX.value, [0, 16], ["rgba(42,48,80,1)", "rgba(45,212,191,0.4)"]),
  }));

  const animatedThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(translateX.value, { duration: 180 }) }],
    backgroundColor: interpolateColor(translateX.value, [0, 16], [OFF_THUMB, TEAL_THUMB]),
  }));

  return (
    <Animated.View
      style={[
        animatedTrackStyle,
        {
          width: 42,
          height: 24,
          borderRadius: 12,
          borderWidth: 1,
          justifyContent: "center",
        },
        props.disabled ? { opacity: 0.5 } : undefined,
      ]}
    >
      <SwitchPrimitives.Root
        style={{ width: 42, height: 24, borderRadius: 12, flexDirection: "row", alignItems: "center" }}
        className={cn(className)}
        {...props}
      >
        <Animated.View
          style={[
            animatedThumbStyle,
            {
              marginLeft: 3,
              width: 18,
              height: 18,
              borderRadius: 9,
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
          ]}
        >
          <SwitchPrimitives.Thumb style={{ width: 18, height: 18, borderRadius: 9 }} />
        </Animated.View>
      </SwitchPrimitives.Root>
    </Animated.View>
  );
}

const Switch = Platform.select({
  web: SwitchWeb,
  default: SwitchNative,
});

export { Switch };
