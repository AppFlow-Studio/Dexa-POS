import AddIngredientModal from "@/components/inventory/AddIngredientModal";
import { MenuItemType, RecipeItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Camera,
  Plus,
  Save,
  Trash2,
  Utensils,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
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

// Form data interface
interface MenuItemFormData {
  name: string;
  description: string;
  price: string;
  cashPrice: string;
  categories: string[]; // Array for multiple categories
  meal: MenuItemType["meal"];
  image: string;
  imageBase64?: string;
  availability: boolean;
  modifiers: string[]; // Array of modifier group IDs
  recipe: RecipeItem[];
}

const EditMenuItemScreen: React.FC = () => {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { menuItems, categories, modifierGroups, updateMenuItem } =
    useMenuStore();

  // Find the item to edit
  const itemToEdit = menuItems.find((item) => item.id === itemId);

  const [formData, setFormData] = useState<MenuItemFormData>({
    name: "",
    description: "",
    price: "",
    cashPrice: "",
    categories: [],
    meal: ["Lunch"],
    image: "",
    imageBase64: undefined,
    availability: true,
    modifiers: [],
    recipe: [],
  });

  const [errors, setErrors] = useState<Partial<MenuItemFormData>>({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isRecipeModalOpen, setRecipeModalOpen] = useState(false);

  const { inventoryItems } = useInventoryStore();

  // Get available categories from store
  const availableCategories = categories
    .filter((cat) => cat.isActive)
    .sort((a, b) => a.order - b.order);

  const meals: MenuItemType["meal"][number][] = [
    "Lunch",
    "Dinner",
    "Brunch",
    "Specials",
  ];

  // Initialize form data when item is found
  useEffect(() => {
    if (itemToEdit) {
      setFormData({
        name: itemToEdit.name,
        description: itemToEdit.description || "",
        price: itemToEdit.price.toString(),
        cashPrice: itemToEdit.cashPrice?.toString() || "",
        categories: Array.isArray(itemToEdit.category)
          ? itemToEdit.category
          : [itemToEdit.category],
        meal: itemToEdit.meal,
        image: itemToEdit.image || "",
        imageBase64:
          itemToEdit.image && itemToEdit.image.length > 200
            ? itemToEdit.image
            : undefined,
        availability: itemToEdit.availability !== false,
        modifiers: itemToEdit.modifiers?.map((modifier) => modifier.id) || [],
        recipe: itemToEdit.recipe || [],
      });
    }
  }, [itemToEdit]);

  // Handle form validation
  const validateForm = (): boolean => {
    const newErrors: Partial<MenuItemFormData> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.price.trim()) {
      newErrors.price = "Price is required";
    } else if (
      isNaN(parseFloat(formData.price)) ||
      parseFloat(formData.price) <= 0
    ) {
      newErrors.price = "Price must be a valid positive number";
    }

    if (
      formData.cashPrice &&
      (isNaN(parseFloat(formData.cashPrice)) ||
        parseFloat(formData.cashPrice) <= 0)
    ) {
      newErrors.cashPrice = "Cash price must be a valid positive number";
    }

    if (formData.categories.length === 0) {
      (newErrors as any).categories = "Please select at least one category";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle image picker
  const pickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(
        "Permission Required",
        "Permission to access camera roll is required!"
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFormData((prev) => ({
        ...prev,
        imageBase64: asset.base64 || undefined,
        image: asset.base64 ? "" : asset.uri, // Clear image if using base64
      }));
    }
  };

  // Handle image removal
  const removeImage = () => {
    setFormData((prev) => ({
      ...prev,
      image: "",
      imageBase64: undefined,
    }));
  };

  // Handle save
  const handleSave = () => {
    if (!validateForm()) {
      return;
    }
    setShowConfirmation(true);
  };

  const confirmSave = async () => {
    if (!itemToEdit) return;

    setIsSaving(true);
    setShowConfirmation(false);

    try {
      // Get the full modifier group objects for the selected modifier IDs
      const selectedModifiers = modifierGroups.filter((modifier) =>
        formData.modifiers.includes(modifier.id)
      );

      const updatedMenuItem: Partial<MenuItemType> = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        price: parseFloat(formData.price),
        cashPrice: formData.cashPrice
          ? parseFloat(formData.cashPrice)
          : undefined,
        category: formData.categories,
        meal: formData.meal,
        image: formData.imageBase64 || formData.image || undefined,
        availability: formData.availability,
        modifiers: selectedModifiers.length > 0 ? selectedModifiers : undefined,
        recipe: formData.recipe,
      };

      updateMenuItem(itemToEdit.id, updatedMenuItem);

      // Simulate a small delay for better UX
      await new Promise((resolve) => setTimeout(resolve, 1000));

      router.back();
    } catch (error) {
      Alert.alert("Error", "Failed to update item. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle meal selection
  const toggleMeal = (meal: MenuItemType["meal"][number]) => {
    setFormData((prev) => ({
      ...prev,
      meal: prev.meal.includes(meal)
        ? prev.meal.filter((m) => m !== meal)
        : [...prev.meal, meal],
    }));
  };

  // Handle category selection
  const toggleCategory = (categoryName: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(categoryName)
        ? prev.categories.filter((cat) => cat !== categoryName)
        : [...prev.categories, categoryName],
    }));
  };

  // Handle modifier group selection
  const toggleModifier = (modifierId: string) => {
    setFormData((prev) => ({
      ...prev,
      modifiers: prev.modifiers.includes(modifierId)
        ? prev.modifiers.filter((mod) => mod !== modifierId)
        : [...prev.modifiers, modifierId],
    }));
  };

  // Get image source for preview
  const getImageSource = (): { uri: string } | undefined => {
    if (formData.imageBase64) {
      return { uri: `data:image/jpeg;base64,${formData.imageBase64}` };
    }

    if (formData.image) {
      if (
        formData.image.startsWith("http") ||
        formData.image.startsWith("file://")
      ) {
        return { uri: formData.image };
      }
      // Try to get image from assets
      try {
        return { uri: `@/assets/images/${formData.image}` };
      } catch {
        return undefined;
      }
    }

    return undefined;
  };

  // Handle back navigation
  const handleBack = () => {
    if (
      JSON.stringify(formData) !==
      JSON.stringify({
        name: itemToEdit?.name || "",
        description: itemToEdit?.description || "",
        price: itemToEdit?.price.toString() || "",
        cashPrice: itemToEdit?.cashPrice?.toString() || "",
        categories: Array.isArray(itemToEdit?.category)
          ? itemToEdit.category
          : [itemToEdit?.category || ""],
        meal: itemToEdit?.meal || ["Lunch"],
        image: itemToEdit?.image || "",
        imageBase64:
          itemToEdit?.image && itemToEdit.image.length > 200
            ? itemToEdit.image
            : undefined,
        availability: itemToEdit?.availability !== false,
      })
    ) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. Are you sure you want to go back?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ]
      );
    } else {
      router.back();
    }
  };

  if (!itemToEdit) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center">
        <Text className="text-white text-lg">Item not found</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 bg-blue-600 px-4 py-2 rounded-lg"
        >
          <Text className="text-white">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleAddIngredient = (ingredient: RecipeItem) => {
    // Check if the ingredient already exists
    if (
      !formData.recipe.some(
        (item) => item.inventoryItemId === ingredient.inventoryItemId
      )
    ) {
      setFormData((prev) => ({
        ...prev,
        recipe: [...prev.recipe, ingredient],
      }));
    } else {
      Alert.alert(
        "Duplicate Item",
        "This ingredient is already in the recipe."
      );
    }
  };

  const handleRemoveIngredient = (inventoryItemId: string) => {
    setFormData((prev) => ({
      ...prev,
      recipe: prev.recipe.filter(
        (item) => item.inventoryItemId !== inventoryItemId
      ),
    }));
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={handleBack}
          className="flex-row items-center"
        >
          <ArrowLeft size={20} color="#9CA3AF" />
          <Text className="text-white font-medium ml-2">Back to Menu</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
        >
          <Save size={16} color="white" />
          <Text className="text-white font-medium ml-2">
            {isSaving ? "Saving..." : "Save Changes"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-6">
        <Text className="text-2xl font-bold text-white mb-6">
          Edit Menu Item
        </Text>

        <View className="flex-row gap-6">
          {/* Left Column - Form */}
          <View className="flex-1">
            {/* Name */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-white mb-4">
                Name
              </Text>
              <TextInput
                className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                placeholder="Item name"
                placeholderTextColor="#9CA3AF"
                value={formData.name}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, name: text }))
                }
              />
              {errors.name && (
                <Text className="text-red-400 text-sm mt-1">{errors.name}</Text>
              )}
            </View>

            {/* Description */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-white mb-4">
                Description
              </Text>
              <TextInput
                className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                placeholder="Item description"
                placeholderTextColor="#9CA3AF"
                value={formData.description}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, description: text }))
                }
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Price */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-white mb-4">
                Price
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextInput
                    className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    value={formData.price}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, price: text }))
                    }
                    keyboardType="numeric"
                  />
                  {errors.price && (
                    <Text className="text-red-400 text-sm mt-1">
                      {errors.price}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <TextInput
                    className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                    placeholder="Cash price (optional)"
                    placeholderTextColor="#9CA3AF"
                    value={formData.cashPrice}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, cashPrice: text }))
                    }
                    keyboardType="numeric"
                  />
                  {errors.cashPrice && (
                    <Text className="text-red-400 text-sm mt-1">
                      {errors.cashPrice}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Categories */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-semibold text-white">
                  Categories
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/menu/add-category")}
                  className="flex-row items-center bg-green-600 px-3 py-1 rounded-lg"
                >
                  <Plus size={14} color="white" />
                  <Text className="text-white text-sm font-medium ml-1">
                    Add Category
                  </Text>
                </TouchableOpacity>
              </View>

              {availableCategories.length === 0 ? (
                <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
                  <Text className="text-gray-400 text-center mb-3">
                    No categories available. Create one to continue.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/menu/add-category")}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                  >
                    <Plus size={16} color="white" />
                    <Text className="text-white font-medium ml-2">
                      Create Category
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View className="flex-row flex-wrap gap-2">
                    {availableCategories.map((category) => (
                      <TouchableOpacity
                        key={category.id}
                        onPress={() => toggleCategory(category.name)}
                        className={`px-4 py-3 rounded-lg border ${
                          formData.categories.includes(category.name)
                            ? "bg-blue-600 border-blue-500"
                            : "bg-[#303030] border-gray-600"
                        }`}
                      >
                        <Text
                          className={`font-medium ${
                            formData.categories.includes(category.name)
                              ? "text-white"
                              : "text-gray-300"
                          }`}
                        >
                          {category.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {formData.categories.length > 0 && (
                    <View className="mt-3">
                      <Text className="text-gray-400 text-sm mb-2">
                        Selected Categories:
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {formData.categories.map((categoryName, index) => (
                          <View
                            key={index}
                            className="flex-row items-center bg-blue-600/20 border border-blue-500 px-3 py-2 rounded-lg"
                          >
                            <Text className="text-blue-400 text-sm font-medium">
                              {categoryName}
                            </Text>
                            <TouchableOpacity
                              onPress={() => toggleCategory(categoryName)}
                              className="ml-2"
                            >
                              <X size={14} color="#60A5FA" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {errors.categories && (
                    <Text className="text-red-400 text-sm mt-2">
                      {errors.categories}
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Meal Types */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-white mb-4">
                Available For
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {meals.map((meal) => (
                  <TouchableOpacity
                    key={meal}
                    onPress={() => toggleMeal(meal)}
                    className={`px-4 py-2 rounded-lg border ${
                      formData.meal.includes(meal)
                        ? "bg-blue-600 border-blue-500"
                        : "bg-[#303030] border-gray-600"
                    }`}
                  >
                    <Text
                      className={`font-medium ${
                        formData.meal.includes(meal)
                          ? "text-white"
                          : "text-gray-300"
                      }`}
                    >
                      {meal}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Modifier Groups */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-semibold text-white">
                  Modifier Groups
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/menu/add-modifier")}
                  className="flex-row items-center bg-green-600 px-3 py-1 rounded-lg"
                >
                  <Plus size={14} color="white" />
                  <Text className="text-white text-sm font-medium ml-1">
                    Add Modifier
                  </Text>
                </TouchableOpacity>
              </View>

              {modifierGroups.length === 0 ? (
                <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
                  <Text className="text-gray-400 text-center mb-3">
                    No modifier groups available. Create one to add
                    customization options.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/menu/add-modifier")}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                  >
                    <Plus size={16} color="white" />
                    <Text className="text-white font-medium ml-2">
                      Create Modifier Group
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View className="flex-row flex-wrap gap-2">
                    {modifierGroups.map((modifier) => (
                      <TouchableOpacity
                        key={modifier.id}
                        onPress={() => toggleModifier(modifier.id)}
                        className={`px-4 py-3 rounded-lg border ${
                          formData.modifiers.includes(modifier.id)
                            ? "bg-blue-600 border-blue-500"
                            : "bg-[#303030] border-gray-600"
                        }`}
                      >
                        <View className="flex-row items-center gap-2">
                          <Text
                            className={`font-medium ${
                              formData.modifiers.includes(modifier.id)
                                ? "text-white"
                                : "text-gray-300"
                            }`}
                          >
                            {modifier.name}
                          </Text>
                          <View
                            className={`px-2 py-1 rounded-full ${modifier.type === "required" ? "bg-red-900/30 border border-red-500" : "bg-blue-900/30 border border-blue-500"}`}
                          >
                            <Text
                              className={`text-xs ${modifier.type === "required" ? "text-red-400" : "text-blue-400"}`}
                            >
                              {modifier.type}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {formData.modifiers.length > 0 && (
                    <View className="mt-3">
                      <Text className="text-gray-400 text-sm mb-2">
                        Selected Modifier Groups:
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {formData.modifiers.map((modifierId, index) => {
                          const modifier = modifierGroups.find(
                            (m) => m.id === modifierId
                          );
                          return (
                            <View
                              key={index}
                              className="flex-row items-center bg-blue-600/20 border border-blue-500 px-3 py-2 rounded-lg"
                            >
                              <Text className="text-blue-400 text-sm font-medium">
                                {modifier?.name}
                              </Text>
                              <TouchableOpacity
                                onPress={() => toggleModifier(modifierId)}
                                className="ml-2"
                              >
                                <X size={14} color="#60A5FA" />
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Recipe / Inventory Components */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-semibold text-white">
                  Recipe / Components
                </Text>
                <TouchableOpacity
                  onPress={() => setRecipeModalOpen(true)}
                  className="flex-row items-center bg-green-600 px-3 py-1 rounded-lg"
                >
                  <Plus size={14} color="white" />
                  <Text className="text-white text-sm font-medium ml-1">
                    Add Ingredient
                  </Text>
                </TouchableOpacity>
              </View>

              {formData.recipe.length > 0 ? (
                <View className="flex-col gap-2">
                  {formData.recipe.map((recipeItem, index) => {
                    const inventoryItem = inventoryItems.find(
                      (i) => i.id === recipeItem.inventoryItemId
                    );
                    return (
                      <View
                        key={recipeItem.inventoryItemId}
                        className="flex-row justify-between items-center bg-[#303030] border border-gray-600 rounded-lg p-3"
                      >
                        <Text className="text-white">
                          {inventoryItem?.name || "Unknown Item"}
                        </Text>
                        <View className="flex-row items-center gap-4">
                          <Text className="text-gray-300">
                            {recipeItem.quantity} {inventoryItem?.unit}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              handleRemoveIngredient(recipeItem.inventoryItemId)
                            }
                          >
                            <Trash2 size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
                  <Text className="text-gray-400">
                    No inventory items linked yet.
                  </Text>
                  <Text className="text-gray-500 text-sm mt-1">
                    Add ingredients to track stock automatically.
                  </Text>
                </View>
              )}
            </View>

            {/* Image */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-white mb-4">
                Image
              </Text>

              {/* Image Preview */}
              {getImageSource() && (
                <View className="mb-4">
                  <View className="w-32 h-32 rounded-lg border border-gray-600 overflow-hidden">
                    <Image
                      source={getImageSource()}
                      className="w-full h-full object-cover"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={removeImage}
                    className="flex-row items-center mt-2"
                  >
                    <Trash2 size={16} color="#EF4444" />
                    <Text className="text-red-400 text-sm ml-1">
                      Remove Image
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={pickImage}
                className="flex-row items-center bg-blue-600 px-4 py-3 rounded-lg"
              >
                <Camera size={16} color="white" />
                <Text className="text-white font-medium ml-2">
                  {getImageSource() ? "Change Image" : "Pick Image"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Availability */}
            <View className="mb-6">
              <Text className="text-lg font-semibold text-white mb-4">
                Availability
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setFormData((prev) => ({
                    ...prev,
                    availability: !prev.availability,
                  }))
                }
                className={`flex-row items-center px-4 py-3 rounded-lg border ${
                  formData.availability
                    ? "bg-green-600 border-green-500"
                    : "bg-red-600 border-red-500"
                }`}
              >
                <Text className="text-white font-medium">
                  {formData.availability ? "Available" : "Unavailable"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Right Column - Preview */}
          <View className="w-80">
            <Text className="text-lg font-semibold text-white mb-4">
              Preview
            </Text>

            <View className="bg-[#303030] rounded-lg border border-gray-700 p-4">
              {/* Image Preview */}
              <View className="w-full h-48 rounded-lg border border-gray-600 overflow-hidden mb-4">
                {getImageSource() ? (
                  <Image
                    source={getImageSource()}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <View className="w-full h-full bg-gray-600 items-center justify-center">
                    <Utensils color="#9ca3af" size={48} />
                  </View>
                )}
              </View>

              {/* Item Details */}
              <Text className="text-white font-bold text-xl mb-2">
                {formData.name || "Item Name"}
              </Text>

              {formData.description && (
                <Text className="text-gray-300 text-sm mb-3">
                  {formData.description}
                </Text>
              )}

              <Text className="text-blue-400 font-bold text-2xl mb-4">
                ${formData.price || "0.00"}
              </Text>

              {/* Additional Preview Info */}
              <View className="w-full mt-4 gap-y-2">
                <View className="bg-[#212121] p-3 rounded-lg">
                  <Text className="text-sm text-gray-400">Categories</Text>
                  {formData.categories.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1 mt-1">
                      {formData.categories.map((category, index) => (
                        <View
                          key={index}
                          className="bg-blue-900/30 border border-blue-500 px-2 py-1 rounded"
                        >
                          <Text className="text-xs text-blue-400">
                            {category}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text className="text-gray-500 text-sm mt-1">
                      No categories selected
                    </Text>
                  )}
                </View>

                <View className="bg-[#212121] p-3 rounded-lg">
                  <Text className="text-sm text-gray-400">Available For</Text>
                  <View className="flex-row flex-wrap gap-1 mt-1">
                    {formData.meal.map((meal, index) => (
                      <View
                        key={index}
                        className="bg-green-900/30 border border-green-500 px-2 py-1 rounded"
                      >
                        <Text className="text-xs text-green-400">{meal}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {formData.modifiers.length > 0 && (
                  <View className="bg-[#212121] p-3 rounded-lg">
                    <Text className="text-sm text-gray-400">
                      Modifier Groups
                    </Text>
                    <View className="flex-row flex-wrap gap-1 mt-1">
                      {formData.modifiers.map((modifierId, index) => {
                        const modifier = modifierGroups.find(
                          (m) => m.id === modifierId
                        );
                        return (
                          <View
                            key={index}
                            className="bg-purple-900/30 border border-purple-500 px-2 py-1 rounded"
                          >
                            <Text className="text-xs text-purple-400">
                              {modifier?.name}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View className="bg-[#212121] p-3 rounded-lg">
                  <Text className="text-sm text-gray-400">Status</Text>
                  <Text
                    className={`text-sm mt-1 ${formData.availability ? "text-green-400" : "text-red-400"}`}
                  >
                    {formData.availability ? "Available" : "Unavailable"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-6">
          <View className="bg-[#303030] rounded-2xl p-6 w-full max-w-sm border border-gray-600">
            {/* Header */}
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-blue-600/20 rounded-full items-center justify-center mb-4">
                <Save size={32} color="#60A5FA" />
              </View>
              <Text className="text-xl font-bold text-white text-center">
                Save Changes?
              </Text>
              <Text className="text-gray-400 text-center mt-2">
                Update "{formData.name}" with your changes?
              </Text>
            </View>

            {/* Item Preview */}
            <View className="bg-[#212121] rounded-lg p-4 mb-6">
              <View className="flex-row items-center gap-3">
                {getImageSource() && (
                  <View className="w-12 h-12 rounded border border-gray-600 overflow-hidden">
                    <Image
                      source={getImageSource()}
                      className="w-full h-full object-cover"
                    />
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-white font-medium">
                    {formData.name || "Item Name"}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    {formData.categories.length > 0
                      ? formData.categories.join(", ")
                      : "No categories"}{" "}
                    • ${formData.price || "0.00"}
                  </Text>
                  {formData.modifiers.length > 0 && (
                    <Text className="text-purple-400 text-xs mt-1">
                      {formData.modifiers.length} modifier group(s) selected
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowConfirmation(false)}
                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-3 items-center"
              >
                <Text className="text-gray-300 font-medium">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                className="flex-1 bg-blue-600 rounded-lg py-3 items-center"
              >
                <Text className="text-white font-medium">
                  {isSaving ? "Saving..." : "Save Changes"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <AddIngredientModal
        isOpen={isRecipeModalOpen}
        onClose={() => setRecipeModalOpen(false)}
        onAddIngredient={handleAddIngredient}
      />
    </View>
  );
};

export default EditMenuItemScreen;
