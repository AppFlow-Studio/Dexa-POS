import AddIngredientModal from "@/components/inventory/AddIngredientModal";
import RecipeIngredientSheet from "@/components/inventory/RecipeIngredientSheet";
import { MenuItemType, RecipeItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { toast } from "@backpackapp-io/react-native-toast";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import {
  ArrowLeft,
  Camera,
  Plus,
  Save,
  Utensils,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
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
  categories: string[]; // Changed to array for multiple categories
  meal: MenuItemType["meal"];
  image: string;
  imageBase64?: string;
  availability: boolean;
  modifiers: string[]; // Array of modifier group IDs
}

const AddMenuItemScreen: React.FC = () => {
  const { addMenuItem, categories, modifierGroups } = useMenuStore();

  const [formData, setFormData] = useState<MenuItemFormData>({
    name: "",
    description: "",
    price: "",
    cashPrice: "",
    categories: [], // Start with empty array
    meal: ["Lunch"],
    image: "",
    imageBase64: undefined,
    availability: true,
    modifiers: [], // Start with empty array
  });

  const [errors, setErrors] = useState<Partial<MenuItemFormData>>({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [isRecipeModalOpen, setRecipeModalOpen] = useState(false);
  const recipeSheetRef = React.useRef<any>(null);

  // Recipe editing state
  const [editingRecipeItemIndex, setEditingRecipeItemIndex] = useState<
    number | null
  >(null);
  const inventorySelectionSheetRef = React.useRef<BottomSheet>(null);
  const inventorySnapPoints = useMemo(() => ["70%"], []);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");

  const { inventoryItems } = useInventoryStore();

  // Validation
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
    toast.error(Object.keys(newErrors).join(", "));
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
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFormData((prev) => ({
        ...prev,
        image: asset.fileName || "uploaded_image.jpg",
        imageBase64: asset.base64 || undefined,
      }));
    }
  };

  const removeImage = () => {
    setFormData((prev) => ({
      ...prev,
      image: "",
      imageBase64: undefined,
    }));
  };

  // Handle form submission
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
      const newMenuItem: Omit<MenuItemType, "id"> = {
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
        modifierGroupIds:
          formData.modifiers.length > 0 ? formData.modifiers : undefined,
        recipe: recipeItems,
      };

      addMenuItem(newMenuItem);

      // Simulate a small delay for better UX
      await new Promise((resolve) => setTimeout(resolve, 1000));

      router.back();
    } catch (error) {
      Alert.alert("Error", "Failed to save menu item. Please try again.");
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
      // Try to get image from assets
      try {
        return { uri: `@/assets/images/${formData.image}` };
      } catch {
        return undefined;
      }
    }

    return undefined;
  };

  const handleAddIngredient = (ingredient: RecipeItem) => {
    // Check if the ingredient already exists to prevent duplicates
    if (
      !recipeItems.some(
        (item) => item.inventoryItemId === ingredient.inventoryItemId
      )
    ) {
      setRecipeItems((prev) => [...prev, ingredient]);
    } else {
      Alert.alert(
        "Duplicate Item",
        "This ingredient is already in the recipe."
      );
    }
  };

  const handleRemoveIngredient = (inventoryItemId: string) => {
    setRecipeItems((prev) =>
      prev.filter((item) => item.inventoryItemId !== inventoryItemId)
    );
  };

  // Helper functions for inventory items
  const getInventoryItemName = (inventoryItemId: string) => {
    const item = inventoryItems.find((i) => i.id === inventoryItemId);
    return item?.name || "Unknown Item";
  };

  const getInventoryItemUnit = (inventoryItemId: string) => {
    const item = inventoryItems.find((i) => i.id === inventoryItemId);
    return item?.unit || "";
  };

  // Filter inventory items based on search
  const filteredInventoryItems = useMemo(() => {
    if (!inventorySearchQuery.trim()) return inventoryItems;
    const query = inventorySearchQuery.toLowerCase();
    return inventoryItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
    );
  }, [inventorySearchQuery, inventoryItems]);

  // Open inventory selection sheet
  const openInventorySelection = () => {
    setInventorySearchQuery("");
    inventorySelectionSheetRef.current?.expand();
  };

  // Select inventory item for recipe
  const selectInventoryItem = (inventoryItemId: string) => {
    if (editingRecipeItemIndex !== null) {
      // Replace existing item
      setRecipeItems((prev) =>
        prev.map((item, index) =>
          index === editingRecipeItemIndex ? { ...item, inventoryItemId } : item
        )
      );
      setEditingRecipeItemIndex(null);
    } else {
      // Add new item
      setRecipeItems((prev) => [...prev, { inventoryItemId, quantity: 1 }]);
    }
    inventorySelectionSheetRef.current?.close();
  };

  // Update recipe item quantity
  const updateRecipeItemQuantity = (index: number, quantity: string) => {
    setRecipeItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity: parseFloat(quantity) || 0 } : item
      )
    );
  };

  // Remove recipe item
  const removeRecipeItem = (index: number) => {
    setRecipeItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Render inventory backdrop
  const renderInventoryBackdrop = useMemo(
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

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-3 border-b border-gray-700 bg-[#303030]">
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
          className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
        >
          <Save size={20} color="white" />
          <Text className="text-xl text-white font-medium ml-1.5">
            Save Item
          </Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1 flex-row">
        {/* Form Section - Left Side */}
        <ScrollView className="flex-1 p-4 bg-[#212121]">
          <Text className="text-2xl font-bold text-white mb-4">
            Add New Menu Item
          </Text>

          {/* Basic Information */}
          <View className="mb-4">
            <Text className="text-xl font-semibold text-white mb-3">
              Basic Information
            </Text>

            {/* Name */}
            <View className="mb-3">
              <Text className="text-lg text-white font-medium mb-1.5">
                Name *
              </Text>
              <TextInput
                className={`bg-[#303030] border rounded-lg px-4 py-3 text-lg h-16 text-white ${
                  errors.name ? "border-red-500" : "border-gray-600"
                }`}
                placeholder="Enter item name"
                placeholderTextColor="#9CA3AF"
                value={formData.name}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, name: text }))
                }
              />
              {errors.name && (
                <Text className="text-base text-red-400 mt-1">
                  {errors.name}
                </Text>
              )}
            </View>

            {/* Description */}
            <View className="mb-3">
              <Text className="text-lg text-white font-medium mb-1.5">
                Description
              </Text>
              <TextInput
                className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 h-16 text-lg text-white"
                placeholder="Enter item description"
                placeholderTextColor="#9CA3AF"
                value={formData.description}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, description: text }))
                }
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Image */}
            <View className="mb-3">
              <Text className="text-lg text-white font-medium mb-1.5">
                Item Image
              </Text>

              {getImageSource() && (
                <View className="mb-2 relative">
                  <Image
                    source={getImageSource()}
                    className="w-full h-40 rounded-lg object-cover"
                  />
                  <TouchableOpacity
                    onPress={removeImage}
                    className="absolute top-1.5 right-1.5 bg-red-600 rounded-full p-1.5"
                  >
                    <X size={18} color="white" />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={pickImage}
                className="flex-row items-center justify-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3"
              >
                <Camera size={20} color="#9CA3AF" />
                <Text className="text-lg text-white ml-2">
                  {getImageSource() ? "Change Image" : "Pick Image"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pricing */}
          <View className="mb-4">
            <Text className="text-xl font-semibold text-white mb-3">
              Pricing
            </Text>

            <View className="mb-3">
              <Text className="text-lg text-white font-medium mb-1.5">
                Price *
              </Text>
              <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4">
                <Text className="text-lg text-white">$</Text>
                <TextInput
                  className="flex-1 ml-2 text-lg h-16 text-white"
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  value={formData.price}
                  onChangeText={(text) =>
                    setFormData((prev) => ({ ...prev, price: text }))
                  }
                  keyboardType="numeric"
                />
              </View>
              {errors.price && (
                <Text className="text-base text-red-400 mt-1">
                  {errors.price}
                </Text>
              )}
            </View>

            <View className="mb-3">
              <Text className="text-lg text-white font-medium mb-1.5">
                Cash Price (Optional)
              </Text>
              <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4">
                <Text className="text-lg text-white">$</Text>
                <TextInput
                  className="flex-1 ml-2 text-lg text-white h-16"
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  value={formData.cashPrice}
                  onChangeText={(text) =>
                    setFormData((prev) => ({ ...prev, cashPrice: text }))
                  }
                  keyboardType="numeric"
                />
              </View>
              {errors.cashPrice && (
                <Text className="text-base text-red-400 mt-1">
                  {errors.cashPrice}
                </Text>
              )}
            </View>
          </View>

          {/* Categories */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xl font-semibold text-white">
                Categories
              </Text>
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

            {availableCategories.length === 0 ? (
              <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
                <Text className="text-xl text-gray-400 text-center mb-2">
                  No categories available. Create one to continue.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/menu/add-category")}
                  className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                  <Plus size={20} color="white" />
                  <Text className="text-xl text-white font-medium ml-1.5">
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
                        className={`text-lg font-medium ${
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
                    <Text className="text-lg text-gray-400 mb-1.5">
                      Selected Categories:
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {formData.categories.map((categoryName, index) => (
                        <View
                          key={index}
                          className="flex-row items-center bg-blue-600/20 border border-blue-500 px-3 py-2 rounded-lg"
                        >
                          <Text className="text-lg text-blue-400 font-medium">
                            {categoryName}
                          </Text>
                          <TouchableOpacity
                            onPress={() => toggleCategory(categoryName)}
                            className="ml-1.5"
                          >
                            <X size={16} color="#60A5FA" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {errors.categories && (
                  <Text className="text-base text-red-400 mt-1.5">
                    {errors.categories}
                  </Text>
                )}
              </>
            )}
          </View>

          {/* Modifier Groups */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xl font-semibold text-white">
                Modifier Groups
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/menu/add-modifier")}
                className="flex-row items-center bg-green-600 px-3 py-1.5 rounded-lg"
              >
                <Plus size={18} color="white" />
                <Text className="text-base text-white font-medium ml-1">
                  Add Modifier
                </Text>
              </TouchableOpacity>
            </View>

            {modifierGroups.length === 0 ? (
              <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
                <Text className="text-xl text-gray-400 text-center mb-2">
                  No modifier groups available.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/menu/add-modifier")}
                  className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                  <Plus size={20} color="white" />
                  <Text className="text-xl text-white font-medium ml-1.5">
                    Create Modifier Group
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View className="flex-row flex-wrap gap-2">
                  {modifierGroups.map((modifier) => (
                    <Pressable
                      key={modifier.id}
                      onPress={() => toggleModifier(modifier.id)}
                      className={`px-4 py-3 h-16 rounded-lg border ${
                        formData.modifiers.includes(modifier.id)
                          ? "bg-green-600 border-green-500"
                          : "bg-[#303030] border-gray-600"
                      }`}
                    >
                      <View className="flex-row items-center gap-1.5">
                        <Text
                          className={`text-lg font-medium ${
                            formData.modifiers.includes(modifier.id)
                              ? "text-white"
                              : "text-gray-300"
                          }`}
                        >
                          {modifier.name}
                        </Text>
                        <View
                          className={`px-2.5 py-1.5 rounded-full ${
                            modifier.type === "required"
                              ? `${
                                  formData.modifiers.includes(modifier.id)
                                    ? "bg-red-900 border border-red-500"
                                    : "bg-red-900/30 border border-red-500"
                                }`
                              : `${
                                  formData.modifiers.includes(modifier.id)
                                    ? "bg-blue-900 border border-blue-500"
                                    : "bg-blue-900/30 border border-blue-500"
                                }`
                          }`}
                        >
                          <Text
                            className={`text-base ${
                              modifier.type === "required"
                                ? `${
                                    formData.modifiers.includes(modifier.id)
                                      ? "text-red-100"
                                      : "text-red-400"
                                  }`
                                : `${
                                    formData.modifiers.includes(modifier.id)
                                      ? "text-blue-100"
                                      : "text-blue-400"
                                  }`
                            }`}
                          >
                            {modifier.type}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>

                {formData.modifiers.length > 0 && (
                  <View className="mt-3">
                    <Text className="text-lg text-gray-400 mb-1.5">
                      Selected Modifier Groups:
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {formData.modifiers.map((modifierId, index) => {
                        const modifier = modifierGroups.find(
                          (m) => m.id === modifierId
                        );
                        return (
                          <View
                            key={index}
                            className="flex-row items-center bg-blue-600/20 border border-blue-500 px-3 py-2 rounded-lg"
                          >
                            <Text className="text-lg text-blue-400 font-medium">
                              {modifier?.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() => toggleModifier(modifierId)}
                              className="ml-1.5"
                            >
                              <X size={16} color="#60A5FA" />
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
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xl font-semibold text-white">
                Recipe / Components
              </Text>
            </View>

            {recipeItems.length === 0 ? (
              <View className="bg-gray-800 rounded-lg p-4 items-center">
                <Text className="text-gray-400 text-center mb-1.5 text-base">
                  No recipe items defined
                </Text>
                <Text className="text-gray-500 text-xs text-center mb-3">
                  Add inventory items to create a recipe
                </Text>
                <TouchableOpacity
                  onPress={openInventorySelection}
                  className="bg-blue-600 px-3 py-1.5 rounded-lg flex-row items-center"
                >
                  <Plus color="white" size={14} />
                  <Text className="text-white ml-1.5 font-semibold text-sm">
                    Add Recipe Item
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="gap-y-2">
                {recipeItems.map((recipeItem, index) => (
                  <View key={index} className="bg-gray-800 rounded-lg p-3">
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        className="flex-1"
                        onPress={() => {
                          setEditingRecipeItemIndex(index);
                          openInventorySelection();
                        }}
                      >
                        <View>
                          <Text className="font-semibold text-white text-base">
                            {getInventoryItemName(recipeItem.inventoryItemId)}
                          </Text>
                          <Text className="text-xs text-gray-400">
                            {getInventoryItemUnit(recipeItem.inventoryItemId)}
                          </Text>
                          <Text className="text-blue-400 text-[10px] mt-0.5">
                            Tap to change item
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View className="w-20">
                        <View>
                          <TextInput
                            value={recipeItem.quantity.toString()}
                            onChangeText={(text) =>
                              updateRecipeItemQuantity(index, text)
                            }
                            keyboardType="numeric"
                            className="bg-[#212121] border border-gray-600 text-white p-1.5 rounded text-center h-16 text-sm"
                            placeholder="0"
                            placeholderTextColor="#9CA3AF"
                          />
                          <Text className="text-gray-400 text-[10px] text-center mt-0.5">
                            Quantity
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        onPress={() => removeRecipeItem(index)}
                        className="bg-red-600 p-1.5 rounded-lg"
                      >
                        <X color="white" size={14} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  onPress={openInventorySelection}
                  className="bg-gray-700 border-2 border-dashed border-gray-500 rounded-lg p-3 items-center"
                >
                  <Plus color="#9CA3AF" size={20} />
                  <Text className="text-gray-400 mt-1.5 font-semibold text-sm">
                    Add Recipe Item
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Availability */}
          <View className="mb-4">
            <Text className="text-xl font-semibold text-white mb-3">
              Availability
            </Text>
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({
                  ...prev,
                  availability: !prev.availability,
                }))
              }
              className={`flex-row items-center justify-between p-4 rounded-lg border ${
                formData.availability
                  ? "bg-green-900/30 border-green-500"
                  : "bg-red-900/30 border-red-500"
              }`}
            >
              <Text className="text-xl text-white font-medium">
                {formData.availability ? "Available" : "Unavailable"}
              </Text>
              <View
                className={`w-7 h-7 rounded-full border-2 ${
                  formData.availability
                    ? "bg-green-500 border-green-500"
                    : "bg-transparent border-red-500"
                }`}
              >
                {formData.availability && (
                  <View className="w-2.5 h-2.5 bg-white rounded-full m-1" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Preview Section - Right Side */}
        <View className="w-80 border-l border-gray-700 bg-[#303030] p-4">
          <Text className="text-xl font-semibold text-white mb-3">Preview</Text>

          <View className="items-center">
            <View className="w-full rounded-2xl mb-2 bg-[#303030] border border-gray-600">
              <View className="flex-col items-center gap-1.5 overflow-hidden rounded-lg">
                {getImageSource() ? (
                  <Image
                    source={getImageSource()}
                    className="w-full h-40 object-cover rounded-lg"
                  />
                ) : (
                  <View className="w-full h-40 rounded-xl items-center justify-center">
                    <Utensils color="#9ca3af" size={36} />
                  </View>
                )}
                <View className="w-full px-3 pb-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xl font-bold text-white mt-2 flex-1">
                      {formData.name || "Item Name"}
                    </Text>
                  </View>
                  <View className="flex-row items-baseline mt-0.5">
                    <Text className="text-xl font-semibold text-white">
                      $
                      {formData.price
                        ? parseFloat(formData.price).toFixed(2)
                        : "0.00"}
                    </Text>
                    {formData.cashPrice && (
                      <Text className="text-base text-gray-300 ml-1.5">
                        Cash: ${parseFloat(formData.cashPrice).toFixed(2)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>

            <View className="w-full mt-3 gap-y-2">
              <View className="bg-[#212121] p-3 rounded-lg">
                <Text className="text-lg text-gray-400">Categories</Text>
                {formData.categories.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1.5 mt-1">
                    {formData.categories.map((category, index) => (
                      <View
                        key={index}
                        className="bg-blue-900/30 border border-blue-500 px-2.5 py-1.5 rounded"
                      >
                        <Text className="text-base text-blue-400">
                          {category}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-lg text-gray-500 mt-1">
                    No categories
                  </Text>
                )}
              </View>

              <View className="bg-[#212121] p-3 rounded-lg">
                <Text className="text-lg text-gray-400">Available For</Text>
                <View className="flex-row flex-wrap gap-1.5 mt-1">
                  {formData.meal.map((meal, index) => (
                    <View
                      key={index}
                      className="bg-blue-900/30 border border-blue-500 px-2.5 py-1.5 rounded"
                    >
                      <Text className="text-base text-blue-400">{meal}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {formData.modifiers.length > 0 && (
                <View className="bg-[#212121] p-3 rounded-lg">
                  <Text className="text-lg text-gray-400">Modifiers</Text>
                  <View className="flex-row flex-wrap gap-1.5 mt-1">
                    {formData.modifiers.map((modifierId, index) => {
                      const modifier = modifierGroups.find(
                        (m) => m.id === modifierId
                      );
                      return (
                        <View
                          key={index}
                          className="bg-green-900/30 border border-green-500 px-2.5 py-1.5 rounded"
                        >
                          <Text className="text-base text-green-400">
                            {modifier?.name}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {formData.description && (
                <View className="bg-[#212121] p-3 rounded-lg">
                  <Text className="text-lg text-gray-400">Description</Text>
                  <Text className="text-xl text-white mt-1">
                    {formData.description}
                  </Text>
                </View>
              )}

              <View className="bg-[#212121] p-3 rounded-lg">
                <Text className="text-lg text-gray-400">Status</Text>
                <Text
                  className={`text-xl font-medium ${
                    formData.availability ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {formData.availability ? "Available" : "Unavailable"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

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
                Save Menu Item?
              </Text>
              <Text className="text-xl text-gray-400 text-center mt-1.5">
                Add "{formData.name || "this item"}" to menu?
              </Text>
            </View>

            <View className="bg-[#212121] rounded-lg p-4 mb-4">
              <View className="flex-row items-center gap-3">
                {getImageSource() ? (
                  <Image
                    source={getImageSource()}
                    className="w-14 h-14 rounded-lg object-cover"
                  />
                ) : (
                  <View className="w-14 h-14 rounded-lg bg-gray-600 items-center justify-center">
                    <Utensils color="#9ca3af" size={20} />
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-xl text-white font-medium">
                    {formData.name || "Item Name"}
                  </Text>
                  <Text className="text-lg text-gray-400">
                    {formData.categories.length > 0
                      ? formData.categories.join(", ")
                      : "No categories"}{" "}
                    • ${formData.price || "0.00"}
                  </Text>
                  {formData.modifiers.length > 0 && (
                    <Text className="text-base text-green-400 mt-0.5">
                      {formData.modifiers.length} modifier(s)
                    </Text>
                  )}
                </View>
              </View>
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
                  {isSaving ? "Saving..." : "Save Item"}
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
      <RecipeIngredientSheet
        ref={recipeSheetRef}
        existingIds={recipeItems.map((r) => r.inventoryItemId)}
        currentId={null}
        onSelect={(inventoryItemId) => {
          if (recipeItems.some((r) => r.inventoryItemId === inventoryItemId))
            return;
          setRecipeItems((prev) => [...prev, { inventoryItemId, quantity: 1 }]);
        }}
      />

      <BottomSheet
        ref={inventorySelectionSheetRef}
        index={-1}
        snapPoints={inventorySnapPoints}
        enablePanDownToClose={true}
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={renderInventoryBackdrop}
      >
        <View className="flex-1">
          <View className="flex-row items-center justify-between p-3 border-b border-gray-700">
            <View className="flex-1">
              <Text className="text-lg font-bold text-white">
                {editingRecipeItemIndex !== null
                  ? "Replace Item"
                  : "Select Item"}
              </Text>
              {editingRecipeItemIndex !== null && (
                <Text className="text-blue-400 text-xs mt-0.5">
                  Choose a new item to replace the current one
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                setEditingRecipeItemIndex(null);
                inventorySelectionSheetRef.current?.close();
              }}
            >
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          </View>

          <View className="p-3 border-b border-gray-700">
            <View className="flex-row items-center bg-[#212121] rounded-lg px-2.5 py-1.5">
              <TextInput
                value={inventorySearchQuery}
                onChangeText={(text) => setInventorySearchQuery(text.trim())}
                placeholder="Search inventory..."
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-white ml-2 h-16 text-base"
              />
            </View>
          </View>

          {filteredInventoryItems.length === 0 ? (
            <View className="flex-1 justify-center items-center p-6">
              <Text className="text-gray-400 text-base text-center">
                {inventorySearchQuery
                  ? "No items found"
                  : "No inventory items available"}
              </Text>
            </View>
          ) : (
            <BottomSheetFlatList
              data={filteredInventoryItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item: inventoryItem }) => {
                const isAlreadyInRecipe = recipeItems.some(
                  (recipeItem) =>
                    recipeItem.inventoryItemId === inventoryItem.id
                );
                const isCurrentlyEditing =
                  editingRecipeItemIndex !== null &&
                  recipeItems[editingRecipeItemIndex]?.inventoryItemId ===
                    inventoryItem.id;

                return (
                  <TouchableOpacity
                    onPress={() => selectInventoryItem(inventoryItem.id)}
                    disabled={isAlreadyInRecipe && !isCurrentlyEditing}
                    className={`p-3 border-b border-gray-700 ${
                      isCurrentlyEditing
                        ? "bg-blue-900 border-blue-600"
                        : isAlreadyInRecipe
                        ? "bg-gray-800 opacity-50"
                        : "bg-transparent"
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text
                          className={`font-semibold text-base ${
                            isCurrentlyEditing
                              ? "text-blue-300"
                              : isAlreadyInRecipe
                              ? "text-gray-500"
                              : "text-white"
                          }`}
                        >
                          {inventoryItem.name}
                        </Text>
                        <Text
                          className={`text-xs ${
                            isCurrentlyEditing
                              ? "text-blue-400"
                              : isAlreadyInRecipe
                              ? "text-gray-600"
                              : "text-gray-400"
                          }`}
                        >
                          {inventoryItem.stockQuantity} {inventoryItem.unit} • $
                          {inventoryItem.cost.toFixed(2)}
                        </Text>
                      </View>
                      {isCurrentlyEditing ? (
                        <View className="bg-blue-600 px-1.5 py-0.5 rounded">
                          <Text className="text-white text-[10px]">
                            Selected
                          </Text>
                        </View>
                      ) : isAlreadyInRecipe ? (
                        <View className="bg-gray-600 px-1.5 py-0.5 rounded">
                          <Text className="text-gray-300 text-[10px]">
                            Added
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={{ paddingBottom: 16 }}
            />
          )}
        </View>
      </BottomSheet>
    </View>
  );
};

export default AddMenuItemScreen;
