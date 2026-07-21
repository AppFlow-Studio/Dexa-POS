import { colors } from "@/lib/theme";
import {
    selectIsFullscreen,
    useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import React, { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform, StyleSheet } from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import ModifierScreen from "./ModifierScreen";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * ModifierScreenOverlay - Slides up from the bottom.
 *
 * PERFORMANCE: ModifierScreen mounts on demand and remains mounted briefly
 * after close for fast repeat edits without keeping its subscription tree
 * alive for the full table-order session.
 */
const ModifierScreenOverlay: React.FC = () => {
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);
  const isOpen = useModifierSidebarStore((s) => s.isOpen);
  const [shouldMountScreen, setShouldMountScreen] = useState(false);
  const [keepScreenPainted, setKeepScreenPainted] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const translateY = useSharedValue(SCREEN_HEIGHT);

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
    if (isFullscreen) {
      translateY.value = withTiming(0, {
        duration: 60,
        easing: Easing.out(Easing.quad),
      });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, {
        duration: 60,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [isFullscreen, translateY]);

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
        styles.overlay,
        animatedStyle,
        keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
      ]}
      pointerEvents={isOpen && isFullscreen ? "auto" : "none"}
    >
      <ModifierScreen keepMountedDuringClose={keepScreenPainted && !isOpen} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.card,
    zIndex: 9999,
    elevation: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
});

export default ModifierScreenOverlay;
