import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { ModifierOption } from "@/lib/types";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { colors } from "@/lib/theme";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, Plus, Save, Trash2 } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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

interface ModifierFormData {
  name: string;
  type: "required" | "optional";
  selectionType: "single" | "multiple";
  maxSelections?: number;
  description?: string;
  options: ModifierOption[];
}

interface FormErrors {
  name?: string;
  options?: string;
  maxSelections?: string;
}

const AddModifierScreen: React.FC = () => {
  const addModifierGroup = useMenuStore((s) => s.addModifierGroup);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const { show } = useToast();

  const [formData, setFormData] = useState<ModifierFormData>({
    name: "",
    type: "optional",
    selectionType: "single",
    maxSelections: undefined,
    description: "",
    options: [],
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);

  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  );

  useEffect(() => {
    const isPristine = !formData.name.trim() && !formData.description?.trim() && formData.options.length === 0;
    setHasChanges(!isPristine);
  }, [formData]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) newErrors.name = "Modifier name is required";
    if (formData.options.length === 0) newErrors.options = "Please add at least one option";
    if (formData.options.some((o) => o.name.trim() === "")) newErrors.options = "Option name is required";
    const hasDefault = formData.options.some((o) => o.isDefault);
    if (formData.type === "required" && formData.selectionType === "single" && !hasDefault) {
      newErrors.options = "One option must be set as default for this type.";
    }
    if (formData.selectionType === "multiple" && formData.maxSelections && formData.maxSelections < 1) {
      newErrors.maxSelections = "Max selections must be at least 1";
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      show({ title: "Validation Error", message: Object.values(newErrors)[0] || "Please review the form.", type: "error" });
    }
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;
    setShowConfirmation(true);
  };

  const params = useLocalSearchParams<{ returnTab?: string }>();

  const confirmSave = async () => {
    setIsSaving(true);
    setShowConfirmation(false);
    try {
      if (!selectedStore) {
        Alert.alert("Error", "No store selected. Please select a store first.");
        setIsSaving(false);
        return;
      }
      const merchantId = selectedStore.merchant_id;
      const locationId = selectedStore.id;
      const isRequired = formData.type === "required";
      const minSelections = isRequired ? 1 : 0;
      const maxSelections = formData.selectionType === "single" ? 1 : formData.maxSelections || null;

      const { data: createdGroup, error } = await MenuService.createModifierGroup(supabase, {
        merchantId, locationId,
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
        isRequired, minSelections,
        maxSelections: maxSelections ?? undefined,
      });

      if (error) {
        show({ title: "Error", message: error.message || "Failed to create modifier group.", type: "error" });
        setIsSaving(false);
        return;
      }

      const optionsWithBackendIds = [];
      if (createdGroup?.id && formData.options.length > 0) {
        for (let i = 0; i < formData.options.length; i++) {
          const option = formData.options[i];
          const { data: createdOption } = await MenuService.createModifierItem(supabase, {
            modifierGroupId: createdGroup.id,
            name: option.name.trim(),
            priceModifier: option.price,
            displayOrder: i,
            isActive: true,
            isDefault: option.isDefault,
            merchantId,
          });
          optionsWithBackendIds.push({ ...option, name: option.name.trim(), id: createdOption?.id || option.id });
        }
      }

      addModifierGroup({
        name: formData.name.trim(),
        type: formData.type,
        selectionType: formData.selectionType,
        maxSelections: formData.maxSelections,
        description: formData.description?.trim() || undefined,
        options: optionsWithBackendIds,
        location_id: locationId,
        id: createdGroup.id,
      });

      show({ title: "Modifier Group Saved", message: `Successfully created "${formData.name}".`, type: "success" });
      hasSavedRef.current = true;
      setHasChanges(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const tab = typeof params.returnTab === "string" ? params.returnTab : undefined;
      if (tab) router.replace({ pathname: "/menu", params: { tab } });
      else router.back();
    } catch (error) {
      console.error(error);
      show({ title: "Save Failed", message: "An error occurred while saving.", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const addOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [...prev.options, { id: `option_${Date.now()}`, name: "", price: 0, isDefault: false }],
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

  const sectionLabel = { fontSize: 11, fontWeight: "600" as const, color: colors.muted, textTransform: "uppercase" as const, letterSpacing: 0.5 };
  const card = { backgroundColor: colors.card + "cc", borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 };
  const inputStyle = { backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.heading };

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Add Modifier Group</Text>

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.teal, opacity: isSaving ? 0.7 : 1 }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.onSolid} />
            ) : (
              <Check size={14} color={colors.onSolid} />
            )}
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSolid }}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, flexDirection: "row" }}>
        {/* Left: Form */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>

        {/* Basic Info */}
        <View style={card}>
          <Text style={sectionLabel}>Basic Information</Text>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Modifier Name *</Text>
            <TextInput
              style={[inputStyle, errors.name ? { borderColor: colors.danger } : {}]}
              placeholder="e.g., Size, Toppings, Sauce"
              placeholderTextColor={colors.muted}
              value={formData.name}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
            />
            {errors.name && <Text style={{ fontSize: 11, color: colors.danger, marginTop: 3 }}>{errors.name}</Text>}
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
              Description <Text style={{ color: colors.muted }}>(Optional)</Text>
            </Text>
            <TextInput
              style={[inputStyle, { height: 72, textAlignVertical: "top" }]}
              placeholder="e.g., Choose up to 3 toppings"
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

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Requirement</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["optional", "required"] as const).map((t) => {
                const active = formData.type === t;
                const isReq = t === "required";
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setFormData((prev) => ({ ...prev, type: t }))}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      alignItems: "center",
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

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Selection Type</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["single", "multiple"] as const).map((s) => {
                const active = formData.selectionType === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setFormData((prev) => ({ ...prev, selectionType: s }))}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      alignItems: "center",
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
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Max Selections (Optional)</Text>
              <TextInput
                style={[inputStyle, errors.maxSelections ? { borderColor: colors.danger } : {}]}
                placeholder="Leave empty for unlimited"
                placeholderTextColor={colors.muted}
                value={formData.maxSelections?.toString() || ""}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, maxSelections: text ? parseInt(text) : undefined }))}
                keyboardType="numeric"
              />
              {errors.maxSelections && <Text style={{ fontSize: 11, color: colors.danger, marginTop: 3 }}>{errors.maxSelections}</Text>}
            </View>
          )}
        </View>

        {/* Options */}
        <View style={card}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={sectionLabel}>Options</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {formData.selectionType === "single" ? "Set one as default" : "Set multiple as default"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={addOption}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "40", marginTop: -8 }}
            >
              <Plus size={13} color={colors.teal} />
              <Text style={{ fontSize: 12, color: colors.teal, fontWeight: "600" }}>Add</Text>
            </TouchableOpacity>
          </View>

          {formData.options.length === 0 ? (
            <View style={{ backgroundColor: colors.screen, borderRadius: 8, padding: 16, alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>No options added yet</Text>
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
                  {/* Option header */}
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

                  {/* Name + Price row */}
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Name</Text>
                      <TextInput
                        style={inputStyle}
                        placeholder="e.g., Large"
                        placeholderTextColor={colors.muted}
                        value={option.name}
                        onChangeText={(text) => updateOption(index, "name", text)}
                      />
                    </View>
                    <View style={{ width: 90 }}>
                      <Text style={{ fontSize: 11, color: colors.label, marginBottom: 4 }}>Price (+$)</Text>
                      <TextInput
                        style={inputStyle}
                        placeholder="0.00"
                        placeholderTextColor={colors.muted}
                        value={option.price === 0 ? "" : option.price.toString()}
                        onChangeText={(text) => updateOption(index, "price", parseFloat(text) || 0)}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Default toggle */}
                  <TouchableOpacity
                    onPress={() => toggleDefaultOption(index)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      padding: 8,
                      borderRadius: 8,
                      borderWidth: 1,
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
                    <View>
                      <Text style={{ fontSize: 12, fontWeight: "500", color: option.isDefault ? colors.success : colors.label }}>
                        Default Selection
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.muted }}>Pre-selected for customers</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {errors.options && (
            <Text style={{ fontSize: 11, color: colors.danger, marginTop: 8 }}>{errors.options}</Text>
          )}
        </View>
        </ScrollView>

        {/* Right: Summary Panel */}
        <View style={{ width: 300, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 16, overflow: "hidden" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Summary</Text>

          {/* Modifier Name */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Modifier Name
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
              {formData.name.trim() || "Untitled"}
            </Text>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: colors.border }} />

          {/* Type & Selection Badges */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Configuration
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: formData.type === "required" ? colors.danger + "15" : colors.teal + "15", borderWidth: 1, borderColor: formData.type === "required" ? colors.danger + "40" : colors.teal + "40" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: formData.type === "required" ? colors.danger : colors.teal }}>
                  {formData.type === "required" ? "Required" : "Optional"}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.border, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 11, color: colors.label, fontWeight: "500" }}>
                  {formData.selectionType === "single" ? "Single" : "Multiple"}
                </Text>
              </View>
            </View>
          </View>

          {/* Max Selections */}
          {formData.selectionType === "multiple" && formData.maxSelections && (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "500" }}>Max Selections:</Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>{formData.maxSelections}</Text>
            </View>
          )}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: colors.border }} />

          {/* Options Stats */}
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "500" }}>Options:</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}>{formData.options.length}</Text>
            </View>

            {formData.options.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Options List
                </Text>
                <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ gap: 4 }} showsVerticalScrollIndicator={false}>
                  {formData.options.map((option, idx) => (
                    <View key={option.id} style={{ backgroundColor: colors.panel, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: colors.label, fontWeight: "500" }}>{option.name || `Option ${idx + 1}`}</Text>
                          {option.isDefault && <Text style={{ fontSize: 10, color: colors.success, marginTop: 2 }}>Default</Text>}
                        </View>
                        {option.price > 0 && <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>+${option.price.toFixed(2)}</Text>}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Confirm Modal */}
      <Modal visible={showConfirmation} transparent animationType="fade" onRequestClose={() => setShowConfirmation(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000080", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, width: "100%", maxWidth: 380, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ alignItems: "center", marginBottom: 14 }}>
              <View style={{ width: 44, height: 44, backgroundColor: colors.teal + "20", borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Save size={20} color={colors.teal} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Save Modifier Group?</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3, textAlign: "center" }}>
                Create "{formData.name}" with {formData.options.length} option{formData.options.length !== 1 ? "s" : ""}?
              </Text>
            </View>

            <View style={{ backgroundColor: colors.screen, borderRadius: 10, padding: 10, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>{formData.name}</Text>
                <View style={{ flexDirection: "row", gap: 5 }}>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: formData.type === "required" ? colors.danger + "15" : colors.teal + "15", borderWidth: 1, borderColor: formData.type === "required" ? colors.danger + "40" : colors.teal + "40" }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: formData.type === "required" ? colors.danger : colors.teal }}>
                      {formData.type}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: colors.border, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, color: colors.label }}>{formData.selectionType}</Text>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: colors.muted }}>{formData.options.length} options</Text>
              {formData.options.some((o) => o.isDefault) && (
                <Text style={{ fontSize: 11, color: colors.success, marginTop: 2 }}>
                  {formData.options.filter((o) => o.isDefault).length} default(s) set
                </Text>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowConfirmation(false)}
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

      <UnsavedChangesDialog isOpen={isDialogVisible} onCancel={handleCancel} onDiscard={handleDiscard} />
    </View>
  );
};

export default AddModifierScreen;
