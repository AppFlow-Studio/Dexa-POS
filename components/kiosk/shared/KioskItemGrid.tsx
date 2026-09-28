import {
  kioskCardMetrics,
  kioskFeatureRowMetrics,
  kioskRowMetrics,
  shouldUseRowLayout,
} from "@/components/kiosk/shared/kioskCardMetrics";
import KioskMenuItem from "@/components/kiosk/shared/KioskMenuItem";
import KioskMenuItemFeatureRow from "@/components/kiosk/shared/KioskMenuItemFeatureRow";
import KioskMenuItemRow from "@/components/kiosk/shared/KioskMenuItemRow";
import {
  KIOSK_GRID_INSET,
  kioskFitColumns,
} from "@/components/kiosk/shared/kioskLayout";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { FlashList } from "@shopify/flash-list";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * The kiosk menu item grid, shared by every template.
 *
 * Owns three things the templates used to each re-implement:
 *
 *  1. **Responsive sizing.** The grid measures its own width and derives the
 *     exact card width from it — `(width − 2·padding − gap·(cols−1)) / cols` —
 *     then hands that down so each card can size its own type and spacing
 *     (see kioskCardMetrics). Switching between 2, 3 and 4 columns stays clean
 *     at any screen size because nothing is hardcoded per column count. Cards
 *     render only once that measurement exists, never at an estimate.
 *  2. **Layout choice.** Three card shapes, picked from the cell's dimensions:
 *     at one column the feature row (copy left, photo bleeding off the right
 *     edge, sized to its own height rather than the whole grid); when a cell
 *     comes out much wider than its height budget — the 2-column landscape
 *     case — the row card (square image left, copy right), because a top-image
 *     card there could only fit by letterboxing its photo; otherwise the
 *     standard top-image card. Same data, same cell, better shape.
 *  3. **Entrance animation.** The grid fades and lifts on every category
 *     switch, replayed from `resetKey`.
 *
 * ## Why FlashList, and what it costs
 *
 * FlashList recycles cells instead of mounting one view tree per item, which is
 * what keeps a long category scrolling on low-power kiosk hardware. Three
 * things had to change to adopt it, and none of them should be undone casually:
 *
 * - **Exact item heights, not estimates.** FlashList sizes cells from
 *   `overrideItemLayout`. Every card shape now reports a real height
 *   (`cardHeight` / `rowHeight` / the feature row's own `height`), summed from
 *   blocks that were already fixed, so the list never measures a cell and
 *   corrects itself afterwards. That correction is what causes FlashList's
 *   visible scroll-jump, and on a menu it would land under the customer's
 *   finger.
 * - **No `columnWrapperStyle`** — FlashList has none. Gutters come from
 *   half-gap padding on each cell against a content container inset by the same
 *   half gap, which reproduces the old spacing exactly (see `cardWidth` below).
 * - **No per-cell entrance animation.** Reanimated `entering` animations and
 *   cell recycling fight: a recycled cell replays the entrance, so cards flash
 *   as the customer scrolls. The staggered per-card cascade is therefore now a
 *   single animation on the list container — same "something changed" signal on
 *   category switch, one animated node instead of N, and nothing to misfire on
 *   a recycled view.
 *
 * The list is no longer keyed on the active category either: remounting it per
 * switch would throw away the recycle pool that FlashList exists to build. It
 * is keyed on its column count alone (a manager setting, or the panel's own
 * width — both change rarely), and the category switch scrolls back to the top
 * through the ref instead.
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
  /** Changes when the active category changes — replays the entrance and scrolls to top. */
  resetKey?: string | null;
  onSelectItem: (item: MenuItemType) => void;
}) {
  const s = useKioskUiScale();
  const [grid, setGrid] = useState({ width: 0, height: 0 });
  const listRef = useRef<FlashList<MenuItemType>>(null);

  const padding = kioskPx(KIOSK_GRID_INSET, s);
  const gap = kioskPx(14, s);

  // Nothing renders until the grid has measured itself. The window used to
  // stand in for the first frame, but the window is not this pane — beside a
  // category rail it over-estimates the width by a third — so every card
  // painted once at the wrong size and then jumped. On the top-image cards that
  // was a barely-visible reflow; on the feature row the photo is positioned
  // from that width and its gradient stops are derived from it, so the photo
  // visibly slid and the blend re-mixed as the row settled. One blank frame is
  // cheaper, and the entrance covers it.
  const measured = grid.width > 0;

  // The requested count is a ceiling: on a pane too narrow to hold it (a phone,
  // or a panel with a wide rail) the grid steps down rather than rendering
  // cards narrower than they can lay out. See kioskFitColumns.
  const columns = measured
    ? kioskFitColumns(numColumns, grid.width, padding, gap)
    : numColumns;

  // One column carries no side padding of its own, so the content container
  // holds the full outer margin; multi-column cells each carry half a gutter
  // and the container gives that half back, which reproduces the old
  // `columnWrapperStyle` spacing precisely.
  const isFeatureRow = columns === 1;
  const cellPadH = isFeatureRow ? 0 : gap / 2;
  const contentPadH = padding - cellPadH;

  const cardWidth = Math.max(
    96,
    (grid.width - contentPadH * 2) / columns - cellPadH * 2,
  );
  /** Full column width — the cell's own box, gutter padding included. */
  const cellWidth = cardWidth + cellPadH * 2;
  // A whole-card budget, not a hint: two cells — each a card plus its bottom
  // gutter — have to fit the visible grid, so the second row lands fully above
  // the fold instead of being clipped at its description. The card metrics
  // treat this as a hard ceiling and give the photo whatever the copy leaves.
  const maxCardHeight = Math.max(160, (grid.height - padding * 2) / 2 - gap);
  const useRowLayout =
    !isFeatureRow && shouldUseRowLayout(cardWidth, maxCardHeight);

  // The exact height of one cell, gutter included — FlashList's whole layout
  // hangs off this, so it is computed from the same metrics the card renders
  // from rather than estimated.
  const cellHeight = useMemo(() => {
    if (!measured) return 0;
    const cardHeight = isFeatureRow
      ? kioskFeatureRowMetrics(cardWidth, maxCardHeight).height
      : useRowLayout
        ? kioskRowMetrics(cardWidth, maxCardHeight).rowHeight
        : kioskCardMetrics(cardWidth, maxCardHeight).cardHeight;
    return cardHeight + gap;
  }, [measured, isFeatureRow, useRowLayout, cardWidth, maxCardHeight, gap]);

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

  // Category switch: back to the top, and replay the entrance. Both used to
  // fall out of remounting the list on `resetKey`; doing them explicitly is
  // what lets the recycle pool survive the switch.
  const enter = useSharedValue(1);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    enter.value = 0;
    enter.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.quad),
    });
  }, [resetKey, enter]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 12 }],
  }));

  const renderItem = useCallback(
    ({ item }: { item: MenuItemType }) => (
      // Both dimensions are explicit, and neither is optional. FlashList
      // renders every cell with `forceNonDeterministicRendering`, so the
      // container RecyclerListView gives us is positioned but **unsized** — no
      // width, no height — and for a multi-column list it is a `flexDirection:
      // "row"` box. A child with no width therefore shrinks to its content, and
      // a `flex: 1` card in an unsized parent resolves to zero height. The cell
      // must size itself. `overrideItemLayout` only tells FlashList how far to
      // scroll; it does not size this view.
      <View
        style={{
          width: cellWidth,
          height: cellHeight,
          paddingHorizontal: cellPadH,
          paddingBottom: gap,
        }}
      >
        {isFeatureRow ? (
          <KioskMenuItemFeatureRow
            item={item}
            config={config}
            cardWidth={cardWidth}
            maxCardHeight={maxCardHeight}
            onPress={onSelectItem}
          />
        ) : useRowLayout ? (
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
      </View>
    ),
    [
      cellWidth,
      cellHeight,
      cellPadH,
      gap,
      isFeatureRow,
      useRowLayout,
      config,
      cardWidth,
      maxCardHeight,
      onSelectItem,
    ],
  );

  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }) => {
      layout.size = cellHeight;
    },
    [cellHeight],
  );

  return (
    <View className="flex-1" onLayout={handleLayout}>
      {measured ? (
        <Animated.View style={[{ flex: 1 }, enterStyle]}>
          {items.length === 0 ? (
            // Rendered outside the list: centring it needs `flexGrow` on the
            // content container, which FlashList's ContentStyle does not accept.
            <View className="flex-1 items-center justify-center">
              <Text
                style={{
                  fontSize: kioskPx(20, s),
                  color: `${config.textColor}99`,
                }}
              >
                No items in this category.
              </Text>
            </View>
          ) : (
            <FlashList
              // Column count changes the whole layout basis, and it moves only
              // with a manager setting or a rotation — never under the
              // customer's finger — so a clean remount there is cheaper than
              // teaching the list to re-span.
              key={columns}
              ref={listRef}
              data={items}
              keyExtractor={(i) => i.id}
              numColumns={columns}
              renderItem={renderItem}
              estimatedItemSize={cellHeight}
              overrideItemLayout={overrideItemLayout}
              estimatedListSize={{ width: grid.width, height: grid.height }}
              // Padding only — FlashList's ContentStyle accepts nothing else.
              contentContainerStyle={{
                paddingTop: padding,
                paddingBottom: padding,
                paddingHorizontal: contentPadH,
              }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}
