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
import { createMMKV } from "react-native-mmkv";
import React, { memo, useEffect, useRef } from "react";
import { Pressable, Text, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

// Persist the tab's vertical position so it stays where staff drag it.
const edgeTabStorage = createMMKV({ id: "dexa-pos-edge-tab" });
const POS_KEY = "edge-tab-y-fraction";

const BASE_TAB_WIDTH = 52;
const BASE_TAB_HEIGHT = 112;


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
  const { height: screenHeight } = useWindowDimensions();

  const tabWidth = Math.round(BASE_TAB_WIDTH * uiScale);
  const tabHeight = Math.round(BASE_TAB_HEIGHT * uiScale);

  // Draggable vertical position (top offset in px), persisted as a screen
  // fraction so it survives rotation / different tablets sensibly.
  const minY = 8;
  const maxY = Math.max(minY, screenHeight - tabHeight - 8);
  const initialY = (() => {
    const frac = edgeTabStorage.getNumber(POS_KEY);
    const y = frac != null ? frac * screenHeight : screenHeight * 0.38;
    return Math.min(maxY, Math.max(minY, y));
  })();
  const posY = useSharedValue(initialY);
  const dragStartY = useSharedValue(0);

  const persistY = (y: number) => {
    edgeTabStorage.set(POS_KEY, y / screenHeight);
  };

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

  // Resolve the theme proxy to plain strings OUTSIDE the worklet — the
  // colors Proxy is JS-thread-only and can't be dereferenced on the UI thread.
  const idleBorderColor = String(colors.border);
  const accentColor = String(colors.teal);

  const animatedStyle = useAnimatedStyle(() => ({
    top: posY.value,
    transform: [
      { translateX: slide.value * (tabWidth + 12) },
      { scale: scale.value },
    ],
    borderColor: interpolateColor(
      glow.value,
      [0, 1],
      [idleBorderColor, accentColor],
    ),
    shadowOpacity: 0.25 + glow.value * 0.5,
  }));

  const onPress = () => {
    useOnlineOrderDrawerStore
      .getState()
      .toggleDrawer(getActiveOnlineOrderKeys());
  };

  // Drag to reposition vertically along the right edge. A small activation
  // distance keeps plain taps working (tap opens the drawer, drag moves it).
  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-15, 15])
    .onStart(() => {
      dragStartY.value = posY.value;
    })
    .onUpdate((e) => {
      const next = dragStartY.value + e.translationY;
      posY.value = Math.min(maxY, Math.max(minY, next));
    })
    .onEnd(() => {
      runOnJS(persistY)(posY.value);
    });

  return (
    <GestureDetector gesture={panGesture}>
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        {
          position: "absolute",
          right: 0,
          width: tabWidth,
          height: tabHeight,
          backgroundColor: colors.panel,
          borderWidth: 1.5,
          borderRightWidth: 0,
          borderTopLeftRadius: 20,
          borderBottomLeftRadius: 20,
          shadowColor: accentColor,
          shadowOffset: { width: -3, height: 2 },
          shadowRadius: 12,
          elevation: 8,
        },
        animatedStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Animated.View
          style={{
            width: Math.round(36 * uiScale),
            height: Math.round(36 * uiScale),
            borderRadius: Math.round(12 * uiScale),
            backgroundColor: accentColor + "1A",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShoppingBag size={Math.round(20 * uiScale)} color={accentColor} />
        </Animated.View>
        <Text
          style={{
            fontWeight: "700",
            color: colors.label,
            fontSize: Math.round(10 * uiScale),
            marginTop: 8,
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
              width:
                unseenCount > 9
                  ? Math.round(28 * uiScale)
                  : Math.round(22 * uiScale),
              height: Math.round(22 * uiScale),
              backgroundColor: accentColor,
              borderRadius: Math.round(11 * uiScale),
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: colors.screen,
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: Math.round(11 * uiScale),
                fontWeight: "700",
                textAlign: "center",
                includeFontPadding: false,
              }}
            >
              {unseenCount > 99 ? "99+" : unseenCount}
            </Text>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
    </GestureDetector>
  );
};

export default memo(OnlineOrderEdgeTab);
