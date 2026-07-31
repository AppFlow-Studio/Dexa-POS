import { colors } from "@/lib/theme";
import {
    selectIsFullscreen,
    useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import React, { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform, StyleSheet, View } from "react-native";
import ModifierScreen from "./ModifierScreen";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * ModifierScreenOverlay — fullscreen overlay for the modifier screen.
 *
 * PERFORMANCE:
 * - ModifierScreen mounts ONCE (on the first open) and never unmounts.
 *   Subsequent opens are prop updates over already-realized views, not
 *   mounts — this is what makes rapid add-item cycles cheap.
 * - NO open/close animation. The overlay snaps in/out via an instant
 *   translateY style flip. The previous Reanimated slide meant every open
 *   and close scheduled UI-thread animation work and a React re-render at
 *   a moment when the JS thread is already busiest (cart write on DONE,
 *   modifier precompute on open). Instant visibility costs one style prop.
 * - Off-screen the subtree keeps its views but is moved out of the
 *   viewport and gets pointerEvents="none", so it neither draws nor
 *   intercepts touches.
 */
const ModifierScreenOverlay: React.FC = () => {
  const isFullscreen = useModifierSidebarStore(selectIsFullscreen);
  const isOpen = useModifierSidebarStore((s) => s.isOpen);
  const [hasEverOpened, setHasEverOpened] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (isOpen || isFullscreen) setHasEverOpened(true);
  }, [isOpen, isFullscreen]);

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

  if (!hasEverOpened) return null;

  const visible = isOpen && isFullscreen;

  return (
    <View
      style={[
        styles.overlay,
        // Instant show/hide — no animation, no Reanimated, no extra frame.
        visible ? null : styles.hidden,
        keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <ModifierScreen />
    </View>
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
    shadowRadius: 0,
    shadowOpacity: 0,
  },
  hidden: {
    transform: [{ translateY: SCREEN_HEIGHT }],
  },
});

export default ModifierScreenOverlay;
