import ScheduleEditor from "@/components/menu/ScheduleEditor";
import { MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, Utensils, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
// Get image source for preview
const getImageSource = (image: string | undefined) => {
    if (image && image.length > 200) {
        return { uri: `data:image/jpeg;base64,${image}` };
    }

    if (image) {
        // Try to get image from assets
        try {
            return { uri: `@/assets/images/${image}` };
        } catch {
            return undefined;
        }
    }

    return undefined;
};
const EditCategoryScreen: React.FC = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { categories, menuItems, updateCategory, deleteCategory, addItemToCategory, removeItemFromCategory } = useMenuStore();

    const existing = useMemo(() => categories.find(c => c.id === id), [id, categories]);
    const allItems = menuItems;

    const [name, setName] = useState(existing?.name || "");
    const [isActive, setIsActive] = useState(existing?.isActive ?? true);
    const [schedules, setSchedules] = useState(existing?.schedules ?? []);
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>(() => {
        if (!existing) return [];
        return allItems.filter((item) => {
            const cats = Array.isArray(item.category) ? item.category : (item.category ? [item.category] : []);
            return cats.includes(existing.name);
        }).map(i => i.id);
    });

    const toggleItem = (item: MenuItemType) => {
        setSelectedItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]);
    };

    const handleSave = async () => {
        if (!existing) return;
        if (!name.trim()) { Alert.alert("Validation", "Name is required"); return; }
        // Update category name and active status
        updateCategory(existing.id, { name: name.trim(), isActive, schedules });

        // Sync items membership
        const beforeItemIds = allItems.filter((item) => {
            const cats = Array.isArray(item.category) ? item.category : (item.category ? [item.category] : []);
            return cats.includes(existing.name);
        }).map(i => i.id);

        // Removed
        beforeItemIds.filter(id => !selectedItemIds.includes(id)).forEach(id => removeItemFromCategory(id, existing.name));
        // Added
        selectedItemIds.filter(id => !beforeItemIds.includes(id)).forEach(id => addItemToCategory(id, name.trim()));

        await new Promise(r => setTimeout(r, 400));
        router.replace({ pathname: "/menu", params: { tab: "categories" } });
    };

    const handleDelete = () => {
        if (!existing) return;
        Alert.alert("Delete Category", `Delete "${existing.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => { deleteCategory(existing.id); router.replace({ pathname: "/menu", params: { tab: "categories" } }); } },
        ]);
    };

    if (!existing) {
        return (
            <View className="flex-1 bg-[#212121] items-center justify-center p-6">
                <Text className="text-white">Category not found.</Text>
                <TouchableOpacity onPress={() => router.back()} className="mt-4 px-4 py-2 bg-[#303030] rounded border border-gray-600"><Text className="text-gray-300">Go Back</Text></TouchableOpacity>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#212121]">
            <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
                <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
                    <ArrowLeft size={20} color="#9CA3AF" />
                    <Text className="text-white font-medium ml-2">Back</Text>
                </TouchableOpacity>
                <View className="flex-row gap-2">
                    <TouchableOpacity onPress={handleDelete} className="px-4 py-2 rounded-lg border border-red-500 bg-red-900/30"><Text className="text-red-400">Delete</Text></TouchableOpacity>
                    <TouchableOpacity onPress={handleSave} className="px-4 py-2 rounded-lg bg-blue-600"><Text className="text-white">Save</Text></TouchableOpacity>
                </View>
            </View>

            <ScrollView className="flex-1 p-6">
                <Text className="text-2xl font-bold text-white mb-6">Edit Category</Text>

                <View className="mb-6">
                    <Text className="text-lg font-semibold text-white mb-3">Name</Text>
                    <TextInput className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white" value={name} onChangeText={setName} placeholder="Category name" placeholderTextColor="#9CA3AF" />
                </View>

                <View className="mb-6">
                    {/* Selected Items Summary */}
                    {selectedItemIds.length > 0 && (
                        <View className="mb-6">
                            <Text className="text-lg font-semibold text-white mb-4">
                                Selected Items ({selectedItemIds.length})
                            </Text>
                            <View className="bg-[#303030] border border-gray-600 rounded-lg p-4">
                                <View className="flex-row flex-wrap gap-2">
                                    {selectedItemIds.map((itemId) => {
                                        const item = allItems.find((i: MenuItemType) => i.id === itemId);
                                        return item ? (
                                            <View key={itemId} className="flex-row items-center bg-blue-600/20 border border-blue-500 px-3 py-2 rounded-lg">
                                                <Text className="text-blue-400 text-sm font-medium">
                                                    {item.name}
                                                </Text>
                                                <TouchableOpacity
                                                    onPress={() => toggleItem(item)}
                                                    className="ml-2"
                                                >
                                                    <X size={14} color="#60A5FA" />
                                                </TouchableOpacity>
                                            </View>
                                        ) : null;
                                    })}
                                </View>
                            </View>
                        </View>
                    )}
                    {/* Available Items */}
                    <View className="mb-6">
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-lg font-semibold text-white">Select Items</Text>
                            <Text className="text-gray-400 text-sm">
                                {selectedItemIds.length} of {allItems.length} selected
                            </Text>
                        </View>

                        {allItems.length === 0 ? (
                            <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
                                <Utensils size={48} color="#9CA3AF" />
                                <Text className="text-gray-400 text-center mt-4">
                                    No menu items found.
                                </Text>
                                <Text className="text-gray-500 text-center text-sm mt-2">
                                    Create some menu items first to add them to categories.
                                </Text>
                            </View>
                        ) : (
                            <View className="gap-3 flex flex-row flex-wrap">
                                {allItems.map((item) => {
                                    const isSelected = selectedItemIds.includes(item.id);
                                    return (
                                        <TouchableOpacity
                                            key={item.id}
                                            onPress={() => toggleItem(item)}
                                            className={`bg-[#303030] rounded-lg w-[32%] border p-4 ${isSelected ? "border-blue-500 bg-blue-900/20" : "border-gray-700"
                                                }`}
                                        >
                                            <View className="flex-row items-center gap-4">
                                                {/* Item Image */}
                                                <View className="w-16 h-16 rounded-lg border border-gray-600 overflow-hidden">
                                                    {getImageSource(item.image) ? (
                                                        <Image
                                                            source={getImageSource(item.image)}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <View className="w-full h-full bg-gray-600 items-center justify-center">
                                                            <Utensils color="#9ca3af" size={24} />
                                                        </View>
                                                    )}
                                                </View>

                                                {/* Item Details */}
                                                <View className="flex-1">
                                                    <Text className="text-white font-medium text-lg">
                                                        {item.name}
                                                    </Text>
                                                    {item.description && (
                                                        <Text className="text-gray-400 text-sm mt-1">
                                                            {item.description}
                                                        </Text>
                                                    )}
                                                    <Text className="text-blue-400 font-semibold mt-1">
                                                        ${item.price.toFixed(2)}
                                                    </Text>

                                                    {/* Show existing categories */}
                                                    {Array.isArray(item.category) && item.category.length > 0 && (
                                                        <View className="flex-row flex-wrap gap-1 mt-2">
                                                            {item.category.map((cat: string, index: number) => (
                                                                <View key={index} className="bg-gray-600/30 border border-gray-500 px-2 py-1 rounded">
                                                                    <Text className="text-xs text-gray-300">{cat}</Text>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>

                                                {/* Selection Indicator */}
                                                <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${isSelected
                                                    ? "bg-blue-600 border-blue-600"
                                                    : "border-gray-500"
                                                    }`}>
                                                    {isSelected && (
                                                        <Check size={16} color="white" />
                                                    )}
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                    </View>


                </View>

                <View className="mb-6">
                    <View className="flex-row items-center justify-between mb-3">
                        <Text className="text-lg font-semibold text-white">Schedules</Text>
                        <TouchableOpacity onPress={() => setIsActive(!isActive)} className={`px-3 py-2 rounded-lg border ${isActive ? "bg-green-900/30 border-green-500" : "bg-red-900/30 border-red-500"}`}>
                            <Text className={isActive ? "text-green-400" : "text-red-400"}>{isActive ? "Master: Enabled" : "Master: Disabled"}</Text>
                        </TouchableOpacity>
                    </View>
                    <ScheduleEditor value={schedules} onChange={setSchedules} />
                </View>

            </ScrollView>
        </View>
    );
};

export default EditCategoryScreen;


