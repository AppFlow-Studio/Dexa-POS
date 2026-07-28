import { colors } from "@/lib/theme";
import {
    selectIsFullscreen,
    useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import React, { useEffect, useState } from "react";
import { Keyboard, Platform, useWindowDimensions } from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import ModifierScreen from "./ModifierScreen";

/**
 * ModifierScreenOverlay - Slides up from the bottom.
 *
 * SIZING: The overlay is mounted inside MenuSection (a flex column), so it must
 * NOT rely on inset-only `StyleSheet.absoluteFillObject` (top/left/right/bottom:0
 * with no width/height). On the New Architecture (Fabric) an inset-only absolute
 * box can collapse to its content size when the parent flex column doesn't hand
 * it a resolved height — which rendered the whole ModifierScreen as a tiny box in
 * the corner. We give it EXPLICIT window width/height (from `useWindowDimensions`,
 * which also tracks rotation/resize, unlike a module-level `Dimensions.get`) so it
 * always fills the viewport. Anchored top/left; the extra width past the menu
 * column simply spills off-screen right, leaving the cart column visible.
 *
 * PERFORMANCE: ModifierScreen mounts on demand and remains mounted briefly
 * after close for fast repeat edits without keeping its subscription tree
 * alive for the full table-order session.
 */
const ModifierScreenOverlay: React.FC = () => {
  const { height } = useWindowDimensions();
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);
  const isOpen = useModifierSidebarStore((s) => s.isOpen);
  const [shouldMountScreen, setShouldMountScreen] = useState(false);
  const [keepScreenPainted, setKeepScreenPainted] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  // Start fully off-screen at the bottom. Kept in a ref-like shared value; the
  // effect below re-targets it whenever the open state or viewport height change.
  const translateY = useSharedValue(height);

  useEffect(() => {
    if (isOpen || isFullscreen) {
      setShouldMountScreen(true);
      return;
    }

    const timeoutId = setTimeout(() => {
      setShouldMountScreen(false);
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [isOpen, isFullscreen]);

  useEffect(() => {
    if (isOpen || isFullscreen) {
      setKeepScreenPainted(true);
      return;
    }

    const timeoutId = setTimeout(() => {
      setKeepScreenPainted(false);
    }, 160);

    return () => clearTimeout(timeoutId);
  }, [isOpen, isFullscreen]);

  useEffect(() => {
    cancelAnimation(translateY);
    translateY.value = withTiming(isFullscreen ? 0 : height, {
      duration: 60,
      easing: Easing.out(Easing.quad),
    });
  }, [isFullscreen, translateY, height]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(event.endCoordinates?.height ?? 0);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!isOpen && !shouldMountScreen) return null;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          // WIDTH comes from the parent (left:0 + right:0 = the MenuSection
          // column's width — the cross axis resolves fine). HEIGHT must be
          // explicit: the flex-column parent doesn't hand a resolved height to an
          // inset-only absolute child on Fabric, which collapsed the sheet into
          // the corner. Parent is `overflow-hidden`, so any excess height clips.
          height,
          backgroundColor: colors.card,
          zIndex: 9999,
        },
        animatedStyle,
        keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
      ]}
      pointerEvents={isOpen && isFullscreen ? "auto" : "none"}
    >
      <ModifierScreen keepMountedDuringClose={keepScreenPainted && !isOpen} />
    </Animated.View>
  );
};

export default ModifierScreenOverlay;
