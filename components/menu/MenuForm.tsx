import ScheduleFormSheet from "@/components/menu/ScheduleFormSheet";
import ScheduleManager from "@/components/menu/ScheduleManager";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { colors } from "@/lib/theme";
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
    data: Omit<Menu, "id" | "createdAt" | "updatedAt" | "categories"> & {
      categories: string[];
    }
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
  const categories = useMenuStore((s) => s.categories);
  const getItemsInCategory = useMenuStore((s) => s.getItemsInCategory);

  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialData?.categories
      ? initialData.categories.map((c: any) =>
          typeof c === "string" ? c : c.name
        )
      : []
  );
  const [schedules, setSchedules] = useState<Schedule[]>(
    initialData?.schedules || []
  );

  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);
  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  );

  const scheduleSheetRef = useRef<BottomSheet>(null);
  const [editingRule, setEditingRule] = useState<Schedule | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    const nameChanged = (initialData?.name || "") !== name;
    const descChanged = (initialData?.description || "") !== description;
    const activeChanged = (initialData?.isActive ?? true) !== isActive;
    const catsChanged =
      JSON.stringify((initialData?.categories || []).sort()) !==
      JSON.stringify(selectedCategories.sort());
    const schedulesChanged =
      JSON.stringify(initialData?.schedules || []) !==
      JSON.stringify(schedules);

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

  const availableCategories = useMemo(
    () =>
      categories
        .filter((cat) => cat.isActive)
        .sort((a, b) => a.order - b.order),
    [categories]
  );

  const toggleCategorySelection = (categoryName: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((n) => n !== categoryName)
        : [...prev, categoryName]
    );
  };

  const toggleCategoryExpansion = (categoryName: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((n) => n !== categoryName)
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
      if (router.canGoBack()) router.back();
    }
  };

  const getPreviewItems = () => {
    const allItems: { [key: string]: any[] } = {};
    selectedCategories.forEach((categoryName) => {
      allItems[categoryName] = getItemsInCategory(categoryName);
    });
    return allItems;
  };

  const previewItems = getPreviewItems();
  const totalItems = Object.values(previewItems).flat().length;

  const openScheduleSheet = (rule?: Schedule, index?: number) => {
    setEditingRule(rule || null);
    setEditingIndex(index ?? null);
    scheduleSheetRef.current?.expand();
  };

  const handleSaveSchedule = (newRule: Schedule) => {
    if (editingIndex !== null) {
      setSchedules(schedules.map((r, i) => (i === editingIndex ? newRule : r)));
    } else {
      setSchedules([...schedules, newRule]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
          {title}
        </Text>

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
              Cancel
            </Text>
          </TouchableOpacity>
          {initialData && (
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
                {isSaving ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.teal,
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.onSolid} />
            ) : (
              <Check size={14} color={colors.onSolid} />
            )}
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSolid }}>
              {isSaving ? "Saving..." : submitButtonLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* Left: Form */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 16 }}
            showsVerticalScrollIndicator={false}
          >
          {/* Name & Description */}
          <View
            style={{
              backgroundColor: colors.card + "cc",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Basic Info
            </Text>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
                Menu Name *
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 13,
                  color: colors.heading,
                }}
                placeholder="e.g., Lunch Menu, Dinner Specials"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
                Description
                <Text style={{ color: colors.muted }}> (Optional)</Text>
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 13,
                  color: colors.heading,
                  height: 72,
                  textAlignVertical: "top",
                }}
                placeholder="Describe this menu..."
                placeholderTextColor={colors.muted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Availability Toggle */}
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Availability
              </Text>
              <TouchableOpacity
                onPress={() => setIsActive(!isActive)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isActive ? colors.teal : colors.card,
                  borderWidth: 1,
                  borderColor: isActive ? colors.teal : colors.border,
                  justifyContent: "center",
                  paddingHorizontal: 2,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: colors.onSolid,
                    alignSelf: isActive ? "flex-end" : "flex-start",
                  }}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Schedules */}
          <View
            style={{
              backgroundColor: colors.card + "cc",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Schedules
            </Text>
            <ScheduleManager
              value={schedules}
              onChange={setSchedules}
              onAdd={() => openScheduleSheet()}
              onEdit={(rule, idx) => openScheduleSheet(rule, idx)}
            />
          </View>

          {/* Categories */}
          <View
            style={{
              backgroundColor: colors.card + "cc",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Categories
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {selectedCategories.length} of {availableCategories.length} selected
              </Text>
            </View>

            {availableCategories.length === 0 ? (
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 20,
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Utensils size={24} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
                  No categories available.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/menu/add-category")}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>
                    Create Category
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                {availableCategories.map((category) => {
                  const isSelected = selectedCategories.includes(category.name);
                  const isExpanded = expandedCategories.includes(category.name);
                  const categoryItems = getItemsInCategory(category.name);

                  return (
                    <View
                      key={category.id}
                      style={{
                        backgroundColor: isSelected ? colors.teal + "08" : colors.panel,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.teal + "40" : colors.border,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => toggleCategorySelection(category.name)}
                        style={{ padding: 12 }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flex: 1, gap: 6 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                                {category.name}
                              </Text>
                              <View
                                style={{
                                  backgroundColor: isSelected ? colors.teal + "20" : colors.card,
                                  borderRadius: 10,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: "600", color: isSelected ? colors.teal : colors.muted }}>
                                  {categoryItems.length}
                                </Text>
                              </View>
                            </View>

                            {!isExpanded && categoryItems.length > 0 && (
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                {categoryItems.map((item, index) => (
                                  <View
                                    key={index}
                                    style={{
                                      backgroundColor: colors.card,
                                      borderWidth: 1,
                                      borderColor: colors.border,
                                      paddingHorizontal: 8,
                                      paddingVertical: 6,
                                      borderRadius: 8,
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: 6,
                                      width: "48%",
                                    }}
                                  >
                                    <View
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 6,
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                        overflow: "hidden",
                                      }}
                                    >
                                      {getImageSource(item.image) ? (
                                        <Image
                                          source={getImageSource(item.image)}
                                          style={{ width: "100%", height: "100%" }}
                                          resizeMode="cover"
                                        />
                                      ) : (
                                        <View
                                          style={{
                                            flex: 1,
                                            backgroundColor: colors.panel,
                                            alignItems: "center",
                                            justifyContent: "center",
                                          }}
                                        >
                                          <Utensils color={colors.muted} size={12} />
                                        </View>
                                      )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 11, color: colors.heading, fontWeight: "500" }} numberOfLines={1}>
                                        {item.name}
                                      </Text>
                                      <Text style={{ fontSize: 10, color: colors.label }}>
                                        ${item.price.toFixed(2)}
                                      </Text>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>

                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              borderWidth: 2,
                              borderColor: isSelected ? colors.teal : colors.border,
                              backgroundColor: isSelected ? colors.teal : "transparent",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {isSelected && <Check size={12} color={colors.onSolid} />}
                          </View>
                        </View>
                      </TouchableOpacity>

                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Preview Summary */}
          {selectedCategories.length > 0 && (
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Preview · {totalItems} items
              </Text>
              {Object.entries(previewItems).map(([categoryName, items]) => (
                <View key={categoryName} style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>
                    {categoryName}
                    <Text style={{ color: colors.muted, fontWeight: "400" }}> ({items.length})</Text>
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {items.slice(0, 6).map((item, index) => (
                      <View
                        key={index}
                        style={{
                          width: 70,
                          height: 70,
                          backgroundColor: colors.card,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        {getImageSource(item.image) ? (
                          <Image
                            source={getImageSource(item.image)}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={{
                              flex: 1,
                              backgroundColor: colors.panel,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Utensils size={16} color={colors.muted} />
                          </View>
                        )}
                      </View>
                    ))}
                    {items.length > 6 && (
                      <View
                        style={{
                          width: 70,
                          height: 70,
                          backgroundColor: colors.panel,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>+{items.length - 6}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
          </ScrollView>

          {/* Right: Summary Panel */}
          <View
            style={{
              width: 320,
              borderLeftWidth: 1,
              borderLeftColor: colors.border,
              backgroundColor: colors.card,
              padding: 16,
              gap: 16,
              overflow: "hidden",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
              Summary
            </Text>

            {/* Selected Categories */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Selected Categories
              </Text>
              <ScrollView
                style={{ maxHeight: 120 }}
                contentContainerStyle={{ gap: 4 }}
                showsVerticalScrollIndicator={false}
              >
                {selectedCategories.length === 0 ? (
                  <Text style={{ fontSize: 12, color: colors.muted }}>No categories selected</Text>
                ) : (
                  selectedCategories.map((catName) => (
                    <View
                      key={catName}
                      style={{
                        backgroundColor: colors.panel,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.label }}>{catName}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* Stats */}
            <View style={{ gap: 12 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "500" }}>
                  Categories Selected:
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}>
                  {selectedCategories.length}
                </Text>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "500" }}>
                  Total Items:
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.teal }}>
                  {totalItems}
                </Text>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "500" }}>
                  Schedules:
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.label }}>
                  {schedules.length}
                </Text>
              </View>
            </View>

            {/* Menu Status */}
            {name.trim() && (
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 8,
                  padding: 10,
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase" }}>
                  Menu Status
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 20,
                    backgroundColor: isActive ? colors.teal + "20" : colors.danger + "15",
                    borderWidth: 1,
                    borderColor: isActive ? colors.teal + "50" : colors.danger + "30",
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: isActive ? colors.teal : colors.danger }}>
                    {isActive ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Confirm Modal */}
      <Modal
        visible={showConfirmation}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 400,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 18 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  backgroundColor: colors.teal + "20",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                <Save size={26} color={colors.teal} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.heading, marginBottom: 6, textAlign: "center" }}>
                {initialData ? "Save Changes?" : "Create Menu?"}
              </Text>
              <Text style={{ fontSize: 13, color: colors.label, textAlign: "center", lineHeight: 19 }}>
                {initialData ? "Save changes to" : "Create"} "{name}" with {selectedCategories.length} {selectedCategories.length === 1 ? "category" : "categories"}
              </Text>
            </View>

            <View style={{ flexDirection: "column", gap: 10 }}>
              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                style={{
                  width: "100%",
                  backgroundColor: colors.teal,
                  borderRadius: 12,
                  paddingVertical: 13,
                  alignItems: "center",
                  shadowColor: colors.teal,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 4,
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.onSolid, fontWeight: "700" }}>
                  {isSaving ? "Saving..." : initialData ? "Save" : "Create"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowConfirmation(false)}
                style={{
                  width: "100%",
                  backgroundColor: colors.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 13,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 14, color: colors.label, fontWeight: "700" }}>Cancel</Text>
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
