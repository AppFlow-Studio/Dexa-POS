import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  KIOSK_SEARCH_RESULT_LIMIT,
  searchKioskMenu,
  type KioskSearchEntry,
} from "@/components/kiosk/shared/kioskMenuSearch";
import {
  kioskFont,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import {
  KIOSK_RESULT_ROW_HEIGHT,
  KioskSearchResultRow,
} from "@/components/kiosk/shared/KioskSearchResultRow";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { kioskCardSurface } from "@/components/kiosk/shared/kioskSurface";
import { useKioskSearchEntries } from "@/components/kiosk/shared/useKioskMenuSearch";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { FlashList } from "@shopify/flash-list";
import { Search } from "lucide-react-native";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

/** Readable measure for the result column on a very wide panel. */
const MAX_COLUMN = 880;
/** Clears the floating cart button, so the last result is never trapped under it. */
const LIST_BOTTOM_PAD = 130;

/**
 * Results for the menu screen's inline search, rendered as a layer over the
 * browsing area while the field is open.
 *
 * It covers the grid rather than replacing it, and that is what makes closing
 * search free: the grid (and the rail, and their scroll offsets, and the
 * selected category) are never unmounted, so the customer lands back exactly
 * where they left. It also means the software keyboard's `adjustResize` shrink
 * re-measures a grid nobody can see — which is what kept a live field off this
 * screen before.
 *
 * Mounted only while search is open, so the index (see useKioskSearchEntries)
 * costs nothing until it is wanted. Per-keystroke cost is one pass over that
 * prebuilt index, run through `useDeferredValue` so the typed text always
 * paints on the frame it was typed and the ranking yields to it.
 */
export function KioskSearchResults({
  config,
  query,
  onSelectItem,
  onClear,
}: {
  config: KioskConfig;
  query: string;
  onSelectItem: (item: MenuItemType) => void;
  onClear: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const deferredQuery = useDeferredValue(query);
  const entries = useKioskSearchEntries();
  const results = useMemo(
    () => searchKioskMenu(entries, deferredQuery),
    [entries, deferredQuery],
  );

  const surface = useMemo(
    () => kioskCardSurface(config.backgroundColor),
    [config.backgroundColor],
  );

  // FlashList positions its cells but does not size them
  // (`forceNonDeterministicRendering`), so a row with no width shrinks to its
  // content instead of filling the column. The list's own width is measured
  // and handed down.
  const [listWidth, setListWidth] = useState(0);
  const listPadH = kioskPx(16, s);
  const rowWidth = Math.max(0, listWidth - listPadH * 2);

  const handleListLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      const { width } = e.nativeEvent.layout;
      setListWidth((prev) => (Math.abs(prev - width) > 0.5 ? width : prev));
    },
    [],
  );

  const renderItem = useCallback(
    ({ item: entry }: { item: KioskSearchEntry }) => (
      <KioskSearchResultRow
        entry={entry}
        config={config}
        surface={surface}
        width={rowWidth}
        onPress={onSelectItem}
      />
    ),
    [config, surface, rowWidth, onSelectItem],
  );

  // Rows are a fixed height, so FlashList gets a real size rather than an
  // estimate it would have to correct after measuring — no scroll-jump under a
  // customer's finger, and no per-cell measurement pass at all.
  const rowHeight = kioskPx(KIOSK_RESULT_ROW_HEIGHT, s);
  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }) => {
      layout.size = rowHeight;
    },
    [rowHeight],
  );

  const trimmed = query.trim();
  const noMatches = trimmed.length > 0 && results.length === 0;
  const resultCaption =
    results.length >= KIOSK_SEARCH_RESULT_LIMIT
      ? `Top ${KIOSK_SEARCH_RESULT_LIMIT} matches`
      : `${results.length} ${results.length === 1 ? "result" : "results"}`;

  return (
    // Fades in over the grid and back out on close, so the layer reads as
    // something that arrived on top of the menu rather than the menu itself
    // having changed into a list.
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(150)}
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: config.backgroundColor, zIndex: 20 },
      ]}
    >
      {/* Tapping the empty chrome puts the keyboard away and gives the results
          the whole panel; the query and results stay put. Controls and rows sit
          deeper in the tree and win the responder, so this only catches taps
          that would otherwise do nothing. */}
      <Pressable
        onPress={Keyboard.dismiss}
        accessible={false}
        style={{ flex: 1 }}
      >
        {results.length > 0 ? (
          <Text
            style={{
              width: "100%",
              maxWidth: kioskPx(MAX_COLUMN, s),
              alignSelf: "center",
              paddingHorizontal: kioskPx(16, s),
              paddingTop: kioskPx(12, s),
              paddingBottom: kioskPx(8, s),
              fontSize: kioskPx(13, s),
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: t.textMuted,
              ...kioskFont(t, "bold"),
            }}
          >
            {resultCaption}
          </Text>
        ) : null}

        {/* The readable-width cap lives on this wrapper, not on the list's
            content container: FlashList's ContentStyle accepts padding and
            background colour only. */}
        <View
          onLayout={handleListLayout}
          style={{
            flex: 1,
            width: "100%",
            maxWidth: kioskPx(MAX_COLUMN, s),
            alignSelf: "center",
          }}
        >
          {results.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: kioskPx(32, s),
                gap: kioskPx(10, s),
              }}
            >
              <Search
                size={kioskPx(44, s)}
                color={t.textFaint}
                strokeWidth={1.5}
              />
              <Text
                style={{
                  fontSize: kioskPx(22, s),
                  letterSpacing: kioskTracking(22),
                  color: t.text,
                  textAlign: "center",
                  ...kioskFont(t, "bold"),
                }}
              >
                {noMatches
                  ? kioskStrings.searchEmpty(trimmed)
                  : kioskStrings.searchPrompt}
              </Text>
              <Text
                style={{
                  fontSize: kioskPx(16, s),
                  color: t.textMuted,
                  textAlign: "center",
                  ...kioskFont(t, "regular"),
                }}
              >
                {noMatches
                  ? kioskStrings.searchEmptyHint
                  : kioskStrings.searchPromptHint}
              </Text>

              {noMatches ? (
                <KioskPressable
                  onPress={onClear}
                  pressedScale={0.95}
                  accessibilityRole="button"
                  style={{
                    marginTop: kioskPx(8, s),
                    height: kioskPx(56, s),
                    paddingHorizontal: kioskPx(30, s),
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: kioskPx(kioskRadius.md, s),
                    backgroundColor: t.primary,
                  }}
                >
                  <Text
                    style={{
                      fontSize: kioskPx(18, s),
                      color: t.onPrimary,
                      ...kioskFont(t, "bold"),
                    }}
                  >
                    {kioskStrings.searchClear}
                  </Text>
                </KioskPressable>
              ) : null}
            </View>
          ) : rowWidth > 0 ? (
            <FlashList
              data={results}
              keyExtractor={(entry) => entry.item.id}
              renderItem={renderItem}
              estimatedItemSize={rowHeight}
              overrideItemLayout={overrideItemLayout}
              contentContainerStyle={{
                paddingHorizontal: listPadH,
                paddingBottom: kioskPx(LIST_BOTTOM_PAD, s),
              }}
              showsVerticalScrollIndicator={false}
              // Without this the first tap on a result is swallowed dismissing
              // the keyboard, and the customer has to tap the same row twice.
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
