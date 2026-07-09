import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  getActiveOnlineOrderKeys,
  useActiveOnlineOrderCount,
  useUnseenOnlineOrderCount,
} from "@/stores/selectors/orderSelectors";
import {
  selectIsOpen,
  useOnlineOrderDrawerStore,
} from "@/stores/useOnlineOrderDrawerStore";
import { ShoppingBag } from "lucide-react-native";
import React, { memo, useEffect, useRef } from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const BASE_TAB_WIDTH = 52;
const BASE_TAB_HEIGHT = 112;

// Matches the Kanban "New Orders" column / "N new" pill accent.
const NEW_ORDER_BLUE = "#3b82f6";

/**
 * Right-edge "tab folder" for online orders. Docked on every main POS screen
 * (mounted in app/(main)/_layout.tsx, non-KDS branch only). Slides in when
 * there are active online orders, shows an unseen-count badge, and pulses
 * when a new unseen order arrives. Tapping toggles the online order drawer,
 * which marks everything seen.
 */
const OnlineOrderEdgeTab: React.FC = () => {
  const activeCount = useActiveOnlineOrderCount();
  const unseenCount = useUnseenOnlineOrderCount();
  const isOpen = useOnlineOrderDrawerStore(selectIsOpen);
  const uiScale = useUiScale();

  const tabWidth = Math.round(BASE_TAB_WIDTH * uiScale);
  const tabHeight = Math.round(BASE_TAB_HEIGHT * uiScale);

  const visible = activeCount > 0;

  // slide: 0 = docked, 1 = hidden off the right edge.
  const slide = useSharedValue(visible ? 0 : 1);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      slide.value = withSpring(0, { damping: 25, stiffness: 300, mass: 0.7 });
    } else {
      slide.value = withTiming(1, { duration: 180 });
    }
  }, [visible, slide]);

  // Pulse when the unseen count INCREASES while the drawer is closed (while
  // open, arrivals are marked seen immediately — a pulse would just flash).
  const prevUnseenRef = useRef(unseenCount);
  useEffect(() => {
    const prev = prevUnseenRef.current;
    prevUnseenRef.current = unseenCount;
    if (unseenCount > prev && !isOpen) {
      scale.value = withSequence(
        withSpring(1.15, { damping: 12, stiffness: 400 }),
        withSpring(1, { damping: 15, stiffness: 300 }),
      );
      glow.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 600 }),
      );
    }
  }, [unseenCount, isOpen, scale, glow]);

  // Resolve the theme proxy to a plain string OUTSIDE the worklet — the
  // colors Proxy is JS-thread-only and can't be dereferenced on the UI thread.
  const idleBorderColor = String(colors.border);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: slide.value * (tabWidth + 12) },
      { scale: scale.value },
    ],
    borderColor: interpolateColor(
      glow.value,
      [0, 1],
      [idleBorderColor, NEW_ORDER_BLUE],
    ),
    shadowOpacity: 0.25 + glow.value * 0.5,
  }));

  const onPress = () => {
    useOnlineOrderDrawerStore.getState().toggleDrawer(getActiveOnlineOrderKeys());
  };

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        {
          position: "absolute",
          right: 0,
          top: "38%",
          width: tabWidth,
          height: tabHeight,
          backgroundColor: colors.panel,
          borderWidth: 1.5,
          borderRightWidth: 0,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
          shadowColor: NEW_ORDER_BLUE,
          shadowOffset: { width: -2, height: 0 },
          shadowRadius: 10,
          elevation: 8,
        },
        animatedStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ShoppingBag size={Math.round(24 * uiScale)} color={NEW_ORDER_BLUE} />
        <Text
          className="font-bold"
          style={{
            color: colors.label,
            fontSize: Math.round(10 * uiScale),
            marginTop: 6,
          }}
        >
          {activeCount}
        </Text>
        {unseenCount > 0 && !isOpen && (
          <Animated.View
            style={{
              position: "absolute",
              top: -8,
              left: -8,
              minWidth: Math.round(22 * uiScale),
              height: Math.round(22 * uiScale),
              backgroundColor: NEW_ORDER_BLUE,
              borderRadius: Math.round(11 * uiScale),
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 4,
              borderWidth: 2,
              borderColor: colors.screen,
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: Math.round(11 * uiScale),
                fontWeight: "700",
              }}
            >
              {unseenCount > 99 ? "99+" : unseenCount}
            </Text>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
};

export default memo(OnlineOrderEdgeTab);
