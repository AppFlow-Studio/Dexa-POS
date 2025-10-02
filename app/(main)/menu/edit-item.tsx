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
  Search,
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
  const modifierSelectionSheetRef = React.useRef<BottomSheet>(null);
  const inventorySnapPoints = useMemo(() => ["70%"], []);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [modifierSearch, setModifierSearch] = useState("");
  const { inventoryItems } = useInventoryStore();

  // Get available categories from store
  const availableCategories = categories
    .filter((cat) => cat.isActive)
    .sort((a, b) => a.order - b.order);



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
        modifiers: itemToEdit.modifierGroupIds || [],
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
        modifierGroupIds:
          formData.modifiers.length > 0 ? formData.modifiers : undefined,

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
        <Text className="text-xl text-white">Item not found</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-3 bg-blue-600 px-4 py-2 rounded-lg"
        >
          <Text className="text-lg text-white">Go Back</Text>
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

  // Filter modifier groups based on search
  const filteredModifierGroups = useMemo(() => {
    if (!modifierSearch.trim()) return modifierGroups;
    const query = modifierSearch.toLowerCase();
    return modifierGroups.filter((m) => {
      const nameMatch = m.name.toLowerCase().includes(query);
      const descMatch = (m.description || "").toLowerCase().includes(query);
      return nameMatch || descMatch;
    });
  }, [modifierSearch, modifierGroups]);

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

  const toggleModifierExpand = (modifierId: string) => {
    setExpandedModifiers((prev) => ({
      ...prev,
      [modifierId]: !prev[modifierId],
    }));
  };

  console.log(filteredModifierGroups[0]);

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={handleBack}
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
            {isSaving ? "Saving..." : "Save Changes"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4">
        <View className="flex-row items-center justify-between w-full gap-2">
          <Text className="text-2xl font-bold text-white">
            Edit: <Text className=" italic">{formData.name}</Text>
          </Text>
          <Text className="text-sm text-gray-400">id:#{itemId}</Text>
        </View>

        <View className="flex-row gap-4">
          {/* Left Column - Form */}
          <View className="flex-1">
            <View className="mb-4">
              <Text className="text-xl font-semibold text-white mb-2">
                Name
              </Text>
              <TextInput
                className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
                placeholder="Item name"
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

            <View className="mb-4">
              <Text className="text-xl font-semibold text-white mb-2">
                Description
              </Text>
              <TextInput
                className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
                placeholder="Item description"
                placeholderTextColor="#9CA3AF"
                value={formData.description}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, description: text }))
                }
                multiline
              />
            </View>

            <View className="mb-4">
              <Text className="text-xl font-semibold text-white mb-2">
                Price
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextInput
                    className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    value={formData.price}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, price: text }))
                    }
                    keyboardType="numeric"
                  />
                  {errors.price && (
                    <Text className="text-base text-red-400 mt-1">
                      {errors.price}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <TextInput
                    className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
                    placeholder="Cash price (opt)"
                    placeholderTextColor="#9CA3AF"
                    value={formData.cashPrice}
                    onChangeText={(text) =>
                      setFormData((prev) => ({ ...prev, cashPrice: text }))
                    }
                    keyboardType="numeric"
                  />
                  {errors.cashPrice && (
                    <Text className="text-base text-red-400 mt-1">
                      {errors.cashPrice}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xl font-semibold text-white">
                  Categories
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/menu/add-category")}
                  className="flex-row items-center bg-green-600 px-3 py-1.5 rounded-lg"
                >
                  <Plus size={18} color="white" />
                  <Text className="text-base text-white font-medium ml-1">
                    Add
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {availableCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    onPress={() => toggleCategory(category.name)}
                    className={`px-4 py-3 rounded-lg border ${formData.categories.includes(category.name)
                      ? "bg-blue-600 border-blue-500"
                      : "bg-[#303030] border-gray-600"
                      }`}
                  >
                    <Text
                      className={`text-lg font-medium ${formData.categories.includes(category.name)
                        ? "text-white"
                        : "text-gray-300"
                        }`}
                    >
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xl font-semibold text-white">
                  Modifiers
                </Text>
                <View className="flex w-fit flex-row items-stretch justify-center gap-x-2">
                  <View className="w-fit flex-row items-center justify-between gap-x-2 bg-gray-600   rounded-lg">
                    <View className="w-fit flex-row items-center justify-start gap-x-2">
                      <View
                        className="items-center pl-2 py-1.5 rounded-lg"
                      >
                        <Search size={18} color="white" />
                      </View>
                      <TextInput
                        value={modifierSearch}
                        onChangeText={setModifierSearch}
                        placeholder="Search..."
                        placeholderTextColor="#9CA3AF"
                        className="text-white h-10 w-[50%] text-sm 600 rounded-lg px-3 py-1.5"
                      />
                    </View>
                    <TouchableOpacity className="flex-row items-center px-3 py-1.5 rounded-lg" onPress={() => { setModifierSearch(""); setExpandedModifiers({}); }}>
                      <X size={18} color="white" />
                      <Text className="text-base text-white font-medium ml-1">
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push("/menu/add-modifier")}
                    className="flex-row items-center bg-green-600 px-3 py-1.5 rounded-lg"
                  >
                    <Plus size={18} color="white" />
                    <Text className="text-base text-white font-medium ml-1">
                      Add
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View className="flex-col gap-2">
                {filteredModifierGroups.map((modifier) => {
                  const selected = formData.modifiers.includes(modifier.id);
                  const expanded = !!expandedModifiers[modifier.id];
                  return (
                    <View
                      key={modifier.id}
                      className={`rounded-lg border ${selected
                        ? "bg-blue-600/10 border-blue-500"
                        : "bg-[#303030] border-gray-600"
                        }`}
                    >
                      <View className="flex-row items-center justify-between p-4">
                        <TouchableOpacity
                          onPress={() => toggleModifier(modifier.id)}
                          className="flex-row items-center gap-2 flex-1"
                        >
                          <Text
                            className={`text-xl font-medium ${selected ? "text-white" : "text-gray-300"
                              }`}
                          >
                            {modifier.name}
                          </Text>
                          <Text className={`px-2.5 py-1.5 rounded-full ${modifier.type === "required"
                            ? "bg-red-900 border border-red-500 text-white"
                            : "bg-blue-900 border border-blue-500 text-white"
                            }`}
                          >
                            {modifier.type}
                          </Text>
                          <Text className={`px-2.5 py-1.5 rounded-full bg-gray-600 text-white`}
                          >
                            {modifier.selectionType} {modifier.maxSelections ? `• Max ${modifier.maxSelections}` : ""}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => toggleModifierExpand(modifier.id)}
                          className="pl-3 py-1.5"
                        >
                          {expanded ? (
                            <ChevronUp size={20} color="#9CA3AF" />
                          ) : (
                            <ChevronDown size={20} color="#9CA3AF" />
                          )}
                        </TouchableOpacity>
                      </View>
                      {expanded && (
                        <View className="px-4 pb-4 gap-y-2">
                          <Text className="text-base text-gray-400">Options</Text>
                          {modifier.options.map((option) => (
                            <View key={option.id} className="flex-row items-center justify-between border rounded-lg border-gray-600 bg-[#303030] p-2">
                              <Text className="text-base text-gray-400">{option.name} <Text className="text-sm">{option.isDefault ? "(Default)" : ""}</Text></Text>
                              <Text className={`text-base ${option.price > 0 ? "text-green-400" : "text-gray-400"}`}>{option.price > 0 ? `+${option.price.toFixed(2)}` : "$0.00"}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-xl font-semibold text-white mb-2">
                Image
              </Text>
              <TouchableOpacity
                onPress={pickImage}
                className="flex-row items-center bg-blue-600 px-4 py-3 rounded-lg self-start"
              >
                <Camera size={20} color="white" />
                <Text className="text-lg text-white font-medium ml-1.5">
                  {getImageSource(formData.image) ? "Change" : "Pick"}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mb-4">
              <Text className="text-xl font-semibold text-white mb-2">
                Availability
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setFormData((prev) => ({
                    ...prev,
                    availability: !prev.availability,
                  }))
                }
                className={`px-4 py-3 rounded-lg border ${formData.availability
                  ? "bg-green-600 border-green-500"
                  : "bg-red-600 border-red-500"
                  }`}
              >
                <Text className="text-lg text-white font-medium">
                  {formData.availability ? "Available" : "Unavailable"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Right Column - Preview */}
          <View className="w-80">
            <Text className="text-xl font-semibold text-white mb-2">
              Preview
            </Text>
            <View className="bg-[#303030] rounded-lg border border-gray-700 p-4">
              <View className="w-full aspect-square mb-3 rounded border border-gray-600 overflow-hidden">
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
                    <Utensils color="#9ca3af" size={20} />
                  </View>
                )}
              </View>
              <Text className="text-white font-bold text-2xl mb-1">
                {formData.name || "Item Name"}
              </Text>
              {formData.description && (
                <Text className="text-gray-300 text-lg mb-2">
                  {formData.description}
                </Text>
              )}
              <Text className="text-blue-400 font-bold text-2xl mb-3">
                ${formData.price || "0.00"}
              </Text>
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
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-[#303030] rounded-2xl p-4 w-full max-w-md border border-gray-600">
            <View className="items-center mb-4">
              <View className="w-16 h-16 bg-blue-600/20 rounded-full items-center justify-center mb-3">
                <Save size={32} color="#60A5FA" />
              </View>
              <Text className="text-2xl font-bold text-white text-center">
                Save Changes?
              </Text>
              <Text className="text-xl text-gray-400 text-center mt-1.5">
                Update "{formData.name}"?
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
                  {isSaving ? "Saving..." : "Save"}
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

          {/* Search Bar */}
          <View className="p-3 border-b border-gray-700">
            <View className="flex-row items-center bg-[#212121] rounded-lg px-2.5 py-1.5">
              <TextInput
                value={inventorySearchQuery}
                onChangeText={(text) => setInventorySearchQuery(text.trim())}
                placeholder="Search inventory items..."
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-white ml-2 h-16 text-base"
              />
            </View>
          </View>

          {/* Inventory Items List */}
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
                    className={`p-3 border-b border-gray-700 ${isCurrentlyEditing
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
                          className={`font-semibold text-base ${isCurrentlyEditing
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

                          className={`text-xs ${isCurrentlyEditing
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

export default EditMenuItemScreen;
