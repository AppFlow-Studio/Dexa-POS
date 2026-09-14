import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  KIOSK_SEARCH_RESULT_LIMIT,
  searchKioskMenu,
  type KioskSearchEntry,
} from "@/components/kiosk/shared/kioskMenuSearch";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { kioskCardSurface } from "@/components/kiosk/shared/kioskSurface";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { useKioskSearchEntries } from "@/components/kiosk/shared/useKioskMenuSearch";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import { useKioskItemQuantity } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { FlashList } from "@shopify/flash-list";
import {
  ChevronLeft,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import React, {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/**
 * Full-panel menu search, shared by every kiosk template.
 *
 * Rendered as an absolute fill *inside the template's menu view* rather than a
 * `Modal`, and that is load bearing twice over. A Modal's touches don't bubble
 * to the template body, so `onTouchStart={registerActivity}` would stop firing
 * and the idle timer could reset the kiosk out from under a customer who is
 * actively tapping through results. Staying in the tree also keeps the header
 * and the floating cart button where they were, so search reads as a layer over
 * the menu rather than a place the customer has been taken to.
 *
 * The layout is one column at every size, which is what makes it correct in
 * both orientations and all three templates without a single branch: the input
 * pins to the top (the software keyboard can never cover it, however tall it
 * is), the results scroll in the space that's left, and the column is capped at
 * a readable width and centred so a 55" landscape panel doesn't stretch rows
 * into a tabloid page. Everything sizes off `kioskPx`, so it tracks the same UI
 * scale as the rest of the kiosk.
 *
 * Per-keystroke cost is one pass over the prebuilt index (see
 * useKioskSearchEntries), run through `useDeferredValue` so the typed text
 * always paints on the frame it was typed and the ranking yields to it.
 *
 * Results render in a FlashList, same as the menu grid. Rows are a fixed
 * height, so `overrideItemLayout` hands it a real size and no cell is ever
 * measured then corrected.
 */

/** Thumbnail edge, and the paddings that together fix the row height. */
const THUMB = 76;
const ROW_PAD_V = 12;
const ROW_GAP = 10;
const ROW_HEIGHT = THUMB + ROW_PAD_V * 2 + ROW_GAP;
/** Readable measure for the result column on a very wide panel. */
const MAX_COLUMN = 880;
/** Clears the floating cart button so the last result is never trapped under it. */
const LIST_BOTTOM_PAD = 130;

export function KioskSearchOverlay({
  config,
  onClose,
  onSelectItem,
}: {
  config: KioskConfig;
  onClose: () => void;
  onSelectItem: (item: MenuItemType) => void;
}) {
  const s = useKioskUiScale();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");

  // The input is controlled by `query` so typing is never dropped or delayed;
  // ranking reads `deferredQuery`, which React is free to leave a frame behind
  // when the JS thread is busy. On low-power kiosk hardware that is the
  // difference between a responsive field and one that stutters mid-word.
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
  const muted = `${config.textColor}99`;
  const faint = `${config.textColor}12`;

  const clear = useCallback(() => {
    setQuery("");
    // Keep the keyboard up — clearing is a correction mid-search, not an exit.
    inputRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (item: MenuItemType) => onSelectItem(item),
    [onSelectItem],
  );

  // FlashList positions its cells but does not size them
  // (`forceNonDeterministicRendering`), so a row with no width shrinks to its
  // content instead of filling the column. The list's own width is measured and
  // handed down.
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
        onPress={handleSelect}
      />
    ),
    [config, surface, rowWidth, handleSelect],
  );

  // Rows are a fixed height, so FlashList gets a real size rather than an
  // estimate it would have to correct after measuring — no scroll-jump under a
  // customer's finger, and no per-cell measurement pass at all.
  const rowHeight = kioskPx(ROW_HEIGHT, s);
  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }) => {
      layout.size = rowHeight;
    },
    [rowHeight],
  );

  const trimmed = query.trim();
  const noMatches = trimmed.length > 0 && results.length === 0;

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: config.backgroundColor, zIndex: 20 },
      ]}
    >
      {/* Tapping any chrome that isn't a control puts the keyboard away and
          gives the results the full panel — the query and results stay put.
          Controls (the field, the back and clear buttons, result rows) sit
          deeper in the tree and win the responder, so this only catches taps
          that would otherwise do nothing. Taps and drags inside the list are
          already handled by `keyboardShouldPersistTaps` / `keyboardDismissMode`
          below. */}
      <Pressable
        onPress={Keyboard.dismiss}
        accessible={false}
        style={{ flex: 1 }}
      >
        {/* Search field row — pinned to the top, above the keyboard at any height */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: kioskPx(14, s),
            width: "100%",
            maxWidth: kioskPx(MAX_COLUMN, s),
            alignSelf: "center",
            paddingHorizontal: kioskPx(16, s),
            paddingTop: kioskPx(16, s),
            paddingBottom: kioskPx(12, s),
          }}
        >
          <KioskPressable
            onPress={onClose}
            pressedScale={0.92}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            style={{
              width: kioskPx(62, s),
              height: kioskPx(62, s),
              borderRadius: kioskPx(31, s),
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: faint,
            }}
          >
            <ChevronLeft size={kioskPx(28, s)} color={config.textColor} />
          </KioskPressable>

          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: kioskPx(14, s),
              height: kioskPx(62, s),
              paddingHorizontal: kioskPx(20, s),
              borderRadius: kioskPx(18, s),
              backgroundColor: surface,
              borderWidth: 1,
              borderColor: `${config.accentColor}33`,
            }}
          >
            <Search size={kioskPx(24, s)} color={config.accentColor} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              placeholder="Search the menu"
              placeholderTextColor={`${config.textColor}80`}
              selectionColor={config.accentColor}
              style={{
                flex: 1,
                fontSize: kioskPx(20, s),
                fontWeight: "500",
                color: config.textColor,
                // RN gives Android inputs their own vertical padding; zeroing it
                // keeps the text on the row's centre line at every UI scale.
                paddingVertical: 0,
              }}
            />
            {query.length > 0 ? (
              <KioskPressable
                onPress={clear}
                pressedScale={0.9}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                style={{
                  width: kioskPx(34, s),
                  height: kioskPx(34, s),
                  borderRadius: kioskPx(17, s),
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: faint,
                }}
              >
                <X size={kioskPx(19, s)} color={config.textColor} />
              </KioskPressable>
            ) : null}
          </View>
        </View>

        {results.length > 0 ? (
          <Text
            style={{
              width: "100%",
              maxWidth: kioskPx(MAX_COLUMN, s),
              alignSelf: "center",
              paddingHorizontal: kioskPx(16, s),
              paddingBottom: kioskPx(8, s),
              fontSize: kioskPx(15, s),
              fontWeight: "600",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: muted,
            }}
          >
            {results.length >= KIOSK_SEARCH_RESULT_LIMIT
              ? `Top ${KIOSK_SEARCH_RESULT_LIMIT} matches`
              : `${results.length} ${results.length === 1 ? "result" : "results"}`}
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
              <Search size={kioskPx(46, s)} color={`${config.textColor}33`} />
              <Text
                style={{
                  fontSize: kioskPx(22, s),
                  fontWeight: "700",
                  color: config.textColor,
                  textAlign: "center",
                }}
              >
                {noMatches
                  ? `No matches for "${trimmed}"`
                  : "What are you looking for?"}
              </Text>
              <Text
                style={{
                  fontSize: kioskPx(17, s),
                  color: muted,
                  textAlign: "center",
                }}
              >
                {noMatches
                  ? "Try a shorter word, or go back and browse the menu."
                  : "Start typing an item, or a category like drinks."}
              </Text>
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
              // Without this the first tap on a result is swallowed dismissing the
              // keyboard, and the customer has to tap the same row twice.
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * One result: thumbnail, name, the category it lives in, and price.
 *
 * A compact fixed-height row rather than a menu card — a result list is read
 * top to bottom while scanning for one known item, where cards are browsed.
 * Fixed height is also what lets FlashList lay the list out from a real size
 * instead of measuring each cell.
 */
const KioskSearchResultRow = React.memo(function KioskSearchResultRow({
  entry,
  config,
  surface,
  width,
  onPress,
}: {
  entry: KioskSearchEntry;
  config: KioskConfig;
  surface: string;
  /** Measured by the overlay — FlashList's cells are positioned but unsized. */
  width: number;
  onPress: (item: MenuItemType) => void;
}) {
  const s = useKioskUiScale();
  const { item, categoryName } = entry;
  const qtyInCart = useKioskItemQuantity(item.id);
  const hasModifiers = !!item.modifierGroupIds?.length;

  const imageSource = useMemo(
    () => resolveMenuItemImageSource(item.image),
    [item.image],
  );
  const PlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(resolveMenuItemFallbackIconKey(item)),
    [item],
  );

  const thumb = kioskPx(THUMB, s);

  return (
    <KioskPressable
      onPress={() => onPress(item)}
      pressedScale={0.98}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(16, s),
        width,
        height: kioskPx(THUMB + ROW_PAD_V * 2, s),
        marginBottom: kioskPx(ROW_GAP, s),
        paddingHorizontal: kioskPx(ROW_PAD_V, s),
        borderRadius: kioskPx(18, s),
        backgroundColor: surface,
        borderWidth: 1,
        borderColor: `${config.accentColor}26`,
      }}
    >
      <View
        style={{
          width: thumb,
          height: thumb,
          borderRadius: kioskPx(14, s),
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${config.accentColor}10`,
        }}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <PlaceholderIcon
            color={`${config.textColor}55`}
            size={kioskPx(32, s)}
          />
        )}
      </View>

      <View style={{ flex: 1, gap: kioskPx(4, s) }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: kioskPx(21, s),
            fontWeight: "700",
            color: config.textColor,
          }}
        >
          {item.name}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: kioskPx(8, s),
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: kioskPx(15, s),
              color: `${config.textColor}99`,
            }}
          >
            {categoryName}
          </Text>
          {hasModifiers ? (
            <SlidersHorizontal
              size={kioskPx(15, s)}
              color={config.accentColor}
            />
          ) : null}
        </View>
      </View>

      {qtyInCart > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: kioskPx(5, s),
            paddingHorizontal: kioskPx(10, s),
            paddingVertical: kioskPx(5, s),
            borderRadius: 999,
            backgroundColor: config.accentColor,
          }}
        >
          <ShoppingCart
            size={kioskPx(14, s)}
            color="#FFFFFF"
            strokeWidth={2.75}
          />
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: kioskPx(14, s),
              fontWeight: "800",
            }}
          >
            {qtyInCart}
          </Text>
        </View>
      ) : null}

      <Text
        style={{
          fontSize: kioskPx(19, s),
          fontWeight: "800",
          color: config.textColor,
        }}
      >
        ${item.price?.toFixed(2)}
      </Text>
    </KioskPressable>
  );
});
