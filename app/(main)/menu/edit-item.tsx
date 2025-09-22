import AddIngredientModal from "@/components/inventory/AddIngredientModal";
import RecipeIngredientSheet from "@/components/inventory/RecipeIngredientSheet";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType, RecipeItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronUp,
  Plus,
  Save,
  Trash2,
  Utensils,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
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
  const recipeSheetRef = React.useRef<any>(null);
  const [expandedModifiers, setExpandedModifiers] = useState<
    Record<string, boolean>
  >({});
  // Recipe editing state
  const [editingRecipeItemIndex, setEditingRecipeItemIndex] = useState<
    number | null
  >(null);
  const inventorySelectionSheetRef = React.useRef<BottomSheet>(null);
  const inventorySnapPoints = useMemo(() => ["70%"], []);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");

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
        <Text className="text-2xl text-white">Item not found</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 bg-blue-600 px-6 py-3 rounded-lg"
        >
          <Text className="text-xl text-white">Go Back</Text>
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
      setFormData((prev) => ({
        ...prev,
        recipe: prev.recipe.map((item, index) =>
          index === editingRecipeItemIndex ? { ...item, inventoryItemId } : item
        ),
      }));
      setEditingRecipeItemIndex(null);
    } else {
      // Add new item
      setFormData((prev) => ({
        ...prev,
        recipe: [...prev.recipe, { inventoryItemId, quantity: 1 }],
      }));
    }
    inventorySelectionSheetRef.current?.close();
  };

  // Update recipe item quantity
  const updateRecipeItemQuantity = (index: number, quantity: string) => {
    setFormData((prev) => ({
      ...prev,
      recipe: prev.recipe.map((item, i) =>
        i === index ? { ...item, quantity: parseFloat(quantity) || 0 } : item
      ),
    }));
  };

  // Remove recipe item
  const removeRecipeItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      recipe: prev.recipe.filter((_, i) => i !== index),
    }));
  };

  // Render inventory backdrop
  const renderInventoryBackdrop = useMemo(
    () => (backdropProps: any) => (
      <BottomSheetBackdrop
        {...backdropProps}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  const toggleModifierExpand = (modifierId: string) => {
    setExpandedModifiers((prev) => ({
      ...prev,
      [modifierId]: !prev[modifierId],
    }));
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-6 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={handleBack}
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
            {isSaving ? "Saving..." : "Save Changes"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-6">
        <View className="flex-row items-center justify-between w-full gap-2">
          <Text className="text-3xl font-bold text-white">
            Edit Menu Item - <Text className=" italic">{formData.name}</Text>
          </Text>
          <Text className="text-md text-gray-400">id:#{itemId}</Text>
        </View>

        <View className="flex-row gap-6">
          {/* Left Column - Form */}
          <View className="flex-1">
            {/* Name */}
            <View className="mb-6">
              <Text className="text-2xl font-semibold text-white mb-4">
                Name
              </Text>
              <TextInput
                className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white h-20"
                placeholder="Item name"
                placeholderTextColor="#9CA3AF"
                value={formData.name}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, name: text }))
                }
              />
              {errors.name && (
                <Text className="text-xl text-red-400 mt-1">{errors.name}</Text>
              )}
            </View>

            {/* Description */}
            <View className="mb-6">
              <Text className="text-2xl font-semibold text-white mb-4">
                Description
              </Text>
              <TextInput
                className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white h-20"
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
              <Text className="text-2xl font-semibold text-white mb-4">
                Price
              </Text>
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <TextInput
                    className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white h-20"
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    value={formData.price}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, price: text }))
                    }
                    keyboardType="numeric"
                  />
                  {errors.price && (
                    <Text className="text-xl text-red-400 mt-1">
                      {errors.price}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <TextInput
                    className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white h-20"
                    placeholder="Cash price (optional)"
                    placeholderTextColor="#9CA3AF"
                    value={formData.cashPrice}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, cashPrice: text }))
                    }
                    keyboardType="numeric"
                  />
                  {errors.cashPrice && (
                    <Text className="text-xl text-red-400 mt-1">
                      {errors.cashPrice}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Categories */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-2xl font-semibold text-white">
                  Categories
                </Text>
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

              {availableCategories.length === 0 ? (
                <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
                  <Text className="text-2xl text-gray-400 text-center mb-3">
                    No categories available. Create one to continue.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/menu/add-category")}
                    className="flex-row items-center bg-blue-600 px-6 py-3 rounded-lg"
                  >
                    <Plus size={24} color="white" />
                    <Text className="text-2xl text-white font-medium ml-2">
                      Create Category
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View className="flex-row flex-wrap gap-3">
                    {availableCategories.map((category) => (
                      <TouchableOpacity
                        key={category.id}
                        onPress={() => toggleCategory(category.name)}
                        className={`px-6 py-4 rounded-lg border ${
                          formData.categories.includes(category.name)
                            ? "bg-blue-600 border-blue-500"
                            : "bg-[#303030] border-gray-600"
                        }`}
                      >
                        <Text
                          className={`text-xl font-medium ${
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
                    <View className="mt-4">
                      <Text className="text-xl text-gray-400 mb-2">
                        Selected Categories:
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {formData.categories.map((categoryName, index) => (
                          <View
                            key={index}
                            className="flex-row items-center bg-blue-600/20 border border-blue-500 px-4 py-3 rounded-lg"
                          >
                            <Text className="text-xl text-blue-400 font-medium">
                              {categoryName}
                            </Text>
                            <TouchableOpacity
                              onPress={() => toggleCategory(categoryName)}
                              className="ml-2"
                            >
                              <X size={18} color="#60A5FA" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {errors.categories && (
                    <Text className="text-xl text-red-400 mt-2">
                      {errors.categories}
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Meal Types */}
            {/* <View className="mb-6">
              <Text className="text-2xl font-semibold text-white mb-4">
                Available For
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {meals.map((meal) => (
                  <TouchableOpacity
                    key={meal}
                    onPress={() => toggleMeal(meal)}
                    className={`px-6 py-3 rounded-lg border ${formData.meal.includes(meal)
                      ? "bg-blue-600 border-blue-500"
                      : "bg-[#303030] border-gray-600"
                      }`}
                  >
                    <Text
                      className={`text-xl font-medium ${formData.meal.includes(meal)
                        ? "text-white"
                        : "text-gray-300"
                        }`}
                    >
                      {meal}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View> */}

            {/* Modifier Groups */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-2xl font-semibold text-white">
                  Modifier Groups
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/menu/add-modifier")}
                  className="flex-row items-center bg-green-600 px-4 py-2 rounded-lg"
                >
                  <Plus size={24} color="white" />
                  <Text className="text-xl text-white font-medium ml-1">
                    Add Modifier
                  </Text>
                </TouchableOpacity>
              </View>

              {modifierGroups.length === 0 ? (
                <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
                  <Text className="text-2xl text-gray-400 text-center mb-3">
                    No modifier groups available. Create one to add
                    customization options.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/menu/add-modifier")}
                    className="flex-row items-center bg-blue-600 px-6 py-3 rounded-lg"
                  >
                    <Plus size={24} color="white" />
                    <Text className="text-2xl text-white font-medium ml-2">
                      Create Modifier Group
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View className="flex-col gap-3">
                    {modifierGroups.map((modifier) => {
                      const selected = formData.modifiers.includes(modifier.id);
                      const expanded = !!expandedModifiers[modifier.id];
                      const optionPreview = modifier.options?.slice(0, 5) || [];

                      return (
                        <View
                          key={modifier.id}
                          className={`rounded-lg border ${selected ? "bg-blue-600/10 border-blue-500" : "bg-[#303030] border-gray-600"}`}
                        >
                          {/* Header */}
                          <View className="flex-row items-center justify-between p-6">
                            <TouchableOpacity
                              onPress={() => toggleModifier(modifier.id)}
                              className="flex-row items-center gap-3 flex-1"
                            >
                              <Text
                                className={`text-2xl font-medium ${selected ? "text-white" : "text-gray-300"}`}
                              >
                                {modifier.name}
                              </Text>
                              <View
                                className={`px-3 py-2 rounded-full ${modifier.type === "required" ? "bg-red-900/30 border border-red-500" : "bg-blue-900/30 border border-blue-500"}`}
                              >
                                <Text
                                  className={`text-xl ${modifier.type === "required" ? "text-red-400" : "text-blue-400"}`}
                                >
                                  {modifier.type}
                                </Text>
                              </View>
                              <View className="bg-gray-600/30 border border-gray-500 px-3 py-2 rounded-full">
                                <Text className="text-xl text-gray-300">
                                  {modifier.selectionType === "single"
                                    ? "Single"
                                    : "Multiple"}
                                  {modifier.selectionType === "multiple" &&
                                  modifier.maxSelections
                                    ? ` • Max ${modifier.maxSelections}`
                                    : ""}
                                </Text>
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => toggleModifierExpand(modifier.id)}
                              className="pl-4 py-2"
                            >
                              {expanded ? (
                                <ChevronUp size={24} color="#9CA3AF" />
                              ) : (
                                <ChevronDown size={24} color="#9CA3AF" />
                              )}
                            </TouchableOpacity>
                          </View>

                          {/* Details */}
                          {expanded && (
                            <View className="px-6 pb-6">
                              {modifier.description ? (
                                <Text className="text-xl text-gray-400 mb-2">
                                  {modifier.description}
                                </Text>
                              ) : null}

                              {optionPreview.length > 0 && (
                                <View>
                                  <Text className="text-xl text-gray-300 mb-1">
                                    Options
                                  </Text>
                                  <View className="gap-2">
                                    {optionPreview.map((opt) => (
                                      <View
                                        key={opt.id}
                                        className="flex-row items-center justify-between bg-[#212121] border border-gray-700 rounded-md px-4 py-3"
                                      >
                                        <View className="flex-row items-center gap-2">
                                          <Text className="text-xl text-white">
                                            {opt.name}
                                          </Text>
                                          {opt.isDefault ? (
                                            <View className="px-3 py-1 rounded-full bg-green-900/30 border border-green-500">
                                              <Text className="text-lg text-green-400">
                                                Default
                                              </Text>
                                            </View>
                                          ) : null}
                                        </View>
                                        <Text className="text-xl text-gray-300">
                                          {opt.price
                                            ? `${opt.price.toFixed(2)}`
                                            : "$0.00"}
                                        </Text>
                                      </View>
                                    ))}
                                    {modifier.options &&
                                    modifier.options.length >
                                      optionPreview.length ? (
                                      <Text className="text-xl text-gray-400 mt-1">
                                        +
                                        {modifier.options.length -
                                          optionPreview.length}{" "}
                                        more
                                      </Text>
                                    ) : null}
                                  </View>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {formData.modifiers.length > 0 && (
                    <View className="mt-4">
                      <Text className="text-xl text-gray-400 mb-2">
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
                              className="flex-row items-center bg-blue-600/20 border border-blue-500 px-4 py-3 rounded-lg"
                            >
                              <Text className="text-xl text-blue-400 font-medium">
                                {modifier?.name}
                              </Text>
                              <TouchableOpacity
                                onPress={() => toggleModifier(modifierId)}
                                className="ml-2"
                              >
                                <X size={18} color="#60A5FA" />
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
                <Text className="text-2xl font-semibold text-white">
                  Recipe / Components
                </Text>
              </View>

              {formData.recipe.length === 0 ? (
                <View className="bg-gray-800 rounded-lg p-6 items-center">
                  <Text className="text-gray-400 text-center mb-2">
                    No recipe items defined
                  </Text>
                  <Text className="text-gray-500 text-sm text-center mb-4">
                    Add inventory items to create a recipe for this menu item
                  </Text>
                  <TouchableOpacity
                    onPress={openInventorySelection}
                    className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center"
                  >
                    <Plus color="white" size={16} />
                    <Text className="text-white ml-2 font-semibold">
                      Add Recipe Item
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="gap-y-3">
                  {formData.recipe.map((recipeItem, index) => (
                    <View key={index} className="bg-gray-800 rounded-lg p-4">
                      <View className="flex-row items-center gap-3">
                        <TouchableOpacity
                          className="flex-1"
                          onPress={() => {
                            setEditingRecipeItemIndex(index);
                            openInventorySelection();
                          }}
                        >
                          <View className="opacity-100">
                            <Text className="font-semibold text-white">
                              {getInventoryItemName(recipeItem.inventoryItemId)}
                            </Text>
                            <Text className="text-sm text-gray-400">
                              {getInventoryItemUnit(recipeItem.inventoryItemId)}
                            </Text>
                            <Text className="text-blue-400 text-xs mt-1">
                              Tap to change item
                            </Text>
                          </View>
                        </TouchableOpacity>

                        <View className="w-24">
                          <View>
                            <TextInput
                              value={recipeItem.quantity.toString()}
                              onChangeText={(text) =>
                                updateRecipeItemQuantity(index, text)
                              }
                              keyboardType="numeric"
                              className="bg-[#212121] border border-gray-600 text-white p-2 rounded text-center h-20"
                              placeholder="0"
                              placeholderTextColor="#9CA3AF"
                            />
                            <Text className="text-gray-400 text-xs text-center mt-1">
                              Quantity
                            </Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          onPress={() => removeRecipeItem(index)}
                          className="bg-red-600 p-2 rounded-lg"
                        >
                          <X color="white" size={16} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity
                    onPress={openInventorySelection}
                    className="bg-gray-700 border-2 border-dashed border-gray-500 rounded-lg p-4 items-center"
                  >
                    <Plus color="#9CA3AF" size={24} />
                    <Text className="text-gray-400 mt-2 font-semibold">
                      Add Recipe Item
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Image */}
            <View className="mb-6">
              <Text className="text-2xl font-semibold text-white mb-4">
                Image
              </Text>

              {/* Image Preview */}
              <View className="w-1/6 aspect-square mb-4 rounded border border-gray-600 overflow-hidden">
                {getImageSource(formData.image) && (
                  <View className="w-full h-full relative overflow-visible">
                    <TouchableOpacity
                      onPress={removeImage}
                      className="absolute top-0  z-10 right-0 bg-red-600 rounded-full p-2"
                    >
                      <Trash2 size={24} color="white" />
                    </TouchableOpacity>
                    <Image
                      source={
                        typeof getImageSource(formData.image) === "string"
                          ? MENU_IMAGE_MAP[
                              formData.image as keyof typeof MENU_IMAGE_MAP
                            ]
                          : getImageSource(formData.image)
                      }
                      className="w-full h-full object-cover"
                    />
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={pickImage}
                className="flex-row items-center bg-blue-600 px-6 py-4 rounded-lg"
              >
                <Camera size={24} color="white" />
                <Text className="text-2xl text-white font-medium ml-2">
                  {getImageSource(formData.image)
                    ? "Change Image"
                    : "Pick Image"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Availability */}
            <View className="mb-6">
              <Text className="text-2xl font-semibold text-white mb-4">
                Availability
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setFormData((prev) => ({
                    ...prev,
                    availability: !prev.availability,
                  }))
                }
                className={`flex-row items-center px-6 py-4 rounded-lg border ${
                  formData.availability
                    ? "bg-green-600 border-green-500"
                    : "bg-red-600 border-red-500"
                }`}
              >
                <Text className="text-2xl text-white font-medium">
                  {formData.availability ? "Available" : "Unavailable"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Right Column - Preview */}
          <View className="w-96">
            <Text className="text-2xl font-semibold text-white mb-4">
              Preview
            </Text>

            <View className="bg-[#303030] rounded-lg border border-gray-700 p-6">
              {/* Image Preview */}
              <View className="w-full aspect-square mb-4 rounded border border-gray-600 overflow-hidden">
                {getImageSource(formData.image) ? (
                  <Image
                    source={
                      typeof getImageSource(formData.image) === "string"
                        ? MENU_IMAGE_MAP[
                            formData.image as keyof typeof MENU_IMAGE_MAP
                          ]
                        : getImageSource(formData.image)
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <View className="w-full h-full bg-gray-600 items-center justify-center">
                    <Utensils color="#9ca3af" size={24} />
                  </View>
                )}
              </View>

              {/* Item Details */}
              <Text className="text-white font-bold text-3xl mb-2">
                {formData.name || "Item Name"}
              </Text>

              {formData.description && (
                <Text className="text-gray-300 text-xl mb-3">
                  {formData.description}
                </Text>
              )}

              <Text className="text-blue-400 font-bold text-3xl mb-4">
                ${formData.price || "0.00"}
              </Text>

              {/* Additional Preview Info */}
              <View className="w-full mt-4 gap-y-3">
                <View className="bg-[#212121] p-4 rounded-lg">
                  <Text className="text-xl text-gray-400">Categories</Text>
                  {formData.categories.length > 0 ? (
                    <View className="flex-row flex-wrap gap-2 mt-1">
                      {formData.categories.map((category, index) => (
                        <View
                          key={index}
                          className="bg-blue-900/30 border border-blue-500 px-3 py-2 rounded"
                        >
                          <Text className="text-lg text-blue-400">
                            {category}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text className="text-xl text-gray-500 mt-1">
                      No categories selected
                    </Text>
                  )}
                </View>

                <View className="bg-[#212121] p-4 rounded-lg">
                  <Text className="text-xl text-gray-400">Available For</Text>
                  <View className="flex-row flex-wrap gap-2 mt-1">
                    {formData.meal.map((meal, index) => (
                      <View
                        key={index}
                        className="bg-green-900/30 border border-green-500 px-3 py-2 rounded"
                      >
                        <Text className="text-lg text-green-400">{meal}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {formData.modifiers.length > 0 && (
                  <View className="bg-[#212121] p-4 rounded-lg">
                    <Text className="text-xl text-gray-400">
                      Modifier Groups
                    </Text>
                    <View className="flex-row flex-wrap gap-2 mt-1">
                      {formData.modifiers.map((modifierId, index) => {
                        const modifier = modifierGroups.find(
                          (m) => m.id === modifierId
                        );
                        return (
                          <View
                            key={index}
                            className="bg-blue-900/30 border border-blue-500 px-3 py-2 rounded"
                          >
                            <Text className="text-lg text-blue-400">
                              {modifier?.name}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View className="bg-[#212121] p-4 rounded-lg">
                  <Text className="text-xl text-gray-400">Status</Text>
                  <Text
                    className={`text-2xl mt-1 ${formData.availability ? "text-green-400" : "text-red-400"}`}
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
          <View className="bg-[#303030] rounded-2xl p-6 w-full max-w-lg border border-gray-600">
            {/* Header */}
            <View className="items-center mb-6">
              <View className="w-20 h-20 bg-blue-600/20 rounded-full items-center justify-center mb-4">
                <Save size={40} color="#60A5FA" />
              </View>
              <Text className="text-3xl font-bold text-white text-center">
                Save Changes?
              </Text>
              <Text className="text-2xl text-gray-400 text-center mt-2">
                Update "{formData.name}" with your changes?
              </Text>
            </View>

            {/* Item Preview */}
            <View className="bg-[#212121] rounded-lg p-6 mb-6">
              <View className="flex-row items-center gap-4 w-full">
                <View className="w-full aspect-square rounded border border-gray-600 overflow-hidden">
                  {getImageSource(formData.image) ? (
                    <Image
                      source={
                        typeof getImageSource(formData.image) === "string"
                          ? MENU_IMAGE_MAP[
                              formData.image as keyof typeof MENU_IMAGE_MAP
                            ]
                          : getImageSource(formData.image)
                      }
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <View className="w-full h-full bg-gray-600 items-center justify-center">
                      <Utensils color="#9ca3af" size={24} />
                    </View>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-2xl text-white font-medium">
                    {formData.name || "Item Name"}
                  </Text>
                  <Text className="text-xl text-gray-400">
                    {formData.categories.length > 0
                      ? formData.categories.join(", ")
                      : "No categories"}{" "}
                    • ${formData.price || "0.00"}
                  </Text>
                  {formData.modifiers.length > 0 && (
                    <Text className="text-lg text-purple-400 mt-1">
                      {formData.modifiers.length} modifier group(s) selected
                    </Text>
                  )}
                </View>
              </View>
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
      <RecipeIngredientSheet
        ref={recipeSheetRef}
        existingIds={formData.recipe.map((r) => r.inventoryItemId)}
        currentId={null}
        onSelect={(inventoryItemId) => {
          // If already exists, ignore
          if (
            formData.recipe.some((r) => r.inventoryItemId === inventoryItemId)
          )
            return;
          // Add with default quantity 1, then user edits in-line
          setFormData((prev) => ({
            ...prev,
            recipe: [...prev.recipe, { inventoryItemId, quantity: 1 }],
          }));
        }}
      />

      {/* Inventory Selection Bottom Sheet */}
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
          <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
            <View className="flex-1">
              <Text className="text-xl font-bold text-white">
                {editingRecipeItemIndex !== null
                  ? "Replace Inventory Item"
                  : "Select Inventory Item"}
              </Text>
              {editingRecipeItemIndex !== null && (
                <Text className="text-blue-400 text-sm mt-1">
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
              <X color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View className="p-4 border-b border-gray-700">
            <View className="flex-row items-center bg-[#212121] rounded-lg px-3 py-2">
              <TextInput
                value={inventorySearchQuery}
                onChangeText={setInventorySearchQuery}
                placeholder="Search inventory items..."
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-white ml-3 h-20"
              />
            </View>
          </View>

          {/* Inventory Items List */}
          {filteredInventoryItems.length === 0 ? (
            <View className="flex-1 justify-center items-center p-8">
              <Text className="text-gray-400 text-lg text-center">
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
                const isAlreadyInRecipe = formData.recipe.some(
                  (recipeItem) =>
                    recipeItem.inventoryItemId === inventoryItem.id
                );
                const isCurrentlyEditing =
                  editingRecipeItemIndex !== null &&
                  formData.recipe[editingRecipeItemIndex]?.inventoryItemId ===
                    inventoryItem.id;

                return (
                  <TouchableOpacity
                    onPress={() => selectInventoryItem(inventoryItem.id)}
                    disabled={isAlreadyInRecipe && !isCurrentlyEditing}
                    className={`p-4 border-b border-gray-700 ${
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
                          className={`font-semibold ${
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
                          className={`text-sm ${
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
                        <View className="bg-blue-600 px-2 py-1 rounded">
                          <Text className="text-white text-xs">
                            Currently Selected
                          </Text>
                        </View>
                      ) : isAlreadyInRecipe ? (
                        <View className="bg-gray-600 px-2 py-1 rounded">
                          <Text className="text-gray-300 text-xs">Added</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </View>
      </BottomSheet>
    </View>
  );
};

export default EditMenuItemScreen;
