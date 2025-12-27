import ScheduleFormSheet from "@/components/menu/ScheduleFormSheet";
import ScheduleManager from "@/components/menu/ScheduleManager";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { Menu, Schedule } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Save,
  Utensils,
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export interface MenuFormProps {
  initialData?: Menu;
  onSubmit: (
    data: Omit<Menu, "id" | "createdAt" | "updatedAt">
  ) => Promise<boolean>;
  isSaving: boolean;
  title: string;
  submitButtonLabel: string;
  onDelete?: () => void;
}

const getImageSource = (image: string | undefined) => {
  if (image && image.length > 200) {
    return { uri: `data:image/jpeg;base64,${image}` };
  }
  if (image) {
    // Try to get image from assets first if it's a key
    if (MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP]) {
      return MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP];
    }
    return { uri: image };
  }
  return undefined;
};

const MenuForm: React.FC<MenuFormProps> = ({
  initialData,
  onSubmit,
  isSaving,
  title,
  submitButtonLabel,
  onDelete,
}) => {
  const { categories, getItemsInCategory } = useMenuStore();

  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialData?.categories || []
  );
  const [schedules, setSchedules] = useState<Schedule[]>(
    initialData?.schedules || []
  );

  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Change Tracking
  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);
  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  );

  // Sheets
  const scheduleSheetRef = useRef<BottomSheet>(null);
  const [editingRule, setEditingRule] = useState<Schedule | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    // Determine if dirty
    const nameChanged = (initialData?.name || "") !== name;
    const descChanged = (initialData?.description || "") !== description;
    const activeChanged = (initialData?.isActive ?? true) !== isActive;
    const catsChanged =
      JSON.stringify((initialData?.categories || []).sort()) !==
      JSON.stringify(selectedCategories.sort());
    const schedulesChanged =
      JSON.stringify(initialData?.schedules || []) !==
      JSON.stringify(schedules);

    // For new menus, consider changed if user typed anything
    const isNewAndChanged =
      !initialData &&
      (name !== "" ||
        description !== "" ||
        selectedCategories.length > 0 ||
        schedules.length > 0);

    if (initialData) {
      setHasChanges(
        nameChanged ||
          descChanged ||
          activeChanged ||
          catsChanged ||
          schedulesChanged
      );
    } else {
      setHasChanges(isNewAndChanged);
    }
  }, [name, description, isActive, selectedCategories, schedules, initialData]);

  // Helper function to check if an ID is a valid UUID (for backend sync)
  const isValidUUID = (id: string) => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  // Get available active categories - show all, backend calls will filter by UUID
  const availableCategories = useMemo(
    () =>
      categories
        .filter((cat) => cat.isActive)
        .sort((a, b) => a.order - b.order),
    [categories]
  );

  // Handlers
  const toggleCategorySelection = (categoryName: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((name) => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  const toggleCategoryExpansion = (categoryName: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((name) => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a menu name");
      return false;
    }

    if (selectedCategories.length === 0) {
      Alert.alert("Error", "Please select at least one category for this menu");
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validateForm()) return;
    setShowConfirmation(true);
  };

  const confirmSave = async () => {
    setShowConfirmation(false);

    const formData = {
      name: name.trim(),
      description: description.trim() || undefined,
      isActive,
      categories: selectedCategories,
      schedules,
    };

    const success = await onSubmit(formData);

    if (success) {
      hasSavedRef.current = true;
      setHasChanges(false);
      // Determine navigation - replace if editing to refresh, back if adding
      if (initialData) {
        // Using replace to force refresh on previous screen often helps in these apps,
        // but simple back is standard. Let's align with ItemForm behavior.
        if (router.canGoBack()) router.back();
      } else {
        if (router.canGoBack()) router.back();
      }
    }
  };

  // Previews
  const getPreviewItems = () => {
    const allItems: { [key: string]: any[] } = {};
    selectedCategories.forEach((categoryName) => {
      allItems[categoryName] = getItemsInCategory(categoryName);
    });
    return allItems;
  };

  const previewItems = getPreviewItems();
  const totalItems = Object.values(previewItems).flat().length;

  // Schedule Handlers
  const openScheduleSheet = (rule?: Schedule, index?: number) => {
    setEditingRule(rule || null);
    setEditingIndex(index ?? null);
    scheduleSheetRef.current?.expand();
  };

  const handleSaveSchedule = (newRule: Schedule) => {
    if (editingIndex !== null) {
      const nextSchedules = schedules.map((r, i) =>
        i === editingIndex ? newRule : r
      );
      setSchedules(nextSchedules);
    } else {
      setSchedules([...schedules, newRule]);
    }
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={20} color="#9CA3AF" />
          <Text className="text-xl text-white font-medium ml-1.5">Back</Text>
        </TouchableOpacity>

        <View className="flex-row gap-2">
          {onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              className="px-4 py-2 rounded-lg border border-red-500 bg-red-900/30"
            >
              <Text className="text-xl text-red-400">Delete</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            className={`flex-row items-center px-4 py-2 rounded-lg ${
              isSaving ? "bg-blue-400" : "bg-blue-600"
            }`}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Save size={20} color="white" />
            )}
            <Text className="text-xl text-white font-medium ml-1.5">
              {isSaving ? "Saving..." : submitButtonLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView className="flex-1 p-4">
          <Text className="text-2xl font-bold text-white mb-4">{title}</Text>

          {/* Name & Description */}
          <View className="mb-4">
            <Text className="text-xl font-semibold text-white mb-2">
              Menu Name
            </Text>
            <TextInput
              className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16 mb-4"
              placeholder="e.g., Lunch Menu, Dinner Specials"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />

            <Text className="text-xl font-semibold text-white mb-2">
              Description (Optional)
            </Text>
            <TextInput
              className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-24 mb-4"
              placeholder="Describe this menu..."
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Schedules */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xl font-semibold text-white">
                Schedules
              </Text>
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
            <ScheduleManager
              value={schedules}
              onChange={setSchedules}
              onAdd={() => openScheduleSheet()}
              onEdit={(rule, idx) => openScheduleSheet(rule, idx)}
            />
          </View>

          {/* Categories */}
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
                <TouchableOpacity
                  onPress={() => router.push("/menu/add-category")}
                  className="mt-3 bg-blue-600 px-4 py-2 rounded-lg"
                >
                  <Text className="text-white text-lg font-medium">
                    Create Category
                  </Text>
                </TouchableOpacity>
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
                                {categoryItems
                                  .slice(0, 3)
                                  .map((item, index) => (
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
                                  <Text
                                    className="text-white text-lg font-medium"
                                    numberOfLines={1}
                                  >
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

          {/* Items Preview Summary */}
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
      </KeyboardAvoidingView>

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
                {initialData ? "Update Menu?" : "Create Menu?"}
              </Text>
              <Text className="text-xl text-gray-400 text-center mt-1.5">
                {initialData ? "Save changes to" : "Create"} &quot;{name}&quot;
                with {selectedCategories.length} categories?
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
                  {isSaving ? "Saving..." : initialData ? "Save" : "Create"}
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

      <ScheduleFormSheet
        ref={scheduleSheetRef}
        rule={editingRule}
        onSave={handleSaveSchedule}
      />
    </View>
  );
};

export default MenuForm;
