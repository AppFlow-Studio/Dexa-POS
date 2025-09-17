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
import React, { useState } from "react";
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
      // Create the menu
      addMenu({
        name: menuName.trim(),
        description: menuDescription.trim() || undefined,
        isActive: true,
        categories: selectedCategories,
      });

      // Simulate a small delay for better UX
      await new Promise((resolve) => setTimeout(resolve, 1000));

      router.back();
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
      <View className="flex-row items-center justify-between p-6 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={24} color="#9CA3AF" />
          <Text className="text-2xl text-white font-medium ml-2">
            Back to Menu
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          className="flex-row items-center bg-blue-600 px-6 py-3 rounded-lg"
        >
          <Save size={24} color="white" />
          <Text className="text-2xl text-white font-medium ml-2">
            {isSaving ? "Saving..." : "Save Menu"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-6">
        <Text className="text-3xl font-bold text-white mb-6">
          Create New Menu
        </Text>

        {/* Menu Name Input */}
        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-4">
            Menu Name
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white"
            placeholder="e.g., Lunch Menu, Dinner Specials, Weekend Brunch"
            placeholderTextColor="#9CA3AF"
            value={menuName}
            onChangeText={setMenuName}
            autoFocus
          />
        </View>

        {/* Menu Description Input */}
        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-4">
            Description (Optional)
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white"
            placeholder="Describe what makes this menu special..."
            placeholderTextColor="#9CA3AF"
            value={menuDescription}
            onChangeText={setMenuDescription}
            multiline
            numberOfLines={3}
          />
        </View>
        <View className="flex-row items-center justify-end mb-4">
          <TouchableOpacity
            onPress={() => router.push("/menu/add-category")}
            className="flex-row items-center bg-green-600 px-4 py-2 rounded-lg"
          >
            <Plus size={24} color="white" />
            <Text className="text-xl text-white font-medium ml-1">
              Add Category
            </Text>
          </TouchableOpacity>
        </View>
        {/* Available Categories */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-2xl font-semibold text-white">
              Select Categories
            </Text>
            <Text className="text-xl text-gray-400">
              {selectedCategories.length} of {availableCategories.length}{" "}
              selected
            </Text>
          </View>

          {availableCategories.length === 0 ? (
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
              <Utensils size={48} color="#9CA3AF" />
              <Text className="text-2xl text-gray-400 text-center mt-4">
                No categories available.
              </Text>
              <Text className="text-xl text-gray-500 text-center mt-2">
                Create some categories first to add them to menus.
              </Text>
            </View>
          ) : (
            <View className="gap-4">
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
                    {/* Main Category Card */}
                    <TouchableOpacity
                      onPress={() => toggleCategorySelection(category.name)}
                      className="p-6"
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1">
                          <View className="flex-row items-center gap-3 mb-2">
                            <Text className="text-white font-medium text-3xl">
                              {category.name}
                            </Text>
                            <View className="bg-gray-600/30 border border-gray-500 px-3 py-2 rounded">
                              <Text className="text-xl text-gray-300">
                                {categoryItems.length} items
                              </Text>
                            </View>
                          </View>

                          {/* Show sample items (only when not expanded) */}
                          {!isExpanded && categoryItems.length > 0 && (
                            <View className="flex-row flex-wrap gap-2 w-full">
                              {categoryItems.slice(0, 3).map((item, index) => (
                                <View
                                  key={index}
                                  className="bg-gray-600/30 border border-gray-500 px-3 py-2 rounded"
                                >
                                  <Text className="text-xl text-gray-300">
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
                                  className="bg-blue-600/30 border border-blue-500 px-3 py-2 rounded"
                                >
                                  <Text className="text-xl text-blue-300">
                                    +{categoryItems.length - 3} more
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>

                        <View className="flex-row items-center gap-2">
                          {/* Expand/Collapse Button */}
                          {categoryItems.length > 3 && (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                toggleCategoryExpansion(category.name);
                              }}
                              className="p-2"
                            >
                              {isExpanded ? (
                                <ChevronUp size={24} color="#9CA3AF" />
                              ) : (
                                <ChevronDown size={24} color="#9CA3AF" />
                              )}
                            </TouchableOpacity>
                          )}

                          {/* Selection Indicator */}
                          <View
                            className={`w-8 h-8 rounded-full border-2 items-center justify-center ${
                              isSelected
                                ? "bg-blue-600 border-blue-600"
                                : "border-gray-500"
                            }`}
                          >
                            {isSelected && <Check size={24} color="white" />}
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Expanded Items List */}
                    {isExpanded && categoryItems.length > 0 && (
                      <View className="border-t border-gray-700 p-6 bg-[#2a2a2a]">
                        <Text className="text-xl text-gray-400 font-medium mb-3">
                          All Items in {category.name}:
                        </Text>
                        <View className="flex-row flex-wrap gap-3 w-full">
                          {categoryItems.map((item, index) => (
                            <View
                              key={index}
                              className="bg-gray-600/30 border w-[24%] border-gray-500 px-4 py-3 rounded-lg flex-row items-center gap-3"
                            >
                              {/* Item Image */}
                              <View className="w-10 h-10 rounded border border-gray-600 overflow-hidden">
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
                                <Text className="text-white text-xl font-medium">
                                  {item.name}
                                </Text>
                                <Text className="text-gray-400 text-lg">
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

        {/* Selected Categories Summary */}
        {selectedCategories.length > 0 && (
          <View className="mb-6">
            <Text className="text-2xl font-semibold text-white mb-4">
              Selected Categories ({selectedCategories.length})
            </Text>
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-6">
              <View className="flex-row flex-wrap gap-2">
                {selectedCategories.map((categoryName) => (
                  <View
                    key={categoryName}
                    className="flex-row items-center bg-blue-600/20 border border-blue-500 px-4 py-3 rounded-lg"
                  >
                    <Text className="text-blue-400 text-xl font-medium">
                      {categoryName}
                    </Text>
                    <TouchableOpacity
                      onPress={() => toggleCategorySelection(categoryName)}
                      className="ml-2"
                    >
                      <X size={18} color="#60A5FA" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Menu Preview */}
        {selectedCategories.length > 0 && (
          <View className="mb-6">
            <Text className="text-2xl font-semibold text-white mb-4">
              Menu Preview ({totalItems} items)
            </Text>
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-6">
              {Object.entries(previewItems).map(([categoryName, items]) => (
                <View key={categoryName} className="mb-4 last:mb-0">
                  <Text className="text-blue-400 font-medium mb-2 text-xl">
                    {categoryName} ({items.length} items)
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {items.slice(0, 5).map((item, index) => (
                      <View
                        key={index}
                        className="bg-gray-600/30 border border-gray-500 px-3 py-2 rounded"
                      >
                        <Text className="text-xl text-gray-300">
                          {item.name}
                        </Text>
                      </View>
                    ))}
                    {items.length > 5 && (
                      <View className="bg-gray-600/30 border border-gray-500 px-3 py-2 rounded">
                        <Text className="text-xl text-gray-300">
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

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-6">
          <View className="bg-[#303030] rounded-2xl p-6 w-full max-w-lg border border-gray-600">
            {/* Header */}
            <View className="items-center mb-6">
              <View className="w-20 h-20 bg-blue-600/20 rounded-full items-center justify-center mb-4">
                <Save size={40} color="#60A5FA" />
              </View>
              <Text className="text-3xl font-bold text-white text-center">
                Create Menu?
              </Text>
              <Text className="text-2xl text-gray-400 text-center mt-2">
                Create "{menuName}" with {selectedCategories.length} categories?
              </Text>
            </View>

            {/* Menu Preview */}
            <View className="bg-[#212121] rounded-lg p-6 mb-6">
              <Text className="text-2xl text-white font-medium mb-2">
                {menuName}
              </Text>
              {menuDescription && (
                <Text className="text-xl text-gray-400 mb-2">
                  {menuDescription}
                </Text>
              )}
              <Text className="text-xl text-gray-400">
                {selectedCategories.length} categories • {totalItems} total
                items
              </Text>
            </View>

            {/* Action Buttons */}
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => setShowConfirmation(false)}
                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-4 items-center"
              >
                <Text className="text-2xl text-gray-300 font-medium">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                className="flex-1 bg-blue-600 rounded-lg py-4 items-center"
              >
                <Text className="text-2xl text-white font-medium">
                  {isSaving ? "Creating..." : "Create Menu"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default AddMenuScreen;
