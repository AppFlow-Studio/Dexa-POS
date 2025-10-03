import CategoryAddScheduleSheet from "@/components/menu/CategoryAddScheduleSheet";
import ScheduleEditor from "@/components/menu/ScheduleEditor";
import ScheduleEditSheet from "@/components/menu/ScheduleEditSheet";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CustomPricing, MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";

import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Check,
  DollarSign,
  Edit,
  Minus,
  Plus,
  Save,
  Search,
  Trash2,
  Utensils,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
    return `${image}`;
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
  const [editingPricingText, setEditingPricingText] = useState<string>("");
  const [newPricing, setNewPricing] = useState<{
    itemId: string;
    price: number;
  } | null>(null);
  const [newPricingText, setNewPricingText] = useState<string>("");

  // Bottom sheet for quick search & select items
  const quickSearchSheetRef = useRef<BottomSheet>(null);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const filteredItems = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
    );
  }, [allItems, quickSearchQuery]);

  // New schedule sheets
  const addScheduleRef = useRef<BottomSheet>(null);
  const openAddSchedule = () => addScheduleRef.current?.expand();
  const handleSaveSchedule = (rule: any) => {
    setSchedules([...(schedules ?? []), rule]);
  };

  const editSheetRef = useRef<BottomSheet>(null);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);
  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  );

  useEffect(() => {
    if (!existing) return;
    const initialItemIds = menuItems
      .filter((item) =>
        (Array.isArray(item.category)
          ? item.category
          : [item.category]
        ).includes(existing.name)
      )
      .map((i) => i.id);

    const nameChanged = existing.name !== name;
    const activeChanged = existing.isActive !== isActive;
    const schedulesChanged =
      JSON.stringify(existing.schedules ?? []) !== JSON.stringify(schedules);
    const itemsChanged =
      JSON.stringify(initialItemIds.sort()) !==
      JSON.stringify(selectedItemIds.sort());

    setHasChanges(
      nameChanged || activeChanged || schedulesChanged || itemsChanged
    );
  }, [name, isActive, schedules, selectedItemIds, existing, menuItems]);

  const openEditSchedule = (rule: any, index: number) => {
    setEditingRule(rule);
    setEditingIndex(index);
    editSheetRef.current?.expand();
  };
  const handleEditSave = (updated: any) => {
    if (editingIndex === null) return;
    const next = schedules.map((r, i) => (i === editingIndex ? updated : r));
    setSchedules(next);
  };

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
      setNewPricingText(item.price.toFixed(2));
    }
  };

  const handleSaveCustomPricing = () => {
    if (!newPricing || !existing) return;
    const parsed = parseFloat(newPricingText.replace(",", "."));
    if (isNaN(parsed)) {
      Alert.alert("Invalid price", "Please enter a valid number.");
      return;
    }
    addCustomPricing(newPricing.itemId, {
      categoryId: existing.id,
      categoryName: existing.name,
      price: parsed,
      isActive: true,
    });
    setNewPricing(null);
    setNewPricingText("");
  };

  const handleUpdateCustomPricing = () => {
    if (!editingPricing) return;
    const parsed = parseFloat(editingPricingText.replace(",", "."));
    if (isNaN(parsed)) {
      Alert.alert("Invalid price", "Please enter a valid number.");
      return;
    }
    updateCustomPricing(editingPricing.itemId, editingPricing.pricing.id, {
      price: parsed,
    });
    setEditingPricing(null);
    setEditingPricingText("");
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
    hasSavedRef.current = true;
    setHasChanges(false);

    await new Promise((r) => setTimeout(r, 100));
    if (router.canGoBack()) {
      router.replace({ pathname: "/menu", params: { tab: "categories" } });
    }
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
      <View className="flex-1 bg-[#212121] items-center justify-center p-4">
        <Text className="text-xl text-white">Category not found.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-3 px-4 py-2 bg-[#303030] rounded border border-gray-600"
        >
          <Text className="text-lg text-gray-300">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={20} color="#9CA3AF" />
          <Text className="text-xl text-white font-medium ml-1.5">Back</Text>
        </TouchableOpacity>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleDelete}
            className="px-4 py-2 rounded-lg border border-red-500 bg-red-900/30"
          >
            <Text className="text-xl text-red-400">Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="px-4 py-2 rounded-lg bg-blue-600"
          >
            <Text className="text-xl text-white">Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        <Text className="text-2xl font-bold text-white mb-4">
          Edit Category
        </Text>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">Name</Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="mb-4">
          {selectedItemIds.length > 0 && (
            <View className="mb-4">
              <Text className="text-xl font-semibold text-white mb-2">
                Selected Items ({selectedItemIds.length})
              </Text>
              <View className="bg-[#303030] border border-gray-600 rounded-lg p-3">
                <View className="flex-row flex-wrap gap-1.5">
                  {selectedItemIds.map((itemId) => {
                    const item = allItems.find(
                      (i: MenuItemType) => i.id === itemId
                    );
                    return item ? (
                      <View
                        key={itemId}
                        className="flex-row items-center bg-blue-600/20 border border-blue-500 px-3 py-2 rounded-lg"
                      >
                        <Text className="text-blue-400 text-lg font-medium">
                          {item.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() => toggleItem(item)}
                          className="ml-1.5"
                        >
                          <X size={16} color="#60A5FA" />
                        </TouchableOpacity>
                      </View>
                    ) : null;
                  })}
                </View>
              </View>
            </View>
          )}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xl font-semibold text-white">
                Select Items
              </Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-lg text-gray-400">
                  {selectedItemIds.length} of {allItems.length} selected
                </Text>
                <TouchableOpacity
                  onPress={() => quickSearchSheetRef.current?.expand()}
                  className="p-2 rounded-lg bg-[#212121] border border-gray-600"
                  accessibilityLabel="Quick search items"
                >
                  <Search size={20} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>

            {allItems.length === 0 ? (
              <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
                <Utensils size={36} color="#9CA3AF" />
                <Text className="text-xl text-gray-400 text-center mt-3">
                  No menu items found.
                </Text>
                <Text className="text-base text-gray-500 text-center mt-1.5">
                  Create items to add them to categories.
                </Text>
              </View>
            ) : (
              <View className="gap-2.5 flex flex-row flex-wrap">
                {allItems.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => toggleItem(item)}
                      className={`bg-[#303030] rounded-lg w-[32.5%] border p-3 ${
                        isSelected
                          ? "border-blue-500 bg-blue-900/20"
                          : "border-gray-700"
                      }`}
                    >
                      <View className="flex-row items-center gap-3">
                        <View className="h-20 aspect-square rounded-lg border border-gray-600 overflow-hidden">
                          {getImageSource(item.image) ? (
                            <Image
                              source={
                                typeof getImageSource(item.image) === "string"
                                  ? MENU_IMAGE_MAP[
                                      item.image as keyof typeof MENU_IMAGE_MAP
                                    ]
                                  : getImageSource(item.image)
                              }
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <View className="w-full h-full bg-gray-600 items-center justify-center">
                              <Utensils color="#9ca3af" size={20} />
                            </View>
                          )}
                        </View>

                        <View className="flex-1">
                          <Text className="text-white font-medium text-base">
                            {item.name}
                          </Text>
                          {item.description && (
                            <Text className="text-gray-400 text-xs mt-0.5">
                              {item.description.slice(0, 20)}...
                            </Text>
                          )}

                          <View className="flex-row items-center gap-1.5 mt-0.5">
                            <Text className="text-blue-400 font-semibold text-sm">
                              ${item.price.toFixed(2)}
                            </Text>
                            {existing &&
                              getItemPriceForCategory(
                                item.id,
                                existing.id
                              ).toFixed(2) !== item.price.toFixed(2) && (
                                <Text className="text-yellow-400 text-[10px]">
                                  (Cat: $
                                  {getItemPriceForCategory(
                                    item.id,
                                    existing.id
                                  ).toFixed(2)}
                                  )
                                </Text>
                              )}
                          </View>

                          {existing && item.customPricing && (
                            <View className="mt-1.5">
                              {item.customPricing
                                .filter((p) => p.categoryId === existing.id)
                                .map((pricing) => (
                                  <View
                                    key={pricing.id}
                                    className="flex-row items-center gap-1.5 mb-1"
                                  >
                                    {editingPricing?.itemId === item.id &&
                                    editingPricing.pricing.id === pricing.id ? (
                                      <View className="flex-col items-center gap-1.5 flex-1">
                                        <View className="flex-row items-center gap-1.5">
                                          <TouchableOpacity
                                            onPress={() => {
                                              const current = parseFloat(
                                                editingPricingText.replace(
                                                  ",",
                                                  "."
                                                )
                                              );
                                              const next = isNaN(current)
                                                ? 0
                                                : Math.max(0, current - 0.25);
                                              setEditingPricingText(
                                                next.toFixed(2)
                                              );
                                            }}
                                            className="p-1"
                                          >
                                            <Minus size={14} color="#9CA3AF" />
                                          </TouchableOpacity>
                                          <TextInput
                                            className="flex-1 bg-[#212121] border border-gray-600 rounded px-1.5 py-0.5 text-white text-center h-16 text-sm"
                                            value={editingPricingText}
                                            onChangeText={setEditingPricingText}
                                            keyboardType="decimal-pad"
                                          />
                                          <TouchableOpacity
                                            onPress={() => {
                                              const current = parseFloat(
                                                editingPricingText.replace(
                                                  ",",
                                                  "."
                                                )
                                              );
                                              const next = isNaN(current)
                                                ? 0
                                                : current + 0.25;
                                              setEditingPricingText(
                                                next.toFixed(2)
                                              );
                                            }}
                                            className="p-1"
                                          >
                                            <Plus size={14} color="#9CA3AF" />
                                          </TouchableOpacity>
                                        </View>
                                        <View className="flex-row items-center gap-1.5">
                                          <TouchableOpacity
                                            onPress={handleUpdateCustomPricing}
                                            className="p-0.5 bg-green-600 rounded"
                                          >
                                            <Save size={18} color="white" />
                                          </TouchableOpacity>
                                          <TouchableOpacity
                                            onPress={() =>
                                              setEditingPricing(null)
                                            }
                                            className="p-0.5 bg-gray-600 rounded"
                                          >
                                            <X size={18} color="white" />
                                          </TouchableOpacity>
                                        </View>
                                      </View>
                                    ) : (
                                      <View className="flex-row items-center gap-1.5 flex-1">
                                        <View
                                          className={`px-1.5 py-0.5 rounded ${
                                            pricing.isActive
                                              ? "bg-yellow-900/30 border border-yellow-500"
                                              : "bg-gray-600/30 border border-gray-500"
                                          }`}
                                        >
                                          <Text
                                            className={`text-[10px] ${
                                              pricing.isActive
                                                ? "text-yellow-400"
                                                : "text-gray-400"
                                            }`}
                                          >
                                            ${pricing.price.toFixed(2)}
                                          </Text>
                                        </View>
                                        <TouchableOpacity
                                          onPress={() => {
                                            /* ... */
                                          }}
                                          className="p-0.5 bg-blue-600 rounded"
                                        >
                                          <Edit size={18} color="white" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={() => {
                                            /* ... */
                                          }}
                                          className="p-0.5 bg-red-600 rounded"
                                        >
                                          <Trash2 size={18} color="white" />
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>
                                ))}
                            </View>
                          )}

                          {existing &&
                            (!item.customPricing ||
                              !item.customPricing.some(
                                (p) => p.categoryId === existing.id
                              )) && (
                              <TouchableOpacity
                                onPress={() => handleAddCustomPricing(item.id)}
                                className="flex-row items-center gap-1 mt-1.5 bg-yellow-900/30 border border-yellow-500 px-1.5 py-0.5 rounded self-start"
                              >
                                <DollarSign size={10} color="#FBBF24" />
                                <Text className="text-yellow-400 text-[10px]">
                                  Add Price
                                </Text>
                              </TouchableOpacity>
                            )}

                          {newPricing?.itemId === item.id && (
                            <View className="flex-col justify-center items-center gap-1.5 mt-1.5">
                              {/* New Pricing Input UI */}
                            </View>
                          )}

                          {Array.isArray(item.category) &&
                            item.category.length > 0 && (
                              <View className="flex-row flex-wrap gap-1 mt-1.5">
                                {item.category.map(
                                  (cat: string, index: number) => (
                                    <View
                                      key={index}
                                      className="bg-gray-600/30 border border-gray-500 px-1.5 py-0.5 rounded"
                                    >
                                      <Text className="text-[10px] text-gray-300">
                                        {cat}
                                      </Text>
                                    </View>
                                  )
                                )}
                              </View>
                            )}
                        </View>

                        <View
                          className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                            isSelected
                              ? "bg-blue-600 border-blue-600"
                              : "border-gray-500"
                          }`}
                        >
                          {isSelected && <Check size={12} color="white" />}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xl font-semibold text-white">Schedules</Text>
            <TouchableOpacity
              onPress={() => setIsActive(!isActive)}
              className={`px-3 py-2 rounded-lg border ${
                isActive
                  ? "bg-green-900/30 border-green-500"
                  : "bg-red-900/30 border-red-500"
              }`}
            >
              <Text
                className={`text-lg ${
                  isActive ? "text-green-400" : "text-red-400"
                }`}
              >
                {isActive ? "Master: On" : "Master: Off"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScheduleEditor
            value={schedules}
            onChange={setSchedules}
            onAddPress={openAddSchedule}
            onEditPress={openEditSchedule}
          />
        </View>
      </ScrollView>

      <CategoryAddScheduleSheet
        ref={addScheduleRef}
        existing={schedules}
        onSave={handleSaveSchedule}
      />
      <ScheduleEditSheet
        ref={editSheetRef}
        rule={editingRule}
        onSave={handleEditSave}
      />

      <BottomSheet
        ref={quickSearchSheetRef}
        index={-1}
        snapPoints={["70%", "90%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        backgroundStyle={{ backgroundColor: "#212121" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      >
        <View className="p-3 border-b border-gray-700">
          <Text className="text-white text-xl font-bold">Add Items</Text>
          <Text className="text-gray-400 text-base mt-1">
            Quickly search and toggle items
          </Text>
        </View>
        <View className="p-3">
          <BottomSheetTextInput
            value={quickSearchQuery}
            onChangeText={setQuickSearchQuery}
            placeholder="Search items..."
            placeholderTextColor="#9CA3AF"
            className="bg-[#303030] border border-gray-600 rounded-lg h-16 px-3 py-2 text-white text-base"
          />
        </View>
        <BottomSheetFlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const isSelected = selectedItemIds.includes(item.id);
            return (
              <TouchableOpacity
                onPress={() => toggleItem(item)}
                className={`flex-row items-center justify-between bg-[#303030] border rounded-lg px-3 py-2.5 mb-2 ${
                  isSelected
                    ? "border-blue-500 bg-blue-900/20"
                    : "border-gray-700"
                }`}
              >
                <View className="flex-row items-center gap-2.5 flex-1">
                  <View className="w-10 h-10 rounded border border-gray-600 overflow-hidden">
                    {getImageSource(item.image) ? (
                      <Image
                        source={
                          typeof getImageSource(item.image) === "string"
                            ? MENU_IMAGE_MAP[
                                item.image as keyof typeof MENU_IMAGE_MAP
                              ]
                            : getImageSource(item.image)
                        }
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <View className="w-full h-full bg-gray-600 items-center justify-center">
                        <Utensils color="#9ca3af" size={18} />
                      </View>
                    )}
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-white text-base" numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                </View>
                <View
                  className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                    isSelected
                      ? "bg-blue-600 border-blue-600"
                      : "border-gray-500"
                  }`}
                >
                  {isSelected && <Check size={14} color="white" />}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View className="items-center justify-center p-8">
              <Text className="text-lg text-gray-400">No items found.</Text>
            </View>
          }
        />
      </BottomSheet>
      <UnsavedChangesDialog
        isOpen={isDialogVisible}
        onCancel={handleCancel}
        onDiscard={handleDiscard}
      />
    </View>
  );
};

export default EditCategoryScreen;
