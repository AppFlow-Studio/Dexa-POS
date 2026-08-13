import RecipeManager from "@/components/inventory/RecipeManager";
import { GlobalItemScreen } from "@/components/menu/GlobalItemScreen";
import { MenuScopeLoadingScreen } from "@/components/menu/MenuScopeLoadingScreen";
import { ModifierStockToggle } from "@/components/menu/ModifierStockToggle";
import DeleteConfirmDialog from "@/components/ui/DeleteConfirmDialog";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useToast } from "@/contexts/ToastContext";
import { useIsSingleLocation } from "@/hooks/pos/useIsSingleLocation";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { isActivelySnoozed } from "@/lib/snoozeDurations";
import { ModifierOption, RecipeItem } from "@/lib/types";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { router, useLocalSearchParams } from "expo-router";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { ArrowLeft, Check, ChefHat, GripVertical, Plus, Save, Trash2, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

interface ModifierFormData {
  name: string;
  type: "required" | "optional";
  selectionType: "single" | "multiple";
  maxSelections?: number;
  description?: string;
  options: ModifierOption[];
  recipeMap: Record<string, RecipeItem[]>;
}

interface FormErrors {
  name?: string;
  options?: string;
  maxSelections?: string;
}

const EditModifierScreen: React.FC = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const { id } = useLocalSearchParams<{ id: string }>();
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  const updateModifierGroup = useMenuStore((s) => s.updateModifierGroup);
  const deleteModifierGroup = useMenuStore((s) => s.deleteModifierGroup);
  const addModifierGroup = useMenuStore((s) => s.addModifierGroup);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const { show } = useToast();
  const { isSingleLocation, isLoading: isSingleLocationLoading } =
    useIsSingleLocation();

  const existing = useMemo(() => modifierGroups.find((m) => m.id === id), [id, modifierGroups]);

  const isGlobalModifier = existing?.location_id === null || existing?.location_id === undefined;
  const isLocalModifier = existing?.location_id === selectedStore?.id;

  const [formData, setFormData] = useState<ModifierFormData>({
    name: "", type: "optional", selectionType: "single",
    maxSelections: undefined, description: "", options: [], recipeMap: {},
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMakingLocalCopy, setIsMakingLocalCopy] = useState(false);
  const [originalFormData, setOriginalFormData] = useState<ModifierFormData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);
  const [selectedOptionIdForRecipe, setSelectedOptionIdForRecipe] = useState<string | null>(null);

  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(hasChanges && !hasSavedRef.current);

  useEffect(() => {
    if (existing) {
      const initialData = {
        name: existing.name,
        type: existing.type,
        selectionType: existing.selectionType,
        maxSelections: existing.maxSelections,
        description: existing.description || "",
        options: existing.options || [],
        recipeMap: (existing.options || []).reduce((acc, opt) => {
          if (opt.recipe) acc[opt.id] = opt.recipe;
          return acc;
        }, {} as Record<string, RecipeItem[]>),
      };
      setFormData(initialData);
      setOriginalFormData(initialData);
    }
  }, [existing]);

  useEffect(() => {
    if (originalFormData) {
      setHasChanges(JSON.stringify(formData) !== JSON.stringify(originalFormData));
    }
  }, [formData, originalFormData]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) newErrors.name = "Modifier name is required";
    if (formData.options.length === 0) newErrors.options = "Please add at least one option";
    if (formData.options.some((o) => o.name.trim() === "")) newErrors.options = "All options must have a name";
    if (formData.type === "required" && !formData.options.some((o) => o.isDefault === true)) {
      newErrors.options = "One option must be set as default for required modifiers";
    }
    if (formData.selectionType === "multiple" && formData.maxSelections && formData.maxSelections < 1) {
      newErrors.maxSelections = "Max selections must be at least 1";
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      show({ title: "Validation Error", message: "Please fix the errors before saving.", type: "error" });
    }
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => { if (!validateForm()) return; setShowConfirm(true); };

  const confirmSave = async () => {
    if (!existing) return;
    setIsSaving(true);
    setShowConfirm(false);
    try {
      const { error } = await MenuService.updateModifierGroup(supabase, existing.id, {
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
        isRequired: formData.type === "required",
        minSelections: formData.type === "required" ? 1 : 0,
        maxSelections: formData.selectionType === "multiple" ? formData.maxSelections : 1,
      });

      if (error) {
        show({ title: "Error", message: error.message || "Failed to update modifier group.", type: "error" });
        return;
      }

      const existingOptions = existing.options || [];
      const formOptions = formData.options;

      for (const [optionIndex, opt] of formOptions.entries()) {
        const existingOpt = existingOptions.find((e) => e.id === opt.id);
        if (existingOpt) {
          await MenuService.updateModifierItem(supabase, opt.id, {
            name: opt.name.trim(),
            priceModifier: opt.price,
            displayOrder: optionIndex,
            isDefault: opt.isDefault,
            isActive: opt.isAvailable ?? true,
          });
          const currentRecipe = formData.recipeMap[opt.id];
          if (currentRecipe) {
            await MenuService.upsertModifierOptionRecipe(supabase, opt.id, currentRecipe.map((r) => ({ inventoryItemId: r.inventoryItemId, quantity: r.quantity })));
          }
        } else {
          if (selectedStore?.merchant_id) {
            const { data: newModifierItem, error: createError } = await MenuService.createModifierItem(supabase, {
              modifierGroupId: existing.id,
              name: opt.name.trim(),
              priceModifier: opt.price,
              displayOrder: optionIndex,
              isActive: opt.isAvailable ?? true,
              isDefault: opt.isDefault,
              merchantId: selectedStore.merchant_id,
            });
            if (!createError && newModifierItem) {
              const currentRecipe = formData.recipeMap[opt.id];
              if (currentRecipe && currentRecipe.length > 0) {
                await MenuService.upsertModifierOptionRecipe(supabase, newModifierItem.id, currentRecipe.map((r) => ({ inventoryItemId: r.inventoryItemId, quantity: r.quantity })));
              }
            }
          }
        }
      }

      for (const existingOpt of existingOptions) {
        if (!formOptions.find((o) => o.id === existingOpt.id)) {
          await MenuService.deleteModifierItem(supabase, existingOpt.id);
        }
      }

      updateModifierGroup(existing.id, {
        name: formData.name.trim(),
        type: formData.type,
        selectionType: formData.selectionType,
        maxSelections: formData.selectionType === "multiple" ? formData.maxSelections : undefined,
        description: formData.description?.trim() || undefined,
        options: formData.options.map((o) => ({ ...o, name: o.name.trim(), recipe: formData.recipeMap[o.id] })),
      });

      show({ title: "Modifier Updated", message: `"${formData.name.trim()}" has been saved.`, type: "success" });
      hasSavedRef.current = true;
      setHasChanges(false);
      router.back();
    } catch (error) {
      console.error(error);
      show({ title: "Error", message: "Failed to update the modifier group.", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMakeLocalCopy = async () => {
    if (!existing || !selectedStore?.id || !selectedStore?.merchant_id) return;
    setIsMakingLocalCopy(true);
    try {
      // 1. Create new local modifier group
      const { data: newGroup, error: groupError } = await MenuService.createModifierGroup(supabase, {
        merchantId: selectedStore.merchant_id,
        locationId: selectedStore.id,
        name: existing.name,
        description: existing.description,
        isRequired: existing.type === "required",
        minSelections: existing.type === "required" ? 1 : 0,
        maxSelections: existing.selectionType === "multiple" ? existing.maxSelections : 1,
      });
      if (groupError || !newGroup) {
        show({ title: "Error", message: "Failed to create local copy.", type: "error" });
        return;
      }

      // 2. Copy all options
      for (const opt of existing.options || []) {
        await MenuService.createModifierItem(supabase, {
          modifierGroupId: newGroup.id,
          name: opt.name,
          priceModifier: opt.price,
          displayOrder: opt.displayOrder,
          isActive: opt.isAvailable ?? true,
          isDefault: opt.isDefault ?? false,
          merchantId: selectedStore.merchant_id,
        });
      }

      // 3. Re-link menu items at this location from global → local
      const locationItemIds = (existing.items || [])
        .filter((item) => !item.location_id || item.location_id === selectedStore.id)
        .map((item) => item.id);

      for (const menuItemId of locationItemIds) {
        await MenuService.removeModifierFromItem(supabase, menuItemId, existing.id);
        await MenuService.assignModifierToItem(supabase, {
          menuItemId,
          modifierGroupId: newGroup.id,
          merchantId: selectedStore.merchant_id,
        });
      }

      // 4. Add to local store and navigate
      addModifierGroup({
        id: newGroup.id,
        name: newGroup.name,
        type: existing.type,
        selectionType: existing.selectionType,
        maxSelections: existing.maxSelections,
        description: existing.description,
        location_id: selectedStore.id,
        options: existing.options || [],
      });

      show({ title: "Local Copy Created", message: `"${existing.name}" is now editable for this location.`, type: "success" });
      router.replace(`/menu/edit-modifier?id=${newGroup.id}`);
    } catch (err) {
      console.error(err);
      show({ title: "Error", message: "Failed to create local copy.", type: "error" });
    } finally {
      setIsMakingLocalCopy(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!existing) return;
    setIsSaving(true);
    try {
      const { error } = await MenuService.deleteModifierGroup(supabase, existing.id);
      if (error) {
        show({ title: "Error", message: error.message || "Failed to delete modifier group.", type: "error" });
        return;
      }
      deleteModifierGroup(existing.id);
      show({ title: "Modifier Deleted", message: `"${existing.name}" has been deleted.`, type: "success" });
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  const addOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [...prev.options, { id: `opt_${Date.now()}`, name: "", price: 0, isDefault: false }],
    }));
  };

  const updateOption = (index: number, field: keyof ModifierOption, value: string | number | boolean) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => i === index ? { ...o, [field]: value } : o),
    }));
  };

  const removeOption = (index: number) => {
    setFormData((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }));
  };

  const toggleDefaultOption = (index: number) => {
    setFormData((prev) => {
      const newOptions = [...prev.options];
      if (prev.selectionType === "single") newOptions.forEach((o, i) => { if (i !== index) o.isDefault = false; });
      newOptions[index].isDefault = !newOptions[index].isDefault;
      return { ...prev, options: newOptions };
    });
  };

  const handleOptionDragEnd = (data: ModifierOption[]) => {
    setFormData((prev) => ({
      ...prev,
      options: data.map((option, index) => ({
        ...option,
        displayOrder: index,
      })),
    }));
  };

  const sectionLabel = { fontSize: s(11), fontWeight: "600" as const, color: colors.muted, textTransform: "uppercase" as const, letterSpacing: 0.5 };
  const card = { backgroundColor: colors.card + "cc", borderRadius: s(12), borderWidth: 1, borderColor: colors.border, padding: s(14), gap: s(12) };
  const inputStyle = { backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: s(8), paddingHorizontal: s(12), paddingVertical: s(10), fontSize: s(13), color: colors.heading };

  if (!existing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center", padding: s(16) }}>
        <Text style={{ fontSize: s(14), color: colors.heading, marginBottom: s(12) }}>Modifier not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: s(16), paddingVertical: s(8), backgroundColor: colors.card, borderRadius: s(8), borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: s(13), color: colors.label }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Single-location merchants edit the global modifier directly. Multi-location
  // keeps the read-only wall but can make a local copy.
  if (isGlobalModifier && isSingleLocationLoading) {
    return <MenuScopeLoadingScreen />;
  }
  if (
    (isGlobalModifier && !isSingleLocation) ||
    (!isGlobalModifier && !isLocalModifier)
  ) {
    return (
      <GlobalItemScreen
        type="Modifier"
        onMakeLocalCopy={selectedStore?.id ? handleMakeLocalCopy : undefined}
        isMakingLocalCopy={isMakingLocalCopy}
      />
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: s(16), paddingVertical: s(12), borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}>
        <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>Edit Modifier Group</Text>

        <View style={{ flexDirection: "row", gap: s(10), alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8), backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.label }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={{ paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8), backgroundColor: colors.danger + "15", borderWidth: 1, borderColor: colors.danger + "30" }}
          >
            <Trash2 size={s(14)} color={colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            style={{ flexDirection: "row", alignItems: "center", gap: s(6), paddingHorizontal: s(14), paddingVertical: s(6), borderRadius: s(8), backgroundColor: colors.teal, opacity: isSaving ? 0.7 : 1 }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.onSolid} />
            ) : (
              <Check size={s(14)} color={colors.onSolid} />
            )}
            <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.onSolid }}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, flexDirection: "row" }}>
        {/* Left: Form */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: s(16), gap: s(16) }} showsVerticalScrollIndicator={false}>

        {/* Basic Info */}
        <View style={card}>
          <Text style={sectionLabel}>Basic Information</Text>
          <View style={{ gap: s(6) }}>
            <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.label }}>Modifier Name *</Text>
            <TextInput
              style={[inputStyle, errors.name ? { borderColor: colors.danger } : {}]}
              value={formData.name}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
              placeholder="Modifier name"
              placeholderTextColor={colors.muted}
            />
            {errors.name && <Text style={{ fontSize: s(11), color: colors.danger, marginTop: s(3) }}>{errors.name}</Text>}
          </View>
          <View style={{ gap: s(6) }}>
            <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.label }}>
              Description <Text style={{ color: colors.muted }}>(Optional)</Text>
            </Text>
            <TextInput
              style={[inputStyle, { height: s(72), textAlignVertical: "top" }]}
              placeholder="Optional description"
              placeholderTextColor={colors.muted}
              value={formData.description}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Type & Selection */}
        <View style={card}>
          <Text style={sectionLabel}>Type & Selection</Text>

          <View style={{ gap: s(8) }}>
            <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.label }}>Requirement</Text>
            <View style={{ flexDirection: "row", gap: s(8) }}>
              {(["optional", "required"] as const).map((t) => {
                const active = formData.type === t;
                const isReq = t === "required";
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setFormData((prev) => ({ ...prev, type: t }))}
                    style={{
                      flex: 1, paddingVertical: s(8), borderRadius: s(8), borderWidth: 1, alignItems: "center",
                      backgroundColor: active ? (isReq ? colors.danger + "15" : colors.teal + "15") : colors.screen,
                      borderColor: active ? (isReq ? colors.danger + "50" : colors.teal + "50") : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: s(13), fontWeight: "600", color: active ? (isReq ? colors.danger : colors.teal) : colors.label }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ gap: s(8) }}>
            <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.label }}>Selection Type</Text>
            <View style={{ flexDirection: "row", gap: s(8) }}>
              {(["single", "multiple"] as const).map((selType) => {
                const active = formData.selectionType === selType;
                return (
                  <TouchableOpacity
                    key={selType}
                    onPress={() => setFormData((prev) => ({ ...prev, selectionType: selType }))}
                    style={{
                      flex: 1, paddingVertical: s(8), borderRadius: s(8), borderWidth: 1, alignItems: "center",
                      backgroundColor: active ? colors.teal + "15" : colors.screen,
                      borderColor: active ? colors.teal + "50" : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: s(13), fontWeight: "600", color: active ? colors.teal : colors.label }}>
                      {selType === "single" ? "Single Choice" : "Multiple Choice"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {formData.selectionType === "multiple" && (
            <View style={{ gap: s(6) }}>
              <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.label }}>Max Selections (Optional)</Text>
              <TextInput
                style={[inputStyle, errors.maxSelections ? { borderColor: colors.danger } : {}]}
                keyboardType="numeric"
                value={formData.maxSelections?.toString() || ""}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, maxSelections: text ? parseInt(text) : undefined }))}
                placeholder="Leave empty for unlimited"
                placeholderTextColor={colors.muted}
              />
              {errors.maxSelections && <Text style={{ fontSize: s(11), color: colors.danger, marginTop: s(3) }}>{errors.maxSelections}</Text>}
            </View>
          )}
        </View>

        {/* Options */}
        <View style={card}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: s(12) }}>
            <View style={{ flex: 1 }}>
              <Text style={sectionLabel}>Options</Text>
              <Text style={{ fontSize: s(11), color: colors.muted }}>
                {formData.selectionType === "single" ? "Set one as default" : "Set multiple as default"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={addOption}
              style={{ flexDirection: "row", alignItems: "center", gap: s(4), paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(8), backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "40", marginTop: s(-8) }}
            >
              <Plus size={s(13)} color={colors.teal} />
              <Text style={{ fontSize: s(12), color: colors.teal, fontWeight: "600" }}>Add</Text>
            </TouchableOpacity>
          </View>

          {formData.options.length === 0 ? (
            <View style={{ backgroundColor: colors.screen, borderRadius: s(8), padding: s(16), alignItems: "center", gap: s(10) }}>
              <Text style={{ fontSize: s(12), color: colors.muted }}>No options yet</Text>
              <TouchableOpacity
                onPress={addOption}
                style={{ flexDirection: "row", alignItems: "center", gap: s(6), paddingHorizontal: s(12), paddingVertical: s(7), borderRadius: s(8), backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50" }}
              >
                <Plus size={s(13)} color={colors.teal} />
                <Text style={{ fontSize: s(13), color: colors.teal, fontWeight: "600" }}>Add First Option</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <DraggableFlatList
              data={formData.options}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              activationDistance={10}
              onDragEnd={({ data }) => handleOptionDragEnd(data)}
              renderItem={({ item: option, drag, isActive, getIndex }: RenderItemParams<ModifierOption>) => {
                const index = getIndex() ?? 0;
                // Snooze state comes from the synced store option (existing),
                // not the local draft. Only saved options can be 86'd.
                const storeOption = existing?.options.find(o => o.id === option.id);
                const optionOutOfStock = isActivelySnoozed(storeOption?.snoozedUntil);
                return (
                  <ScaleDecorator>
                    <View
                      style={{
                        backgroundColor: colors.screen,
                        borderRadius: s(10),
                        borderWidth: 1,
                        borderColor: option.isDefault ? colors.success + "50" : isActive ? colors.teal + "45" : colors.border,
                        padding: s(10),
                        marginBottom: s(8),
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: s(8) }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
                          <TouchableOpacity
                            onLongPress={drag}
                            delayLongPress={120}
                            style={{ padding: s(4), borderRadius: s(6), backgroundColor: colors.card }}
                          >
                            <GripVertical size={s(13)} color={colors.muted} />
                          </TouchableOpacity>
                          <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Option {index + 1}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
                          {storeOption && (
                            <ModifierStockToggle
                              target={{ kind: "option", optionId: option.id }}
                              isOutOfStock={optionOutOfStock}
                              showLabel
                            />
                          )}
                          <TouchableOpacity
                            onPress={() => removeOption(index)}
                            style={{ padding: s(4), backgroundColor: colors.danger + "15", borderRadius: s(6) }}
                          >
                            <Trash2 size={s(13)} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={{ flexDirection: "row", gap: s(8), marginBottom: s(8) }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: s(11), color: colors.label, marginBottom: s(4) }}>Name</Text>
                          <TextInput
                            style={inputStyle}
                            value={option.name}
                            onChangeText={(text) => updateOption(index, "name", text)}
                            placeholder="e.g., Large"
                            placeholderTextColor={colors.muted}
                          />
                        </View>
                        <View style={{ width: s(90) }}>
                          <Text style={{ fontSize: s(11), color: colors.label, marginBottom: s(4) }}>Price (+$)</Text>
                          <TextInput
                            style={inputStyle}
                            value={option.price === 0 ? "" : option.price.toString()}
                            onChangeText={(text) => updateOption(index, "price", parseFloat(text) || 0)}
                            keyboardType="numeric"
                            placeholder="0.00"
                            placeholderTextColor={colors.muted}
                          />
                        </View>
                      </View>

                      <View style={{ flexDirection: "row", gap: s(8) }}>
                        <TouchableOpacity
                          onPress={() => toggleDefaultOption(index)}
                          style={{
                            flex: 1, flexDirection: "row", alignItems: "center", gap: s(8),
                            padding: s(8), borderRadius: s(8), borderWidth: 1,
                            backgroundColor: option.isDefault ? colors.success + "12" : colors.card,
                            borderColor: option.isDefault ? colors.success + "40" : colors.border,
                          }}
                        >
                          <View style={{
                            width: s(18), height: s(18), borderRadius: s(4), borderWidth: 1.5,
                            borderColor: option.isDefault ? colors.success : colors.border,
                            backgroundColor: option.isDefault ? colors.success : "transparent",
                            alignItems: "center", justifyContent: "center",
                          }}>
                            {option.isDefault && <Check size={s(10)} color="#fff" />}
                          </View>
                          <Text style={{ fontSize: s(12), fontWeight: "500", color: option.isDefault ? colors.success : colors.label }}>
                            Default
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => setSelectedOptionIdForRecipe(option.id)}
                          style={{
                            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: s(6),
                            padding: s(8), borderRadius: s(8), borderWidth: 1,
                            backgroundColor: formData.recipeMap[option.id]?.length ? colors.teal + "15" : colors.card,
                            borderColor: formData.recipeMap[option.id]?.length ? colors.teal + "40" : colors.border,
                          }}
                        >
                          <ChefHat size={s(13)} color={formData.recipeMap[option.id]?.length ? colors.teal : colors.label} />
                          <Text style={{ fontSize: s(12), fontWeight: "500", color: formData.recipeMap[option.id]?.length ? colors.teal : colors.label }}>
                            {formData.recipeMap[option.id]?.length ? `${formData.recipeMap[option.id].length} Ingredients` : "Recipe"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </ScaleDecorator>
                );
              }}
            />
          )}

          {errors.options && (
            <Text style={{ fontSize: s(11), color: colors.danger, marginTop: s(8) }}>{errors.options}</Text>
          )}
        </View>
        </ScrollView>

        {/* Right: Summary Panel */}
        <View style={{ width: s(300), borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.card, padding: s(16), gap: s(16), overflow: "hidden" }}>
          <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.heading }}>Summary</Text>

          {/* Modifier Name */}
          <View style={{ gap: s(8) }}>
            <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Modifier Name
            </Text>
            <Text style={{ fontSize: s(13), fontWeight: "600", color: colors.heading }}>
              {formData.name.trim() || "Untitled"}
            </Text>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: colors.border }} />

          {/* Type & Selection Badges */}
          <View style={{ gap: s(8) }}>
            <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Configuration
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(6) }}>
              <View style={{ paddingHorizontal: s(10), paddingVertical: s(4), borderRadius: s(6), backgroundColor: formData.type === "required" ? colors.danger + "15" : colors.teal + "15", borderWidth: 1, borderColor: formData.type === "required" ? colors.danger + "40" : colors.teal + "40" }}>
                <Text style={{ fontSize: s(11), fontWeight: "600", color: formData.type === "required" ? colors.danger : colors.teal }}>
                  {formData.type === "required" ? "Required" : "Optional"}
                </Text>
              </View>
              <View style={{ paddingHorizontal: s(10), paddingVertical: s(4), borderRadius: s(6), backgroundColor: colors.border, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: s(11), color: colors.label, fontWeight: "500" }}>
                  {formData.selectionType === "single" ? "Single" : "Multiple"}
                </Text>
              </View>
            </View>
          </View>

          {/* Max Selections */}
          {formData.selectionType === "multiple" && formData.maxSelections && (
            <View style={{ gap: s(4) }}>
              <Text style={{ fontSize: s(11), color: colors.muted, fontWeight: "500" }}>Max Selections:</Text>
              <Text style={{ fontSize: s(14), fontWeight: "700", color: colors.heading }}>{formData.maxSelections}</Text>
            </View>
          )}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: colors.border }} />

          {/* Options Stats */}
          <View style={{ gap: s(12) }}>
            <View style={{ gap: s(4) }}>
              <Text style={{ fontSize: s(11), color: colors.muted, fontWeight: "500" }}>Options:</Text>
              <Text style={{ fontSize: s(16), fontWeight: "700", color: colors.heading }}>{formData.options.length}</Text>
            </View>

            {formData.options.length > 0 && (
              <View style={{ gap: s(8) }}>
                <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Options List
                </Text>
                <ScrollView style={{ maxHeight: s(180) }} contentContainerStyle={{ gap: s(4) }} showsVerticalScrollIndicator={false}>
                  {formData.options.map((option, idx) => (
                    <View key={option.id} style={{ backgroundColor: colors.panel, borderRadius: s(6), paddingHorizontal: s(8), paddingVertical: s(6) }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: s(11), color: colors.label, fontWeight: "500" }}>{option.name || `Option ${idx + 1}`}</Text>
                          {option.isDefault && <Text style={{ fontSize: s(10), color: colors.success, marginTop: s(2) }}>Default</Text>}
                        </View>
                        {option.price > 0 && <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.teal }}>+${option.price.toFixed(2)}</Text>}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Save Confirm Modal */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000080", alignItems: "center", justifyContent: "center", padding: s(16) }}>
          <View style={{ backgroundColor: colors.card, borderRadius: s(16), padding: s(16), width: "100%", maxWidth: s(380), borderWidth: 1, borderColor: colors.border }}>
            <View style={{ alignItems: "center", marginBottom: s(14) }}>
              <View style={{ width: s(44), height: s(44), backgroundColor: colors.teal + "20", borderRadius: s(12), alignItems: "center", justifyContent: "center", marginBottom: s(10) }}>
                <Save size={s(20)} color={colors.teal} />
              </View>
              <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>Save Changes?</Text>
              <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(3) }}>Update "{formData.name}"?</Text>
            </View>
            <View style={{ flexDirection: "row", gap: s(8) }}>
              <TouchableOpacity
                onPress={() => setShowConfirm(false)}
                style={{ flex: 1, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: s(8), paddingVertical: s(9), alignItems: "center" }}
              >
                <Text style={{ fontSize: s(13), color: colors.label, fontWeight: "500" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                style={{ flex: 1, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: s(8), paddingVertical: s(9), alignItems: "center" }}
              >
                <Text style={{ fontSize: s(13), color: colors.teal, fontWeight: "600" }}>{isSaving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <UnsavedChangesDialog isOpen={isDialogVisible} onCancel={handleCancel} onDiscard={handleDiscard} />

      {/* Recipe Modal */}
      <Modal
        visible={!!selectedOptionIdForRecipe}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedOptionIdForRecipe(null)}
      >
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.panel }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: s(14), borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
              <View>
                <Text style={{ fontSize: s(14), fontWeight: "700", color: colors.heading }}>Manage Recipe</Text>
                <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(1) }}>
                  for "{formData.options.find((o) => o.id === selectedOptionIdForRecipe)?.name}"
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedOptionIdForRecipe(null)}
                style={{ padding: s(6), backgroundColor: colors.screen, borderRadius: s(8), borderWidth: 1, borderColor: colors.border }}
              >
                <X size={s(14)} color={colors.label} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, padding: s(14) }}>
              {selectedOptionIdForRecipe && (
                <RecipeManager
                  recipe={formData.recipeMap[selectedOptionIdForRecipe] || []}
                  onUpdate={(newRecipe) => {
                    setFormData((prev) => ({
                      ...prev,
                      recipeMap: { ...prev.recipeMap, [selectedOptionIdForRecipe]: newRecipe },
                    }));
                  }}
                />
              )}
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>

      <UnsavedChangesDialog isOpen={isDialogVisible} onCancel={handleCancel} onDiscard={handleDiscard} />

      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Modifier Group"
        message="Are you sure you want to delete this modifier group? This action cannot be undone."
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={() => {
          setShowDeleteDialog(false);
          confirmDelete();
        }}
      />
    </View>
  );
};

export default EditModifierScreen;
