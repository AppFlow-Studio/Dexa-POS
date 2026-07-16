import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

export interface CategoryPill {
  key: string;
  name: string;
}

const NUDGE_PX = 120;
const FADE_WIDTH = 40;
const PILL_PADDING_V = 14;
const PILL_BORDER_WIDTH = 1;
const PILL_FONT_SIZE = 16;
const PILL_LINE_HEIGHT = PILL_FONT_SIZE * 1.2;
// Matches the pill's own full box height (2x vertical padding + text line
// height + 2x border) so the nudge button is centered against the same
// height the pill row actually renders at — the row's height is set by its
// tallest pill, borders included.
const BUTTON_SIZE = PILL_PADDING_V * 2 + PILL_LINE_HEIGHT + PILL_BORDER_WIDTH * 2;

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
 * Scroll affordance (fade edges + chevron nudge buttons) mirrors the POS's
 * MenuControls.tsx category row — same ref-tracked offset/viewport/content
 * width, same 2px scroll-position tolerance, same fixed-120px nudge — ported
 * to kiosk styling (config colors instead of the POS theme, kioskPx scale).
 */
export function KioskCategoryPillBar({
  config,
  pills,
  resolvedKey,
  onSelect,
}: {
  config: KioskConfig;
  pills: CategoryPill[];
  resolvedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const s = useKioskUiScale();
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollAffordance = useCallback((offsetX: number) => {
    const maxOffset = Math.max(0, contentWidthRef.current - viewportWidthRef.current);
    setCanScrollLeft(offsetX > 2);
    setCanScrollRight(offsetX < maxOffset - 2);
  }, []);

  const fadeWidth = kioskPx(FADE_WIDTH, s);
  const nudge = kioskPx(NUDGE_PX, s);
  const buttonSize = kioskPx(BUTTON_SIZE, s);
  const chevronSize = buttonSize * 0.5;

  return (
    <View style={{ position: "relative" }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: kioskPx(16, s),
          paddingVertical: kioskPx(12, s),
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
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              style={{
                marginRight: kioskPx(10, s),
                paddingHorizontal: kioskPx(24, s),
                paddingVertical: kioskPx(14, s),
                borderRadius: 999,
                backgroundColor: selected
                  ? config.primaryColor
                  : `${config.primaryColor}0F`,
                borderWidth: 1,
                borderColor: selected
                  ? config.primaryColor
                  : `${config.textColor}14`,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: kioskPx(16, s),
                  fontWeight: selected ? "700" : "500",
                  color: selected ? "#FFFFFF" : config.textColor,
                }}
              >
                {name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {canScrollLeft ? (
        <LinearGradient
          colors={[config.backgroundColor, `${config.backgroundColor}00`]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: fadeWidth,
            zIndex: 4,
          }}
          pointerEvents="none"
        />
      ) : null}

      {canScrollRight ? (
        <LinearGradient
          colors={[`${config.backgroundColor}00`, config.backgroundColor]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: fadeWidth,
            zIndex: 4,
          }}
          pointerEvents="none"
        />
      ) : null}

      {canScrollLeft ? (
        <Pressable
          onPress={() => {
            const nextX = Math.max(0, scrollXRef.current - nudge);
            scrollRef.current?.scrollTo({ x: nextX, animated: true });
          }}
          style={{
            position: "absolute",
            left: kioskPx(4, s),
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
          <ChevronLeft size={chevronSize} color={config.textColor} />
        </Pressable>
      ) : null}

      {canScrollRight ? (
        <Pressable
          onPress={() => {
            const nextX = scrollXRef.current + nudge;
            scrollRef.current?.scrollTo({ x: nextX, animated: true });
          }}
          style={{
            position: "absolute",
            right: kioskPx(4, s),
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
          <ChevronRight size={chevronSize} color={config.textColor} />
        </Pressable>
      ) : null}
    </View>
  );
}
