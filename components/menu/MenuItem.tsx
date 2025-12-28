import { useToast } from "@/contexts/ToastContext";
import { MenuItemType } from "@/lib/types";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Settings, Utensils } from "lucide-react-native";
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
    borderRadius: 20,
    marginBottom: 8,
    backgroundColor: "#303030",
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  containerDisabled: {
    opacity: 0.5,
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
    width: "100%",
    height: 96,
    flex: 1,
  },
  image: {
    width: "100%",
    height: 96,
    borderRadius: 8,
  },
  placeholderContainer: {
    width: "100%",
    height: 96,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modifierIconContainer: {
    position: "absolute",
    bottom: 8,
    right: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#60A5FA",
    alignSelf: "center",
    width: "90%",
  },
  contentContainer: {
    width: "100%",
    paddingHorizontal: 16,
    flex: 1,
    paddingBottom: 4,
    height: "100%",
    justifyContent: "flex-end",
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nameText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    marginTop: 12,
    flex: 1,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceText: {
    fontSize: 20,
    fontWeight: "600",
    color: "white",
  },
  priceTextCustom: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FACC15",
  },
  originalPriceText: {
    fontSize: 18,
    color: "#6B7280",
    marginLeft: 8,
    textDecorationLine: "line-through",
  },
  cashPriceText: {
    fontSize: 14,
    color: "#D1D5DB",
    marginLeft: 8,
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
    backgroundColor: "#22C55E",
    borderRadius: 4,
    marginRight: 8,
  },
  stockDotRed: {
    width: 8,
    height: 8,
    backgroundColor: "#EF4444",
    borderRadius: 4,
    marginRight: 8,
  },
  stockTextGreen: {
    color: "#4ADE80",
    fontSize: 14,
    fontWeight: "500",
  },
  stockTextRed: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "500",
  },
});

// OPTIMIZED: Memoized icon components (prevents re-render)
const PlaceholderIcon = React.memo(() => (
  <Utensils color="#9ca3af" size={24} />
));
PlaceholderIcon.displayName = "PlaceholderIcon";

const ModifierIcon = React.memo(() => <Settings color="#60A5FA" size={24} />);
ModifierIcon.displayName = "ModifierIcon";

// OPTIMIZED: Memoized stock status component
const StockStatus = React.memo(
  ({
    stockQuantity,
    availability,
  }: {
    stockQuantity?: number;
    availability?: boolean;
  }) => {
    if (stockQuantity !== undefined && stockQuantity > 0) {
      return (
        <View style={styles.stockRow}>
          <View style={styles.stockDotGreen} />
          <Text style={styles.stockTextGreen}>{stockQuantity} in stock</Text>
        </View>
      );
    }

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
  }
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
  // OPTIMIZED: Use O(1) ordersById lookup instead of O(n) orders.find()
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const activeOrder = useOrderStore((state) =>
    state.activeOrderId ? state.ordersById[state.activeOrderId] : undefined
  );
  const { activeEmployeeId, getSession, showClockInWall } = useTimeclockStore();
  const { show } = useToast();

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
    [item.modifierGroupIds]
  );

  const isDisabled = item.availability === false;

  // OPTIMIZED: Use getState() for action-only function to avoid subscription
  const handlePress = useCallback(() => {
    if (!isClockedIn) {
      showClockInWall();
      return;
    }

    if (onOrderClosedCheck && onOrderClosedCheck()) {
      return;
    }

    if (!activeOrder?.order_type) {
      show({
        title: "Order Type Required",
        message:
          "Please select an order type (e.g., Dine-In) before adding items.",
        type: "warning",
      });
      return;
    }

    // Use getState() to avoid subscribing to store changes
    useModifierSidebarStore
      .getState()
      .openFullscreen(item, activeOrderId, categoryId);
  }, [
    item,
    activeOrderId,
    categoryId,
    isClockedIn,
    activeOrder?.order_type,
    onOrderClosedCheck,
    showClockInWall,
    show,
  ]);

  return (
    <TouchableOpacity
      disabled={isDisabled}
      onPress={handlePress}
      style={[styles.container, isDisabled && styles.containerDisabled]}
    >
      <View style={styles.innerContainer}>
        <View style={styles.imageContainer}>
          {imageSource ? (
            <Image source={imageSource} style={styles.image} />
          ) : (
            <View style={styles.placeholderContainer}>
              <PlaceholderIcon />
            </View>
          )}
          {hasModifiers && (
            <View style={styles.modifierIconContainer}>
              <ModifierIcon />
            </View>
          )}
        </View>
        <View style={styles.divider} />
        <View style={styles.contentContainer}>
          <View style={styles.nameContainer}>
            <Text style={styles.nameText}>{item.name}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text
              style={
                priceData.hasCustomPricing
                  ? styles.priceTextCustom
                  : styles.priceText
              }
            >
              ${priceData.displayPrice?.toFixed(2)}
            </Text>

            {item.cashPrice && (
              <Text style={styles.cashPriceText}>
                Cash Price: ${item.cashPrice.toFixed(2)}
              </Text>
            )}
          </View>
          <View style={styles.stockContainer}>
            <StockStatus
              stockQuantity={item.stockQuantity}
              availability={item.availability}
            />
          </View>
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
