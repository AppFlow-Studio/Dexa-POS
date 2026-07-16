import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { resolveMenuItemFallbackIconKey } from "@/components/kiosk/shared/menuItemFallbackIcon";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { getMenuItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import React, { useMemo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Full-width row variant of KioskMenuItem — image on the left, name/
 * description/price stacked on the right. Used by templates that lay the
 * menu out as a single scrollable list (grouped by category) instead of a
 * grid, e.g. Template C.
 */
interface KioskMenuItemRowProps {
  item: MenuItemType;
  config: KioskConfig;
  onPress: (item: MenuItemType) => void;
}

const useStyles = (s: number) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: kioskPx(18, s),
      overflow: "hidden",
      borderWidth: 1,
      padding: kioskPx(10, s),
      gap: kioskPx(14, s),
    },
    containerDisabled: {
      opacity: 0.4,
    },
    imageWrapper: {
      width: kioskPx(88, s),
      height: kioskPx(88, s),
      borderRadius: kioskPx(14, s),
      overflow: "hidden",
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
    content: {
      flex: 1,
      gap: kioskPx(4, s),
    },
    nameText: {
      fontSize: kioskPx(17, s),
      fontWeight: "700",
    },
    descriptionText: {
      fontSize: kioskPx(13, s),
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: kioskPx(10, s),
      marginTop: kioskPx(2, s),
    },
    cardPrice: {
      fontSize: kioskPx(16, s),
      fontWeight: "700",
    },
    cashPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: kioskPx(3, s),
      borderWidth: 1,
      borderRadius: kioskPx(8, s),
      paddingHorizontal: kioskPx(6, s),
      paddingVertical: kioskPx(2, s),
    },
    cashAmount: {
      fontSize: kioskPx(13, s),
      fontWeight: "700",
    },
    modifierDot: {
      position: "absolute",
      top: kioskPx(8, s),
      right: kioskPx(8, s),
      width: kioskPx(10, s),
      height: kioskPx(10, s),
      borderRadius: 999,
    },
  });

const KioskMenuItemRow: React.FC<KioskMenuItemRowProps> = ({
  item,
  config,
  onPress,
}) => {
  const s = useKioskUiScale();
  const styles = useStyles(s);
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

  const accent = config.accentColor;
  const cashColor = "#16A34A";

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
              size={kioskPx(32, s)}
            />
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text
          style={[styles.nameText, { color: config.textColor }]}
          numberOfLines={1}
        >
          {item.name}
        </Text>

        {item.description ? (
          <Text
            style={[styles.descriptionText, { color: `${config.textColor}99` }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        ) : null}

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

      {hasModifiers && (
        <View style={[styles.modifierDot, { backgroundColor: accent }]} />
      )}
    </TouchableOpacity>
  );
};

export default React.memo(KioskMenuItemRow, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.price === next.item.price &&
    prev.item.cashPrice === next.item.cashPrice &&
    prev.item.availability === next.item.availability &&
    prev.item.name === next.item.name &&
    prev.item.description === next.item.description &&
    prev.item.image === next.item.image &&
    prev.config.accentColor === next.config.accentColor &&
    prev.config.backgroundColor === next.config.backgroundColor &&
    prev.config.textColor === next.config.textColor &&
    prev.onPress === next.onPress
  );
});
