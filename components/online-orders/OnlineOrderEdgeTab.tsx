import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  getActiveOnlineOrderKeys,
  useActiveOnlineOrderCount,
  useUnseenOnlineOrderCount,
} from "@/stores/selectors/orderSelectors";
import {
  selectIsOpen,
  selectTabPositionY,
  useOnlineOrderDrawerStore,
} from "@/stores/useOnlineOrderDrawerStore";
import { ShoppingBag } from "lucide-react-native";
import React, { memo, useEffect, useMemo, useRef } from "react";
import { Text, useWindowDimensions } from "react-native";
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

const BASE_TAB_WIDTH = 52;
const BASE_TAB_HEIGHT = 112;

// Matches the Kanban "New Orders" column / "N new" pill accent.
const NEW_ORDER_BLUE = "#3b82f6";

// Keep the tab clear of the very top/bottom of the screen (headers, nav bars)
// so a dragged tab can always be grabbed again.
const BASE_TRACK_INSET = 64;

// Movement past this many pixels turns the press into a drag, so the release
// repositions the tab instead of opening the drawer.
const DRAG_THRESHOLD = 6;

/**
 * Right-edge "tab folder" for online orders. Docked on every main POS screen
 * (mounted in app/(main)/_layout.tsx, non-KDS branch only). Slides in when
 * there are active online orders, shows an unseen-count badge, and pulses
 * when a new unseen order arrives. Tapping toggles the online order drawer,
 * which marks everything seen.
 *
 * The tab stays pinned to the right edge but slides freely up and down it:
 * drag it clear of whatever it covers on the current screen and the position
 * persists (as a 0..1 fraction of the track) in useOnlineOrderDrawerStore.
 */
const OnlineOrderEdgeTab: React.FC = () => {
  const activeCount = useActiveOnlineOrderCount();
  const unseenCount = useUnseenOnlineOrderCount();
  const isOpen = useOnlineOrderDrawerStore(selectIsOpen);
  const positionY = useOnlineOrderDrawerStore(selectTabPositionY);
  const uiScale = useUiScale();
  const { height: windowHeight } = useWindowDimensions();

  const tabWidth = Math.round(BASE_TAB_WIDTH * uiScale);
  const tabHeight = Math.round(BASE_TAB_HEIGHT * uiScale);

  // Vertical track the tab may be dragged along, in px from the top.
  const trackInset = Math.round(BASE_TRACK_INSET * uiScale);
  const trackTop = trackInset;
  const trackBottom = Math.max(
    trackTop,
    windowHeight - trackInset - tabHeight,
  );
  const trackLength = trackBottom - trackTop;

  const visible = activeCount > 0;

  // slide: 0 = docked, 1 = hidden off the right edge.
  const slide = useSharedValue(visible ? 0 : 1);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  // Live top offset in px. Driven by the store while idle, by the finger
  // during a drag; the drag's final value is written back to the store.
  const offsetY = useSharedValue(trackTop + positionY * trackLength);
  const dragStartY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Re-derive the pixel offset whenever the store position or the track
  // changes (rotation, UI scale) — but never while a drag is in flight.
  useEffect(() => {
    if (isDragging.value) return;
    offsetY.value = trackTop + positionY * trackLength;
  }, [positionY, trackTop, trackLength, offsetY, isDragging]);

  const commitPosition = useMemo(
    () => (nextOffset: number) => {
      const fraction = trackLength > 0 ? (nextOffset - trackTop) / trackLength : 0;
      useOnlineOrderDrawerStore.getState().setTabPositionY(fraction);
    },
    [trackTop, trackLength],
  );

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
    top: offsetY.value,
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

  const toggleDrawer = () => {
    useOnlineOrderDrawerStore
      .getState()
      .toggleDrawer(getActiveOnlineOrderKeys());
  };

  // Pan owns both interactions: a release that never crossed DRAG_THRESHOLD
  // is treated as a tap (toggle the drawer), anything further repositions the
  // tab. One gesture rather than Pan + Tap keeps the two from racing on a
  // slow press-and-slide.
  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin(() => {
          dragStartY.value = offsetY.value;
          isDragging.value = false;
        })
        .onUpdate((e) => {
          if (!isDragging.value) {
            if (Math.abs(e.translationY) < DRAG_THRESHOLD) return;
            isDragging.value = true;
          }
          offsetY.value = Math.max(
            trackTop,
            Math.min(trackBottom, dragStartY.value + e.translationY),
          );
        })
        .onEnd(() => {
          if (!isDragging.value) {
            runOnJS(toggleDrawer)();
            return;
          }
          const settled = Math.max(
            trackTop,
            Math.min(trackBottom, offsetY.value),
          );
          offsetY.value = withSpring(settled, {
            damping: 30,
            stiffness: 350,
            mass: 0.6,
          });
          runOnJS(commitPosition)(settled);
        })
        .onFinalize(() => {
          isDragging.value = false;
        }),
    [
      offsetY,
      dragStartY,
      isDragging,
      trackTop,
      trackBottom,
      commitPosition,
    ],
  );

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        style={[
          {
            position: "absolute",
            right: 0,
            width: tabWidth,
            height: tabHeight,
            alignItems: "center",
            justifyContent: "center",
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
        <ShoppingBag size={Math.round(24 * uiScale)} color={NEW_ORDER_BLUE} />
        <Text
          style={{
            fontWeight: "700",
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
      </Animated.View>
    </GestureDetector>
  );
};

export default memo(OnlineOrderEdgeTab);
