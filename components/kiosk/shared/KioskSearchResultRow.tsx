import {
  kioskFont,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KioskItemThumb } from "@/components/kiosk/shared/KioskItemThumb";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskMoney } from "@/components/kiosk/shared/kioskMoney";
import type { KioskSearchEntry } from "@/components/kiosk/shared/kioskMenuSearch";
import {
  kioskFontPx,
  kioskPx,
} from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import { useKioskUiScale } from "@/lib/uiScale";
import { useKioskItemQuantity } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingCart } from "@/lib/icons";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

/** Thumbnail edge, and the paddings that together fix the row height. */
export const KIOSK_RESULT_THUMB = 76;
export const KIOSK_RESULT_PAD_V = 12;
export const KIOSK_RESULT_GAP = 10;
export const KIOSK_RESULT_ROW_HEIGHT =
  KIOSK_RESULT_THUMB + KIOSK_RESULT_PAD_V * 2 + KIOSK_RESULT_GAP;

/**
 * One search result: thumbnail, name, the category it lives in, and price.
 *
 * A compact fixed-height row rather than a menu card — a result list is read
 * top to bottom while scanning for one known item, where cards are browsed.
 * Fixed height is also what lets FlashList lay the list out from a real size
 * instead of measuring each cell.
 */
export const KioskSearchResultRow = React.memo(function KioskSearchResultRow({
  entry,
  config,
  surface,
  width,
  onPress,
}: {
  entry: KioskSearchEntry;
  config: KioskConfig;
  surface: string;
  /** Measured by the panel — FlashList's cells are positioned but unsized. */
  width: number;
  /** Hands up the whole entry so the caller knows which category it was found in. */
  onPress: (entry: KioskSearchEntry) => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const { item, categoryName } = entry;
  const qtyInCart = useKioskItemQuantity(item.id);

  const PlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(resolveMenuItemFallbackIconKey(item)),
    [item],
  );

  const thumb = kioskPx(KIOSK_RESULT_THUMB, s);

  return (
    <KioskPressable
      onPress={() => onPress(entry)}
      pressedScale={0.98}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(16, s),
        width,
        height: kioskPx(KIOSK_RESULT_THUMB + KIOSK_RESULT_PAD_V * 2, s),
        marginBottom: kioskPx(KIOSK_RESULT_GAP, s),
        paddingHorizontal: kioskPx(KIOSK_RESULT_PAD_V, s),
        borderRadius: kioskPx(kioskRadius.md, s),
        backgroundColor: surface,
      }}
    >
      <View
        style={{
          width: thumb,
          height: thumb,
          borderRadius: kioskPx(kioskRadius.sm, s),
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.sunken,
        }}
      >
        {/* Decoded to thumbnail size and released on recycle. A result list
            swaps its whole set on every keystroke while the grid it covers
            stays mounted underneath, so a full-resolution bitmap per row is
            the one thing this screen cannot afford — see KioskItemThumb. */}
        <KioskItemThumb
          image={item.image}
          size={thumb}
          recyclingKey={item.id}
          fallback={
            <PlaceholderIcon color={t.textFaint} size={kioskPx(32, s)} />
          }
        />
      </View>

      <View style={{ flex: 1, gap: kioskPx(4, s) }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: kioskPx(20, s),
            letterSpacing: kioskTracking(20),
            color: t.text,
            ...kioskFont(t, "bold"),
          }}
        >
          {item.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: kioskFontPx(14, s),
            color: t.textMuted,
            ...kioskFont(t, "regular"),
          }}
        >
          {categoryName}
        </Text>
      </View>

      {qtyInCart > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: kioskPx(5, s),
            paddingHorizontal: kioskPx(10, s),
            paddingVertical: kioskPx(5, s),
            borderRadius: kioskPx(kioskRadius.xs, s),
            backgroundColor: t.primary,
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
              fontSize: kioskFontPx(14, s),
              fontWeight: "800",
            }}
          >
            {qtyInCart}
          </Text>
        </View>
      ) : null}

      <Text
        style={{
          fontSize: kioskPx(18, s),
          color: t.text,
          fontVariant: ["tabular-nums"],
          ...kioskFont(t, "bold"),
        }}
      >
        {kioskMoney(item.price ?? 0)}
      </Text>
    </KioskPressable>
  );
});
