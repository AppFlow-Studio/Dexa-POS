import { Dialog, DialogContent } from "@/components/ui/dialog";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import {
  ArrowLeft,
  Check,
  DollarSign,
  Minus,
  Plus,
  Save,
  Search,
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

const AddCategoryScreen: React.FC = () => {
  const { menuItems, addCategory, addItemToCategory, addCustomPricing } =
    useMenuStore();

  const [categoryName, setCategoryName] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newPricing, setNewPricing] = useState<{
    itemId: string;
    price: number;
  } | null>(null);
  const [newPricingText, setNewPricingText] = useState<string>("");
  const [customPricingRules, setCustomPricingRules] = useState<{
    [itemId: string]: number;
  }>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Use a ref to track if we've saved successfully
  const hasSavedRef = useRef(false);

  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  );

  useEffect(() => {
    const isPristine =
      !categoryName.trim() &&
      selectedItems.length === 0 &&
      Object.keys(customPricingRules).length === 0;
    setHasChanges(!isPristine);
  }, [categoryName, selectedItems, customPricingRules]);

  // Get all items
  const availableItems = menuItems;

  // Bottom sheet for quick search & select items
  const quickSearchSheetRef = useRef<BottomSheet>(null);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    if (!q) return availableItems;
    return availableItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
    );
  }, [availableItems, quickSearchQuery]);

  // Handle item selection
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  // Custom pricing functions
  const handleAddCustomPricing = (itemId: string) => {
    const item = availableItems.find((i) => i.id === itemId);
    if (item) {
      setNewPricing({ itemId, price: item.price });
      setNewPricingText(item.price.toFixed(2));
    }
  };

  const handleSaveCustomPricing = () => {
    if (!newPricing || !categoryName.trim()) return;
    const parsed = parseFloat(newPricingText.replace(",", "."));
    if (isNaN(parsed)) {
      Alert.alert("Invalid price", "Please enter a valid number.");
      return;
    }
    setCustomPricingRules((prev) => ({
      ...prev,
      [newPricing.itemId]: parsed,
    }));
    setNewPricing(null);
    setNewPricingText("");
  };

  const handleRemoveCustomPricing = (itemId: string) => {
    setCustomPricingRules((prev) => {
      const newRules = { ...prev };
      delete newRules[itemId];
      return newRules;
    });
  };

  const handleEditCustomPricing = (itemId: string) => {
    const currentPrice = customPricingRules[itemId];
    if (currentPrice) {
      setNewPricing({ itemId, price: currentPrice });
      handleRemoveCustomPricing(itemId);
    }
  };

  // Handle form validation
  const validateForm = (): boolean => {
    if (!categoryName.trim()) {
      Alert.alert("Error", "Please enter a category name");
      return false;
    }

    if (selectedItems.length === 0) {
      Alert.alert("Error", "Please select at least one item for this category");
      return false;
    }

    return true;
  };

  // Handle save
  const handleSave = () => {
    if (!validateForm()) {
      return;
    }
    setShowConfirmation(true);
  };

  const confirmSave = () => {
    setIsSaving(true);
    setShowConfirmation(false);

    try {
      // Perform all the synchronous store updates
      const newOrder =
        Math.max(
          ...useMenuStore.getState().categories.map((cat) => cat.order),
          0
        ) + 1;
      const newCategory = {
        name: categoryName.trim(),
        isActive: true,
        order: newOrder,
      };
      addCategory(newCategory);
      selectedItems.forEach((itemId) => {
        addItemToCategory(itemId, categoryName.trim());
      });
      const createdCategory = useMenuStore
        .getState()
        .categories.find((cat) => cat.name === categoryName.trim());
      if (createdCategory) {
        Object.entries(customPricingRules).forEach(([itemId, price]) => {
          addCustomPricing(itemId, {
            categoryId: createdCategory.id,
            categoryName: createdCategory.name,
            price: price,
            isActive: true,
          });
        });
      }

      // Mark as saved and reset states
      hasSavedRef.current = true;
      setHasChanges(false);

      // Navigate back immediately after successful save
      if (router.canGoBack()) {
        router.back();
      }
    } catch (error) {
      Alert.alert("Error", "Failed to save category. Please try again.");
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-3 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={18} color="#9CA3AF" />
          <Text className="text-white font-medium ml-1.5 text-sm">
            Back to Menu
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          className="flex-row items-center bg-blue-600 px-3 py-1.5 rounded-lg"
        >
          <Save size={14} color="white" />
          <Text className="text-white font-medium ml-1.5 text-sm">
            {isSaving ? "Saving..." : "Save Category"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4">
        <Text className="text-xl font-bold text-white mb-4">
          Add New Category
        </Text>

        {/* Category Name Input */}
        <View className="mb-4">
          <Text className="text-base font-semibold text-white mb-2">
            Category Name
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 text-white h-16 text-base"
            placeholder="e.g., Appetizers, Main Course, Desserts"
            placeholderTextColor="#9CA3AF"
            value={categoryName}
            onChangeText={setCategoryName}
            autoFocus
          />
        </View>

        {/* Available Items */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xl font-semibold text-white">
              Select Items
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-lg text-gray-400">
                {selectedItems.length} of {availableItems.length} selected
              </Text>
              <TouchableOpacity
                onPress={() => quickSearchSheetRef.current?.expand()}
                className="p-2 rounded-lg bg-[#212121] border border-gray-600"
                accessibilityLabel="Quick search items"
              >
                <Search size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

          {availableItems.length === 0 ? (
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
              <Utensils size={36} color="#9CA3AF" />
              <Text className="text-gray-400 text-center mt-3 text-sm">
                No menu items found.
              </Text>
              <Text className="text-gray-500 text-center text-xs mt-1">
                Create some menu items first to add them to categories.
              </Text>
            </View>
          ) : (
            <View className="gap-2.5 flex flex-row flex-wrap">
              {availableItems.map((item) => {
                const isSelected = selectedItems.includes(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => toggleItemSelection(item.id)}
                    className={`bg-[#303030] rounded-lg w-[32.5%] border p-3 ${
                      isSelected
                        ? "border-blue-500 bg-blue-900/20"
                        : "border-gray-700"
                    }`}
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="flex=col gap-2">
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
                      </View>

                      <View className="flex-1">
                        <Text className="text-white font-medium text-base">
                          {item.name}
                        </Text>
                        <View className="flex-row items-center gap-2 mt-1">
                          <Text className="text-blue-400 font-semibold text-sm">
                            ${item.price.toFixed(2)}
                          </Text>
                          {categoryName.trim() && (
                            <Text className="text-yellow-400 text-[10px]">
                              (Will be: $
                              {customPricingRules[item.id]
                                ? customPricingRules[item.id].toFixed(2)
                                : item.price.toFixed(2)}
                              )
                            </Text>
                          )}
                        </View>

                        {customPricingRules[item.id] && (
                          <View className="mt-1.5">
                            <View className="flex-row items-center gap-1.5">
                              <View className="bg-yellow-900/30 border border-yellow-500 px-1.5 py-0.5 rounded">
                                <Text className="text-yellow-400 text-[10px]">
                                  ${customPricingRules[item.id].toFixed(2)}
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleEditCustomPricing(item.id)}
                                className="p-0.5 flex items-center justify-center bg-blue-600 rounded"
                              >
                                <Save size={16} color="white" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() =>
                                  handleRemoveCustomPricing(item.id)
                                }
                                className="p-0.5 flex items-center justify-center bg-red-600 rounded"
                              >
                                <X size={16} color="white" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {categoryName.trim() &&
                          !customPricingRules[item.id] && (
                            <TouchableOpacity
                              onPress={() => handleAddCustomPricing(item.id)}
                              className="flex-row items-center gap-1 mt-1.5 bg-yellow-900/30 border border-yellow-500 px-1.5 py-0.5 rounded self-start"
                            >
                              <DollarSign size={10} color="#FBBF24" />
                              <Text className="text-yellow-400 text-[10px]">
                                Set Custom Price
                              </Text>
                            </TouchableOpacity>
                          )}

                        {newPricing?.itemId === item.id && (
                          <View className="flex-col items-center gap-1.5 mt-1.5">
                            <View className="flex-row items-center gap-1.5">
                              <TouchableOpacity
                                onPress={() => {
                                  const current = parseFloat(
                                    newPricingText.replace(",", ".")
                                  );
                                  const next = isNaN(current)
                                    ? 0
                                    : Math.max(0, current - 0.25);
                                  setNewPricingText(next.toFixed(2));
                                }}
                                className="p-0.5"
                              >
                                <Minus size={12} color="#9CA3AF" />
                              </TouchableOpacity>
                              <TextInput
                                className="flex-1 bg-[#212121] border border-gray-600 rounded px-1.5 py-0.5 text-white text-center h-16 text-sm"
                                value={newPricingText}
                                onChangeText={(text) => setNewPricingText(text)}
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                                placeholderTextColor="#9CA3AF"
                              />
                              <TouchableOpacity
                                onPress={() => {
                                  const current = parseFloat(
                                    newPricingText.replace(",", ".")
                                  );
                                  const next = isNaN(current)
                                    ? 0
                                    : current + 0.25;
                                  setNewPricingText(next.toFixed(2));
                                }}
                                className="p-0.5"
                              >
                                <Plus size={12} color="#9CA3AF" />
                              </TouchableOpacity>
                            </View>
                            <View className="flex-row items-center gap-1.5">
                              <TouchableOpacity
                                onPress={handleSaveCustomPricing}
                                className="p-0.5 flex items-center justify-center bg-green-600 rounded"
                              >
                                <Save size={18} color="white" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  setNewPricing(null);
                                  setNewPricingText("");
                                }}
                                className="p-0.5 flex items-center justify-center bg-gray-600 rounded"
                              >
                                <X size={18} color="white" />
                              </TouchableOpacity>
                            </View>
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

        {selectedItems.length > 0 && (
          <View className="mb-4">
            <Text className="text-base font-semibold text-white mb-2">
              Selected Items ({selectedItems.length})
            </Text>
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-3">
              <View className="flex-row flex-wrap gap-1.5">
                {selectedItems.map((itemId) => {
                  const item = availableItems.find(
                    (i: MenuItemType) => i.id === itemId
                  );
                  return item ? (
                    <View
                      key={itemId}
                      className="flex-row items-center bg-blue-600/20 border border-blue-500 px-2 py-1.5 rounded-lg"
                    >
                      <Text className="text-blue-400 text-xs font-medium">
                        {item.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => toggleItemSelection(itemId)}
                        className="ml-1.5"
                      >
                        <X size={12} color="#60A5FA" />
                      </TouchableOpacity>
                    </View>
                  ) : null;
                })}
              </View>
            </View>
          </View>
        )}

        {Object.keys(customPricingRules).length > 0 && (
          <View className="mb-4">
            <Text className="text-base font-semibold text-white mb-2">
              Custom Pricing Rules ({Object.keys(customPricingRules).length})
            </Text>
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-3">
              <View className="gap-1.5">
                {Object.entries(customPricingRules).map(([itemId, price]) => {
                  const item = availableItems.find(
                    (i: MenuItemType) => i.id === itemId
                  );
                  return item ? (
                    <View
                      key={itemId}
                      className="flex-row items-center justify-between bg-yellow-900/20 border border-yellow-500 px-2 py-1.5 rounded-lg"
                    >
                      <View className="flex-1">
                        <Text className="text-yellow-400 text-xs font-medium">
                          {item.name}
                        </Text>
                        <Text className="text-gray-400 text-[10px]">
                          ${item.price.toFixed(2)} → ${price.toFixed(2)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <TouchableOpacity
                          onPress={() => handleRemoveCustomPricing(itemId)}
                          className="p-0.5 bg-red-600 rounded"
                        >
                          <X size={18} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null;
                })}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="w-[450px]">
          <View className="bg-[#303030] rounded-2xl p-4 w-full border border-gray-600">
            <View className="items-center mb-4">
              <View className="w-14 h-14 bg-blue-600/20 rounded-full items-center justify-center mb-3">
                <Save size={28} color="#60A5FA" />
              </View>
              <Text className="text-lg font-bold text-white text-center">
                Create Category?
              </Text>
              <Text className="text-gray-400 text-center mt-1 text-sm">
                Create "{categoryName}" with {selectedItems.length} items?
              </Text>
            </View>

            <View className="bg-[#212121] rounded-lg p-3 mb-4">
              <Text className="text-white font-medium mb-1 text-sm">
                {categoryName}
              </Text>
              <Text className="text-gray-400 text-xs mb-1">
                {selectedItems.length} items will be added to this category
              </Text>
              {Object.keys(customPricingRules).length > 0 && (
                <Text className="text-yellow-400 text-xs">
                  {Object.keys(customPricingRules).length} custom pricing rules
                  will be applied
                </Text>
              )}
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setShowConfirmation(false)}
                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-2.5 items-center"
              >
                <Text className="text-gray-300 font-medium text-sm">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                className="flex-1 bg-blue-600 rounded-lg py-2.5 items-center"
              >
                <Text className="text-white font-medium text-sm">
                  {isSaving ? "Creating..." : "Create Category"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </DialogContent>
      </Dialog>

      {/* Bottom Sheet */}
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
            Quickly search and toggle items for this category
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
            const isSelected = selectedItems.includes(item.id);
            return (
              <TouchableOpacity
                onPress={() => toggleItemSelection(item.id)}
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
                        <Utensils color="#9ca3af" size={16} />
                      </View>
                    )}
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-white text-base" numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!!item.description && (
                      <Text className="text-gray-400 text-sm" numberOfLines={1}>
                        {item.description}
                      </Text>
                    )}
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

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        isOpen={isDialogVisible}
        onCancel={handleCancel}
        onDiscard={handleDiscard}
      />
    </View>
  );
};

export default AddCategoryScreen;
