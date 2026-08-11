import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import { useKioskItemQuantity } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { Check } from "lucide-react-native";
import React, { useMemo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Kiosk clone of components/menu/MenuItem.tsx — same card layout (image on top,
 * divider, name, price, modifier corner) but kiosk-native:
 *
 *  - Themed entirely from `config` (per-profile colors), not the POS `colors`.
 *  - No clock-in wall, no useOrderStore / useModifierSidebarStore coupling.
 *  - Tapping calls `onPress(item)`; the template decides whether to open the
 *    item-detail/modifier screen or add straight to the kiosk cart.
 *
 * Larger touch targets than the POS card (kiosks are customer-facing).
 */
interface KioskMenuItemProps {
  item: MenuItemType;
  config: KioskConfig;
  onPress: (item: MenuItemType) => void;
}

const useStyles = (s: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: kioskPx(16, s),
      overflow: "hidden",
      borderWidth: 1,
    },
    containerDisabled: {
      opacity: 0.4,
    },
    modifierCorner: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 0,
      height: 0,
      borderTopWidth: kioskPx(22, s),
      borderLeftWidth: kioskPx(22, s),
      borderLeftColor: "transparent",
      zIndex: 10,
    },
    inCartBadge: {
      position: "absolute",
      top: kioskPx(8, s),
      left: kioskPx(8, s),
      zIndex: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: kioskPx(3, s),
      paddingLeft: kioskPx(6, s),
      paddingRight: kioskPx(9, s),
      paddingVertical: kioskPx(4, s),
      borderRadius: 999,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 3,
    },
    inCartBadgeText: {
      color: "#FFFFFF",
      fontWeight: "800",
      fontSize: kioskPx(13, s),
    },
    imageWrapper: {
      flex: 1,
      width: "100%",
    },
    image: {
      width: "100%",
      height: "100%",
    },
    placeholderContainer: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    divider: {
      height: 1,
      marginHorizontal: kioskPx(12, s),
    },
    contentContainer: {
      paddingHorizontal: kioskPx(12, s),
      paddingVertical: kioskPx(8, s),
      gap: kioskPx(4, s),
    },
    nameText: {
      fontSize: kioskPx(15, s),
      fontWeight: "600",
      lineHeight: kioskPx(19, s),
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: kioskPx(2, s),
    },
    cardPrice: {
      fontSize: kioskPx(15, s),
      fontWeight: "700",
    },
  });

const KioskMenuItem: React.FC<KioskMenuItemProps> = ({
  item,
  config,
  onPress,
}) => {
  const s = useKioskUiScale();
  const styles = useStyles(s);
  const isDisabled = item.availability === false;
  const hasModifiers = !!item.modifierGroupIds?.length;
  const qtyInCart = useKioskItemQuantity(item.id);
  const inCart = qtyInCart > 0;

  const resolvedImageSource = useMemo(
    () => resolveMenuItemImageSource(item.image),
    [item.image],
  );

  const PlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(resolveMenuItemFallbackIconKey(item)),
    [item],
  );

  // Tint placeholder/divider/accents off the kiosk theme.
  const accent = config.accentColor;

  return (
    <TouchableOpacity
      disabled={isDisabled}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          borderColor: inCart ? accent : `${accent}30`,
          borderWidth: inCart ? 2 : 1,
        },
        isDisabled && styles.containerDisabled,
      ]}
    >
      {hasModifiers && (
        <View style={[styles.modifierCorner, { borderTopColor: accent }]} />
      )}

      {inCart && (
        <View style={[styles.inCartBadge, { backgroundColor: accent }]}>
          <Check size={kioskPx(13, s)} color="#FFFFFF" strokeWidth={3.5} />
          <Text style={styles.inCartBadgeText}>{qtyInCart}</Text>
        </View>
      )}

      <View style={styles.imageWrapper}>
        {resolvedImageSource ? (
          <Image
            source={resolvedImageSource}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.placeholderContainer,
              { backgroundColor: `${accent}10` },
            ]}
          >
            <PlaceholderIcon
              color={`${config.textColor}55`}
              size={kioskPx(40, s)}
            />
          </View>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: `${accent}20` }]} />

      <View style={styles.contentContainer}>
        <Text
          style={[styles.nameText, { color: config.textColor }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>

        <View style={styles.priceRow}>
          <Text style={[styles.cardPrice, { color: config.textColor }]}>
            ${item.price?.toFixed(2)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default React.memo(KioskMenuItem, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.price === next.item.price &&
    prev.item.availability === next.item.availability &&
    prev.item.name === next.item.name &&
    prev.item.image === next.item.image &&
    prev.config.accentColor === next.config.accentColor &&
    prev.config.backgroundColor === next.config.backgroundColor &&
    prev.config.textColor === next.config.textColor &&
    prev.onPress === next.onPress
  );
});
