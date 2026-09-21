import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
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
const PILL_PADDING_V = 12;
const PILL_BORDER_WIDTH = 1;
const PILL_FONT_SIZE = 18;
const PILL_LINE_HEIGHT = PILL_FONT_SIZE * 1.2;
/** Long merchant category names truncate rather than push the strip wide. */
const PILL_MAX_WIDTH = 240;
// Matches the pill's own full box height (2x vertical padding + text line
// height + 2x border) so the nudge button is centered against the same
// height the pill row actually renders at — the row's height is set by its
// tallest pill, borders included.
const BUTTON_SIZE =
  PILL_PADDING_V * 2 + PILL_LINE_HEIGHT + PILL_BORDER_WIDTH * 2;
/** A nudge moves most of a viewport, so repeated taps walk the strip. */
const NUDGE_FRACTION = 0.8;
/** Scroll-position tolerance, in px. */
const EPSILON = 2;

/**
 * Horizontal scrollable category selector — one pill per unique category
 * name. Unlike KioskCategoryRail (which groups by menu, so same-named
 * categories in different menus each get their own visible section), this
 * bar has no per-menu grouping — callers are expected to have already
 * deduped/merged same-named categories before building `pills`, otherwise a
 * category shared by two menus would render as two identical, unexplained
 * pills. Used by templates that lay their menu out as a single scrollable
 * list rather than a sidebar + grid split.
 *
 * Overflow affordance: a fade at the edge with a chevron sitting on it, shown
 * only when there is actually something that way. Visibility is derived from
 * the scroll offset, the content width and the viewport — never from how many
 * pills there are, because label widths vary and a count cannot tell you
 * whether six categories fit or five do.
 *
 * The chevron itself is unchanged from the build that shipped — a raised
 * circle in the page colour, sitting just inside the edge on top of the fade.
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
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  /** Measured box of each pill, for scrolling a partly-hidden one into view. */
  const pillBoxRef = useRef<Record<string, { x: number; width: number }>>({});
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
      // `onScroll` lands the real offset; this keeps the chevrons honest at the
      // ends of the strip even if the animation is interrupted.
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

  // Selecting a pill that is only half on screen (or off it entirely — the
  // grid can change the selection without the strip being touched) brings it
  // fully into view, so the active pill is always readable.
  useEffect(() => {
    if (!resolvedKey) return;
    const box = pillBoxRef.current[resolvedKey];
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

  const fadeWidth = kioskPx(FADE_WIDTH, s);
  const buttonSize = kioskPx(BUTTON_SIZE, s);
  const chevronSize = buttonSize * 0.5;
  const chevronInset = kioskPx(4, s);

  // While search is open the strip is not what the customer is looking at —
  // the results are — but it stays live, because tapping a category is the
  // fastest way back out of a search. Dimmed rather than hidden: a strip that
  // vanished would take the way out with it, and one left at full strength
  // reads as though it still drives what is on screen.
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withTiming(dimmed ? 1 : 0, { duration: 180 });
  }, [dimmed, dim]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - dim.value * 0.58 }));

  return (
    <Animated.View style={[{ position: "relative" }, dimStyle]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: kioskPx(16, s),
          paddingVertical: kioskPx(10, s),
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
              pressedScale={0.94}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                pillBoxRef.current[key] = { x, width };
              }}
              style={{
                marginRight: kioskPx(10, s),
                maxWidth: kioskPx(PILL_MAX_WIDTH, s),
                paddingHorizontal: kioskPx(24, s),
                paddingVertical: kioskPx(PILL_PADDING_V, s),
                borderRadius: 999,
                backgroundColor: selected
                  ? config.primaryColor
                  : `${config.primaryColor}0F`,
                borderWidth: PILL_BORDER_WIDTH,
                borderColor: selected
                  ? config.primaryColor
                  : `${config.textColor}14`,
              }}
            >
              {/* Active state is fill + text contrast only — no icon, because
                  a merchant category has no icon to draw from. */}
              <Text
                numberOfLines={1}
                style={{
                  fontSize: kioskPx(PILL_FONT_SIZE, s),
                  lineHeight: kioskPx(PILL_LINE_HEIGHT, s),
                  fontWeight: selected ? "700" : "500",
                  color: selected ? "#FFFFFF" : config.textColor,
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
          buttonSize={buttonSize}
          chevronSize={chevronSize}
          inset={chevronInset}
          onPress={() => nudge(-1)}
        />
      ) : null}

      {canScrollRight ? (
        <EdgeAffordance
          config={config}
          side="right"
          fadeWidth={fadeWidth}
          buttonSize={buttonSize}
          chevronSize={chevronSize}
          inset={chevronInset}
          onPress={() => nudge(1)}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * The fade plus its chevron, as one unit — they describe the same thing (there
 * is more strip this way) and must appear and disappear together.
 */
function EdgeAffordance({
  config,
  side,
  fadeWidth,
  buttonSize,
  chevronSize,
  inset,
  onPress,
}: {
  config: KioskConfig;
  side: "left" | "right";
  fadeWidth: number;
  buttonSize: number;
  chevronSize: number;
  /** Gap between the chevron and the strip's edge. */
  inset: number;
  onPress: () => void;
}) {
  const Chevron = side === "left" ? ChevronLeft : ChevronRight;
  const transparent = `${config.backgroundColor}00`;
  // Explicit both-edge offsets rather than a computed key, so the style object
  // still types as a ViewStyle.
  const edge = side === "left" ? { left: 0 } : { right: 0 };
  const buttonEdge = side === "left" ? { left: inset } : { right: inset };

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
          top: 0,
          bottom: 0,
          width: fadeWidth,
          zIndex: 4,
        }}
        pointerEvents="none"
      />

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          side === "left"
            ? kioskStrings.scrollCategoriesLeft
            : kioskStrings.scrollCategoriesRight
        }
        style={{
          position: "absolute",
          ...buttonEdge,
          top: "50%",
          marginTop: -buttonSize / 2,
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
