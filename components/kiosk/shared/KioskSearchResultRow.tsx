import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskMoney } from "@/components/kiosk/shared/kioskMoney";
import type { KioskSearchEntry } from "@/components/kiosk/shared/kioskMenuSearch";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import { useKioskItemQuantity } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingCart } from "lucide-react-native";
import React, { useMemo } from "react";
import { Image, Text, View } from "react-native";

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
  onPress: (item: MenuItemType) => void;
}) {
  const s = useKioskUiScale();
  const { item, categoryName } = entry;
  const qtyInCart = useKioskItemQuantity(item.id);

  const imageSource = useMemo(
    () => resolveMenuItemImageSource(item.image),
    [item.image],
  );
  const PlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(resolveMenuItemFallbackIconKey(item)),
    [item],
  );

  const thumb = kioskPx(KIOSK_RESULT_THUMB, s);

  return (
    <KioskPressable
      onPress={() => onPress(item)}
      pressedScale={0.98}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(16, s),
        width,
        height: kioskPx(KIOSK_RESULT_THUMB + KIOSK_RESULT_PAD_V * 2, s),
        marginBottom: kioskPx(KIOSK_RESULT_GAP, s),
        paddingHorizontal: kioskPx(KIOSK_RESULT_PAD_V, s),
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
        <Text
          numberOfLines={1}
          style={{
            fontSize: kioskPx(15, s),
            color: `${config.textColor}99`,
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
        {kioskMoney(item.price ?? 0)}
      </Text>
    </KioskPressable>
  );
});
