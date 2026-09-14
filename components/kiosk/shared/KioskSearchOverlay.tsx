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
  FlatList,
  Image,
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

  const renderItem = useCallback(
    ({ item: entry }: { item: KioskSearchEntry }) => (
      <KioskSearchResultRow
        entry={entry}
        config={config}
        surface={surface}
        onPress={handleSelect}
      />
    ),
    [config, surface, handleSelect],
  );

  // Fixed-height rows, so the list can skip measurement entirely and jump
  // straight to any offset as the customer flicks through a long result set.
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: kioskPx(ROW_HEIGHT, s),
      offset: kioskPx(ROW_HEIGHT, s) * index,
      index,
    }),
    [s],
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

      <FlatList
        data={results}
        keyExtractor={(entry) => entry.item.id}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: "100%",
          maxWidth: kioskPx(MAX_COLUMN, s),
          alignSelf: "center",
          paddingHorizontal: kioskPx(16, s),
          paddingBottom: kioskPx(LIST_BOTTOM_PAD, s),
          flexGrow: results.length === 0 ? 1 : undefined,
        }}
        showsVerticalScrollIndicator={false}
        // Without this the first tap on a result is swallowed dismissing the
        // keyboard, and the customer has to tap the same row twice.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        // No `removeClippedSubviews`: it has a history of blanking cells in
        // Android FlatLists, and a blank row is a lost sale on a customer-facing
        // panel. `getItemLayout` plus a 40-result cap already keep this cheap.
        ListEmptyComponent={
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
        }
      />
    </View>
  );
}

/**
 * One result: thumbnail, name, the category it lives in, and price.
 *
 * A compact fixed-height row rather than a menu card — a result list is read
 * top to bottom while scanning for one known item, where cards are browsed.
 * Fixed height is also what lets the list use `getItemLayout`.
 */
const KioskSearchResultRow = React.memo(function KioskSearchResultRow({
  entry,
  config,
  surface,
  onPress,
}: {
  entry: KioskSearchEntry;
  config: KioskConfig;
  surface: string;
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
