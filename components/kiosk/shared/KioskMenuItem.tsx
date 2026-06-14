import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import type { KioskConfig } from "@/types/kiosk";
import React, { useMemo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Kiosk clone of components/menu/MenuItem.tsx — same card layout (image on top,
 * divider, name, card price + cash pill, modifier corner) but kiosk-native:
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
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
    borderTopWidth: 22,
    borderLeftWidth: 22,
    borderLeftColor: "transparent",
    zIndex: 10,
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
    marginHorizontal: 12,
  },
  contentContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  nameText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 19,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: "700",
  },
  cashPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cashAmount: {
    fontSize: 13,
    fontWeight: "700",
  },
});

const KioskMenuItem: React.FC<KioskMenuItemProps> = ({
  item,
  config,
  onPress,
}) => {
  const isDisabled = item.availability === false;
  const hasModifiers = !!item.modifierGroupIds?.length;

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
  const cashColor = "#16A34A"; // success green for the cash pill, theme-neutral

  return (
    <TouchableOpacity
      disabled={isDisabled}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          borderColor: `${accent}30`,
        },
        isDisabled && styles.containerDisabled,
      ]}
    >
      {hasModifiers && (
        <View style={[styles.modifierCorner, { borderTopColor: accent }]} />
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
            <PlaceholderIcon color={`${config.textColor}55`} size={40} />
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

          {item.cashPrice != null && (
            <View
              style={[
                styles.cashPill,
                {
                  backgroundColor: `${cashColor}18`,
                  borderColor: `${cashColor}40`,
                },
              ]}
            >
              <Text style={[styles.cashAmount, { color: cashColor }]}>
                ${item.cashPrice.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default React.memo(KioskMenuItem, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.price === next.item.price &&
    prev.item.cashPrice === next.item.cashPrice &&
    prev.item.availability === next.item.availability &&
    prev.item.name === next.item.name &&
    prev.item.image === next.item.image &&
    prev.config.accentColor === next.config.accentColor &&
    prev.config.backgroundColor === next.config.backgroundColor &&
    prev.config.textColor === next.config.textColor &&
    prev.onPress === next.onPress
  );
});
