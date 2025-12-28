import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { ModifierOption } from "@/lib/types";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Form data interface (consistent with add screen)
interface ModifierFormData {
  name: string;
  type: "required" | "optional";
  selectionType: "single" | "multiple";
  maxSelections?: number;
  description?: string;
  options: ModifierOption[];
}

// Error interface
interface FormErrors {
  name?: string;
  options?: string;
  maxSelections?: string;
}

const EditModifierScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { modifierGroups, updateModifierGroup, deleteModifierGroup } =
    useMenuStore();
  const { selectedStore } = useStoreSettingsStore();
  const supabase = useSupabaseClient();
  const { show } = useToast();

  const existing = useMemo(
    () => modifierGroups.find((m) => m.id === id),
    [id, modifierGroups]
  );

  // Check if this is a global modifier (not local to this store)
  const isGlobalModifier =
    existing?.location_id === null || existing?.location_id === undefined;
  const isLocalModifier = existing?.location_id === selectedStore?.id;

  // Use a single formData state object for consistency
  const [formData, setFormData] = useState<ModifierFormData>({
    name: "",
    type: "optional",
    selectionType: "single",
    maxSelections: undefined,
    description: "",
    options: [],
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalFormData, setOriginalFormData] =
    useState<ModifierFormData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);

  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  );

  useEffect(() => {
    if (existing) {
      const initialData = {
        name: existing.name,
        type: existing.type,
        selectionType: existing.selectionType,
        maxSelections: existing.maxSelections,
        description: existing.description || "",
        options: existing.options || [],
      };
      setFormData(initialData);
      setOriginalFormData(initialData); // Store the initial state for comparison
    }
  }, [existing]);

  useEffect(() => {
    if (originalFormData) {
      const changed =
        JSON.stringify(formData) !== JSON.stringify(originalFormData);
      setHasChanges(changed);
    }
  }, [formData, originalFormData]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Modifier name is required";
    }

    if (formData.options.length === 0) {
      newErrors.options = "Please add at least one option";
    }

    if (formData.options.some((option) => option.name.trim() === "")) {
      newErrors.options = "All options must have a name";
    }

    if (
      formData.type === "required" &&
      !formData.options.some((option) => option.isDefault === true)
    ) {
      newErrors.options =
        "One option must be set as default for required modifiers";
    }

    if (
      formData.selectionType === "multiple" &&
      formData.maxSelections &&
      formData.maxSelections < 1
    ) {
      newErrors.maxSelections = "Max selections must be at least 1";
    }

    setErrors(newErrors);

    // Show toasts for errors
    if (Object.keys(newErrors).length > 0) {
      show({
        title: "Validation Error",
        message: "Please fix the errors before saving.",
        type: "error",
      });
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }
    setShowConfirm(true);
  };

  const confirmSave = async () => {
    if (!existing) return;
    setIsSaving(true);
    setShowConfirm(false);
    try {
      // Update modifier group in backend
      const { error } = await MenuService.updateModifierGroup(
        supabase,
        existing.id,
        {
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          isRequired: formData.type === "required",
          minSelections: formData.type === "required" ? 1 : 0,
          maxSelections:
            formData.selectionType === "multiple" ? formData.maxSelections : 1,
        }
      );

      if (error) {
        console.error("Failed to update modifier group:", error);
        show({
          title: "Error",
          message: error.message || "Failed to update modifier group.",
          type: "error",
        });
        return;
      }

      // Handle modifier options sync (only on save per user requirement)
      // Compare existing options with form options
      const existingOptions = existing.options || [];
      const formOptions = formData.options;

      // Update/create options
      for (const opt of formOptions) {
        const existingOpt = existingOptions.find((e) => e.id === opt.id);
        if (existingOpt) {
          // Update existing option
          await MenuService.updateModifierItem(supabase, opt.id, {
            name: opt.name.trim(),
            priceModifier: opt.price,
            isDefault: opt.isDefault,
            isActive: opt.isAvailable ?? true,
          });
        } else {
          // This is a new option (created locally with temp ID)
          if (selectedStore?.merchant_id) {
            await MenuService.createModifierItem(supabase, {
              modifierGroupId: existing.id,
              name: opt.name.trim(),
              priceModifier: opt.price,
              displayOrder: existingOptions.length, // Append to end or use logic
              isActive: opt.isAvailable ?? true,
              isDefault: opt.isDefault,
              merchantId: selectedStore.merchant_id,
            });
          }
        }
      }

      // Delete removed options
      for (const existingOpt of existingOptions) {
        const stillExists = formOptions.find((o) => o.id === existingOpt.id);
        if (!stillExists) {
          await MenuService.deleteModifierItem(supabase, existingOpt.id);
        }
      }

      // Update local store
      updateModifierGroup(existing.id, {
        name: formData.name.trim(),
        type: formData.type,
        selectionType: formData.selectionType,
        maxSelections:
          formData.selectionType === "multiple"
            ? formData.maxSelections
            : undefined,
        description: formData.description?.trim() || undefined,
        options: formData.options.map((o) => ({ ...o, name: o.name.trim() })),
      });

      show({
        title: "Modifier Updated",
        message: `The modifier group "${formData.name.trim()}" has been saved.`,
        type: "success",
      });

      hasSavedRef.current = true;
      setHasChanges(false);

      router.back();
    } catch (error) {
      console.error(error);
      show({
        title: "Error",
        message: "Failed to update the modifier group. Please try again.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!existing) return;

    // Delete from backend first
    const { error } = await MenuService.deleteModifierGroup(
      supabase,
      existing.id
    );
    if (error) {
      show({
        title: "Error",
        message: error.message || "Failed to delete modifier group.",
        type: "error",
      });
      setShowDeleteConfirm(false);
      return;
    }

    // Delete from local store
    deleteModifierGroup(existing.id);
    show({
      title: "Modifier Deleted",
      message: `The modifier group "${existing.name}" has been deleted.`,
      type: "success",
    });
    router.back();
  };

  // --- Form update functions ---
  const addOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        { id: `opt_${Date.now()}`, name: "", price: 0, isDefault: false },
      ],
    }));
  };

  const updateOption = (
    index: number,
    field: keyof ModifierOption,
    value: string | number | boolean
  ) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.map((option, i) =>
        i === index ? { ...option, [field]: value } : option
      ),
    }));
  };

  const removeOption = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const toggleDefaultOption = (index: number) => {
    setFormData((prev) => {
      const newOptions = [...prev.options];
      if (prev.selectionType === "single") {
        newOptions.forEach((option, i) => {
          if (i !== index) option.isDefault = false;
        });
      }
      newOptions[index].isDefault = !newOptions[index].isDefault;
      return { ...prev, options: newOptions };
    });
  };

  if (!existing) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center p-4">
        <Text className="text-xl text-white">Modifier not found.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-3 px-4 py-2 bg-[#303030] rounded border border-gray-600"
        >
          <Text className="text-lg text-gray-300">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Check if this is a global modifier (not local to this store)
  if (isGlobalModifier || !isLocalModifier) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center p-4">
        <Text className="text-2xl text-white font-bold mb-2">
          Global Modifier
        </Text>
        <Text className="text-lg text-gray-400 text-center mb-6">
          This modifier group belongs to all locations and cannot be edited from
          here. Please contact your administrator to modify global modifiers.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-blue-600 px-6 py-3 rounded-lg"
        >
          <Text className="text-lg text-white font-medium">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-[#212121]" behavior="padding">
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={20} color="#9CA3AF" />
          <Text className="text-xl text-white font-medium ml-1.5">Back</Text>
        </TouchableOpacity>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleDelete}
            className="px-4 py-2 rounded-lg border border-red-500 bg-red-900/30"
          >
            <View className="flex-row items-center">
              <Trash2 size={20} color="#EF4444" />
              <Text className="text-xl text-red-400 ml-1.5">Delete</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg bg-blue-600"
          >
            <View className="flex-row items-center">
              <Save size={20} color="#fff" />
              <Text className="text-xl text-white ml-1.5">
                {isSaving ? "Saving..." : "Save"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 p-4 pb-8">
        <Text className="text-2xl font-bold text-white mb-4">
          Edit Modifier Group
        </Text>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">Name</Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
            value={formData.name}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, name: text }))
            }
            placeholder="Modifier name"
          />
          {errors.name && (
            <Text className="text-base text-red-400 mt-1">{errors.name}</Text>
          )}
        </View>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">Type</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({ ...prev, type: "optional" }))
              }
              className={`flex-1 px-4 py-3 rounded-lg border ${
                formData.type === "optional"
                  ? "bg-blue-600 border-blue-500"
                  : "bg-[#303030] border-gray-600"
              }`}
            >
              <Text
                className={`text-xl text-center ${
                  formData.type === "optional" ? "text-white" : "text-gray-300"
                }`}
              >
                Optional
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({ ...prev, type: "required" }))
              }
              className={`flex-1 px-4 py-3 rounded-lg border ${
                formData.type === "required"
                  ? "bg-red-600 border-red-500"
                  : "bg-[#303030] border-gray-600"
              }`}
            >
              <Text
                className={`text-xl font-medium text-center ${
                  formData.type === "required" ? "text-white" : "text-gray-300"
                }`}
              >
                Required
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Selection
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({ ...prev, selectionType: "single" }))
              }
              className={`flex-1 px-4 py-3 rounded-lg border ${
                formData.selectionType === "single"
                  ? "bg-green-600 border-green-500"
                  : "bg-[#303030] border-gray-600"
              }`}
            >
              <Text
                className={`text-xl text-center ${
                  formData.selectionType === "single"
                    ? "text-white"
                    : "text-gray-300"
                }`}
              >
                Single
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({ ...prev, selectionType: "multiple" }))
              }
              className={`flex-1 px-4 py-3 rounded-lg border ${
                formData.selectionType === "multiple"
                  ? "bg-green-600 border-green-500"
                  : "bg-[#303030] border-gray-600"
              }`}
            >
              <Text
                className={`text-xl text-center ${
                  formData.selectionType === "multiple"
                    ? "text-white"
                    : "text-gray-300"
                }`}
              >
                Multiple
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {formData.selectionType === "multiple" && (
          <View className="mb-4">
            <Text className="text-xl font-semibold text-white mb-2">
              Max Selections
            </Text>
            <TextInput
              className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
              keyboardType="numeric"
              value={formData.maxSelections?.toString() || ""}
              onChangeText={(text) =>
                setFormData((prev) => ({
                  ...prev,
                  maxSelections: text ? parseInt(text) : undefined,
                }))
              }
              placeholder="Unlimited"
            />
          </View>
        )}

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Description
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
            placeholder="Optional description"
            value={formData.description}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, description: text }))
            }
            multiline
          />
        </View>

        <View className="mb-8">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xl font-semibold text-white">Options</Text>
            <TouchableOpacity
              onPress={addOption}
              className="flex-row items-center bg-green-600 px-3 py-2 rounded-lg"
            >
              <Plus size={20} color="#fff" />
              <Text className="text-lg text-white ml-1.5">Add</Text>
            </TouchableOpacity>
          </View>
          {formData.options.length === 0 ? (
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
              <Text className="text-lg text-gray-400">No options yet.</Text>
            </View>
          ) : (
            <View className="gap-2">
              {formData.options.map((option, index) => (
                <View
                  key={option.id}
                  className="bg-[#303030] border border-gray-600 rounded-lg p-4"
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-xl text-white font-medium">
                      Option {index + 1}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeOption(index)}
                      className="p-1.5"
                    >
                      <Trash2 size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-lg text-gray-300 mb-1.5">Name</Text>
                      <TextInput
                        className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-xl text-white h-16"
                        value={option.name}
                        onChangeText={(text) =>
                          updateOption(index, "name", text)
                        }
                      />
                    </View>
                    <View className="w-28">
                      <Text className="text-lg text-gray-300 mb-1.5">
                        Price
                      </Text>
                      <TextInput
                        className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-xl text-white h-16"
                        value={option.price.toString()}
                        onChangeText={(text) =>
                          updateOption(index, "price", parseFloat(text) || 0)
                        }
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View className="mt-3">
                    <TouchableOpacity
                      onPress={() => toggleDefaultOption(index)}
                      className={`flex-row items-center p-3 rounded-lg border ${
                        option.isDefault
                          ? "bg-green-600/20 border-green-500"
                          : "bg-[#212121] border-gray-600"
                      }`}
                    >
                      <View className="flex-row items-center">
                        <View
                          className={`w-5 h-5 rounded border-2 mr-3 items-center justify-center ${
                            option.isDefault
                              ? "bg-green-600 border-green-600"
                              : "border-gray-400"
                          }`}
                        >
                          {option.isDefault && (
                            <View className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </View>
                        <Text
                          className={`text-lg font-medium ${
                            option.isDefault
                              ? "text-green-400"
                              : "text-gray-300"
                          }`}
                        >
                          Default
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
          {errors.options && (
            <Text className="text-base text-red-400 mt-1.5">
              {errors.options}
            </Text>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-[#303030] rounded-2xl p-4 w-full max-w-md border border-gray-600">
            <Text className="text-2xl text-white font-bold mb-1.5">
              Save changes?
            </Text>
            <Text className="text-xl text-gray-400 mb-3">
              Update "{formData.name}"?
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowConfirm(false)}
                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-3 items-center"
              >
                <Text className="text-xl text-gray-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                className="flex-1 bg-blue-600 rounded-lg py-3 items-center"
              >
                <Text className="text-xl text-white">
                  {isSaving ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-[#303030] rounded-2xl p-4 w-full max-w-md border border-gray-600">
            <Text className="text-2xl text-white font-bold mb-1.5">
              Delete Modifier?
            </Text>
            <Text className="text-xl text-gray-400 mb-3">
              Are you sure you want to delete "{existing.name}"? This action
              cannot be undone.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-3 items-center"
              >
                <Text className="text-xl text-gray-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDelete}
                className="flex-1 bg-red-600 rounded-lg py-3 items-center"
              >
                <Text className="text-xl text-white">Delete</Text>
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
    </KeyboardAvoidingView>
  );
};

export default EditModifierScreen;
