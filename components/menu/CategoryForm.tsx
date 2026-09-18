import ScheduleFormSheet from "@/components/menu/ScheduleFormSheet";
import ScheduleManager from "@/components/menu/ScheduleManager";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFlatList,
    BottomSheetTextInput,
} from "@/components/ui/bottomSheet";
import DeleteConfirmDialog from "@/components/ui/DeleteConfirmDialog";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import {
    extractMenuItemPlaceholderIconKey,
    getMenuItemPlaceholderIcon,
    type MenuItemPlaceholderIconKey,
} from "@/lib/menuItemPlaceholderIcon";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { Category, MenuItemType, Schedule } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useMenuStore } from "@/stores/useMenuStore";
import { router } from "expo-router";
import {
    Check,
    DollarSign,
    Minus,
    Plus,
    Search,
    Trash2,
    Utensils,
    X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface CategoryFormData {
  name: string;
  isActive: boolean;
  schedules: Schedule[];
  selectedItems: string[];
  customPricing: Record<string, number>;
}

export interface CategoryFormProps {
  initialData?: Category;
  initialItems?: string[];
  onSubmit: (data: CategoryFormData) => Promise<boolean>;
  isSaving: boolean;
  title: string;
  submitButtonLabel: string;
  onDelete?: () => void;
  /** Disable all mutating actions (save / delete) — e.g. while offline. */
  disabled?: boolean;
}

const CategoryForm: React.FC<CategoryFormProps> = ({
  initialData,
  initialItems = [],
  onSubmit,
  isSaving,
  title,
  submitButtonLabel,
  onDelete,
  disabled = false,
}) => {
  const allItems = useMenuStore((store) => store.menuItems);
  const addCustomPricing = useMenuStore((store) => store.addCustomPricing);
  const deleteCustomPricing = useMenuStore(
    (store) => store.deleteCustomPricing,
  );
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const [name, setName] = useState(initialData?.name || "");
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [schedules, setSchedules] = useState<Schedule[]>(
    initialData?.schedules || [],
  );
  const [selectedItemIds, setSelectedItemIds] =
    useState<string[]>(initialItems);
  const [pendingCustomPrices, setPendingCustomPrices] = useState<
    Record<string, number>
  >({});
  const [newPricing, setNewPricing] = useState<{
    itemId: string;
    price: number;
  } | null>(null);
  const [newPricingText, setNewPricingText] = useState("");

  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const hasSavedRef = useRef(false);
  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current,
  );

  const quickSearchSheetRef = useRef<BottomSheet>(null);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const scheduleSheetRef = useRef<BottomSheet>(null);
  const [editingRule, setEditingRule] = useState<Schedule | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const isEditMode = !!initialData;

  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    const nameChanged = (initialData?.name || "") !== name;
    const activeChanged = (initialData?.isActive ?? true) !== isActive;
    const schedulesChanged =
      JSON.stringify(initialData?.schedules || []) !==
      JSON.stringify(schedules);
    const itemsChanged =
      JSON.stringify(initialItems.sort()) !==
      JSON.stringify(selectedItemIds.sort());
    const isNewAndChanged =
      !initialData &&
      (name !== "" || selectedItemIds.length > 0 || schedules.length > 0);
    setHasChanges(
      initialData
        ? nameChanged || activeChanged || schedulesChanged || itemsChanged
        : isNewAndChanged,
    );
  }, [name, isActive, schedules, selectedItemIds, initialData, initialItems]);

  const filteredItems = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q),
    );
  }, [allItems, quickSearchQuery]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Validation", "Name is required");
      return;
    }
    const success = await onSubmit({
      name: name.trim(),
      isActive,
      schedules,
      selectedItems: selectedItemIds,
      customPricing: {},
    });
    if (success) {
      hasSavedRef.current = true;
      setHasChanges(false);
      if (router.canGoBack()) router.back();
    }
  };

  const toggleItem = (item: MenuItemType) => {
    setSelectedItemIds((prev) =>
      prev.includes(item.id)
        ? prev.filter((id) => id !== item.id)
        : [...prev, item.id],
    );
  };

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

  const handleAddCustomPricing = (itemId: string) => {
    const item = allItems.find((i) => i.id === itemId);
    if (item) {
      setNewPricing({ itemId, price: item.price });
      setNewPricingText(item.price.toFixed(2));
    }
  };

  const handleCommitCustomPricing = () => {
    if (!newPricing) return;
    const parsed = parseFloat(newPricingText.replace(",", "."));
    if (isNaN(parsed)) {
      Alert.alert("Invalid price", "Please enter a valid number.");
      return;
    }
    if (isEditMode) {
      addCustomPricing(newPricing.itemId, {
        categoryId: initialData.id,
        categoryName: initialData.name,
        price: parsed,
        isActive: true,
      });
    } else {
      setPendingCustomPrices((prev) => ({
        ...prev,
        [newPricing.itemId]: parsed,
      }));
    }
    setNewPricing(null);
    setNewPricingText("");
  };

  const handleRemoveCustomPricing = (itemId: string, pricingId?: string) => {
    if (isEditMode && pricingId) {
      Alert.alert("Delete Custom Pricing", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCustomPricing(itemId, pricingId),
        },
      ]);
    } else {
      setPendingCustomPrices((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
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
              <Check size={s(14)} color={colors.onSolid} />
            )}
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "600",
                color: colors.onSolid,
              }}
            >
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
            contentContainerStyle={{ padding: s(16), gap: s(16) }}
            showsVerticalScrollIndicator={false}
          >
            {/* Basic Info */}
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
                  Category Name *
                </Text>
                <TextInput
                  autoFocus={false}
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
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Starters, Mains, Desserts"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            {/* Availability Toggle */}
            <View
              style={{
                backgroundColor: colors.card + "cc",
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

            {/* Availability Schedule */}
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
                Schedule
              </Text>
              <ScheduleManager
                value={schedules}
                onChange={setSchedules}
                onAdd={() => openScheduleSheet()}
                onEdit={(rule, idx) => openScheduleSheet(rule, idx)}
              />
            </View>

            {/* Selected items summary chips */}
            {selectedItemIds.length > 0 && (
              <View
                style={{
                  backgroundColor: colors.card + "cc",
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
                  Selected · {selectedItemIds.length}
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: s(6) }}
                >
                  {selectedItemIds.map((itemId) => {
                    const item = allItems.find((i) => i.id === itemId);
                    return item ? (
                      <View
                        key={itemId}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: colors.teal + "15",
                          borderWidth: 1,
                          borderColor: colors.teal + "40",
                          paddingHorizontal: s(8),
                          paddingVertical: s(4),
                          borderRadius: s(20),
                          gap: s(6),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(11),
                            fontWeight: "600",
                            color: colors.teal,
                          }}
                        >
                          {item.name}
                        </Text>
                        <TouchableOpacity onPress={() => toggleItem(item)}>
                          <X size={s(11)} color={colors.teal} />
                        </TouchableOpacity>
                      </View>
                    ) : null;
                  })}
                </View>
              </View>
            )}

            {/* Item Selection */}
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
                  Items · {selectedItemIds.length}/{allItems.length}
                </Text>
                <TouchableOpacity
                  onPress={() => quickSearchSheetRef.current?.expand()}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(5),
                    paddingHorizontal: s(10),
                    paddingVertical: s(5),
                    borderRadius: s(8),
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Search size={s(12)} color={colors.label} />
                  <Text style={{ fontSize: s(11), color: colors.label }}>
                    Search
                  </Text>
                </TouchableOpacity>
              </View>

              {allItems.length === 0 ? (
                <View
                  style={{
                    backgroundColor: colors.panel,
                    borderRadius: s(8),
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: s(20),
                    alignItems: "center",
                    gap: s(8),
                  }}
                >
                  <Utensils size={s(20)} color={colors.muted} />
                  <Text style={{ fontSize: s(12), color: colors.muted }}>
                    No menu items found.
                  </Text>
                </View>
              ) : (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}
                >
                  {allItems.map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    let activeCustomPrice: number | null = null;
                    let pricingId: string | undefined;

                    if (isEditMode) {
                      const cp = item.customPricing?.find(
                        (p) => p.categoryId === initialData.id,
                      );
                      if (cp?.isActive) {
                        activeCustomPrice = cp.price;
                        pricingId = cp.id;
                      }
                    } else if (pendingCustomPrices[item.id] !== undefined) {
                      activeCustomPrice = pendingCustomPrices[item.id];
                    }

                    const imgSrc = resolveMenuItemImageSource(item.image);
                    const PlaceholderIcon = getMenuItemPlaceholderIcon(
                      ((item.placeholderIcon as
                        MenuItemPlaceholderIconKey | undefined) ??
                        extractMenuItemPlaceholderIconKey(item.cardBgColor)) as
                        MenuItemPlaceholderIconKey | undefined,
                    );

                    return (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => toggleItem(item)}
                        style={{
                          width: s(140),
                          backgroundColor: isSelected
                            ? colors.teal + "08"
                            : colors.panel,
                          borderRadius: s(10),
                          borderWidth: 1,
                          borderColor: isSelected
                            ? colors.teal + "40"
                            : colors.border,
                          overflow: "hidden",
                        }}
                      >
                        {/* Thumbnail */}
                        <View
                          style={{
                            height: s(72),
                            backgroundColor: colors.screen,
                          }}
                        >
                          {imgSrc ? (
                            <Image
                              source={imgSrc}
                              style={{ width: "100%", height: "100%" }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View
                              style={{
                                flex: 1,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <PlaceholderIcon
                                size={s(20)}
                                color={colors.muted}
                                strokeWidth={2}
                              />
                            </View>
                          )}
                          {/* Check badge */}
                          {isSelected && (
                            <View
                              style={{
                                position: "absolute",
                                top: s(5),
                                right: s(5),
                                width: s(18),
                                height: s(18),
                                borderRadius: s(9),
                                backgroundColor: colors.teal,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Check size={s(11)} color={colors.onSolid} />
                            </View>
                          )}
                        </View>

                        {/* Info */}
                        <View style={{ padding: s(8), gap: s(3) }}>
                          <Text
                            style={{
                              fontSize: s(11),
                              fontWeight: "600",
                              color: colors.heading,
                            }}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: s(4),
                            }}
                          >
                            <Text
                              style={{
                                fontSize: s(11),
                                fontWeight: "600",
                                color:
                                  activeCustomPrice !== null
                                    ? colors.warning
                                    : colors.teal,
                              }}
                            >
                              ${(activeCustomPrice ?? item.price).toFixed(2)}
                            </Text>
                            {activeCustomPrice !== null && (
                              <Text
                                style={{
                                  fontSize: s(10),
                                  color: colors.muted,
                                  textDecorationLine: "line-through",
                                }}
                              >
                                ${item.price.toFixed(2)}
                              </Text>
                            )}
                          </View>

                          {/* Custom pricing controls — only when selected */}
                          {isSelected && (
                            <View style={{ marginTop: s(2) }}>
                              {activeCustomPrice !== null ? (
                                <TouchableOpacity
                                  onPress={() =>
                                    handleRemoveCustomPricing(
                                      item.id,
                                      pricingId,
                                    )
                                  }
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: s(3),
                                    alignSelf: "flex-start",
                                    backgroundColor: colors.danger + "15",
                                    borderWidth: 1,
                                    borderColor: colors.danger + "30",
                                    paddingHorizontal: s(6),
                                    paddingVertical: s(2),
                                    borderRadius: s(6),
                                  }}
                                >
                                  <X size={s(10)} color={colors.danger} />
                                  <Text
                                    style={{
                                      fontSize: s(10),
                                      color: colors.danger,
                                    }}
                                  >
                                    Reset
                                  </Text>
                                </TouchableOpacity>
                              ) : newPricing?.itemId === item.id ? (
                                <View style={{ gap: s(4) }}>
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: s(4),
                                    }}
                                  >
                                    <TouchableOpacity
                                      onPress={() => {
                                        const c = parseFloat(
                                          newPricingText.replace(",", "."),
                                        );
                                        setNewPricingText(
                                          (isNaN(c)
                                            ? 0
                                            : Math.max(0, c - 0.25)
                                          ).toFixed(2),
                                        );
                                      }}
                                      style={{ padding: s(3) }}
                                    >
                                      <Minus
                                        size={s(11)}
                                        color={colors.label}
                                      />
                                    </TouchableOpacity>
                                    <TextInput
                                      autoFocus={false}
                                      style={{
                                        flex: 1,
                                        backgroundColor: colors.screen,
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                        borderRadius: s(6),
                                        paddingHorizontal: s(6),
                                        paddingVertical: s(3),
                                        fontSize: s(11),
                                        color: colors.heading,
                                        textAlign: "center",
                                      }}
                                      value={newPricingText}
                                      onChangeText={setNewPricingText}
                                      keyboardType="decimal-pad"
                                    />
                                    <TouchableOpacity
                                      onPress={() => {
                                        const c = parseFloat(
                                          newPricingText.replace(",", "."),
                                        );
                                        setNewPricingText(
                                          (isNaN(c) ? 0 : c + 0.25).toFixed(2),
                                        );
                                      }}
                                      style={{ padding: s(3) }}
                                    >
                                      <Plus size={s(11)} color={colors.label} />
                                    </TouchableOpacity>
                                  </View>
                                  <View
                                    style={{ flexDirection: "row", gap: s(4) }}
                                  >
                                    <TouchableOpacity
                                      onPress={handleCommitCustomPricing}
                                      style={{
                                        flex: 1,
                                        backgroundColor: colors.success + "20",
                                        borderWidth: 1,
                                        borderColor: colors.success + "50",
                                        borderRadius: s(6),
                                        paddingVertical: s(3),
                                        alignItems: "center",
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: s(10),
                                          fontWeight: "600",
                                          color: colors.success,
                                        }}
                                      >
                                        Set
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      onPress={() => setNewPricing(null)}
                                      style={{
                                        flex: 1,
                                        backgroundColor: colors.card,
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                        borderRadius: s(6),
                                        paddingVertical: s(3),
                                        alignItems: "center",
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: s(10),
                                          color: colors.label,
                                        }}
                                      >
                                        Cancel
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  onPress={() =>
                                    handleAddCustomPricing(item.id)
                                  }
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: s(3),
                                    alignSelf: "flex-start",
                                    backgroundColor: colors.warning + "15",
                                    borderWidth: 1,
                                    borderColor: colors.warning + "30",
                                    paddingHorizontal: s(6),
                                    paddingVertical: s(2),
                                    borderRadius: s(6),
                                  }}
                                >
                                  <DollarSign
                                    size={s(10)}
                                    color={colors.warning}
                                  />
                                  <Text
                                    style={{
                                      fontSize: s(10),
                                      color: colors.warning,
                                    }}
                                  >
                                    Custom $
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Right: Summary Panel */}
          <View
            style={{
              width: s(300),
              borderLeftWidth: s(1),
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

            {/* Category Name */}
            {name.trim() && (
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
                  Category Name
                </Text>
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  {name}
                </Text>
              </View>
            )}

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
                  Items Selected:
                </Text>
                <Text
                  style={{
                    fontSize: s(16),
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  {selectedItemIds.length}
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
                  Total Available:
                </Text>
                <Text
                  style={{
                    fontSize: s(16),
                    fontWeight: "700",
                    color: colors.teal,
                  }}
                >
                  {allItems.length}
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

            {/* Availability Status */}
            {name.trim() && (
              <View style={{ gap: s(4) }}>
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.muted,
                    fontWeight: "500",
                  }}
                >
                  Category Status:
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

      {/* Quick Search Sheet */}
      <BottomSheet
        ref={quickSearchSheetRef}
        index={-1}
        snapPoints={["60%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        {...bottomSheetTheme}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: s(14),
            paddingVertical: s(14),
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            gap: s(10),
          }}
        >
          <Search size={s(14)} color={colors.muted} />
          <BottomSheetTextInput
            value={quickSearchQuery}
            onChangeText={setQuickSearchQuery}
            placeholder="Search items…"
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              height: s(40),
              fontSize: s(13),
              color: colors.heading,
              paddingVertical: s(8),
            }}
          />
          {quickSearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setQuickSearchQuery("")}>
              <X size={s(13)} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        <BottomSheetFlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: s(14),
            paddingTop: 8,
            paddingBottom: 32,
          }}
          renderItem={({ item }) => {
            const isSelected = selectedItemIds.includes(item.id);
            const imgSrc = resolveMenuItemImageSource(item.image);
            const PlaceholderIcon = getMenuItemPlaceholderIcon(
              ((item.placeholderIcon as
                MenuItemPlaceholderIconKey | undefined) ??
                extractMenuItemPlaceholderIconKey(item.cardBgColor)) as
                MenuItemPlaceholderIconKey | undefined,
            );
            return (
              <TouchableOpacity
                onPress={() => toggleItem(item)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: isSelected
                    ? colors.teal + "08"
                    : colors.card,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.teal + "40" : colors.border,
                  borderRadius: s(8),
                  paddingHorizontal: s(10),
                  paddingVertical: s(8),
                  marginBottom: s(6),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(10),
                    flex: 1,
                  }}
                >
                  <View
                    style={{
                      width: s(34),
                      height: s(34),
                      borderRadius: s(6),
                      borderWidth: 1,
                      borderColor: colors.border,
                      overflow: "hidden",
                    }}
                  >
                    {imgSrc ? (
                      <Image
                        source={imgSrc}
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
                        <PlaceholderIcon
                          size={s(13)}
                          color={colors.muted}
                          strokeWidth={2}
                        />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "500",
                        color: colors.heading,
                      }}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: s(11), color: colors.label }}>
                      ${item.price.toFixed(2)}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    width: s(20),
                    height: s(20),
                    borderRadius: s(10),
                    borderWidth: 2,
                    borderColor: isSelected ? colors.teal : colors.border,
                    backgroundColor: isSelected ? colors.teal : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isSelected && <Check size={s(11)} color={colors.onSolid} />}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </BottomSheet>

      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Category"
        message="Are you sure you want to delete this category? This action cannot be undone."
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={() => {
          setShowDeleteDialog(false);
          onDelete?.();
        }}
      />
    </View>
  );
};

export default CategoryForm;
