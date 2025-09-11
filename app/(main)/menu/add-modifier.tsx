import { ModifierOption } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

// Form data interface
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

const AddModifierScreen: React.FC = () => {
    const { addModifierGroup } = useMenuStore();

    const [formData, setFormData] = useState<ModifierFormData>({
        name: "",
        type: "optional",
        selectionType: "single",
        maxSelections: undefined,
        description: "",
        options: []
    });

    const [errors, setErrors] = useState<FormErrors>({});
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Handle form validation
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = "Modifier name is required";
        }

        if (formData.options.length === 0) {
            newErrors.options = "Please add at least one option";
        }

        if (formData.selectionType === "multiple" && formData.maxSelections && formData.maxSelections < 1) {
            newErrors.maxSelections = "Max selections must be at least 1";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle save
    const handleSave = () => {
        if (!validateForm()) {
            return;
        }
        setShowConfirmation(true);
    };

    const params = useLocalSearchParams<{ returnTab?: string }>();

    const confirmSave = async () => {
        setIsSaving(true);
        setShowConfirmation(false);

        try {
            // Create the modifier group data
            const modifierGroupData = {
                name: formData.name.trim(),
                type: formData.type,
                selectionType: formData.selectionType,
                maxSelections: formData.maxSelections,
                description: formData.description?.trim() || undefined,
                options: formData.options.map(option => ({
                    ...option,
                    name: option.name.trim()
                }))
            };

            // Save to store
            addModifierGroup(modifierGroupData);

            // Simulate a small delay for better UX
            await new Promise(resolve => setTimeout(resolve, 1000));

            const tab = typeof params.returnTab === "string" ? params.returnTab : undefined;
            if (tab) {
                router.replace({ pathname: "/menu", params: { tab } });
            } else {
                router.back();
            }
        } catch (error) {
            Alert.alert("Error", "Failed to save modifier group. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    // Handle back navigation
    const handleBack = () => {
        if (formData.name.trim() || formData.options.length > 0) {
            Alert.alert(
                "Unsaved Changes",
                "You have unsaved changes. Are you sure you want to go back?",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Discard", style: "destructive", onPress: () => router.back() }
                ]
            );
        } else {
            router.back();
        }
    };

    // Add new option
    const addOption = () => {
        const newOption: ModifierOption = {
            id: `option_${Date.now()}`,
            name: "",
            price: 0,
            isDefault: false
        };
        setFormData(prev => ({
            ...prev,
            options: [...prev.options, newOption]
        }));
    };

    // Update option
    const updateOption = (index: number, field: keyof ModifierOption, value: string | number | boolean) => {
        setFormData(prev => ({
            ...prev,
            options: prev.options.map((option, i) =>
                i === index ? { ...option, [field]: value } : option
            )
        }));
    };

    // Remove option
    const removeOption = (index: number) => {
        setFormData(prev => ({
            ...prev,
            options: prev.options.filter((_, i) => i !== index)
        }));
    };

    // Toggle default selection for an option
    const toggleDefaultOption = (index: number) => {
        setFormData(prev => {
            const newOptions = [...prev.options];

            // If single choice, unset all other defaults first
            if (prev.selectionType === "single") {
                newOptions.forEach((option, i) => {
                    if (i !== index) {
                        option.isDefault = false;
                    }
                });
            }

            // Toggle the selected option's default status
            newOptions[index].isDefault = !newOptions[index].isDefault;

            return {
                ...prev,
                options: newOptions
            };
        });
    };

    return (
        <KeyboardAvoidingView className="flex-1 bg-[#212121]" behavior="padding">
            {/* Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
                <TouchableOpacity
                    onPress={handleBack}
                    className="flex-row items-center"
                >
                    <ArrowLeft size={20} color="#9CA3AF" />
                    <Text className="text-white font-medium ml-2">Back to Modifiers</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleSave}
                    disabled={isSaving}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                    <Save size={16} color="white" />
                    <Text className="text-white font-medium ml-2">
                        {isSaving ? "Saving..." : "Save Modifier"}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 p-6">
                <Text className="text-2xl font-bold text-white mb-6">Add Modifier Group</Text>

                {/* Modifier Name */}
                <View className="mb-6">
                    <Text className="text-lg font-semibold text-white mb-4">Modifier Name</Text>
                    <TextInput
                        className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                        placeholder="e.g., Size, Toppings, Sauce"
                        placeholderTextColor="#9CA3AF"
                        value={formData.name}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                    />
                    {errors.name && <Text className="text-red-400 text-sm mt-1">{errors.name}</Text>}
                </View>

                {/* Modifier Type */}
                <View className="mb-6">
                    <Text className="text-lg font-semibold text-white mb-4">Type</Text>
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            onPress={() => setFormData(prev => ({ ...prev, type: "optional" }))}
                            className={`flex-1 px-4 py-3 rounded-lg border ${formData.type === "optional"
                                ? "bg-blue-600 border-blue-500"
                                : "bg-[#303030] border-gray-600"
                                }`}
                        >
                            <Text className={`font-medium text-center ${formData.type === "optional" ? "text-white" : "text-gray-300"
                                }`}>
                                Optional
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setFormData(prev => ({ ...prev, type: "required" }))}
                            className={`flex-1 px-4 py-3 rounded-lg border ${formData.type === "required"
                                ? "bg-red-600 border-red-500"
                                : "bg-[#303030] border-gray-600"
                                }`}
                        >
                            <Text className={`font-medium text-center ${formData.type === "required" ? "text-white" : "text-gray-300"
                                }`}>
                                Required
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Selection Type */}
                <View className="mb-6">
                    <Text className="text-lg font-semibold text-white mb-4">Selection Type</Text>
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            onPress={() => setFormData(prev => ({ ...prev, selectionType: "single" }))}
                            className={`flex-1 px-4 py-3 rounded-lg border ${formData.selectionType === "single"
                                ? "bg-green-600 border-green-500"
                                : "bg-[#303030] border-gray-600"
                                }`}
                        >
                            <Text className={`font-medium text-center ${formData.selectionType === "single" ? "text-white" : "text-gray-300"
                                }`}>
                                Single Choice
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setFormData(prev => ({ ...prev, selectionType: "multiple" }))}
                            className={`flex-1 px-4 py-3 rounded-lg border ${formData.selectionType === "multiple"
                                ? "bg-green-600 border-green-500"
                                : "bg-[#303030] border-gray-600"
                                }`}
                        >
                            <Text className={`font-medium text-center ${formData.selectionType === "multiple" ? "text-white" : "text-gray-300"
                                }`}>
                                Multiple Choice
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Max Selections (only for multiple choice) */}
                {formData.selectionType === "multiple" && (
                    <View className="mb-6">
                        <Text className="text-lg font-semibold text-white mb-4">Max Selections (Optional)</Text>
                        <TextInput
                            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                            placeholder="Leave empty for unlimited"
                            placeholderTextColor="#9CA3AF"
                            value={formData.maxSelections?.toString() || ""}
                            onChangeText={(text) => setFormData(prev => ({
                                ...prev,
                                maxSelections: text ? parseInt(text) : undefined
                            }))}
                            keyboardType="numeric"
                        />
                        {errors.maxSelections && <Text className="text-red-400 text-sm mt-1">{errors.maxSelections}</Text>}
                    </View>
                )}

                {/* Description */}
                <View className="mb-6">
                    <Text className="text-lg font-semibold text-white mb-4">Description (Optional)</Text>
                    <TextInput
                        className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                        placeholder="e.g., Choose up to 3 toppings"
                        placeholderTextColor="#9CA3AF"
                        value={formData.description}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                        multiline
                        numberOfLines={2}
                    />
                </View>

                {/* Options */}
                <View className="mb-6">
                    <View className="flex-row items-center justify-between mb-4">
                        <View>
                            <Text className="text-lg font-semibold text-white">Options</Text>
                            <Text className="text-gray-400 text-sm">
                                {formData.selectionType === "single"
                                    ? "Only one option can be set as default for single choice"
                                    : "Multiple options can be set as default for multiple choice"
                                }
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={addOption}
                            className="flex-row items-center bg-green-600 px-3 py-2 rounded-lg"
                        >
                            <Plus size={16} color="white" />
                            <Text className="text-white text-sm font-medium ml-1">Add Option</Text>
                        </TouchableOpacity>
                    </View>

                    {formData.options.length === 0 ? (
                        <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
                            <Text className="text-gray-400 text-center mb-3">
                                No options added yet. Add options to define the choices for this modifier.
                            </Text>
                            <TouchableOpacity
                                onPress={addOption}
                                className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                            >
                                <Plus size={16} color="white" />
                                <Text className="text-white font-medium ml-2">Add First Option</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View className="gap-3">
                            {formData.options.map((option, index) => (
                                <View key={option.id} className="bg-[#303030] border border-gray-600 rounded-lg p-4">
                                    <View className="flex-row items-center justify-between mb-3">
                                        <Text className="text-white font-medium">Option {index + 1}</Text>
                                        <TouchableOpacity
                                            onPress={() => removeOption(index)}
                                            className="p-1"
                                        >
                                            <Trash2 size={16} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>

                                    <View className="flex-row gap-3">
                                        <View className="flex-1">
                                            <Text className="text-gray-300 text-sm mb-2">Option Name</Text>
                                            <TextInput
                                                className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white"
                                                placeholder="e.g., Large, Extra Cheese"
                                                placeholderTextColor="#9CA3AF"
                                                value={option.name}
                                                onChangeText={(text) => updateOption(index, "name", text)}
                                            />
                                        </View>
                                        <View className="w-24">
                                            <Text className="text-gray-300 text-sm mb-2">Price</Text>
                                            <TextInput
                                                className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white"
                                                placeholder="0.00"
                                                placeholderTextColor="#9CA3AF"
                                                value={option.price.toString()}
                                                onChangeText={(text) => updateOption(index, "price", parseFloat(text) || 0)}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                    </View>

                                    {/* Default Selection Toggle */}
                                    <View className="mt-3">
                                        <TouchableOpacity
                                            onPress={() => toggleDefaultOption(index)}
                                            className={`flex-row items-center justify-between p-3 rounded-lg border ${option.isDefault
                                                ? "bg-green-600/20 border-green-500"
                                                : "bg-[#212121] border-gray-600"
                                                }`}
                                        >
                                            <View className="flex-row items-center">
                                                <View className={`w-5 h-5 rounded border-2 mr-3 items-center justify-center ${option.isDefault
                                                    ? "bg-green-600 border-green-600"
                                                    : "border-gray-400"
                                                    }`}>
                                                    {option.isDefault && (
                                                        <View className="w-2 h-2 bg-white rounded-full" />
                                                    )}
                                                </View>
                                                <View>
                                                    <Text className={`font-medium ${option.isDefault ? "text-green-400" : "text-gray-300"}`}>
                                                        Default Selection
                                                    </Text>
                                                    <Text className="text-gray-400 text-xs">
                                                        {formData.selectionType === "single"
                                                            ? "This option will be pre-selected"
                                                            : "This option will be pre-selected (multiple allowed)"
                                                        }
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    {errors.options && <Text className="text-red-400 text-sm mt-2">{errors.options}</Text>}
                </View>
            </ScrollView>

            {/* Confirmation Modal */}
            <Modal
                visible={showConfirmation}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowConfirmation(false)}
            >
                <View className="flex-1 bg-black/50 items-center justify-center p-6">
                    <View className="bg-[#303030] rounded-2xl p-6 w-full max-w-sm border border-gray-600">
                        {/* Header */}
                        <View className="items-center mb-6">
                            <View className="w-16 h-16 bg-blue-600/20 rounded-full items-center justify-center mb-4">
                                <Save size={32} color="#60A5FA" />
                            </View>
                            <Text className="text-xl font-bold text-white text-center">
                                Save Modifier Group?
                            </Text>
                            <Text className="text-gray-400 text-center mt-2">
                                Create "{formData.name}" with {formData.options.length} options?
                            </Text>
                        </View>

                        {/* Modifier Preview */}
                        <View className="bg-[#212121] rounded-lg p-4 mb-6">
                            <View className="flex-row items-center justify-between mb-2">
                                <Text className="text-white font-medium">{formData.name}</Text>
                                <View className="flex-row gap-2">
                                    <View className={`px-2 py-1 rounded-full ${formData.type === "required" ? "bg-red-900/30 border border-red-500" : "bg-blue-900/30 border border-blue-500"}`}>
                                        <Text className={`text-xs ${formData.type === "required" ? "text-red-400" : "text-blue-400"}`}>
                                            {formData.type}
                                        </Text>
                                    </View>
                                    <View className="bg-gray-600/30 border border-gray-500 px-2 py-1 rounded-full">
                                        <Text className="text-xs text-gray-300">
                                            {formData.selectionType}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <Text className="text-gray-400 text-sm">
                                {formData.options.length} options • {formData.selectionType === "multiple" && formData.maxSelections ? `Max ${formData.maxSelections} selections` : "Unlimited selections"}
                            </Text>
                            {formData.options.some(option => option.isDefault) && (
                                <Text className="text-green-400 text-sm mt-1">
                                    {formData.options.filter(option => option.isDefault).length} default option(s) set
                                </Text>
                            )}
                        </View>

                        {/* Action Buttons */}
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setShowConfirmation(false)}
                                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-3 items-center"
                            >
                                <Text className="text-gray-300 font-medium">Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={confirmSave}
                                disabled={isSaving}
                                className="flex-1 bg-blue-600 rounded-lg py-3 items-center"
                            >
                                <Text className="text-white font-medium">
                                    {isSaving ? "Saving..." : "Save Modifier"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
};

export default AddModifierScreen;
