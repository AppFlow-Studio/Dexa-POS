import ScheduleFormSheet from "@/components/menu/ScheduleFormSheet";
import ScheduleManager from "@/components/menu/ScheduleManager";
import AppNoticeModal from "@/components/ui/AppNoticeModal";
import BottomSheet from "@/components/ui/bottomSheet";
import DeleteConfirmDialog from "@/components/ui/DeleteConfirmDialog";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { colors } from "@/lib/theme";
import { Menu, Schedule } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useMenuStore } from "@/stores/useMenuStore";
import { router } from "expo-router";
import {
    Check,
    ChevronDown,
    ChevronUp,
    Save,
    Trash2,
    Utensils
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Keyboard,
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
    },
  ) => Promise<boolean>;
  isSaving: boolean;
  title: string;
  submitButtonLabel: string;
  onDelete?: () => void;
  /** Disable all mutating actions (save / delete) — e.g. while offline. */
  disabled?: boolean;
}

const getImageSource = (image: string | undefined) => {
  if (!image) return undefined;
  if (image.includes("://")) return { uri: image };
  if (image.length > 200) return { uri: `data:image/jpeg;base64,${image}` };
  if (MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP]) {
    return MENU_IMAGE_MAP[image as keyof typeof MENU_IMAGE_MAP];
  }
  return { uri: image };
};

