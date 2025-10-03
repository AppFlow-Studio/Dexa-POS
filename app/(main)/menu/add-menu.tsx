import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useMenuStore } from "@/stores/useMenuStore";
import { router } from "expo-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Save,
  Utensils,
  X,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
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

const AddMenuScreen: React.FC = () => {
  const { categories, menuItems, addMenu, getItemsInCategory } = useMenuStore();

  const [menuName, setMenuName] = useState("");
  const [menuDescription, setMenuDescription] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);

  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  );

  useEffect(() => {
    const isPristine =
      !menuName.trim() &&
      !menuDescription.trim() &&
      selectedCategories.length === 0;
    setHasChanges(!isPristine);
  }, [menuName, menuDescription, selectedCategories]);

  // Get available categories (only active ones)
  const availableCategories = categories
    .filter((cat) => cat.isActive)
    .sort((a, b) => a.order - b.order);

  // Handle category selection
  const toggleCategorySelection = (categoryName: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((name) => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  // Handle category expansion
  const toggleCategoryExpansion = (categoryName: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((name) => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  // Handle form validation
  const validateForm = (): boolean => {
    if (!menuName.trim()) {
      Alert.alert("Error", "Please enter a menu name");
      return false;
    }

    if (selectedCategories.length === 0) {
      Alert.alert("Error", "Please select at least one category for this menu");
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

  const confirmSave = async () => {
    setIsSaving(true);
    setShowConfirmation(false);

    try {
      addMenu({
        name: menuName.trim(),
        description: menuDescription.trim() || undefined,
        isActive: true,
        categories: selectedCategories,
      });

      // Mark as saved to allow navigation
      hasSavedRef.current = true;
      setHasChanges(false);

      // Navigate back
      if (router.canGoBack()) {
        router.back();
      }
    } catch (error) {
      Alert.alert("Error", "Failed to save menu. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Get all items from selected categories for preview
  const getPreviewItems = () => {
    const allItems: { [key: string]: any[] } = {};
    selectedCategories.forEach((categoryName) => {
      allItems[categoryName] = getItemsInCategory(categoryName);
    });
    return allItems;
  };

  const previewItems = getPreviewItems();
  const totalItems = Object.values(previewItems).flat().length;

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={20} color="#9CA3AF" />
          <Text className="text-xl text-white font-medium ml-1.5">
            Back to Menu
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
        >
          <Save size={20} color="white" />
          <Text className="text-xl text-white font-medium ml-1.5">
            {isSaving ? "Saving..." : "Save Menu"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4">
        <Text className="text-2xl font-bold text-white mb-4">
          Create New Menu
        </Text>

        {/* Menu Name Input */}
        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Menu Name
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
            placeholder="e.g., Lunch Menu, Dinner Specials"
            placeholderTextColor="#9CA3AF"
            value={menuName}
            onChangeText={setMenuName}
            autoFocus
          />
        </View>

        {/* Menu Description Input */}
        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Description (Optional)
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
            placeholder="Describe this menu..."
            placeholderTextColor="#9CA3AF"
            value={menuDescription}
            onChangeText={setMenuDescription}
            multiline
            numberOfLines={3}
          />
        </View>
        <View className="flex-row items-center justify-end mb-3">
          <TouchableOpacity
            onPress={() => router.push("/menu/add-category")}
            className="flex-row items-center bg-green-600 px-3 py-1.5 rounded-lg"
          >
            <Plus size={18} color="white" />
            <Text className="text-base text-white font-medium ml-1">
              Add Category
            </Text>
          </TouchableOpacity>
        </View>

        {/* Available Categories */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xl font-semibold text-white">
              Select Categories
            </Text>
            <Text className="text-lg text-gray-400">
              {selectedCategories.length} of {availableCategories.length}{" "}
              selected
            </Text>
          </View>

          {availableCategories.length === 0 ? (
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
              <Utensils size={36} color="#9CA3AF" />
              <Text className="text-xl text-gray-400 text-center mt-3">
                No categories available.
              </Text>
              <Text className="text-base text-gray-500 text-center mt-1.5">
                Create categories to add them to menus.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {availableCategories.map((category) => {
                const isSelected = selectedCategories.includes(category.name);
                const isExpanded = expandedCategories.includes(category.name);
                const categoryItems = getItemsInCategory(category.name);

                return (
                  <View
                    key={category.id}
                    className={`bg-[#303030] rounded-lg border ${
                      isSelected
                        ? "border-blue-500 bg-blue-900/20"
                        : "border-gray-700"
                    }`}
                  >
                    <TouchableOpacity
                      onPress={() => toggleCategorySelection(category.name)}
                      className="p-4"
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2 mb-1.5">
                            <Text className="text-white font-medium text-2xl">
                              {category.name}
                            </Text>
                            <View className="bg-gray-600/30 border border-gray-500 px-2.5 py-1.5 rounded">
                              <Text className="text-lg text-gray-300">
                                {categoryItems.length} items
                              </Text>
                            </View>
                          </View>

                          {!isExpanded && categoryItems.length > 0 && (
                            <View className="flex-row flex-wrap gap-1.5 w-full">
                              {categoryItems.slice(0, 3).map((item, index) => (
                                <View
                                  key={index}
                                  className="bg-gray-600/30 border border-gray-500 px-2.5 py-1.5 rounded"
                                >
                                  <Text className="text-lg text-gray-300">
                                    {item.name}
                                  </Text>
                                </View>
                              ))}
                              {categoryItems.length > 3 && (
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    toggleCategoryExpansion(category.name);
                                  }}
                                  className="bg-blue-600/30 border border-blue-500 px-2.5 py-1.5 rounded"
                                >
                                  <Text className="text-lg text-blue-300">
                                    +{categoryItems.length - 3} more
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>

                        <View className="flex-row items-center gap-1.5">
                          {categoryItems.length > 3 && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                toggleCategoryExpansion(category.name);
                              }}
                              className="p-1.5"
                            >
                              {isExpanded ? (
                                <ChevronUp size={20} color="#9CA3AF" />
                              ) : (
                                <ChevronDown size={20} color="#9CA3AF" />
                              )}
                            </TouchableOpacity>
                          )}

                          <View
                            className={`w-7 h-7 rounded-full border-2 items-center justify-center ${
                              isSelected
                                ? "bg-blue-600 border-blue-600"
                                : "border-gray-500"
                            }`}
                          >
                            {isSelected && <Check size={18} color="white" />}
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {isExpanded && categoryItems.length > 0 && (
                      <View className="border-t border-gray-700 p-4 bg-[#2a2a2a]">
                        <Text className="text-lg text-gray-400 font-medium mb-2">
                          All Items in {category.name}:
                        </Text>
                        <View className="flex-row flex-wrap gap-2 w-full">
                          {categoryItems.map((item, index) => (
                            <View
                              key={index}
                              className="bg-gray-600/30 border w-[24%] border-gray-500 px-3 py-2 rounded-lg flex-row items-center gap-2"
                            >
                              <View className="w-8 h-8 rounded border border-gray-600 overflow-hidden">
                                {getImageSource(item.image) ? (
                                  <Image
                                    source={getImageSource(item.image)}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <View className="w-full h-full bg-gray-600 items-center justify-center">
                                    <Utensils color="#9ca3af" size={18} />
                                  </View>
                                )}
                              </View>
                              <View className="flex-1">
                                <Text className="text-white text-lg font-medium">
                                  {item.name}
                                </Text>
                                <Text className="text-gray-400 text-base">
                                  ${item.price.toFixed(2)}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {selectedCategories.length > 0 && (
          <View className="mb-4">
            <Text className="text-xl font-semibold text-white mb-2">
              Selected Categories ({selectedCategories.length})
            </Text>
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-4">
              <View className="flex-row flex-wrap gap-1.5">
                {selectedCategories.map((categoryName) => (
                  <View
                    key={categoryName}
                    className="flex-row items-center bg-blue-600/20 border border-blue-500 px-3 py-2 rounded-lg"
                  >
                    <Text className="text-blue-400 text-lg font-medium">
                      {categoryName}
                    </Text>
                    <TouchableOpacity
                      onPress={() => toggleCategorySelection(categoryName)}
                      className="ml-1.5"
                    >
                      <X size={16} color="#60A5FA" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {selectedCategories.length > 0 && (
          <View className="mb-4">
            <Text className="text-xl font-semibold text-white mb-2">
              Menu Preview ({totalItems} items)
            </Text>
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-4">
              {Object.entries(previewItems).map(([categoryName, items]) => (
                <View key={categoryName} className="mb-3 last:mb-0">
                  <Text className="text-blue-400 font-medium mb-1.5 text-lg">
                    {categoryName} ({items.length} items)
                  </Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {items.slice(0, 5).map((item, index) => (
                      <View
                        key={index}
                        className="bg-gray-600/30 border border-gray-500 px-2.5 py-1.5 rounded"
                      >
                        <Text className="text-lg text-gray-300">
                          {item.name}
                        </Text>
                      </View>
                    ))}
                    {items.length > 5 && (
                      <View className="bg-gray-600/30 border border-gray-500 px-2.5 py-1.5 rounded">
                        <Text className="text-lg text-gray-300">
                          +{items.length - 5} more
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showConfirmation}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-[#303030] rounded-2xl p-4 w-full max-w-md border border-gray-600">
            <View className="items-center mb-4">
              <View className="w-16 h-16 bg-blue-600/20 rounded-full items-center justify-center mb-3">
                <Save size={32} color="#60A5FA" />
              </View>
              <Text className="text-2xl font-bold text-white text-center">
                Create Menu?
              </Text>
              <Text className="text-xl text-gray-400 text-center mt-1.5">
                Create "{menuName}" with {selectedCategories.length} categories?
              </Text>
            </View>

            <View className="bg-[#212121] rounded-lg p-4 mb-4">
              <Text className="text-xl text-white font-medium mb-1.5">
                {menuName}
              </Text>
              {menuDescription && (
                <Text className="text-lg text-gray-400 mb-1.5">
                  {menuDescription}
                </Text>
              )}
              <Text className="text-lg text-gray-400">
                {selectedCategories.length} categories • {totalItems} total
                items
              </Text>
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowConfirmation(false)}
                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-3 items-center"
              >
                <Text className="text-xl text-gray-300 font-medium">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                className="flex-1 bg-blue-600 rounded-lg py-3 items-center"
              >
                <Text className="text-xl text-white font-medium">
                  {isSaving ? "Creating..." : "Create Menu"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <UnsavedChangesDialog
        isOpen={isDialogVisible}
        onCancel={handleCancel}
        onDiscard={handleDiscard}
      />
    </View>
  );
};

export default AddMenuScreen;
