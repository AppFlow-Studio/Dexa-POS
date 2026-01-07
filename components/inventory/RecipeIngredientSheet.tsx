import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Package, Search, X } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

export type RecipeIngredientSheetRef = BottomSheet;

interface Props {
  onSelect: (inventoryItemId: string) => void;
  existingIds?: string[];
  currentId?: string | null;
}

const RecipeIngredientSheet = forwardRef<RecipeIngredientSheetRef, Props>(
  ({ onSelect, existingIds = [], currentId = null }, ref) => {
    const snapPoints = useMemo(() => ["95%"], []);
    const renderBackdrop = useMemo(
      () => (backdropProps: any) =>
        (
          <BottomSheetBackdrop
            {...backdropProps}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        ),
      []
    );

    const { inventoryItems } = useInventoryStore();
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(currentId);

    const filtered = useMemo(() => {
      if (!search.trim()) return inventoryItems;
      const q = search.toLowerCase();
      return inventoryItems.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q)
      );
    }, [search, inventoryItems]);

    const handleSelect = (id: string) => {
      onSelect(id);
      setSelectedId(id);
      (ref as any)?.current?.close?.();
    };

    return (
      <BottomSheet
        ref={ref as any}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        backgroundStyle={{ backgroundColor: "#212121" }}
        handleIndicatorStyle={{ backgroundColor: "#4B5563" }}
        backdropComponent={renderBackdrop}
        topInset={60}
      >
        <BottomSheetView className="flex-1 w-full bg-[#212121]">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-800">
            <View>
              <Text className="text-white text-xl font-bold">
                Add Ingredient
              </Text>
              <Text className="text-gray-400 text-sm mt-0.5">
                Select an item from inventory
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => (ref as any)?.current?.close?.()}
              className="p-2 bg-gray-800 rounded-full"
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View className="p-4 bg-[#212121]">
            <View className="flex-row items-center bg-[#303030] border border-gray-700 rounded-xl px-3 py-2">
              <Search size={20} color="#9CA3AF" />
              <BottomSheetTextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name or category..."
                placeholderTextColor="#9CA3AF"
                className="flex-1 ml-3 text-white text-base h-10"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <X size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* List */}
          <View className="flex-1 w-full bg-[#212121]">
            {filtered.length === 0 ? (
              <View className="flex-1 items-center justify-center p-8 opacity-50">
                <Package size={48} color="#4B5563" />
                <Text className="text-gray-500 text-lg font-medium mt-4">
                  No items found
                </Text>
                <Text className="text-gray-600 text-center mt-2">
                  Try searching for something else
                </Text>
              </View>
            ) : (
              <BottomSheetScrollView
                className="flex-1 w-full"
                contentContainerStyle={{ paddingBottom: 40 }}
              >
                {filtered.map((item) => {
                  const isSelected = selectedId === item.id;
                  const isAdded =
                    existingIds.includes(item.id) && item.id !== currentId;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      disabled={isAdded}
                      onPress={() => handleSelect(item.id)}
                      className={`mx-4 mb-2 p-3 rounded-xl border ${
                        isSelected
                          ? "bg-blue-900/20 border-blue-500"
                          : isAdded
                          ? "bg-[#252525] border-gray-800 opacity-50"
                          : "bg-[#303030] border-gray-700"
                      }`}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2 mb-1">
                            <Text
                              className={`text-lg font-semibold ${
                                isSelected ? "text-blue-400" : "text-white"
                              }`}
                            >
                              {item.name}
                            </Text>
                          </View>

                          <View className="flex-row items-center gap-3">
                            <View className="flex-row items-center bg-gray-800/50 px-2 py-1 rounded-md">
                              <Text className="text-gray-400 text-xs uppercase tracking-wider font-medium mr-1.5">
                                Category
                              </Text>
                              <Text className="text-gray-300 text-xs font-medium">
                                {item.category}
                              </Text>
                            </View>

                            <Text className="text-gray-500 text-xs">•</Text>

                            <Text className="text-gray-400 text-xs">
                              {item.stockQuantity} {item.unit} in stock
                            </Text>
                          </View>
                        </View>

                        {/* Status Badge */}
                        <View className="ml-3">
                          {isSelected && (
                            <View className="w-6 h-6 bg-blue-500 rounded-full items-center justify-center">
                              <Text className="text-white text-xs font-bold">
                                ✓
                              </Text>
                            </View>
                          )}
                          {!isSelected && isAdded && (
                            <View className="bg-gray-700 px-2 py-1 rounded">
                              <Text className="text-gray-400 text-xs font-medium">
                                Added
                              </Text>
                            </View>
                          )}
                          {!isSelected && !isAdded && (
                            <View className="w-6 h-6 rounded-full border border-gray-600" />
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </BottomSheetScrollView>
            )}
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

RecipeIngredientSheet.displayName = "RecipeIngredientSheet";

export default RecipeIngredientSheet;
