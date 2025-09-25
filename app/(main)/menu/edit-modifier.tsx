import { ModifierOption } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
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

  const existing = useMemo(
    () => modifierGroups.find((m) => m.id === id),
    [id, modifierGroups]
  );

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
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setFormData({
        name: existing.name,
        type: existing.type,
        selectionType: existing.selectionType,
        maxSelections: existing.maxSelections,
        description: existing.description || "",
        options: existing.options || [],
      });
    }
  }, [existing]);

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
      Object.values(newErrors).forEach((error) => {
        toast.error(error, { position: ToastPosition.BOTTOM });
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
      await new Promise((r) => setTimeout(r, 400));
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert("Delete Modifier", `Delete "${existing.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteModifierGroup(existing.id);
          router.back();
        },
      },
    ]);
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
      <View className="flex-1 bg-[#212121] items-center justify-center p-6">
        <Text className="text-2xl text-white">
          Modifier not found or not editable.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 bg-[#303030] rounded border border-gray-600"
        >
          <Text className="text-xl text-gray-300">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-[#212121]" behavior="padding">
      <View className="flex-row items-center justify-between p-6 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={24} color="#9CA3AF" />
          <Text className="text-2xl text-white font-medium ml-2">Back</Text>
        </TouchableOpacity>
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={handleDelete}
            className="px-6 py-3 rounded-lg border border-red-500 bg-red-900/30"
          >
            <View className="flex-row items-center">
              <Trash2 size={24} color="#EF4444" />
              <Text className="text-2xl text-red-400 ml-2">Delete</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            className="px-6 py-3 rounded-lg bg-blue-600"
          >
            <View className="flex-row items-center">
              <Save size={24} color="#fff" />
              <Text className="text-2xl text-white ml-2">
                {isSaving ? "Saving..." : "Save"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 p-6 pb-12">
        <Text className="text-3xl font-bold text-white mb-6">
          Edit Modifier Group
        </Text>

        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-3">Name</Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white h-20"
            value={formData.name}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, name: text }))
            }
            placeholder="Modifier name"
            placeholderTextColor="#9CA3AF"
          />
          {errors.name && (
            <Text className="text-xl text-red-400 mt-1">{errors.name}</Text>
          )}
        </View>

        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-3">Type</Text>
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({ ...prev, type: "optional" }))
              }
              className={`flex-1 px-6 py-4 rounded-lg border ${formData.type === "optional" ? "bg-blue-600 border-blue-500" : "bg-[#303030] border-gray-600"}`}
            >
              <Text
                className={`text-2xl text-center ${formData.type === "optional" ? "text-white" : "text-gray-300"}`}
              >
                Optional
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({ ...prev, type: "required" }))
              }
              className={`flex-1 px-6 py-4 rounded-lg border ${
                formData.type === "required"
                  ? "bg-red-600 border-red-500"
                  : "bg-[#303030] border-gray-600"
              }`}
            >
              <Text
                className={`text-2xl font-medium text-center ${
                  formData.type === "required" ? "text-white" : "text-gray-300"
                }`}
              >
                Required
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-3">
            Selection Type
          </Text>
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({ ...prev, selectionType: "single" }))
              }
              className={`flex-1 px-6 py-4 rounded-lg border ${
                formData.selectionType === "single"
                  ? "bg-green-600 border-green-500"
                  : "bg-[#303030] border-gray-600"
              }`}
            >
              <Text
                className={`text-2xl text-center ${formData.selectionType === "single" ? "text-white" : "text-gray-300"}`}
              >
                Single
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                setFormData((prev) => ({ ...prev, selectionType: "multiple" }))
              }
              className={`flex-1 px-6 py-4 rounded-lg border ${formData.selectionType === "multiple" ? "bg-green-600 border-green-500" : "bg-[#303030] border-gray-600"}`}
            >
              <Text
                className={`text-2xl text-center ${formData.selectionType === "multiple" ? "text-white" : "text-gray-300"}`}
              >
                Multiple
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {formData.selectionType === "multiple" && (
          <View className="mb-6">
            <Text className="text-2xl font-semibold text-white mb-3">
              Max Selections (optional)
            </Text>
            <TextInput
              className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white h-20"
              keyboardType="numeric"
              value={formData.maxSelections?.toString() || ""}
              onChangeText={(text) =>
                setFormData((prev) => ({
                  ...prev,
                  maxSelections: text ? parseInt(text) : undefined,
                }))
              }
              placeholder="Leave empty for unlimited"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        )}

        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-3">
            Description
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white h-20"
            placeholder="e.g., Choose up to 3 toppings"
            placeholderTextColor="#9CA3AF"
            value={formData.description}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, description: text }))
            }
            multiline
            numberOfLines={2}
          />
        </View>

        <View className="mb-12">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-2xl font-semibold text-white">Options</Text>
            <TouchableOpacity
              onPress={addOption}
              className="flex-row items-center bg-green-600 px-4 py-3 rounded-lg"
            >
              <Plus size={24} color="#fff" />
              <Text className="text-xl text-white ml-2">Add Option</Text>
            </TouchableOpacity>
          </View>
          {formData.options.length === 0 ? (
            <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
              <Text className="text-xl text-gray-400">No options yet.</Text>
            </View>
          ) : (
            <View className="gap-3">
              {formData.options.map((option, index) => (
                <View
                  key={option.id}
                  className="bg-[#303030] border border-gray-600 rounded-lg p-6"
                >
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-2xl text-white font-medium">
                      Option {index + 1}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeOption(index)}
                      className="p-2"
                    >
                      <Trash2 size={24} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row gap-4">
                    <View className="flex-1">
                      <Text className="text-xl text-gray-300 mb-2">
                        Option Name
                      </Text>
                      <TextInput
                        className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-2xl text-white h-20"
                        placeholder="e.g., Large, Extra Cheese"
                        placeholderTextColor="#9CA3AF"
                        value={option.name}
                        onChangeText={(text) =>
                          updateOption(index, "name", text)
                        }
                      />
                    </View>
                    <View className="w-32">
                      <Text className="text-xl text-gray-300 mb-2">Price</Text>
                      <TextInput
                        className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-2xl text-white h-20"
                        placeholder="0.00"
                        placeholderTextColor="#9CA3AF"
                        value={option.price.toString()}
                        onChangeText={(text) =>
                          updateOption(index, "price", parseFloat(text) || 0)
                        }
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* --- THIS IS THE CORRECTED PART --- */}
                  <View className="mt-4">
                    <TouchableOpacity
                      onPress={() => toggleDefaultOption(index)}
                      className={`flex-row items-center justify-between p-4 rounded-lg border ${
                        option.isDefault
                          ? "bg-green-600/20 border-green-500"
                          : "bg-[#212121] border-gray-600"
                      }`}
                    >
                      <View className="flex-row items-center">
                        <View
                          className={`w-6 h-6 rounded border-2 mr-4 items-center justify-center ${
                            option.isDefault
                              ? "bg-green-600 border-green-600"
                              : "border-gray-400"
                          }`}
                        >
                          {option.isDefault && (
                            <View className="w-3 h-3 bg-white rounded-full" />
                          )}
                        </View>
                        <View>
                          <Text
                            className={`text-xl font-medium ${option.isDefault ? "text-green-400" : "text-gray-300"}`}
                          >
                            Default Selection
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                  {/* --- END OF CORRECTION --- */}
                </View>
              ))}
            </View>
          )}
          {errors.options && (
            <Text className="text-xl text-red-400 mt-2">{errors.options}</Text>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-6">
          <View className="bg-[#303030] rounded-2xl p-6 w-full max-w-lg border border-gray-600">
            <Text className="text-3xl text-white font-bold mb-2">
              Save changes?
            </Text>
            <Text className="text-2xl text-gray-400 mb-4">
              Update "{formData.name}" with {formData.options.length} option(s)?
            </Text>
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => setShowConfirm(false)}
                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-4 items-center"
              >
                <Text className="text-2xl text-gray-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                className="flex-1 bg-blue-600 rounded-lg py-4 items-center"
              >
                <Text className="text-2xl text-white">
                  {isSaving ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

export default EditModifierScreen;
