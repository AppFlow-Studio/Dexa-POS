import { RecipeItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { ChefHat, Plus, Trash2 } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import RecipeIngredientSheet from "./RecipeIngredientSheet";

interface RecipeManagerProps {
  recipe: RecipeItem[];
  onUpdate: (newRecipe: RecipeItem[]) => void;
  editable?: boolean;
}

const RecipeManager: React.FC<RecipeManagerProps> = ({
  recipe,
  onUpdate,
  editable = true,
}) => {
  const { inventoryItems } = useInventoryStore();
  const sheetRef = useRef<BottomSheet>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Local state for exact string input of quantities (to allow decimals like "0." while typing)
  const [localQuantities, setLocalQuantities] = useState<
    Record<string, string>
  >({});

  const getInventoryItem = (id: string) =>
    inventoryItems.find((i) => i.id === id);

  const handleSelect = (inventoryItemId: string) => {
    if (editingIndex !== null) {
      const oldItemId = recipe[editingIndex].inventoryItemId;
      const updated = [...recipe];
      updated[editingIndex] = { ...updated[editingIndex], inventoryItemId };

      // Transfer local quantity string if it exists
      if (localQuantities[oldItemId]) {
        setLocalQuantities((prev) => {
          const next = { ...prev };
          next[inventoryItemId] = next[oldItemId];
          delete next[oldItemId];
          return next;
        });
      }

      onUpdate(updated);
      setEditingIndex(null);
    } else {
      if (recipe.some((r) => r.inventoryItemId === inventoryItemId)) {
        return;
      }
      onUpdate([...recipe, { inventoryItemId, quantity: 1 }]);
    }
  };

  const handleQuantityChange = (text: string, index: number) => {
    const item = recipe[index];

    // Update local string state
    setLocalQuantities((prev) => ({
      ...prev,
      [item.inventoryItemId]: text,
    }));

    // Update parent state with parsed number
    const updated = [...recipe];
    updated[index] = { ...updated[index], quantity: parseFloat(text) || 0 };
    onUpdate(updated);
  };

  const removeItem = (index: number) => {
    const itemToRemove = recipe[index];

    // Clean up local state
    setLocalQuantities((prev) => {
      const next = { ...prev };
      delete next[itemToRemove.inventoryItemId];
      return next;
    });

    const updated = [...recipe];
    updated.splice(index, 1);
    onUpdate(updated);
  };

  return (
    <View className="flex-1 gap-y-4">
      {recipe.length === 0 ? (
        <View className="bg-[#212121] rounded-2xl p-8 items-center border border-gray-800 border-dashed">
          <View className="w-16 h-16 bg-gray-800 rounded-full items-center justify-center mb-4">
            <ChefHat size={32} color="#4B5563" />
          </View>
          <Text className="text-gray-400 text-center mb-2 text-lg font-medium">
            No ingredients added
          </Text>
          <Text className="text-gray-500 text-center mb-6 text-sm">
            Add inventory items to build your recipe
          </Text>
          {editable && (
            <TouchableOpacity
              onPress={() => {
                setEditingIndex(null);
                sheetRef.current?.expand();
              }}
              className="bg-blue-600 px-6 py-3 rounded-xl flex-row items-center"
            >
              <Plus color="white" size={20} />
              <Text className="text-white ml-2 font-bold text-base">
                Add Ingredient
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View className="gap-y-3">
          {recipe.map((item, index) => {
            const inventoryItem = getInventoryItem(item.inventoryItemId);
            return (
              <View
                key={index}
                className="bg-[#212121] rounded-2xl p-4 border border-gray-800"
              >
                <View className="flex-row items-center gap-4">
                  <TouchableOpacity
                    disabled={!editable}
                    className="flex-1"
                    onPress={() => {
                      setEditingIndex(index);
                      sheetRef.current?.expand();
                    }}
                  >
                    <View>
                      <Text className="font-bold text-white text-lg">
                        {inventoryItem?.name || "Unknown Item"}
                      </Text>
                      <View className="flex-row items-center mt-1">
                        <View className="bg-gray-800 px-2 py-0.5 rounded">
                          <Text className="text-gray-400 text-xs font-medium lowercase">
                            {inventoryItem?.unit || "unit"}
                          </Text>
                        </View>
                        <Text className="text-gray-600 mx-2 text-xs">•</Text>
                        <Text className="text-blue-400/80 text-xs font-medium">
                          ${inventoryItem?.cost?.toFixed(2) || "0.00"}
                        </Text>
                        {editable && (
                          <>
                            <Text className="text-gray-600 mx-2 text-xs">
                              •
                            </Text>
                            <Text className="text-gray-500 text-xs">
                              Tap to replace
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View className="w-28">
                    <Text className="text-gray-500 text-[10px] mb-1 uppercase tracking-tighter text-center font-bold">
                      Qty ({inventoryItem?.unit || "unit"})
                    </Text>
                    <TextInput
                      editable={editable}
                      value={
                        localQuantities[item.inventoryItemId] ??
                        item.quantity.toString()
                      }
                      onChangeText={(text) => handleQuantityChange(text, index)}
                      keyboardType="numeric"
                      className="bg-[#303030] border border-gray-700 text-white px-3 py-2 rounded-xl text-center h-12 text-base font-semibold"
                      placeholder="0"
                      placeholderTextColor="#4B5563"
                    />
                  </View>

                  {editable && (
                    <TouchableOpacity
                      onPress={() => removeItem(index)}
                      className="bg-red-900/10 border border-red-900/30 p-3 rounded-xl"
                    >
                      <Trash2 color="#EF4444" size={20} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {editable && (
            <TouchableOpacity
              onPress={() => {
                setEditingIndex(null);
                sheetRef.current?.expand();
              }}
              className="bg-[#212121] border-2 border-dashed border-gray-800 rounded-2xl p-4 items-center flex-row justify-center"
            >
              <Plus color="#4B5563" size={20} />
              <Text className="text-gray-500 ml-2 font-bold text-base">
                Add Another Ingredient
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Sheet */}
      <RecipeIngredientSheet
        ref={sheetRef}
        existingIds={recipe.map((r) => r.inventoryItemId)}
        currentId={
          editingIndex !== null ? recipe[editingIndex].inventoryItemId : null
        }
        onSelect={handleSelect}
      />
    </View>
  );
};

export default RecipeManager;
