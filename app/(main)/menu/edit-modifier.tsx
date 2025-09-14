import MenuLayout from "@/components/menu/MenuLayout";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

const EditModifierScreen: React.FC = () => {
    const { id, returnTab } = useLocalSearchParams<{ id: string; returnTab?: string }>();
    const { modifierGroups, updateModifierGroup, deleteModifierGroup, getModifierGroup } = useMenuStore();

    const existing = useMemo(() => (id ? getModifierGroup(id) : undefined), [id, modifierGroups]);

    const [name, setName] = useState(existing?.name || "");
    const [type, setType] = useState<"required" | "optional">(existing?.type || "optional");
    const [selectionType, setSelectionType] = useState<"single" | "multiple">(existing?.selectionType || "single");
    const [maxSelections, setMaxSelections] = useState<number | undefined>(existing?.maxSelections);
    const [description, setDescription] = useState(existing?.description || "");
    const [options, setOptions] = useState(existing?.options || []);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!existing) return;
        setName(existing.name);
        setType(existing.type);
        setSelectionType(existing.selectionType);
        setMaxSelections(existing.maxSelections);
        setDescription(existing.description || "");
        setOptions(existing.options || []);
    }, [existing?.id]);

    const addOption = () => {
        setOptions(prev => [...prev, { id: `opt_${Date.now()}`, name: "", price: 0 }]);
    };

    const updateOption = (idx: number, field: "name" | "price", value: string) => {
        setOptions(prev => prev.map((o, i) => i === idx ? { ...o, [field]: field === "price" ? (parseFloat(value) || 0) : value } : o));
    };

    const removeOption = (idx: number) => {
        setOptions(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSave = () => {
        if (!existing) return;
        if (!name.trim()) {
            Alert.alert("Validation", "Name is required");
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
                name: name.trim(),
                type,
                selectionType,
                maxSelections: selectionType === "multiple" ? maxSelections : undefined,
                description: description.trim() || undefined,
                options: options.map(o => ({ ...o, name: o.name.trim() })),
            });
            await new Promise(r => setTimeout(r, 600));
            router.back();
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = () => {
        if (!existing) return;
        Alert.alert("Delete Modifier", `Delete "${existing.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => { deleteModifierGroup(existing.id); router.replace({ pathname: "/menu", params: { tab: returnTab || "modifiers" } }); } }
        ]);
    };

    if (!existing) {
        return (
            <View className="flex-1 bg-[#212121] items-center justify-center p-6">
                <Text className="text-white">Modifier not found or not editable.</Text>
                <TouchableOpacity onPress={() => router.back()} className="mt-4 px-4 py-2 bg-[#303030] rounded border border-gray-600">
                    <Text className="text-gray-300">Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
            <KeyboardAvoidingView className="flex-1 bg-[#212121]" behavior="padding">
                <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
                    <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
                        <ArrowLeft size={20} color="#9CA3AF" />
                        <Text className="text-white font-medium ml-2">Back</Text>
                    </TouchableOpacity>
                    <View className="flex-row gap-2">
                        <TouchableOpacity onPress={handleDelete} className="px-4 py-2 rounded-lg border border-red-500 bg-red-900/30">
                            <View className="flex-row items-center"><Trash2 size={16} color="#EF4444" /><Text className="text-red-400 ml-2">Delete</Text></View>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleSave} disabled={isSaving} className="px-4 py-2 rounded-lg bg-blue-600">
                            <View className="flex-row items-center"><Save size={16} color="#fff" /><Text className="text-white ml-2">{isSaving ? "Saving..." : "Save"}</Text></View>
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView className="flex-1 p-6">
                    <Text className="text-2xl font-bold text-white mb-6">Edit Modifier Group</Text>

                    <View className="mb-6">
                        <Text className="text-lg font-semibold text-white mb-3">Name</Text>
                        <TextInput className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white" value={name} onChangeText={setName} placeholder="Modifier name" placeholderTextColor="#9CA3AF" />
                    </View>

                    <View className="mb-6">
                        <Text className="text-lg font-semibold text-white mb-3">Type</Text>
                        <View className="flex-row gap-3">
                            <TouchableOpacity onPress={() => setType("optional")} className={`flex-1 px-4 py-3 rounded-lg border ${type === "optional" ? "bg-blue-600 border-blue-500" : "bg-[#303030] border-gray-600"}`}><Text className={`text-center ${type === "optional" ? "text-white" : "text-gray-300"}`}>Optional</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setType("required")} className={`flex-1 px-4 py-3 rounded-lg border ${type === "required" ? "bg-red-600 border-red-500" : "bg-[#303030] border-gray-600"}`}><Text className={`text-center ${type === "required" ? "text-white" : "text-gray-300"}`}>Required</Text></TouchableOpacity>
                        </View>
                    </View>

                    <View className="mb-6">
                        <Text className="text-lg font-semibold text-white mb-3">Selection Type</Text>
                        <View className="flex-row gap-3">
                            <TouchableOpacity onPress={() => setSelectionType("single")} className={`flex-1 px-4 py-3 rounded-lg border ${selectionType === "single" ? "bg-green-600 border-green-500" : "bg-[#303030] border-gray-600"}`}><Text className={`text-center ${selectionType === "single" ? "text-white" : "text-gray-300"}`}>Single</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setSelectionType("multiple")} className={`flex-1 px-4 py-3 rounded-lg border ${selectionType === "multiple" ? "bg-green-600 border-green-500" : "bg-[#303030] border-gray-600"}`}><Text className={`text-center ${selectionType === "multiple" ? "text-white" : "text-gray-300"}`}>Multiple</Text></TouchableOpacity>
                        </View>
                    </View>

                    {selectionType === "multiple" && (
                        <View className="mb-6">
                            <Text className="text-lg font-semibold text-white mb-3">Max Selections (optional)</Text>
                            <TextInput className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white" keyboardType="numeric" value={maxSelections?.toString() || ""} onChangeText={(t) => setMaxSelections(t ? parseInt(t) : undefined)} placeholder="Leave empty for unlimited" placeholderTextColor="#9CA3AF" />
                        </View>
                    )}

                    <View className="mb-6">
                        <Text className="text-lg font-semibold text-white mb-3">Description</Text>
                        <TextInput className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white" value={description} onChangeText={setDescription} placeholder="Optional description" placeholderTextColor="#9CA3AF" />
                    </View>

                    <View className="mb-2">
                        <View className="flex-row items-center justify-between mb-3">
                            <Text className="text-lg font-semibold text-white">Options</Text>
                            <TouchableOpacity onPress={addOption} className="flex-row items-center bg-green-600 px-3 py-2 rounded-lg"><Plus size={16} color="#fff" /><Text className="text-white ml-2">Add Option</Text></TouchableOpacity>
                        </View>
                        {options.length === 0 ? (
                            <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center"><Text className="text-gray-400">No options yet.</Text></View>
                        ) : (
                            <View className="gap-2">
                                {options.map((opt, idx) => (
                                    <View key={opt.id} className="bg-[#303030] border border-gray-600 rounded-lg p-3">
                                        <View className="flex-row gap-3">
                                            <View className="flex-1">
                                                <Text className="text-gray-300 text-xs mb-1">Name</Text>
                                                <TextInput className="bg-[#212121] border border-gray-600 rounded px-3 py-2 text-white" value={opt.name} onChangeText={(t) => updateOption(idx, "name", t)} placeholder="e.g., Large" placeholderTextColor="#9CA3AF" />
                                            </View>
                                            <View className="w-28">
                                                <Text className="text-gray-300 text-xs mb-1">Price</Text>
                                                <TextInput className="bg-[#212121] border border-gray-600 rounded px-3 py-2 text-white" value={opt.price.toString()} onChangeText={(t) => updateOption(idx, "price", t)} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#9CA3AF" />
                                            </View>
                                        </View>
                                        <View className="items-end mt-2">
                                            <TouchableOpacity onPress={() => removeOption(idx)} className="px-3 py-1 rounded border border-red-500"><Text className="text-red-400 text-xs">Remove</Text></TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                </ScrollView>

                <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
                    <View className="flex-1 bg-black/50 items-center justify-center p-6">
                        <View className="bg-[#303030] rounded-2xl p-6 w-full max-w-sm border border-gray-600">
                            <Text className="text-white text-lg font-bold mb-2">Save changes?</Text>
                            <Text className="text-gray-400 mb-4">Update "{name}" with {options.length} option(s)?</Text>
                            <View className="flex-row gap-3">
                                <TouchableOpacity onPress={() => setShowConfirm(false)} className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-3 items-center"><Text className="text-gray-300">Cancel</Text></TouchableOpacity>
                                <TouchableOpacity onPress={confirmSave} disabled={isSaving} className="flex-1 bg-blue-600 rounded-lg py-3 items-center"><Text className="text-white">{isSaving ? "Saving..." : "Save"}</Text></TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </KeyboardAvoidingView>
    );
};

export default EditModifierScreen;


