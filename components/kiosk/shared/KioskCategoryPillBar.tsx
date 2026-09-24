import {
  kioskFont,
  kioskMotion,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import {
  isKioskHandheld,
  KIOSK_GRID_INSET,
  kioskStripArrowSize,
} from "@/components/kiosk/shared/kioskLayout";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export interface CategoryPill {
  key: string;
  name: string;
}

const FADE_WIDTH = 40;
const TAB_PADDING_V = 14;
const TAB_PADDING_H = 18;
const TAB_FONT_SIZE = 18;
const TAB_LINE_HEIGHT = 22;
/** Gap between one tab and the next. */
const TAB_GAP = 8;
/**
 * Clear space the strip holds around its tabs.
 *
 * Applied to the top in full, and to the bottom only for whatever the grid
 * below does not already provide (`KIOSK_GRID_INSET`). Split that way the two
 * *visible* gaps match — which is the thing being asked for — instead of the
 * strip's own padding being symmetric on paper and the tab sitting hard
 * against the header's divider with twice the space beneath it.
 */
const STRIP_PADDING_V = 16;
/** Long merchant category names truncate rather than push the strip wide. */
const TAB_MAX_WIDTH = 260;
// The row's own full box height, so the chevron is centred against the height
// the tabs actually render at.
const TAB_HEIGHT = TAB_PADDING_V * 2 + TAB_LINE_HEIGHT;
/** A nudge moves most of a viewport, so repeated taps walk the strip. */
const NUDGE_FRACTION = 0.8;
/** Scroll-position tolerance, in px. */
const EPSILON = 2;

/**
 * Horizontal category selector - one tab per unique category name.
 *
 * The selected category is filled, not underlined. A rule under the active
 * label is quieter and it was too quiet: at a kiosk the customer is standing
 * back from the panel, glancing at the strip between decisions, and a two
 * pixel mark under one word in a row of words is not something you catch at
 * that distance. A filled block is. What the redesign keeps is the shape - a
 * squared-off tab at the same corner radius as the header's controls, not a
 * stadium-rounded chip.
 *
 * Unlike KioskCategoryRail (which groups by menu, so same-named categories in
 * different menus each get their own visible section), this bar has no
 * per-menu grouping - callers are expected to have already deduped same-named
 * categories before building `pills`, otherwise a category shared by two menus
 * would render as two identical, unexplained tabs.
 *
 * Overflow affordance: a fade at the edge with a chevron on it, shown only
 * when there is something that way. Visibility is derived from the scroll
 * offset, the content width and the viewport - never from how many categories
 * there are, because label widths vary and a count cannot tell you whether six
 * fit or five do.
 */
export function KioskCategoryPillBar({
  config,
  pills,
  resolvedKey,
  onSelect,
  dimmed = false,
}: {
  config: KioskConfig;
  pills: CategoryPill[];
  resolvedKey: string | null;
  onSelect: (key: string) => void;
  /** Stand the strip down while a search layer is over the grid below it. */
  dimmed?: boolean;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  /** Measured box of each tab, for scrolling a partly-hidden one into view. */
  const tabBoxRef = useRef<Record<string, { x: number; width: number }>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollAffordance = useCallback((offsetX: number) => {
    const maxOffset = Math.max(
      0,
      contentWidthRef.current - viewportWidthRef.current,
    );
    setCanScrollLeft(offsetX > EPSILON);
    setCanScrollRight(offsetX < maxOffset - EPSILON);
  }, []);

  const scrollTo = useCallback(
    (x: number) => {
      const maxOffset = Math.max(
        0,
        contentWidthRef.current - viewportWidthRef.current,
      );
      const clamped = Math.min(maxOffset, Math.max(0, x));
      scrollRef.current?.scrollTo({ x: clamped, animated: true });
      // `onScroll` lands the real offset; this keeps the chevrons honest at
      // the ends even if the animation is interrupted.
      scrollXRef.current = clamped;
      updateScrollAffordance(clamped);
    },
    [updateScrollAffordance],
  );

  const nudge = useCallback(
    (direction: -1 | 1) => {
      const step = Math.max(80, viewportWidthRef.current * NUDGE_FRACTION);
      scrollTo(scrollXRef.current + step * direction);
    },
    [scrollTo],
  );

  // Selecting a tab that is only half on screen (or off it entirely - the grid
  // can change the selection without the strip being touched) brings it fully
  // into view, so the active tab is always readable.
  useEffect(() => {
    if (!resolvedKey) return;
    const box = tabBoxRef.current[resolvedKey];
    const viewport = viewportWidthRef.current;
    if (!box || viewport <= 0) return;

    const left = scrollXRef.current;
    const right = left + viewport;
    if (box.x < left) {
      scrollTo(box.x);
    } else if (box.x + box.width > right) {
      scrollTo(box.x + box.width - viewport);
    }
  }, [resolvedKey, scrollTo]);

  // While search is open the strip is not what the customer is looking at -
  // the results are - but it stays live, because tapping a category is the
  // fastest way back out of a search.
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withTiming(dimmed ? 1 : 0, { duration: kioskMotion.base });
  }, [dimmed, dim]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - dim.value * 0.58 }));

  const fadeWidth = kioskPx(FADE_WIDTH, s);
  const tabHeight = kioskPx(TAB_HEIGHT, s);
  const arrow = kioskStripArrowSize(
    tabHeight,
    isKioskHandheld(windowWidth, windowHeight),
  );
  const chevronInset = kioskPx(4, s);

  return (
    <Animated.View style={[{ position: "relative" }, dimStyle]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          flexDirection: "row",
          alignItems: "stretch",
          paddingHorizontal: kioskPx(16, s),
          paddingTop: kioskPx(STRIP_PADDING_V, s),
          paddingBottom: kioskPx(
            Math.max(0, STRIP_PADDING_V - KIOSK_GRID_INSET),
            s,
          ),
        }}
        onScroll={(event) => {
          const x = event.nativeEvent.contentOffset.x;
          scrollXRef.current = x;
          updateScrollAffordance(x);
        }}
        onLayout={(event) => {
          viewportWidthRef.current = event.nativeEvent.layout.width;
          updateScrollAffordance(scrollXRef.current);
        }}
        onContentSizeChange={(width) => {
          contentWidthRef.current = width;
          updateScrollAffordance(scrollXRef.current);
        }}
        scrollEventThrottle={16}
      >
        {pills.map(({ key, name }) => {
          const selected = key === resolvedKey;
          return (
            <KioskPressable
              key={key}
              onPress={() => onSelect(key)}
              pressedScale={0.97}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                tabBoxRef.current[key] = { x, width };
              }}
              style={{
                maxWidth: kioskPx(TAB_MAX_WIDTH, s),
                marginRight: kioskPx(TAB_GAP, s),
                paddingHorizontal: kioskPx(TAB_PADDING_H, s),
                paddingVertical: kioskPx(TAB_PADDING_V, s),
                justifyContent: "center",
                borderRadius: kioskPx(kioskRadius.md, s),
                backgroundColor: selected ? t.primary : "transparent",
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: kioskPx(TAB_FONT_SIZE, s),
                  lineHeight: kioskPx(TAB_LINE_HEIGHT, s),
                  letterSpacing: kioskTracking(TAB_FONT_SIZE),
                  color: selected ? t.onPrimary : t.textMuted,
                  ...kioskFont(t, selected ? "bold" : "regular"),
                }}
              >
                {name}
              </Text>
            </KioskPressable>
          );
        })}
      </ScrollView>

      {canScrollLeft ? (
        <EdgeAffordance
          config={config}
          side="left"
          fadeWidth={fadeWidth}
          bandHeight={tabHeight}
          buttonSize={arrow.button}
          chevronSize={arrow.icon}
          inset={chevronInset}
          top={kioskPx(STRIP_PADDING_V, s)}
          onPress={() => nudge(-1)}
        />
      ) : null}

      {canScrollRight ? (
        <EdgeAffordance
          config={config}
          side="right"
          fadeWidth={fadeWidth}
          bandHeight={tabHeight}
          buttonSize={arrow.button}
          chevronSize={arrow.icon}
          inset={chevronInset}
          top={kioskPx(STRIP_PADDING_V, s)}
          onPress={() => nudge(1)}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * The fade plus its chevron, as one unit - they describe the same thing (there
 * is more strip this way) and must appear and disappear together.
 *
 * The chevron itself is unchanged from the build that shipped: a raised circle
 * in the page colour, inset just inside the edge, sitting on the fade. On a
 * phone the circle is smaller than a tab (kioskStripArrowSize); it is centred
 * on the tabs, and its hit area is padded back out to the full tab height.
 */
function EdgeAffordance({
  config,
  side,
  fadeWidth,
  bandHeight,
  buttonSize,
  chevronSize,
  inset,
  top,
  onPress,
}: {
  config: KioskConfig;
  side: "left" | "right";
  fadeWidth: number;
  /** Height of the tabs - the fade covers exactly their band. */
  bandHeight: number;
  buttonSize: number;
  chevronSize: number;
  /** Gap between the chevron and the strip's edge. */
  inset: number;
  /**
   * Top edge of the tab band.
   *
   * The chevron is centred within the band rather than the strip. Centring on
   * the strip would put it half a padding too high, because the strip pads its
   * top and leaves its bottom to the grid below (see STRIP_PADDING_V).
   */
  top: number;
  onPress: () => void;
}) {
  const Chevron = side === "left" ? ChevronLeft : ChevronRight;
  const transparent = `${config.backgroundColor}00`;
  // Explicit both-edge offsets rather than a computed key, so the style object
  // still types as a ViewStyle.
  const edge = side === "left" ? { left: 0 } : { right: 0 };
  const buttonEdge = side === "left" ? { left: inset } : { right: inset };
  // Zero on a panel, where the circle is a full tab tall.
  const slop = Math.max(0, (bandHeight - buttonSize) / 2);

  return (
    <>
      <LinearGradient
        colors={
          side === "left"
            ? [config.backgroundColor, transparent]
            : [transparent, config.backgroundColor]
        }
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          position: "absolute",
          ...edge,
          top,
          height: bandHeight,
          width: fadeWidth,
          zIndex: 4,
        }}
        pointerEvents="none"
      />

      <Pressable
        onPress={onPress}
        hitSlop={slop}
        accessibilityRole="button"
        accessibilityLabel={
          side === "left"
            ? kioskStrings.scrollCategoriesLeft
            : kioskStrings.scrollCategoriesRight
        }
        style={{
          position: "absolute",
          ...buttonEdge,
          top: top + slop,
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: config.backgroundColor,
          zIndex: 5,
          shadowColor: "#000000",
          shadowOpacity: 0.28,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <Chevron size={chevronSize} color={config.textColor} />
      </Pressable>
    </>
  );
}
