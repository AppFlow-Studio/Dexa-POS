import { shouldUseRowLayout } from "@/components/kiosk/shared/kioskCardMetrics";
import KioskMenuItem from "@/components/kiosk/shared/KioskMenuItem";
import KioskMenuItemRow from "@/components/kiosk/shared/KioskMenuItemRow";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { useCallback, useState } from "react";
import { FlatList, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

/** Cap on the entrance stagger so a long category doesn't trickle in forever. */
const MAX_STAGGER_INDEX = 11;
const STAGGER_MS = 28;

/**
 * The kiosk menu item grid, shared by every template.
 *
 * Owns two things the templates used to each re-implement:
 *
 *  1. **Responsive sizing.** The grid measures its own width and derives the
 *     exact card width from it — `(width − 2·padding − gap·(cols−1)) / cols` —
 *     then hands that down so each card can size its own type and spacing
 *     (see kioskCardMetrics). Switching between 2, 3 and 4 columns stays clean
 *     at any screen size because nothing is hardcoded per column count.
 *  2. **Layout choice.** When a cell comes out much wider than its height
 *     budget — the 2-column landscape case — a top-image card can only fit by
 *     letterboxing its photo, so the grid switches to the row card (square
 *     image left, copy right) instead. Same data, same cell, better shape.
 *  3. **Entrance animation.** Cards fade/slide up in a short staggered
 *     cascade. `resetKey` (the active category) is folded into the list key so
 *     the cascade replays on every category switch and the grid scrolls back
 *     to the top — both of which are the desired behaviour anyway.
 *
 * `flex: 1 / numColumns` on each cell is deliberate: with flex-basis 0 the
 * grow factors sum to exactly 1 on a full row, so cells fill it precisely, and
 * a partially-filled last row leaves its cells at the correct width instead of
 * stretching them across the gap.
 */
export function KioskItemGrid({
  config,
  items,
  numColumns,
  resetKey,
  onSelectItem,
}: {
  config: KioskConfig;
  items: MenuItemType[];
  numColumns: number;
  /** Changes when the active category changes — replays the entrance cascade. */
  resetKey?: string | null;
  onSelectItem: (item: MenuItemType) => void;
}) {
  const s = useKioskUiScale();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [grid, setGrid] = useState({ width: 0, height: 0 });

  const padding = kioskPx(16, s);
  const gap = kioskPx(14, s);

  // Fall back to the window for the very first frame, before onLayout has
  // reported. Only ever affects one frame, and keeps the initial paint from
  // rendering at a nonsense size.
  const measuredWidth = grid.width || windowWidth;
  const measuredHeight = grid.height || windowHeight;

  const cardWidth = Math.max(
    96,
    (measuredWidth - padding * 2 - gap * (numColumns - 1)) / numColumns,
  );
  // Budget just over half the visible grid per card, so roughly two rows are
  // always in view and the customer can see the grid continues below.
  const maxCardHeight = Math.max(
    160,
    (measuredHeight - padding * 2 - gap) * 0.52,
  );
  const useRowLayout = shouldUseRowLayout(cardWidth, maxCardHeight);

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      setGrid((prev) =>
        Math.abs(prev.width - width) > 0.5 ||
        Math.abs(prev.height - height) > 0.5
          ? { width, height }
          : prev,
      );
    },
    [],
  );

  return (
    <View className="flex-1" onLayout={handleLayout}>
      <FlatList
        key={`${numColumns}:${resetKey ?? ""}`}
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={numColumns}
        columnWrapperStyle={{ gap, marginBottom: gap }}
        contentContainerStyle={{
          padding,
          flexGrow: items.length === 0 ? 1 : undefined,
        }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Animated.View
            style={{ flex: 1 / numColumns }}
            entering={FadeInDown.delay(
              Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS,
            )
              .duration(260)
              .springify()
              .damping(18)}
          >
            {useRowLayout ? (
              <KioskMenuItemRow
                item={item}
                config={config}
                cardWidth={cardWidth}
                maxCardHeight={maxCardHeight}
                onPress={onSelectItem}
              />
            ) : (
              <KioskMenuItem
                item={item}
                config={config}
                cardWidth={cardWidth}
                maxCardHeight={maxCardHeight}
                onPress={onSelectItem}
              />
            )}
          </Animated.View>
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text
              style={{
                fontSize: kioskPx(20, s),
                color: `${config.textColor}99`,
              }}
            >
              No items in this category.
            </Text>
          </View>
        }
      />
    </View>
  );
}
