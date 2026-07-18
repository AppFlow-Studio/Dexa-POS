import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  EditingLevel,
  LEVEL_CONFIGS,
  MenuService,
} from "@/services/menuService";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { isActivelySnoozed } from "@/lib/snoozeDurations";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Ban, Check, RotateCcw, Trash2, X } from "lucide-react-native";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export interface PriceEditItem {
  id: string;
  name: string;
  currentPrice: number;
  currentCashPrice?: number;
  currentAvailability?: boolean;
  snoozedUntil?: string | null;
}

export interface PriceEditContext {
  categoryId?: string | null;
  menuId?: string | null;
}

export interface PriceEditBottomSheetRef {
  open: (item: PriceEditItem, context: PriceEditContext) => void;
  close: () => void;
}

interface PriceEditBottomSheetProps {
  onSave: (itemId: string, newPrice: number) => void;
  onReset?: (itemId: string) => void;
  onDelete?: (itemId: string, itemName: string) => void;
  /**
   * Hand off to the 86 / out-of-stock flow. Used for the item itself and for
   * its individual modifier options/groups (all get the timed snooze flow).
   */
  onSnooze?: (item: {
    id: string;
    name: string;
    snoozedUntil?: string | null;
    kind?: "item" | "modifier-option" | "modifier-group";
    optionIds?: string[];
  }) => void;
}

const filterPriceInput = (text: string): string => {
  const filtered = text.replace(/[^0-9.]/g, "");
  const parts = filtered.split(".");
  if (parts.length > 2) {
    return parts[0] + "." + parts.slice(1).join("");
  }
  return filtered;
};

const PriceEditBottomSheetComponent: React.ForwardRefRenderFunction<
  PriceEditBottomSheetRef,
  PriceEditBottomSheetProps
