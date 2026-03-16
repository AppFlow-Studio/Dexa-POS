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

// OPTIMIZED: Pre-compiled StyleSheet (no runtime parsing)
const styles = StyleSheet.create({
  container: {
    width: "23%",
    aspectRatio: 1,
    borderRadius: 20,
    marginBottom: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: `${colors.teal}40`,
    padding: 3
  },
  containerDisabled: {
    opacity: 0.5,
  },
  containerNoImage: {
    aspectRatio: undefined,
    height: 80,
  },
  innerContainer: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    overflow: "hidden",
    borderRadius: 8,
    flex: 1,
  },
  imageContainer: {
    position: "relative",
    width: "90%",
    height: 96,
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 2,
    borderRadius: 10,
  },
  image: {
    width: "100%",
    height: '100%',
    borderRadius: 8,
  },
  placeholderContainer: {
    width: "100%",
    height: '100%',
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modifierIconContainer: {
    position: "absolute",
    top: 6,
    right: 6,
  },
  modifierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.teal,
  },
  divider: {
    height: 1,
    backgroundColor: colors.info,
    alignSelf: "center",
    width: "90%",
  },
  contentContainer: {
    width: "100%",
    paddingHorizontal: 16,
    paddingBottom: 4,
    justifyContent: "flex-end",
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nameText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.heading,
    marginTop: 2,
    flex: 1,
  },
  priceContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priceText: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.heading,
  },
  priceTextCustom: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.warning,
  },
  originalPriceText: {
    fontSize: 18,
    color: colors.muted,
    marginLeft: 8,
    textDecorationLine: "line-through",
  },
  cashPriceText: {
    fontSize: 12,
    color: colors.success,
    marginLeft: 4,
    marginRight: 4,
  },
  cashPriceTextCash: {
    fontSize: 12,
    color: colors.success,
    marginLeft: 4,
    fontWeight: 500,
  },
  stockContainer: {
    marginTop: 8,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stockDotGreen: {
    width: 8,
    height: 8,
    backgroundColor: colors.success,
    borderRadius: 4,
    marginRight: 8,
  },
  stockDotRed: {
    width: 8,
    height: 8,
    backgroundColor: colors.danger,
    borderRadius: 4,
    marginRight: 8,
  },
  stockTextGreen: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "500",
  },
  stockTextRed: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "500",
  },
});

// OPTIMIZED: Memoized icon components (prevents re-render)
const PlaceholderIcon = React.memo(() => (
  <Utensils color={colors.label} size={24} />
));
PlaceholderIcon.displayName = "PlaceholderIcon";


