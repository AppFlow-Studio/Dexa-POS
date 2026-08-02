import { colors } from "@/lib/theme";
import {
    selectIsFullscreen,
    useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import React, { useEffect, useState } from "react";
import { Keyboard, Platform, useWindowDimensions, View } from "react-native";
import ModifierScreen from "./ModifierScreen";

/**
 * ModifierScreenOverlay — fullscreen overlay for the modifier screen.
 *
 * SIZING: The overlay is mounted inside MenuSection (a flex column), so it must
 * NOT rely on inset-only `StyleSheet.absoluteFill` (top/left/right/bottom:0
 * with no width/height). On the New Architecture (Fabric) an inset-only absolute
 * box can collapse to its content size when the parent flex column doesn't hand
 * it a resolved height — which rendered the whole ModifierScreen as a tiny box in
 * the corner. We give it an EXPLICIT height (from `useWindowDimensions`, which
 * also tracks rotation/resize, unlike a module-level `Dimensions.get`) so it
 * always fills the viewport. Width comes from the parent via left:0 + right:0 —
 * the cross axis resolves fine. Parent is `overflow-hidden`, so excess clips.
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
  const { height } = useWindowDimensions();
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
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          // HEIGHT must be explicit: the flex-column parent doesn't hand a
          // resolved height to an inset-only absolute child on Fabric, which
          // collapsed the sheet into the corner.
          height,
          backgroundColor: colors.card,
          zIndex: 9999,
        },
        // Instant show/hide — no animation, no Reanimated, no extra frame.
        // Translating by the live viewport height (not a module-level constant)
        // keeps it fully off-screen across rotation and resize.
        visible ? null : { transform: [{ translateY: height }] },
        keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <ModifierScreen />
    </View>
  );
};

export default ModifierScreenOverlay;
