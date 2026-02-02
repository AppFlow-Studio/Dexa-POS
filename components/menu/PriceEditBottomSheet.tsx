import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  EditingLevel,
  LEVEL_CONFIGS,
  MenuService,
} from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { RotateCcw, X } from "lucide-react-native";
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
> = ({ onSave, onReset }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["80%"], []);

  const [item, setItem] = useState<PriceEditItem | null>(null);
  const [context, setContext] = useState<PriceEditContext>({
    categoryId: null,
    menuId: null,
  });
  const [priceValue, setPriceValue] = useState("");
  const [cashPriceValue, setCashPriceValue] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [lastEditedField, setLastEditedField] = useState<
    "card" | "cash" | null
  >(null);
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

  // Expose methods to parent via ref
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

  // Determine editing level
  const editingLevel: EditingLevel = MenuService.getEditingLevel({
    categoryId: context.categoryId,
    menuId: context.menuId,
  });
  const levelConfig = LEVEL_CONFIGS[editingLevel];
  const resetDescription = MenuService.getResetDescription(editingLevel);
  const canReset = editingLevel > 2;

  // Dual pricing auto-calculation
  const handleCardPriceChange = useCallback(
    (text: string) => {
      const filtered = filterPriceInput(text);
      setPriceValue(filtered);
      setLastEditedField("card");

      if (isDualPricing && filtered) {
        const cardPrice = parseFloat(filtered);
        if (!isNaN(cardPrice)) {
          const calculatedCash =
            cardPrice * (1 - dualPricingPercentage! / 100);
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
          const calculatedCard =
            cashPrice / (1 - dualPricingPercentage! / 100);
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

      // Optimistic update to local store
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

  const renderBackdrop = useMemo(
    () => (props: any) =>
      (
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
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#303030" }}
    >
      <BottomSheetView className="flex-1 p-6">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-bold text-white">Edit Price</Text>
          <TouchableOpacity
            onPress={handleClose}
            className="p-2 bg-[#212121] rounded-full"
          >
            <X size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Level Indicator */}
        <View
          className="p-4 rounded-lg mb-4"
          style={{ backgroundColor: levelConfig.color + "20" }}
        >
          <View className="flex-row items-center gap-2">
            <Text className="text-xl">{levelConfig.icon}</Text>
            <Text
              className="text-lg font-bold"
              style={{ color: levelConfig.color }}
            >
              {levelConfig.label}
            </Text>
          </View>
          <Text className="text-base text-gray-400 mt-1">
            {levelConfig.description}
          </Text>
        </View>

        {/* Item Name */}
        {item && (
          <Text className="text-xl text-white font-semibold mb-4">
            {item.name}
          </Text>
        )}

        {/* Dual Pricing Indicator */}
        {isDualPricing && (
          <View className="bg-purple-900/30 border border-purple-500 rounded-lg px-3 py-2 mb-4">
            <Text className="text-purple-300 text-base font-medium">
              Dual Pricing Active ({dualPricingPercentage}% cash discount)
            </Text>
          </View>
        )}

        {/* Card Price Input */}
        <View className="mb-3">
          <Text className="text-base text-gray-400 mb-2">
            Card Price
          </Text>
          <View className="flex-row items-center bg-[#212121] rounded-lg border border-gray-600 px-4 py-3">
            <Text className="text-2xl text-white mr-2">$</Text>
            <BottomSheetTextInput
              value={priceValue}
              onChangeText={handleCardPriceChange}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#6B7280"
              style={{
                flex: 1,
                fontSize: 24,
                color: "white",
              }}
            />
          </View>
        </View>

        {/* Cash Price Input */}
        <View className="mb-3">
          <Text className="text-base text-gray-400 mb-2">
            Cash Price
            {isDualPricing && lastEditedField === "card" && (
              <Text className="text-purple-400"> (auto-calculated)</Text>
            )}
          </Text>
          <View className="flex-row items-center bg-[#212121] rounded-lg border border-gray-600 px-4 py-3">
            <Text className="text-2xl text-white mr-2">$</Text>
            <BottomSheetTextInput
              value={cashPriceValue}
              onChangeText={handleCashPriceChange}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#6B7280"
              style={{
                flex: 1,
                fontSize: 24,
                color: "white",
              }}
            />
          </View>
        </View>

        {/* Availability Toggle */}
        <View className="flex-row items-center justify-between bg-[#212121] rounded-lg border border-gray-600 px-4 py-3 mb-4">
          <Text className="text-lg text-white">Available</Text>
          <Switch
            value={isAvailable}
            onValueChange={setIsAvailable}
            trackColor={{ false: "#4B5563", true: "#10B981" }}
            thumbColor="white"
          />
        </View>

        {/* Error Message */}
        {error && (
          <View className="bg-red-900/30 border border-red-500 rounded-lg p-3 mb-4">
            <Text className="text-red-400">{error}</Text>
          </View>
        )}

        {/* Reset Button (only for Level 4 & 5) */}
        {canReset && resetDescription && (
          <TouchableOpacity
            onPress={handleReset}
            disabled={isLoading}
            className="flex-row items-center justify-center bg-[#212121] border border-gray-600 rounded-lg py-3 mb-4"
          >
            <RotateCcw size={20} color="#9CA3AF" />
            <Text className="text-gray-300 text-lg ml-2">
              {resetDescription}
            </Text>
          </TouchableOpacity>
        )}

        {/* Action Buttons */}
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={handleClose}
            disabled={isLoading}
            className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-4"
          >
            <Text className="text-center text-white text-lg font-semibold">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isLoading}
            className="flex-1 bg-blue-600 rounded-lg py-4"
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-center text-white text-lg font-semibold">
                Save
              </Text>
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
