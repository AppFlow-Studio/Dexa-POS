import ScheduleEditor from "@/components/menu/ScheduleEditor";
import { CustomPricing, MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Check,
  DollarSign,
  Edit,
  Minus,
  Plus,
  Save,
  Trash2,
  Utensils,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
// Get image source for preview
const getImageSource = (image: string | undefined) => {
  if (image && image.length > 200) {
    return { uri: `data:image/jpeg;base64,${image}` };
  }

  if (image) {
    // Try to get image from assets
    try {
      return { uri: `@/assets/images/${image}` };
    } catch {
      return undefined;
    }
  }

  return undefined;
};
const EditCategoryScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    categories,
    menuItems,
    updateCategory,
    deleteCategory,
    addItemToCategory,
    removeItemFromCategory,
    addCustomPricing,
    updateCustomPricing,
    deleteCustomPricing,
    toggleCustomPricingActive,
    getItemPriceForCategory,
  } = useMenuStore();

  const existing = useMemo(
    () => categories.find((c) => c.id === id),
    [id, categories]
  );
  const allItems = menuItems;

  const [name, setName] = useState(existing?.name || "");
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [schedules, setSchedules] = useState(existing?.schedules ?? []);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(() => {
    if (!existing) return [];
    return allItems
      .filter((item) => {
        const cats = Array.isArray(item.category)
          ? item.category
          : item.category
            ? [item.category]
            : [];
        return cats.includes(existing.name);
      })
      .map((i) => i.id);
  });
  const [editingPricing, setEditingPricing] = useState<{
    itemId: string;
    pricing: CustomPricing;
  } | null>(null);
  const [newPricing, setNewPricing] = useState<{
    itemId: string;
    price: number;
  } | null>(null);

  const toggleItem = (item: MenuItemType) => {
    setSelectedItemIds((prev) =>
      prev.includes(item.id)
        ? prev.filter((id) => id !== item.id)
        : [...prev, item.id]
    );
  };

  // Custom pricing functions
  const handleAddCustomPricing = (itemId: string) => {
    const item = allItems.find((i) => i.id === itemId);
    if (item && existing) {
      setNewPricing({ itemId, price: item.price });
    }
  };

  const handleSaveCustomPricing = () => {
    if (!newPricing || !existing) return;

    addCustomPricing(newPricing.itemId, {
      categoryId: existing.id,
      categoryName: existing.name,
      price: newPricing.price,
      isActive: true,
    });
    setNewPricing(null);
  };

  const handleUpdateCustomPricing = () => {
    if (!editingPricing) return;

    updateCustomPricing(editingPricing.itemId, editingPricing.pricing.id, {
      price: editingPricing.pricing.price,
    });
    setEditingPricing(null);
  };

  const handleDeleteCustomPricing = (itemId: string, pricingId: string) => {
    Alert.alert(
      "Delete Custom Pricing",
      "Are you sure you want to delete this custom pricing?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCustomPricing(itemId, pricingId),
        },
      ]
    );
  };

  const handleToggleCustomPricingActive = (
    itemId: string,
    pricingId: string
  ) => {
    toggleCustomPricingActive(itemId, pricingId);
  };

  const handleSave = async () => {
    if (!existing) return;
    if (!name.trim()) {
      Alert.alert("Validation", "Name is required");
      return;
    }
    // Update category name and active status
    updateCategory(existing.id, { name: name.trim(), isActive, schedules });

    // Sync items membership
    const beforeItemIds = allItems
      .filter((item) => {
        const cats = Array.isArray(item.category)
          ? item.category
          : item.category
            ? [item.category]
            : [];
        return cats.includes(existing.name);
      })
      .map((i) => i.id);

    // Removed
    beforeItemIds
      .filter((id) => !selectedItemIds.includes(id))
      .forEach((id) => removeItemFromCategory(id, existing.name));
    // Added
    selectedItemIds
      .filter((id) => !beforeItemIds.includes(id))
      .forEach((id) => addItemToCategory(id, name.trim()));

    await new Promise((r) => setTimeout(r, 400));
    router.replace({ pathname: "/menu", params: { tab: "categories" } });
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert("Delete Category", `Delete "${existing.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteCategory(existing.id);
          router.replace({ pathname: "/menu", params: { tab: "categories" } });
        },
      },
    ]);
  };

  if (!existing) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center p-6">
        <Text className="text-2xl text-white">Category not found.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 bg-[#303030] rounded border border-gray-600"
        >
          <Text className="text-xl text-gray-300">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="flex-row items-center justify-between p-6 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={24} color="#9CA3AF" />
          <Text className="text-2xl text-white font-medium ml-2">Back</Text>
        </TouchableOpacity>
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={handleDelete}
            className="px-6 py-3 rounded-lg border border-red-500 bg-red-900/30"
          >
            <Text className="text-2xl text-red-400">Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="px-6 py-3 rounded-lg bg-blue-600"
          >
            <Text className="text-2xl text-white">Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 p-6">
        <Text className="text-3xl font-bold text-white mb-6">
          Edit Category
        </Text>

        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-3">Name</Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white"
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="mb-6">
          {/* Selected Items Summary */}
          {selectedItemIds.length > 0 && (
            <View className="mb-6">
              <Text className="text-2xl font-semibold text-white mb-4">
                Selected Items ({selectedItemIds.length})
              </Text>
              <View className="bg-[#303030] border border-gray-600 rounded-lg p-6">
                <View className="flex-row flex-wrap gap-2">
                  {selectedItemIds.map((itemId) => {
                    const item = allItems.find(
                      (i: MenuItemType) => i.id === itemId
                    );
                    return item ? (
                      <View
                        key={itemId}
                        className="flex-row items-center bg-blue-600/20 border border-blue-500 px-4 py-3 rounded-lg"
                      >
                        <Text className="text-blue-400 text-xl font-medium">
                          {item.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() => toggleItem(item)}
                          className="ml-2"
                        >
                          <X size={18} color="#60A5FA" />
                        </TouchableOpacity>
                      </View>
                    ) : null;
                  })}
                </View>
              </View>
            </View>
          )}
          {/* Available Items */}
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-2xl font-semibold text-white">
                Select Items
              </Text>
              <Text className="text-xl text-gray-400">
                {selectedItemIds.length} of {allItems.length} selected
              </Text>
            </View>

            {allItems.length === 0 ? (
              <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
                <Utensils size={48} color="#9CA3AF" />
                <Text className="text-2xl text-gray-400 text-center mt-4">
                  No menu items found.
                </Text>
                <Text className="text-xl text-gray-500 text-center mt-2">
                  Create some menu items first to add them to categories.
                </Text>
              </View>
            ) : (
              <View className="gap-3 flex flex-row flex-wrap">
                {allItems.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => toggleItem(item)}
                      className={`bg-[#303030] rounded-lg w-[32%] border p-4 ${
                        isSelected
                          ? "border-blue-500 bg-blue-900/20"
                          : "border-gray-700"
                      }`}
                    >
                      <View className="flex-row items-center gap-4">
                        {/* Item Image */}
                        <View className="w-16 h-16 rounded-lg border border-gray-600 overflow-hidden">
                          {getImageSource(item.image) ? (
                            <Image
                              source={getImageSource(item.image)}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <View className="w-full h-full bg-gray-600 items-center justify-center">
                              <Utensils color="#9ca3af" size={24} />
                            </View>
                          )}
                        </View>

                        {/* Item Details */}
                        <View className="flex-1">
                          <Text className="text-white font-medium text-lg">
                            {item.name}
                          </Text>
                          {item.description && (
                            <Text className="text-gray-400 text-sm mt-1">
                              {item.description.slice(0, 45)}...
                            </Text>
                          )}

                          {/* Price Display */}
                          <View className="flex-row items-center gap-2 mt-1">
                            <Text className="text-blue-400 font-semibold">
                              ${item.price.toFixed(2)}
                            </Text>
                            {existing && (
                              <Text className="text-yellow-400 text-xs">
                                (Category: $
                                {getItemPriceForCategory(
                                  item.id,
                                  existing.id
                                ).toFixed(2)}
                                )
                              </Text>
                            )}
                          </View>

                          {/* Custom Pricing for this category */}
                          {existing && item.customPricing && (
                            <View className="mt-2">
                              {item.customPricing
                                .filter((p) => p.categoryId === existing.id)
                                .map((pricing) => (
                                  <View
                                    key={pricing.id}
                                    className="flex-row items-center gap-2 mb-1"
                                  >
                                    {editingPricing?.itemId === item.id &&
                                    editingPricing.pricing.id === pricing.id ? (
                                      // Edit mode
                                      <View className="flex-row items-center gap-2 flex-1">
                                        <TouchableOpacity
                                          onPress={() =>
                                            setEditingPricing({
                                              ...editingPricing,
                                              pricing: {
                                                ...pricing,
                                                price: Math.max(
                                                  0,
                                                  pricing.price - 0.25
                                                ),
                                              },
                                            })
                                          }
                                          className="p-1"
                                        >
                                          <Minus size={14} color="#9CA3AF" />
                                        </TouchableOpacity>
                                        <TextInput
                                          className="flex-1 bg-[#212121] border border-gray-600 rounded px-2 py-1 text-white text-center"
                                          value={editingPricing.pricing.price.toString()}
                                          onChangeText={(text) =>
                                            setEditingPricing({
                                              ...editingPricing,
                                              pricing: {
                                                ...pricing,
                                                price: parseFloat(text) || 0,
                                              },
                                            })
                                          }
                                          keyboardType="numeric"
                                        />
                                        <TouchableOpacity
                                          onPress={() =>
                                            setEditingPricing({
                                              ...editingPricing,
                                              pricing: {
                                                ...pricing,
                                                price: pricing.price + 0.25,
                                              },
                                            })
                                          }
                                          className="p-1"
                                        >
                                          <Plus size={14} color="#9CA3AF" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={handleUpdateCustomPricing}
                                          className="p-1 bg-green-600 rounded"
                                        >
                                          <Save size={12} color="white" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={() =>
                                            setEditingPricing(null)
                                          }
                                          className="p-1 bg-gray-600 rounded"
                                        >
                                          <X size={12} color="white" />
                                        </TouchableOpacity>
                                      </View>
                                    ) : (
                                      // View mode
                                      <View className="flex-row items-center gap-2 flex-1">
                                        <View
                                          className={`px-2 py-1 rounded ${pricing.isActive ? "bg-yellow-900/30 border border-yellow-500" : "bg-gray-600/30 border border-gray-500"}`}
                                        >
                                          <Text
                                            className={`text-xs ${pricing.isActive ? "text-yellow-400" : "text-gray-400"}`}
                                          >
                                            ${pricing.price.toFixed(2)}
                                          </Text>
                                        </View>
                                        <TouchableOpacity
                                          onPress={() =>
                                            handleToggleCustomPricingActive(
                                              item.id,
                                              pricing.id
                                            )
                                          }
                                          className={`p-1 rounded ${pricing.isActive ? "bg-green-600" : "bg-gray-600"}`}
                                        >
                                          <Check size={12} color="white" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={() =>
                                            setEditingPricing({
                                              itemId: item.id,
                                              pricing,
                                            })
                                          }
                                          className="p-1 bg-blue-600 rounded"
                                        >
                                          <Edit size={12} color="white" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={() =>
                                            handleDeleteCustomPricing(
                                              item.id,
                                              pricing.id
                                            )
                                          }
                                          className="p-1 bg-red-600 rounded"
                                        >
                                          <Trash2 size={12} color="white" />
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>
                                ))}
                            </View>
                          )}

                          {/* Add Custom Pricing Button */}
                          {existing &&
                            (!item.customPricing ||
                              !item.customPricing.some(
                                (p) => p.categoryId === existing.id
                              )) && (
                              <TouchableOpacity
                                onPress={() => handleAddCustomPricing(item.id)}
                                className="flex-row items-center gap-1 mt-2 bg-yellow-900/30 border border-yellow-500 px-2 py-1 rounded self-start"
                              >
                                <DollarSign size={12} color="#FBBF24" />
                                <Text className="text-yellow-400 text-xs">
                                  Add Custom Price
                                </Text>
                              </TouchableOpacity>
                            )}

                          {/* New Pricing Input */}
                          {newPricing?.itemId === item.id && (
                            <View className="flex-row items-center gap-2 mt-2">
                              <TouchableOpacity
                                onPress={() =>
                                  setNewPricing({
                                    ...newPricing,
                                    price: Math.max(0, newPricing.price - 0.25),
                                  })
                                }
                                className="p-1"
                              >
                                <Minus size={14} color="#9CA3AF" />
                              </TouchableOpacity>
                              <TextInput
                                className="flex-1 bg-[#212121] border border-gray-600 rounded px-2 py-1 text-white text-center"
                                value={newPricing.price.toString()}
                                onChangeText={(text) =>
                                  setNewPricing({
                                    ...newPricing,
                                    price: parseFloat(text) || 0,
                                  })
                                }
                                keyboardType="numeric"
                                placeholder="0.00"
                                placeholderTextColor="#9CA3AF"
                              />
                              <TouchableOpacity
                                onPress={() =>
                                  setNewPricing({
                                    ...newPricing,
                                    price: newPricing.price + 0.25,
                                  })
                                }
                                className="p-1"
                              >
                                <Plus size={14} color="#9CA3AF" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={handleSaveCustomPricing}
                                className="p-1 bg-green-600 rounded"
                              >
                                <Save size={12} color="white" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setNewPricing(null)}
                                className="p-1 bg-gray-600 rounded"
                              >
                                <X size={12} color="white" />
                              </TouchableOpacity>
                            </View>
                          )}

                          {/* Show existing categories */}
                          {Array.isArray(item.category) &&
                            item.category.length > 0 && (
                              <View className="flex-row flex-wrap gap-1 mt-2">
                                {item.category.map(
                                  (cat: string, index: number) => (
                                    <View
                                      key={index}
                                      className="bg-gray-600/30 border border-gray-500 px-2 py-1 rounded"
                                    >
                                      <Text className="text-xs text-gray-300">
                                        {cat}
                                      </Text>
                                    </View>
                                  )
                                )}
                              </View>
                            )}
                        </View>

                        {/* Selection Indicator */}
                        <View
                          className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                            isSelected
                              ? "bg-blue-600 border-blue-600"
                              : "border-gray-500"
                          }`}
                        >
                          {isSelected && <Check size={16} color="white" />}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-2xl font-semibold text-white">Schedules</Text>
            <TouchableOpacity
              onPress={() => setIsActive(!isActive)}
              className={`px-4 py-3 rounded-lg border ${isActive ? "bg-green-900/30 border-green-500" : "bg-red-900/30 border-red-500"}`}
            >
              <Text
                className={`text-xl ${isActive ? "text-green-400" : "text-red-400"}`}
              >
                {isActive ? "Master: Enabled" : "Master: Disabled"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScheduleEditor value={schedules} onChange={setSchedules} />
        </View>
      </ScrollView>
    </View>
  );
};

export default EditCategoryScreen;