// OPTIMIZED: Memoized stock status component
const StockStatus = React.memo(
  ({
    stockQuantity,
    availability,
  }: {
    stockQuantity?: number;
    availability?: boolean;
  }) => {
    //     if (stockQuantity !== undefined && stockQuantity > 0) {
    //       return (
    //         <View style={styles.stockRow}>
    //           <View style={styles.stockDotGreen} />
    //           <Text style={styles.stockTextGreen}>{stockQuantity} in stock</Text>
    //         </View>
    //       );
    //     }

    if (availability === false) {
      return (
        <View style={styles.stockRow}>
          <View style={styles.stockDotRed} />
          <Text style={styles.stockTextRed}>Out of Stock</Text>
        </View>
      );
    }

    return (
      <View style={styles.stockRow}>
        <View style={styles.stockDotGreen} />
        <Text style={styles.stockTextGreen}>In Stock</Text>
      </View>
    );
  },
);
StockStatus.displayName = "StockStatus";

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
  // OPTIMIZED: Removed activeOrderId/activeOrder subscriptions - now read via getState() in handlePress
  const { activeEmployeeId, getSession, showClockInWall } = useTimeclockStore();
  const { show } = useToast();
  const showMenuItemPrices = useSettingsStore((s) => s.showMenuItemPrices);
  const showMenuImages = useSettingsStore((s) => s.showMenuImages);

  const isClockedIn = useMemo(() => {
    if (!activeEmployeeId) return false;
    const session = getSession(activeEmployeeId);
    return session?.status === "clockedIn";
  }, [activeEmployeeId, getSession]);

  // OPTIMIZED: Pre-compute price data (moved from render IIFE)
  const priceData = useMemo(() => {
    // Trusted item.price from tree
    const displayPrice = item.price;
    const basePrice =
      item.priceLevels?.level_2_location_item ??
      item.priceLevels?.level_1_base ??
      item.price;
    // Show custom pricing if display price differs from base price
    const hasCustomPricing = displayPrice !== basePrice;

    return { displayPrice, hasCustomPricing, basePrice };
  }, [item]);

  // OPTIMIZED: Pre-compute derived values
  const hasModifiers = useMemo(
    () => item.modifierGroupIds && item.modifierGroupIds.length > 0,
    [item.modifierGroupIds],
  );

  const isDisabled = item.availability === false;

  // ─── Phase 1: onPressIn ──────────────────────────────────────────────────
  // Fires ~50-150ms before onPress. Do validation + pre-warm computation here.
  // DO NOT open the modal — avoid triggering a React render while finger is down.
  const handlePressIn = useCallback(() => {
    // Synchronous block (same frame, before React)
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

    // Pre-warm: compute modifier data NOW while finger is still down.
    // By the time onPress fires, this is already cached.
    useModifierSidebarStore.getState().preWarm(item, categoryId, menuId);
  }, [
    item,
    categoryId,
    menuId,
    isClockedIn,
    onOrderClosedCheck,
    showClockInWall,
    show,
  ]);

  // ─── Phase 2: onPress ──────────────────────────────────────────────────────
  // Fires after finger lifts. Pre-warm is already done — just flip isOpen = true.
  const handlePress = useCallback(() => {
    // If validation failed in pressIn, menu was already unblocked — skip
    if (!isMenuBlockedSync()) return;

    const { activeOrderId } = useOrderStore.getState();

    // openToAdd consumes the preWarm cache — no computation needed
    useModifierSidebarStore
      .getState()
      .openToAdd(item, activeOrderId, categoryId, menuId);
  }, [item, categoryId, menuId]);

  return (
    <TouchableOpacity
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPress={handlePress}
      style={[styles.container, isDisabled && styles.containerDisabled, (!showMenuImages || !imageSource) && styles.containerNoImage]}
    >
      <View style={styles.innerContainer}>
        {hasModifiers && (
          <View style={styles.modifierIconContainer}>
            <View style={styles.modifierDot} />
          </View>
        )}
        {showMenuImages && imageSource && (
          <View style={styles.imageContainer}>
            <Image source={imageSource} style={styles.image} />
          </View>
        )}
        {/* <View style={styles.divider} /> */}
        <View style={styles.contentContainer} >
          <View style={styles.nameContainer}>
            <Text style={styles.nameText}>{item.name}</Text>
          </View>
          {showMenuItemPrices && (
            <View
              style={styles.priceContainer}
              className="flex-row flex items-center gap-1"
            >
              <Text
                style={
                  priceData.hasCustomPricing
                    ? styles.priceTextCustom
                    : styles.priceText
                }
                className="flex-row items-center gap-1 w-fit "
              >
                ${priceData.displayPrice?.toFixed(2)}
              </Text>

              {item.cashPrice && (
                <View className="flex-row  items-center gap-1 w-fit rounded-full bg-emerald-900 p-0.5">
                  <Text style={styles.cashPriceTextCash}>Cash:</Text>
                  <Text
                    style={styles.cashPriceText}
                    className="flex-row items-center gap-1"
                  >
                    ${item.cashPrice.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          )}
          {/* <View style={styles.stockContainer}>
            <StockStatus
              stockQuantity={item.stockQuantity}
              availability={item.availability}
            />
          </View> */}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// OPTIMIZED: React.memo with custom comparison to prevent unnecessary re-renders
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