> = ({ onSave, onReset, onDelete, onSnooze }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null);

  const [item, setItem] = useState<PriceEditItem | null>(null);
  const [context, setContext] = useState<PriceEditContext>({
    categoryId: null,
    menuId: null,
  });
  const [priceValue, setPriceValue] = useState("");
  const [cashPriceValue, setCashPriceValue] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [lastEditedField, setLastEditedField] = useState<"card" | "cash" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useSupabaseClient();
  const triggerPosSync = useTriggerPosSync();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const locationId = selectedStore?.id;
  const pricingStrategy = selectedStore?.pricing_strategy;
  const dualPricingPercentage = selectedStore?.dual_pricing_percentage;

  const isDualPricing =
    pricingStrategy === "dual" &&
    typeof dualPricingPercentage === "number" &&
    dualPricingPercentage > 0;

  // The modifier groups attached to this item — surfaced so the item's
  // modifier options can be 86'd per-location right from the slide-up (mirrors
  // the website's edit-item form). Read reactively so toggles update live.
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  const menuItemsById = useMenuStore((s) => s.menuItemsById);
  const itemGroups = useMemo(() => {
    if (!item) return [];
    const ids = menuItemsById[item.id]?.modifierGroupIds ?? [];
    if (!ids.length) return [];
    const idSet = new Set(ids);
    return modifierGroups.filter((g) => idSet.has(g.id));
  }, [item, menuItemsById, modifierGroups]);

  const snapPoints = useMemo(
    () => (itemGroups.length > 0 ? ["88%"] : ["65%"]),
    [itemGroups.length],
  );

  const itemSnoozed = isActivelySnoozed(item?.snoozedUntil);

  useImperativeHandle(ref, () => ({
    open: (newItem: PriceEditItem, newContext: PriceEditContext) => {
      setItem(newItem);
      setContext(newContext);
      setPriceValue(newItem.currentPrice.toFixed(2));
      setCashPriceValue(
        newItem.currentCashPrice != null
          ? newItem.currentCashPrice.toFixed(2)
          : ""
      );
      setIsAvailable(newItem.currentAvailability !== false);
      setLastEditedField(null);
      setError(null);
      bottomSheetRef.current?.expand();
    },
    close: () => {
      bottomSheetRef.current?.close();
    },
  }));

  const editingLevel: EditingLevel = MenuService.getEditingLevel({
    categoryId: context.categoryId,
    menuId: context.menuId,
  });
  const levelConfig = LEVEL_CONFIGS[editingLevel];
  const resetDescription = MenuService.getResetDescription(editingLevel);
  const canReset = editingLevel > 2;

  const handleCardPriceChange = useCallback(
    (text: string) => {
      const filtered = filterPriceInput(text);
      setPriceValue(filtered);
      setLastEditedField("card");
      if (isDualPricing && filtered) {
        const cardPrice = parseFloat(filtered);
        if (!isNaN(cardPrice)) {
          const calculatedCash = cardPrice * (1 - dualPricingPercentage! / 100);
          setCashPriceValue(calculatedCash.toFixed(2));
        }
      }
    },
    [isDualPricing, dualPricingPercentage]
  );

  const handleCashPriceChange = useCallback(
    (text: string) => {
      const filtered = filterPriceInput(text);
      setCashPriceValue(filtered);
      setLastEditedField("cash");
      if (isDualPricing && filtered) {
        const cashPrice = parseFloat(filtered);
        if (!isNaN(cashPrice)) {
          const calculatedCard = cashPrice / (1 - dualPricingPercentage! / 100);
          setPriceValue(calculatedCard.toFixed(2));
        }
      }
    },
    [isDualPricing, dualPricingPercentage]
  );

  const handleClose = useCallback(() => {
    bottomSheetRef.current?.close();
  }, []);

  const handleSave = async () => {
    if (!item || !locationId) {
      setError("Missing item or location information");
      return;
    }

    const price = parseFloat(priceValue);
    if (isNaN(price) || price < 0) {
      setError("Please enter a valid card price");
      return;
    }

    let cashPrice: number | null = null;
    if (cashPriceValue.trim() !== "") {
      cashPrice = parseFloat(cashPriceValue);
      if (isNaN(cashPrice) || cashPrice < 0) {
        setError("Please enter a valid cash price");
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: updateError } = await MenuService.updateItemPrice(
        supabase,
        {
          menuItemId: item.id,
          categoryId: context.categoryId,
          menuId: context.menuId,
          locationId,
          price,
          cashPrice,
          availability: isAvailable,
        }
      );

      if (updateError) {
        setError(updateError.message || "Failed to update price");
        return;
      }

      useMenuStore.getState().updateItemPriceOptimistic(item.id, price, {
        categoryId: context.categoryId ?? null,
        menuId: context.menuId ?? null,
        cashPrice,
        availability: isAvailable,
      });

      onSave(item.id, price);
      if (locationId) triggerPosSync(locationId);
      handleClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!item || !locationId) return;
    const targetLevel = MenuService.getResetTargetLevel(editingLevel);
    if (!targetLevel) return;

    setIsLoading(true);
    setError(null);

    try {
      const { error: resetError } = await MenuService.resetItemPrice(supabase, {
        menuItemId: item.id,
        categoryId: context.categoryId,
        menuId: context.menuId,
        locationId,
        targetLevel,
      });

      if (resetError) {
        setError(resetError.message || "Failed to reset price");
        return;
      }

      onReset?.(item.id);
      if (locationId) triggerPosSync(locationId);
      handleClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;
    handleClose();
    onDelete?.(item.id, item.name);
  };

  const handle86 = () => {
    if (!item) return;
    handleClose();
    onSnooze?.({
      id: item.id,
      name: item.name,
      snoozedUntil: item.snoozedUntil,
    });
  };

  // 86 a modifier option / group with the same timed snooze flow as items.
  const handleModifierSnooze = (target: {
    id: string;
    name: string;
    snoozedUntil?: string | null;
    kind: "modifier-option" | "modifier-group";
    optionIds?: string[];
  }) => {
    handleClose();
    onSnooze?.(target);
  };

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      {...bottomSheetTheme}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
      >

        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
              Edit Item
            </Text>
            {item && (
              <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
                {item.name}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {onDelete && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isLoading}
                style={{
                  padding: 7,
                  backgroundColor: colors.danger + "15",
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.danger + "30",
                }}
              >
                <Trash2 size={15} color={colors.danger} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleClose}
              style={{
                padding: 7,
                backgroundColor: colors.teal + "10",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal + "30",
              }}
            >
              <X size={15} color={colors.teal} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Level Badge */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: levelConfig.color + "15",
            borderWidth: 1,
            borderColor: levelConfig.color + "30",
            marginBottom: 14,
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ fontSize: 13 }}>{levelConfig.icon}</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: levelConfig.color }}>
            {levelConfig.label}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            — {levelConfig.description}
          </Text>
        </View>

        {/* Dual Pricing Badge */}
        {isDualPricing && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.info + "15",
              borderWidth: 1,
              borderColor: colors.info + "30",
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.info, fontWeight: "600" }}>
              Dual Pricing Active — {dualPricingPercentage}% cash discount
            </Text>
          </View>
        )}

        {/* Price Row */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
          {/* Card Price */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Card Price
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.screen,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 10,
                paddingVertical: 8,
                opacity: isDualPricing ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.teal, marginRight: 4 }}>$</Text>
              <BottomSheetTextInput
                value={priceValue}
                onChangeText={handleCardPriceChange}
                editable={!isDualPricing}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.heading }}
              />
            </View>
          </View>

          {/* Cash Price */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Cash Price{isDualPricing && lastEditedField === "card" ? "  (auto)" : ""}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.screen,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.label, marginRight: 4 }}>$</Text>
              <BottomSheetTextInput
                value={cashPriceValue}
                onChangeText={handleCashPriceChange}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.heading }}
              />
            </View>
          </View>
        </View>

        {/* Availability Row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.screen,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 14,
          }}
        >
          <View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>Available</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {isAvailable ? "Visible on menu" : "Hidden from menu"}
            </Text>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={setIsAvailable}
            trackColor={{ false: colors.border, true: colors.teal + "80" }}
            thumbColor={isAvailable ? colors.teal : colors.label}
          />
        </View>

        {/* 86 / Out of stock — filled red when the item IS out of stock (status),
            outlined when in stock (action). Taps into the timed snooze flow. */}
        {onSnooze && (
          <TouchableOpacity
            onPress={handle86}
            disabled={isLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: itemSnoozed ? colors.danger : colors.danger + "12",
              borderWidth: 1,
              borderColor: itemSnoozed ? colors.danger : colors.danger + "35",
              borderRadius: 8,
              paddingVertical: 10,
              marginBottom: 14,
            }}
          >
            <Ban size={14} color={itemSnoozed ? colors.onSolid : colors.danger} />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: itemSnoozed ? colors.onSolid : colors.danger,
              }}
            >
              {itemSnoozed
                ? "Out of Stock · Tap to Manage"
                : "Mark Out of Stock (86)"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Modifiers — 86 the item's modifier options per location, right from
            the slide-up (mirrors the website's edit-item form). */}
        {itemGroups.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: colors.muted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Modifiers
            </Text>
            <View style={{ gap: 8 }}>
              {itemGroups.map((group) => {
                const options = Array.isArray(group.options)
                  ? group.options
                  : [];
                const optionIds = options.map((o) => o.id);
                const snoozedCount = options.filter((o) =>
                  isActivelySnoozed(o.snoozedUntil),
                ).length;
                const total = options.length;
                const groupOutOfStock = total > 0 && snoozedCount === total;
                const anySnoozed = snoozedCount > 0;
                const groupStatusLabel = groupOutOfStock
                  ? "All out of stock"
                  : anySnoozed
                    ? `${snoozedCount}/${total} out of stock`
                    : "In stock";
                return (
                  <View
                    key={group.id}
                    style={{
                      backgroundColor: colors.screen,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: options.length > 0 ? 8 : 0,
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.heading,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {group.name}
                      </Text>
                      {optionIds.length > 0 && (
                        <TouchableOpacity
                          onPress={() =>
                            handleModifierSnooze({
                              id: group.id,
                              name: group.name,
                              kind: "modifier-group",
                              optionIds,
                              snoozedUntil: groupOutOfStock ? "infinity" : null,
                            })
                          }
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 5,
                            paddingHorizontal: 8,
                            paddingVertical: 5,
                            borderRadius: 6,
                            backgroundColor: anySnoozed
                              ? colors.danger + "18"
                              : colors.success + "12",
                            borderWidth: 1,
                            borderColor: anySnoozed
                              ? colors.danger + "40"
                              : colors.success + "30",
                          }}
                        >
                          {anySnoozed ? (
                            <Ban size={12} color={colors.danger} />
                          ) : (
                            <Check size={12} color={colors.success} />
                          )}
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "700",
                              color: anySnoozed
                                ? colors.danger
                                : colors.success,
                            }}
                          >
                            {groupStatusLabel}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {options.map((o) => {
                      const snoozed = isActivelySnoozed(o.snoozedUntil);
                      return (
                        <View
                          key={o.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingVertical: 4,
                            gap: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.heading,
                              opacity: snoozed ? 0.6 : 1,
                              flex: 1,
                            }}
                            numberOfLines={1}
                          >
                            {o.name}
                            {o.price > 0 && (
                              <Text style={{ color: colors.teal }}>
                                {"  +"}${o.price.toFixed(2)}
                              </Text>
                            )}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              handleModifierSnooze({
                                id: o.id,
                                name: o.name,
                                kind: "modifier-option",
                                snoozedUntil: o.snoozedUntil,
                              })
                            }
                            hitSlop={6}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 5,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                              backgroundColor: snoozed
                                ? colors.danger + "18"
                                : colors.success + "12",
                              borderWidth: 1,
                              borderColor: snoozed
                                ? colors.danger + "40"
                                : colors.success + "30",
                            }}
                          >
                            {snoozed ? (
                              <Ban size={11} color={colors.danger} />
                            ) : (
                              <Check size={11} color={colors.success} />
                            )}
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: snoozed
                                  ? colors.danger
                                  : colors.success,
                              }}
                            >
                              {snoozed ? "Out of stock" : "In stock"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Error */}
        {error && (
          <View
            style={{
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "30",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text>
          </View>
        )}

        {/* Reset */}
        {canReset && resetDescription && (
          <TouchableOpacity
            onPress={handleReset}
            disabled={isLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingVertical: 8,
              marginBottom: 10,
            }}
          >
            <RotateCcw size={13} color={colors.label} />
            <Text style={{ fontSize: 12, color: colors.label }}>{resetDescription}</Text>
          </TouchableOpacity>
        )}

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={handleClose}
            disabled={isLoading}
            style={{
              flex: 1,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isLoading}
            style={{
              flex: 2,
              backgroundColor: colors.teal,
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.onSolid} size="small" />
            ) : (
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSolid }}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const PriceEditBottomSheet = forwardRef(PriceEditBottomSheetComponent);
PriceEditBottomSheet.displayName = "PriceEditBottomSheet";

export default PriceEditBottomSheet;
