import RecipeManager from "@/components/inventory/RecipeManager";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { ModifierOption, RecipeItem } from "@/lib/types";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { colors } from "@/lib/theme";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, ChefHat, Plus, Save, Trash2, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  const updateModifierGroup = useMenuStore((s) => s.updateModifierGroup);
  const deleteModifierGroup = useMenuStore((s) => s.deleteModifierGroup);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const { show } = useToast();

  const existing = useMemo(() => modifierGroups.find((m) => m.id === id), [id, modifierGroups]);

  const isGlobalModifier = existing?.location_id === null || existing?.location_id === undefined;
  const isLocalModifier = existing?.location_id === selectedStore?.id;

  const [formData, setFormData] = useState<ModifierFormData>({
    name: "", type: "optional", selectionType: "single",
    maxSelections: undefined, description: "", options: [], recipeMap: {},
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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

      for (const opt of formOptions) {
        const existingOpt = existingOptions.find((e) => e.id === opt.id);
        if (existingOpt) {
          await MenuService.updateModifierItem(supabase, opt.id, {
            name: opt.name.trim(),
            priceModifier: opt.price,
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
              displayOrder: existingOptions.length,
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

  const handleDelete = () => { if (!existing) return; setShowDeleteConfirm(true); };

  const confirmDelete = async () => {
    if (!existing) return;
    const { error } = await MenuService.deleteModifierGroup(supabase, existing.id);
    if (error) {
      show({ title: "Error", message: error.message || "Failed to delete modifier group.", type: "error" });
      setShowDeleteConfirm(false);
      return;
    }
    deleteModifierGroup(existing.id);
    show({ title: "Modifier Deleted", message: `"${existing.name}" has been deleted.`, type: "success" });
    router.back();
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

  const sectionLabel = { fontSize: 10, fontWeight: "600" as const, color: colors.muted, textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 8 };
  const card = { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 12 };
  const inputStyle = { backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.heading };

  if (!existing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text style={{ fontSize: 14, color: colors.heading, marginBottom: 12 }}>Modifier not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 13, color: colors.label }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isGlobalModifier || !isLocalModifier) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 8 }}>Global Modifier</Text>
        <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 20 }}>
          This modifier group belongs to all locations and cannot be edited here. Contact your administrator.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.teal + "20", borderRadius: 8, borderWidth: 1, borderColor: colors.teal + "50" }}>
          <Text style={{ fontSize: 13, color: colors.teal, fontWeight: "600" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.panel }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
        >
          <ArrowLeft size={14} color={colors.label} />
          <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500" }}>Back</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Edit Modifier Group</Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={handleDelete}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.danger + "15", borderWidth: 1, borderColor: colors.danger + "40" }}
          >
            <Trash2 size={13} color={colors.danger} />
            <Text style={{ fontSize: 13, color: colors.danger, fontWeight: "600" }}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50" }}
          >
            {isSaving ? <ActivityIndicator size="small" color={colors.teal} /> : <Save size={13} color={colors.teal} />}
            <Text style={{ fontSize: 13, color: colors.teal, fontWeight: "600" }}>{isSaving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator={false}>

        {/* Basic Info */}
        <View style={card}>
          <Text style={sectionLabel}>Basic Information</Text>
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Modifier Name *</Text>
            <TextInput
              style={[inputStyle, errors.name ? { borderColor: colors.danger } : {}]}
              value={formData.name}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
              placeholder="Modifier name"
              placeholderTextColor={colors.muted}
            />
            {errors.name && <Text style={{ fontSize: 11, color: colors.danger, marginTop: 3 }}>{errors.name}</Text>}
          </View>
          <View>
            <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Description (Optional)</Text>
            <TextInput
              style={[inputStyle, { height: 60, textAlignVertical: "top" }]}
              placeholder="Optional description"
              placeholderTextColor={colors.muted}
              value={formData.description}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
              multiline
            />
          </View>
        </View>

        {/* Type & Selection */}
        <View style={card}>
          <Text style={sectionLabel}>Type & Selection</Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 11, color: colors.label, marginBottom: 6 }}>Requirement</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["optional", "required"] as const).map((t) => {
                const active = formData.type === t;
                const isReq = t === "required";
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setFormData((prev) => ({ ...prev, type: t }))}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center",
                      backgroundColor: active ? (isReq ? colors.danger + "15" : colors.teal + "15") : colors.screen,
                      borderColor: active ? (isReq ? colors.danger + "50" : colors.teal + "50") : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: active ? (isReq ? colors.danger : colors.teal) : colors.label }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={{ fontSize: 11, color: colors.label, marginBottom: 6 }}>Selection Type</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["single", "multiple"] as const).map((s) => {
                const active = formData.selectionType === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setFormData((prev) => ({ ...prev, selectionType: s }))}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center",
                      backgroundColor: active ? colors.teal + "15" : colors.screen,
                      borderColor: active ? colors.teal + "50" : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: active ? colors.teal : colors.label }}>
                      {s === "single" ? "Single Choice" : "Multiple Choice"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {formData.selectionType === "multiple" && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Max Selections (Optional)</Text>
              <TextInput
                style={[inputStyle, errors.maxSelections ? { borderColor: colors.danger } : {}]}
                keyboardType="numeric"
                value={formData.maxSelections?.toString() || ""}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, maxSelections: text ? parseInt(text) : undefined }))}
                placeholder="Leave empty for unlimited"
                placeholderTextColor={colors.muted}
              />
              {errors.maxSelections && <Text style={{ fontSize: 11, color: colors.danger, marginTop: 3 }}>{errors.maxSelections}</Text>}
            </View>
          )}
        </View>

        {/* Options */}
        <View style={card}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <View>
              <Text style={sectionLabel}>Options</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: -4 }}>
                {formData.selectionType === "single" ? "Set one as default" : "Set multiple as default"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={addOption}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "40" }}
            >
              <Plus size={13} color={colors.teal} />
              <Text style={{ fontSize: 12, color: colors.teal, fontWeight: "600" }}>Add Option</Text>
            </TouchableOpacity>
          </View>

          {formData.options.length === 0 ? (
            <View style={{ backgroundColor: colors.screen, borderRadius: 8, padding: 16, alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>No options yet</Text>
              <TouchableOpacity
                onPress={addOption}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50" }}
              >
                <Plus size={13} color={colors.teal} />
                <Text style={{ fontSize: 13, color: colors.teal, fontWeight: "600" }}>Add First Option</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {formData.options.map((option, index) => (
                <View
                  key={option.id}
                  style={{
                    backgroundColor: colors.screen,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: option.isDefault ? colors.success + "50" : colors.border,
                    padding: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Option {index + 1}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeOption(index)}
                      style={{ padding: 4, backgroundColor: colors.danger + "15", borderRadius: 6 }}
                    >
                      <Trash2 size={13} color={colors.danger} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Name</Text>
                      <TextInput
                        style={inputStyle}
                        value={option.name}
                        onChangeText={(text) => updateOption(index, "name", text)}
                        placeholder="e.g., Large"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                    <View style={{ width: 90 }}>
                      <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Price (+$)</Text>
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

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {/* Default toggle */}
                    <TouchableOpacity
                      onPress={() => toggleDefaultOption(index)}
                      style={{
                        flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
                        padding: 8, borderRadius: 8, borderWidth: 1,
                        backgroundColor: option.isDefault ? colors.success + "12" : colors.card,
                        borderColor: option.isDefault ? colors.success + "40" : colors.border,
                      }}
                    >
                      <View style={{
                        width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
                        borderColor: option.isDefault ? colors.success : colors.border,
                        backgroundColor: option.isDefault ? colors.success : "transparent",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {option.isDefault && <Check size={10} color="#fff" />}
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: "500", color: option.isDefault ? colors.success : colors.label }}>
                        Default
                      </Text>
                    </TouchableOpacity>

                    {/* Recipe button */}
                    <TouchableOpacity
                      onPress={() => setSelectedOptionIdForRecipe(option.id)}
                      style={{
                        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: 8, borderRadius: 8, borderWidth: 1,
                        backgroundColor: formData.recipeMap[option.id]?.length ? colors.teal + "15" : colors.card,
                        borderColor: formData.recipeMap[option.id]?.length ? colors.teal + "40" : colors.border,
                      }}
                    >
                      <ChefHat size={13} color={formData.recipeMap[option.id]?.length ? colors.teal : colors.label} />
                      <Text style={{ fontSize: 12, fontWeight: "500", color: formData.recipeMap[option.id]?.length ? colors.teal : colors.label }}>
                        {formData.recipeMap[option.id]?.length ? `${formData.recipeMap[option.id].length} Ingredients` : "Recipe"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {errors.options && (
            <Text style={{ fontSize: 11, color: colors.danger, marginTop: 8 }}>{errors.options}</Text>
          )}
        </View>
      </ScrollView>

      {/* Save Confirm Modal */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000080", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, width: "100%", maxWidth: 380, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ alignItems: "center", marginBottom: 14 }}>
              <View style={{ width: 44, height: 44, backgroundColor: colors.teal + "20", borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Save size={20} color={colors.teal} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Save Changes?</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>Update "{formData.name}"?</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowConfirm(false)}
                style={{ flex: 1, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 9, alignItems: "center" }}
              >
                <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                style={{ flex: 1, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: 8, paddingVertical: 9, alignItems: "center" }}
              >
                <Text style={{ fontSize: 13, color: colors.teal, fontWeight: "600" }}>{isSaving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000080", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, width: "100%", maxWidth: 380, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ alignItems: "center", marginBottom: 14 }}>
              <View style={{ width: 44, height: 44, backgroundColor: colors.danger + "15", borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Trash2 size={20} color={colors.danger} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Delete Modifier?</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3, textAlign: "center" }}>
                Delete "{existing.name}"? This cannot be undone.
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(false)}
                style={{ flex: 1, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 9, alignItems: "center" }}
              >
                <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDelete}
                style={{ flex: 1, backgroundColor: colors.danger + "20", borderWidth: 1, borderColor: colors.danger + "50", borderRadius: 8, paddingVertical: 9, alignItems: "center" }}
              >
                <Text style={{ fontSize: 13, color: colors.danger, fontWeight: "600" }}>Delete</Text>
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
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Manage Recipe</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                  for "{formData.options.find((o) => o.id === selectedOptionIdForRecipe)?.name}"
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedOptionIdForRecipe(null)}
                style={{ padding: 6, backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
              >
                <X size={14} color={colors.label} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, padding: 14 }}>
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
    </KeyboardAvoidingView>
  );
};

export default EditModifierScreen;
