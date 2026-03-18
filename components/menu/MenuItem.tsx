import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { MenuItemType } from "@/lib/types";
import {
  isMenuBlockedSync,
  setMenuBlockedSync,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Utensils } from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const styles = StyleSheet.create({
  container: {
    width: "19%",
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: `${colors.teal}30`,
    overflow: "hidden",
  },
  containerDisabled: {
    opacity: 0.4,
  },
  containerNoImage: {
    aspectRatio: undefined,
    height: 64,
  },
  // Modifier corner triangle
  modifierCorner: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderTopWidth: 18,
    borderLeftWidth: 18,
    borderTopColor: colors.teal,
    borderLeftColor: "transparent",
    zIndex: 10,
  },
  // Image area
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
    backgroundColor: `${colors.teal}08`,
  },
  // Content area
  contentContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  nameText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.heading,
    lineHeight: 15,
  },
  // Price row: card price left, cash pill right
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 1,
  },
  cardPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.heading,
  },
  cardPriceCustom: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.warning,
  },
  cashPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: `${colors.success}18`,
    borderWidth: 1,
    borderColor: `${colors.success}40`,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cashLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: `${colors.success}99`,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  cashAmount: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
  },
  // Divider between image and content
  divider: {
    height: 1,
    backgroundColor: `${colors.teal}20`,
    marginHorizontal: 10,
  },
});

const PlaceholderIcon = React.memo(() => (
  <Utensils color={`${colors.label}60`} size={16} />
));
PlaceholderIcon.displayName = "PlaceholderIcon";

interface MenuItemProps {
  item: MenuItemType;
  imageSource?: ImageSourcePropType;
  onOrderClosedCheck?: () => boolean;
  categoryId?: string;
  menuId?: string;
}

const MenuItem: React.FC<MenuItemProps> = ({
  item,
  imageSource,
  onOrderClosedCheck,
  categoryId,
  menuId,
}) => {
  const { activeEmployeeId, getSession, showClockInWall } = useTimeclockStore();
  const { show } = useToast();
  const showMenuItemPrices = useSettingsStore((s) => s.showMenuItemPrices);
  const showMenuImages = useSettingsStore((s) => s.showMenuImages);

  const isClockedIn = useMemo(() => {
    if (!activeEmployeeId) return false;
    const session = getSession(activeEmployeeId);
    return session?.status === "clockedIn";
  }, [activeEmployeeId, getSession]);

  const priceData = useMemo(() => {
    const displayPrice = item.price;
    const basePrice =
      item.priceLevels?.level_2_location_item ??
      item.priceLevels?.level_1_base ??
      item.price;
    const hasCustomPricing = displayPrice !== basePrice;
    return { displayPrice, hasCustomPricing, basePrice };
  }, [item]);

  const hasModifiers = useMemo(
    () => item.modifierGroupIds && item.modifierGroupIds.length > 0,
    [item.modifierGroupIds],
  );

  const isDisabled = item.availability === false;

  const handlePressIn = useCallback(() => {
    setMenuBlockedSync(true);

    if (!isClockedIn) {
      setMenuBlockedSync(false);
      showClockInWall();
      return;
    }

    if (onOrderClosedCheck?.()) {
      setMenuBlockedSync(false);
      return;
    }

    const { activeOrderId, ordersById } = useOrderStore.getState();
    const currentOrder = activeOrderId ? ordersById[activeOrderId] : undefined;

    if (!currentOrder?.order_type) {
      setMenuBlockedSync(false);
      show({
        title: "Order Type Required",
        message: "Please select an order type before adding items.",
        type: "warning",
      });
      return;
    }

    useModifierSidebarStore.getState().preWarm(item, categoryId, menuId);
  }, [item, categoryId, menuId, isClockedIn, onOrderClosedCheck, showClockInWall, show]);

  const handlePress = useCallback(() => {
    if (!isMenuBlockedSync()) return;
    const { activeOrderId } = useOrderStore.getState();
    useModifierSidebarStore.getState().openToAdd(item, activeOrderId, categoryId, menuId);
  }, [item, categoryId, menuId]);

  return (
    <TouchableOpacity
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPress={handlePress}
      style={[
        styles.container,
        isDisabled && styles.containerDisabled,
        !showMenuImages && styles.containerNoImage,
      ]}
    >
      {/* Modifier triangle corner */}
      {hasModifiers && <View style={styles.modifierCorner} />}

      {/* Image */}
      {showMenuImages && (
        <View style={styles.imageWrapper}>
          {imageSource ? (
            <Image source={imageSource} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderContainer}>
              <PlaceholderIcon />
            </View>
          )}
        </View>
      )}

      {/* Divider */}
      {showMenuImages && <View style={styles.divider} />}

      {/* Content */}
      <View style={styles.contentContainer}>
        <Text style={styles.nameText} numberOfLines={2}>{item.name}</Text>

        {showMenuItemPrices && (
          <View style={styles.priceRow}>
            <Text style={priceData.hasCustomPricing ? styles.cardPriceCustom : styles.cardPrice}>
              ${priceData.displayPrice?.toFixed(2)}
            </Text>

            {item.cashPrice && (
              <View style={styles.cashPill}>
                <Text style={styles.cashAmount}>${item.cashPrice.toFixed(2)}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default React.memo(MenuItem, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.price === nextProps.item.price &&
    prevProps.item.availability === nextProps.item.availability &&
    prevProps.item.stockQuantity === nextProps.item.stockQuantity &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.categoryId === nextProps.categoryId &&
    prevProps.imageSource === nextProps.imageSource
  );
});
