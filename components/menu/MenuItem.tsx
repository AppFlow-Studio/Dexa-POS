import OptimizedListImage, {
    type ImageLoadPriority,
} from "@/components/ui/OptimizedListImage";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import {
    DEFAULT_MENU_ITEM_PLACEHOLDER_ICON,
    extractMenuItemPlaceholderIconKey,
    getMenuItemPlaceholderIcon,
    type MenuItemPlaceholderIconKey,
} from "@/lib/menuItemPlaceholderIcon";
import { useIsActiveOrderReadOnly } from "@/lib/orderAccessControlHooks";
import { cancelMenuModifierPreWarm } from "@/lib/menuModifierPreWarmControl";
import { startInteraction } from "@/lib/perf";
import { colors } from "@/lib/theme";
import { MenuItemType } from "@/lib/types";
import { useColorScheme } from "@/lib/useColorScheme";
import {
    isModifierPreWarmed,
    isMenuBlockedSync,
    setMenuBlockedSync,
    useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import React, { useCallback, useMemo } from "react";
import {
    ImageSourcePropType,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type MenuItemStyles = ReturnType<typeof createStyles>;

const menuItemStylesByScheme = new Map<string, MenuItemStyles>();

const createStyles = () =>
  StyleSheet.create({
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

const getStylesForScheme = (scheme: string) => {
  const cached = menuItemStylesByScheme.get(scheme);
  if (cached) return cached;
  const next = createStyles();
  menuItemStylesByScheme.set(scheme, next);
  return next;
};

const VALID_PLACEHOLDER_KEYS = new Set<MenuItemPlaceholderIconKey>([
  "utensils",
  "drink",
  "burger",
  "pizza",
  "dessert",
  "coffee",
  "salad",
  "seafood",
]);

const resolveFallbackIconKey = (
  item: MenuItemType,
): MenuItemPlaceholderIconKey => {
  const fromPlaceholderField = item.placeholderIcon as
    | MenuItemPlaceholderIconKey
    | undefined;

  if (
    fromPlaceholderField &&
    VALID_PLACEHOLDER_KEYS.has(fromPlaceholderField)
  ) {
    return fromPlaceholderField;
  }

  const fromCardBgColor = extractMenuItemPlaceholderIconKey(item.cardBgColor);
  if (fromCardBgColor) {
    return fromCardBgColor;
  }

  const hintSource = `${item.name} ${
    item.category?.join(" ") || ""
  }`.toLowerCase();

  if (/coffee|espresso|latte|cappuccino|tea/.test(hintSource)) return "coffee";
  if (/soda|drink|juice|cola|lemonade|smoothie|beverage/.test(hintSource))
    return "drink";
  if (/burger|sandwich/.test(hintSource)) return "burger";
  if (/pizza|slice/.test(hintSource)) return "pizza";
  if (/cake|dessert|ice\s*cream|cookie|brownie|sweet/.test(hintSource))
    return "dessert";
  if (/salad|greens/.test(hintSource)) return "salad";
  if (/fish|shrimp|salmon|tuna|seafood/.test(hintSource)) return "seafood";

  return DEFAULT_MENU_ITEM_PLACEHOLDER_ICON;
};

interface MenuItemProps {
  item: MenuItemType;
  imageSource?: ImageSourcePropType;
  /** From FlatList index — viewport rows load first */
  imagePriority?: ImageLoadPriority;
  onOrderClosedCheck?: () => boolean;
  categoryId?: string;
  menuId?: string;
  disabled?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({
  item,
  imageSource,
  imagePriority = "normal",
  onOrderClosedCheck,
  categoryId,
  menuId,
  disabled = false,
}) => {
  const { colorScheme } = useColorScheme();
  const styles = useMemo(() => getStylesForScheme(colorScheme), [colorScheme]);
  const isClockedIn = useTimeclockStore((s) => {
    if (!s.activeEmployeeId) return false;
    return s.sessions[s.activeEmployeeId]?.status === "clockedIn";
  });
  const showClockInWall = useTimeclockStore((s) => s.showClockInWall);
  const showMenuItemPrices = useSettingsStore((s) => s.showMenuItemPrices);
  const showMenuImages = useSettingsStore((s) => s.showMenuImages);

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

  const isReadOnly = useIsActiveOrderReadOnly();
  const isDisabled = disabled || item.availability === false || isReadOnly;

  const handlePressIn = useCallback(() => {
    cancelMenuModifierPreWarm();
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

    // if (!currentOrder?.order_type) {
    //   setMenuBlockedSync(false);
    //   show({
    //     title: "Order Type Required",
    //     message: "Please select an order type before adding items.",
    //     type: "warning",
    //   });
    //   return;
    // }

    if (!isModifierPreWarmed(item.id)) {
      useModifierSidebarStore.getState().preWarm(item, categoryId, menuId);
    }
  }, [
    item,
    categoryId,
    menuId,
    isClockedIn,
    onOrderClosedCheck,
    showClockInWall,
  ]);

  const handlePress = useCallback(() => {
    if (!isMenuBlockedSync()) return;
    const perf = startInteraction("pos.open_modifier_sheet", {
      item_id: item.id,
      has_modifiers: !!hasModifiers,
      prewarmed: isModifierPreWarmed(item.id),
    });
    const { activeOrderId } = useOrderStore.getState();
    useModifierSidebarStore
      .getState()
      .openToAdd(item, activeOrderId, categoryId, menuId);
    perf.endAfterPaint();
  }, [item, categoryId, menuId, hasModifiers]);

  const resolvedImageSource =
    imageSource ?? resolveMenuItemImageSource(item.image);

  const PlaceholderIcon = useMemo(() => {
    const iconKey = resolveFallbackIconKey(item);
    return getMenuItemPlaceholderIcon(iconKey);
  }, [item]);

  return (
    <TouchableOpacity
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPress={handlePress}
      style={[
        styles.container,
        !showMenuImages && styles.containerNoImage,
        isDisabled && styles.containerDisabled,
      ]}
    >
      {/* Modifier triangle corner */}
      {hasModifiers && <View style={styles.modifierCorner} />}

      {/* Image */}
      {showMenuImages && (
        <View style={styles.imageWrapper}>
          {resolvedImageSource ? (
            <OptimizedListImage
              source={resolvedImageSource}
              style={styles.image}
              contentFit="cover"
              priority={imagePriority}
              recyclingKey={`${item.id}:${item.image ?? ""}`}
            />
          ) : (
            <View style={styles.placeholderContainer}>
              <PlaceholderIcon color={`${colors.label}60`} size={16} />
            </View>
          )}
        </View>
      )}

      {/* Divider */}
      {showMenuImages && <View style={styles.divider} />}

      {/* Content */}
      <View style={styles.contentContainer}>
        <Text style={styles.nameText} numberOfLines={2}>
          {item.name}
        </Text>

        {showMenuItemPrices && (
          <View style={styles.priceRow}>
            <Text
              style={
                priceData.hasCustomPricing
                  ? styles.cardPriceCustom
                  : styles.cardPrice
              }
            >
              ${priceData.displayPrice?.toFixed(2)}
            </Text>

            {item.cashPrice && (
              <View style={styles.cashPill}>
                <Text style={styles.cashAmount}>
                  ${item.cashPrice.toFixed(2)}
                </Text>
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
    prevProps.item.image === nextProps.item.image &&
    prevProps.item.cardBgColor === nextProps.item.cardBgColor &&
    prevProps.item.placeholderIcon === nextProps.item.placeholderIcon &&
    prevProps.categoryId === nextProps.categoryId &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.imageSource === nextProps.imageSource &&
    prevProps.imagePriority === nextProps.imagePriority
  );
});