const MenuForm: React.FC<MenuFormProps> = ({
  initialData,
  onSubmit,
  isSaving,
  title,
  submitButtonLabel,
  onDelete,
  disabled = false,
}) => {
  const categories = useMenuStore((s) => s.categories);
  const getItemsInCategory = useMenuStore((s) => s.getItemsInCategory);

  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || "",
  );
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialData?.categories
      ? initialData.categories.map((c: any) =>
          typeof c === "string" ? c : c.name,
        )
      : [],
  );
  const [schedules, setSchedules] = useState<Schedule[]>(
    initialData?.schedules || [],
  );

  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [validationNotice, setValidationNotice] = useState<{
    title: string;
    description: string;
  } | null>(null);

  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);
  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current,
  );

  const scheduleSheetRef = useRef<BottomSheet>(null);
  const [editingRule, setEditingRule] = useState<Schedule | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    Keyboard.dismiss();
  }, []);

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
          schedulesChanged,
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
    [categories],
  );

  const toggleCategorySelection = (categoryName: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((n) => n !== categoryName)
        : [...prev, categoryName],
    );
  };

  const toggleCategoryExpansion = (categoryName: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((n) => n !== categoryName)
        : [...prev, categoryName],
    );
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setValidationNotice({
        title: "Menu Name Required",
        description: "Please enter a menu name before saving.",
      });
      return false;
    }
    if (selectedCategories.length === 0) {
      setValidationNotice({
        title: "Select a Category",
        description: "Choose at least one category before creating the menu.",
      });
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
          paddingHorizontal: s(16),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel,
        }}
      >
        <Text
          style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}
        >
          {title}
        </Text>

        <View
          style={{ flexDirection: "row", gap: s(10), alignItems: "center" }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              paddingHorizontal: s(12),
              paddingVertical: s(6),
              borderRadius: s(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "600",
                color: colors.label,
              }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
          {initialData && onDelete && (
            <TouchableOpacity
              onPress={disabled ? undefined : () => setShowDeleteDialog(true)}
              disabled={disabled}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                borderRadius: s(8),
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "30",
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <Trash2
                size={s(14)}
                color={disabled ? colors.muted : colors.danger}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={disabled ? undefined : handleSave}
            disabled={isSaving || disabled}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(6),
              paddingHorizontal: s(14),
              paddingVertical: s(6),
              borderRadius: s(8),
              backgroundColor: colors.teal,
              opacity: isSaving ? 0.7 : disabled ? 0.4 : 1,
            }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.onSolid} />
            ) : (
              <Check
                size={s(14)}
                color={disabled ? colors.onSolid + "99" : colors.onSolid}
              />
            )}
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "600",
                color: colors.onSolid,
              }}
            >
              {isSaving ? "Saving..." : "Save Changes"}
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
            contentContainerStyle={{ padding: s(16), gap: s(16) }}
            showsVerticalScrollIndicator={false}
          >
            {/* Name & Description */}
            <View
              style={{
                backgroundColor: colors.card + "cc",
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: colors.border,
                padding: s(14),
                gap: s(12),
              }}
            >
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "600",
                  color: colors.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Basic Info
              </Text>

              <View style={{ gap: s(6) }}>
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "600",
                    color: colors.label,
                  }}
                >
                  Menu Name *
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(8),
                    paddingHorizontal: s(12),
                    paddingVertical: s(10),
                    fontSize: s(13),
                    color: colors.heading,
                  }}
                  placeholder="e.g., Lunch Menu, Dinner Specials"
                  placeholderTextColor={colors.muted}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={{ gap: s(6) }}>
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "600",
                    color: colors.label,
                  }}
                >
                  Description
                  <Text style={{ color: colors.muted }}> (Optional)</Text>
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(8),
                    paddingHorizontal: s(12),
                    paddingVertical: s(10),
                    fontSize: s(13),
                    color: colors.heading,
                    height: s(72),
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
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: colors.border,
                padding: s(14),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Availability
                </Text>
                <TouchableOpacity
                  onPress={() => setIsActive(!isActive)}
                  style={{
                    width: s(44),
                    height: s(24),
                    borderRadius: s(12),
                    backgroundColor: isActive ? colors.teal : colors.card,
                    borderWidth: 1,
                    borderColor: isActive ? colors.teal : colors.border,
                    justifyContent: "center",
                    paddingHorizontal: s(2),
                  }}
                >
                  <View
                    style={{
                      width: s(20),
                      height: s(20),
                      borderRadius: s(10),
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
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: colors.border,
                padding: s(14),
                gap: s(12),
              }}
            >
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "600",
                  color: colors.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
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
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: colors.border,
                padding: s(14),
                gap: s(12),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Categories
                </Text>
                <Text style={{ fontSize: s(11), color: colors.muted }}>
                  {selectedCategories.length} of {availableCategories.length}{" "}
                  selected
                </Text>
              </View>

              {availableCategories.length === 0 ? (
                <View
                  style={{
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(10),
                    padding: s(20),
                    alignItems: "center",
                    gap: s(10),
                  }}
                >
                  <Utensils size={s(24)} color={colors.muted} />
                  <Text
                    style={{
                      fontSize: s(12),
                      color: colors.muted,
                      textAlign: "center",
                    }}
                  >
                    No categories available.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/menu/add-category")}
                    style={{
                      paddingHorizontal: s(14),
                      paddingVertical: s(6),
                      borderRadius: s(8),
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
                        color: colors.teal,
                      }}
                    >
                      Create Category
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: s(6) }}>
                  {availableCategories.map((category) => {
                    const isSelected = selectedCategories.includes(
                      category.name,
                    );
                    const isExpanded = expandedCategories.includes(
                      category.name,
                    );
                    const categoryItems = getItemsInCategory(category.name);

                    return (
                      <View
                        key={category.id}
                        style={{
                          backgroundColor: isSelected
                            ? colors.teal + "08"
                            : colors.panel,
                          borderRadius: s(10),
                          borderWidth: 1,
                          borderColor: isSelected
                            ? colors.teal + "40"
                            : colors.border,
                        }}
                      >
                        <View
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              toggleCategorySelection(category.name)
                            }
                            style={{ flex: 1, padding: s(12) }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <View style={{ flex: 1, gap: s(4) }}>
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: s(8),
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: s(13),
                                      fontWeight: "600",
                                      color: colors.heading,
                                    }}
                                  >
                                    {category.name}
                                  </Text>
                                  <View
                                    style={{
                                      backgroundColor: isSelected
                                        ? colors.teal + "20"
                                        : colors.card,
                                      borderRadius: s(10),
                                      paddingHorizontal: s(6),
                                      paddingVertical: s(2),
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: s(10),
                                        fontWeight: "600",
                                        color: isSelected
                                          ? colors.teal
                                          : colors.muted,
                                      }}
                                    >
                                      {categoryItems.length}
                                    </Text>
                                  </View>
                                </View>
                              </View>

                              <View
                                style={{
                                  width: s(22),
                                  height: s(22),
                                  borderRadius: s(11),
                                  borderWidth: s(2),
                                  borderColor: isSelected
                                    ? colors.teal
                                    : colors.border,
                                  backgroundColor: isSelected
                                    ? colors.teal
                                    : "transparent",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {isSelected && (
                                  <Check size={s(12)} color={colors.onSolid} />
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>

                          {categoryItems.length > 0 && (
                            <TouchableOpacity
                              onPress={() =>
                                toggleCategoryExpansion(category.name)
                              }
                              style={{
                                paddingHorizontal: s(12),
                                paddingVertical: s(12),
                              }}
                            >
                              {isExpanded ? (
                                <ChevronUp size={s(18)} color={colors.label} />
                              ) : (
                                <ChevronDown
                                  size={s(18)}
                                  color={colors.label}
                                />
                              )}
                            </TouchableOpacity>
                          )}
                        </View>

                        {isExpanded && categoryItems.length > 0 && (
                          <View
                            style={{
                              paddingHorizontal: s(12),
                              paddingBottom: s(12),
                              gap: s(8),
                            }}
                          >
                            {categoryItems.map((item, index) => (
                              <View
                                key={index}
                                style={{
                                  backgroundColor: colors.card,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  paddingHorizontal: s(10),
                                  paddingVertical: s(8),
                                  borderRadius: s(8),
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: s(8),
                                }}
                              >
                                <View
                                  style={{
                                    width: s(32),
                                    height: s(32),
                                    borderRadius: s(6),
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
                                      <Utensils
                                        color={colors.muted}
                                        size={s(14)}
                                      />
                                    </View>
                                  )}
                                </View>
                                <View style={{ flex: 1, gap: s(2) }}>
                                  <Text
                                    style={{
                                      fontSize: s(12),
                                      color: colors.heading,
                                      fontWeight: "500",
                                    }}
                                    numberOfLines={1}
                                  >
                                    {item.name}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: s(11),
                                      color: colors.label,
                                    }}
                                  >
                                    ${item.price.toFixed(2)}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
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
                  borderRadius: s(12),
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: s(14),
                  gap: s(10),
                }}
              >
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Preview · {totalItems} items
                </Text>
                {Object.entries(previewItems).map(([categoryName, items]) => (
                  <View key={categoryName} style={{ gap: s(6) }}>
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
                        color: colors.teal,
                      }}
                    >
                      {categoryName}
                      <Text style={{ color: colors.muted, fontWeight: "400" }}>
                        {" "}
                        ({items.length})
                      </Text>
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: s(6),
                      }}
                    >
                      {items.slice(0, 6).map((item, index) => (
                        <View
                          key={index}
                          style={{
                            width: s(70),
                            height: s(70),
                            backgroundColor: colors.card,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: s(8),
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
                              <Utensils size={s(16)} color={colors.muted} />
                            </View>
                          )}
                        </View>
                      ))}
                      {items.length > 6 && (
                        <View
                          style={{
                            width: s(70),
                            height: s(70),
                            backgroundColor: colors.panel,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: s(8),
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: s(12),
                              fontWeight: "600",
                              color: colors.muted,
                            }}
                          >
                            +{items.length - 6}
                          </Text>
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
              width: s(300),
              borderLeftWidth: 1,
              borderLeftColor: colors.border,
              backgroundColor: colors.card,
              padding: s(16),
              gap: s(16),
              overflow: "hidden",
            }}
          >
            <Text
              style={{
                fontSize: s(13),
                fontWeight: "700",
                color: colors.heading,
              }}
            >
              Summary
            </Text>

            {/* Selected Categories */}
            <View style={{ gap: s(8) }}>
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "600",
                  color: colors.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Selected Categories
              </Text>
              <ScrollView
                style={{ maxHeight: s(120) }}
                contentContainerStyle={{ gap: s(4) }}
                showsVerticalScrollIndicator={false}
              >
                {selectedCategories.length === 0 ? (
                  <Text style={{ fontSize: s(12), color: colors.muted }}>
                    No categories selected
                  </Text>
                ) : (
                  selectedCategories.map((catName) => (
                    <View
                      key={catName}
                      style={{
                        backgroundColor: colors.panel,
                        borderRadius: s(6),
                        paddingHorizontal: s(8),
                        paddingVertical: s(4),
                      }}
                    >
                      <Text style={{ fontSize: s(11), color: colors.label }}>
                        {catName}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* Stats */}
            <View style={{ gap: s(12) }}>
              <View style={{ gap: s(4) }}>
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.muted,
                    fontWeight: "500",
                  }}
                >
                  Categories Selected:
                </Text>
                <Text
                  style={{
                    fontSize: s(16),
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  {selectedCategories.length}
                </Text>
              </View>

              <View style={{ gap: s(4) }}>
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.muted,
                    fontWeight: "500",
                  }}
                >
                  Total Items:
                </Text>
                <Text
                  style={{
                    fontSize: s(16),
                    fontWeight: "700",
                    color: colors.teal,
                  }}
                >
                  {totalItems}
                </Text>
              </View>

              <View style={{ gap: s(4) }}>
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.muted,
                    fontWeight: "500",
                  }}
                >
                  Schedules:
                </Text>
                <Text
                  style={{
                    fontSize: s(16),
                    fontWeight: "700",
                    color: colors.label,
                  }}
                >
                  {schedules.length}
                </Text>
              </View>
            </View>

            {/* Menu Status */}
            {name.trim() && (
              <View style={{ gap: s(4) }}>
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.muted,
                    fontWeight: "500",
                  }}
                >
                  Menu Status:
                </Text>
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: isActive ? colors.teal : colors.danger,
                  }}
                >
                  {isActive ? "Active" : "Inactive"}
                </Text>
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
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: colors.heading,
                  marginBottom: 6,
                  textAlign: "center",
                }}
              >
                {initialData ? "Save Changes?" : "Create Menu?"}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.label,
                  textAlign: "center",
                  lineHeight: 19,
                }}
              >
                {initialData ? "Save changes to" : "Create"} &quot;{name}&quot;
                with {selectedCategories.length}{" "}
                {selectedCategories.length === 1 ? "category" : "categories"}
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
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.onSolid,
                    fontWeight: "700",
                  }}
                >
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
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.label,
                    fontWeight: "700",
                  }}
                >
                  Cancel
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

      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Menu"
        message="Are you sure you want to delete this menu? This action cannot be undone."
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={() => {
          setShowDeleteDialog(false);
          onDelete?.();
        }}
      />

      <AppNoticeModal
        visible={!!validationNotice}
        onClose={() => setValidationNotice(null)}
        title={validationNotice?.title || ""}
        description={validationNotice?.description || ""}
        variant="warning"
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
