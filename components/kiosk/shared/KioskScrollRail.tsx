import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { ReactNode } from "react";
import type { LayoutChangeEvent, ScrollViewProps } from "react-native";
import { View } from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

/**
 * A ScrollView with a thin, always-visible thumb on its right edge, so a
 * customer can tell at a glance that a long list (e.g. many modifier groups)
 * continues below the fold. The platform indicator only flashes while the list
 * is moving, which is exactly when the hint is no longer needed.
 *
 * Thumb only — no track, not draggable — and hidden when the content fits.
 */
export function KioskScrollRail({
  color,
  children,
  style,
  ...scrollProps
}: Omit<ScrollViewProps, "onScroll" | "showsVerticalScrollIndicator"> & {
  /** Thumb colour. */
  color: string;
  children: ReactNode;
}) {
  const s = useKioskUiScale();
  const inset = kioskPx(6, s);
  const width = kioskPx(4, s);
  const minThumb = kioskPx(32, s);

  const scrollY = useSharedValue(0);
  const viewportH = useSharedValue(0);
  const contentH = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const thumbStyle = useAnimatedStyle(() => {
    const track = viewportH.value - inset * 2;
    const overflow = contentH.value - viewportH.value;
    if (overflow <= 1 || track <= 0) return { opacity: 0 };
    const height = Math.max(minThumb, (track * viewportH.value) / contentH.value);
    // Clamped so iOS overscroll bounce doesn't push the thumb off the track.
    const progress = Math.min(1, Math.max(0, scrollY.value / overflow));
    return {
      opacity: 1,
      height,
      transform: [{ translateY: progress * (track - height) }],
    };
  });

  return (
    <View style={[{ flex: 1 }, style]}>
      <Animated.ScrollView
        {...scrollProps}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={(e: LayoutChangeEvent) => {
          viewportH.value = e.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_w, h) => {
          contentH.value = h;
        }}
      >
        {children}
      </Animated.ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: inset,
            right: inset / 2,
            width,
            borderRadius: width / 2,
            backgroundColor: color,
          },
          thumbStyle,
        ]}
      />
    </View>
  );
}
