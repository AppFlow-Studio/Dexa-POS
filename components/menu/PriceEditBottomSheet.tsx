import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  EditingLevel,
  LEVEL_CONFIGS,
  MenuService,
} from "@/services/menuService";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { RotateCcw, Trash2, X } from "lucide-react-native";
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
> = ({ onSave, onReset, onDelete }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["65%"], []);

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
      <BottomSheetView style={{ flex: 1, padding: 16 }}>

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

      </BottomSheetView>
    </BottomSheet>
  );
};

const PriceEditBottomSheet = forwardRef(PriceEditBottomSheetComponent);
PriceEditBottomSheet.displayName = "PriceEditBottomSheet";

export default PriceEditBottomSheet;
