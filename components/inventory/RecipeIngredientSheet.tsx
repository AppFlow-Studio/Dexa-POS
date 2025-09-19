import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import React, { forwardRef, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export type RecipeIngredientSheetRef = BottomSheet;

interface Props {
    onSelect: (inventoryItemId: string) => void;
    existingIds?: string[];
    currentId?: string | null;
}

const RecipeIngredientSheet = forwardRef<RecipeIngredientSheetRef, Props>(({ onSelect, existingIds = [], currentId = null }, ref) => {
    const snapPoints = useMemo(() => ["85%"], []);
    const renderBackdrop = useMemo(
        () => (backdropProps: any) => (
            <BottomSheetBackdrop {...backdropProps} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />
        ),
        []
    );

    const { inventoryItems } = useInventoryStore();
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(currentId);

    const filtered = useMemo(() => {
        if (!search.trim()) return inventoryItems;
        const q = search.toLowerCase();
        return inventoryItems.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
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
            enablePanDownToClose
            backgroundStyle={{ backgroundColor: "#303030" }}
            handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
            backdropComponent={renderBackdrop}
        >
            <BottomSheetView className="flex-1 h-full w-full">
                <View className="p-4 border-b border-gray-700">
                    <Text className="text-white text-2xl font-bold">Add Ingredient</Text>
                    <Text className="text-gray-400 mt-1">Select an inventory item and set quantity</Text>
                </View>

                <View className="p-4">
                    <BottomSheetTextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search inventory..."
                        placeholderTextColor="#9CA3AF"
                        className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-white text-lg"
                    />
                </View>

                <View className="flex-1 w-full h-full">
                    <ScrollView
                        className="flex-1 w-full h-full"
                    >
                        {filtered.map((item) => {
                            const isSelected = selectedId === item.id;
                            const isAdded = existingIds.includes(item.id) && item.id !== currentId;
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    disabled={isAdded}
                                    onPress={() => handleSelect(item.id)}
                                    className={`px-4 py-3 border-b border-gray-700 ${isSelected ? "bg-blue-900/20" : isAdded ? "opacity-50" : ""}`}
                                >
                                    <View className="flex-row items-center justify-between">
                                        <View>
                                            <Text className="text-2xl text-white">{item.name}</Text>
                                            <Text className="text-xl text-gray-400">{item.category} • {item.unit}</Text>
                                        </View>
                                        {isSelected && (
                                            <View className="px-3 py-1 rounded bg-blue-900/30 border border-blue-500">
                                                <Text className="text-blue-400">Selected</Text>
                                            </View>
                                        )}
                                        {!isSelected && isAdded && (
                                            <View className="px-3 py-1 rounded bg-gray-700 border border-gray-600">
                                                <Text className="text-gray-300">Added</Text>
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                <View className="p-4 border-t border-gray-700 bg-[#303030]">
                    <TouchableOpacity onPress={() => (ref as any)?.current?.close?.()} className="w-full py-3 bg-gray-600 rounded-lg">
                        <Text className="text-white text-center text-xl font-semibold">Close</Text>
                    </TouchableOpacity>
                </View>
            </BottomSheetView>
        </BottomSheet>
    );
});

RecipeIngredientSheet.displayName = "RecipeIngredientSheet";

export default RecipeIngredientSheet;


